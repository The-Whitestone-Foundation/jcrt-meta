#!/usr/bin/env node
// Expand one issue's ZIP and check its metadata sidecar against the KCWorks
// import contract before handing both to scripts/kcworks_api_importer.py.
// The upstream importer has no dry-run mode, so this is the last chance to
// catch a bad payload locally.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVES = path.join(ROOT, "archives");
const issue = process.argv[2];
const OUT = path.resolve(ROOT, process.argv[3] || path.join("import", String(issue)));

const FAST_ID = /^http:\/\/id\.worldcat\.org\/fast\/\d+$/;
const HOMOSAURUS_ID = /^https:\/\/homosaurus\.org\/v3\/homoit\d+$/;
const SCHEMES = new Set([
	"FAST-topical", "FAST-geographic", "FAST-corporate", "FAST-formgenre", "FAST-event",
	"FAST-meeting", "FAST-personal", "FAST-title", "FAST-chronological", "Homosaurus",
]);

if (!issue || !/^\d+\.\d+$/.test(issue)) {
	console.error("Usage: node scripts/preflight-import.mjs <issue> [output_dir]   e.g. 25.1");
	process.exit(2);
}

const zip = path.join(ARCHIVES, `${issue}.zip`);
const sidecar = path.join(ARCHIVES, `${issue}.metadata.json`);
for (const file of [zip, sidecar]) if (!fs.existsSync(file)) throw new Error(`Missing: ${file}`);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
if (spawnSync("unzip", ["-q", zip, "-d", OUT]).status !== 0) throw new Error(`Cannot extract: ${zip}`);

const records = JSON.parse(fs.readFileSync(sidecar, "utf8"));
if (!Array.isArray(records)) throw new Error(`Sidecar is not a JSON array: ${sidecar}`);

const problems = [];
const used = new Set();
records.forEach((record, index) => {
	const where = `${issue}[${index}] ${record?.metadata?.title || "(untitled)"}`;
	const fail = (message) => problems.push(`${where}: ${message}`);
	const metadata = record.metadata || {};

	for (const key of ["title", "publication_date", "publisher", "description"]) {
		if (typeof metadata[key] !== "string") fail(`metadata.${key} is not a string`);
	}
	if (!metadata.title) fail("metadata.title is empty");
	if (!/^\d{4}(-\d{2}-\d{2})?$/.test(metadata.publication_date || "")) fail(`publication_date is not EDTF: ${metadata.publication_date}`);
	if (!metadata.resource_type?.id) fail("metadata.resource_type.id is missing");
	if (!metadata.creators?.length) fail("metadata.creators is empty");
	for (const creator of metadata.creators || []) {
		if (!creator.person_or_org?.name) fail("creator without person_or_org.name");
		for (const identifier of creator.person_or_org?.identifiers || []) {
			if (identifier.scheme === "orcid" && !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(identifier.identifier || "")) fail(`invalid creator ORCID: ${identifier.identifier}`);
			if (identifier.scheme === "isni" && !/^\d{15}[\dX]$/.test(identifier.identifier || "")) fail(`invalid creator ISNI: ${identifier.identifier}`);
			if (!["orcid", "isni", "kc_username"].includes(identifier.scheme)) fail(`unknown creator identifier scheme: ${identifier.scheme}`);
		}
	}
	if (!record.parent?.access?.owned_by?.length) fail("parent.access.owned_by is missing");

	const schemes = (metadata.identifiers || []).map((identifier) => identifier.scheme);
	if (schemes.includes("issn")) fail("ISSN belongs in custom_fields, not metadata.identifiers");
	if (new Set(schemes).size !== schemes.length) fail(`duplicate identifier schemes: ${schemes.join(", ")}`);
	if (record.custom_fields?.["journal:journal"]?.issn !== "1530-5228") fail("custom_fields journal:journal.issn is missing");

	for (const subject of metadata.subjects || []) {
		if (!FAST_ID.test(subject.id || "") && !HOMOSAURUS_ID.test(subject.id || "")) fail(`subject id is not a controlled URI: ${JSON.stringify(subject)}`);
		if (!SCHEMES.has(subject.scheme)) fail(`unknown subject scheme: ${subject.scheme}`);
		if (!subject.subject) fail(`subject without a label: ${subject.id}`);
		for (const key of Object.keys(subject)) {
			if (!["id", "subject", "scheme"].includes(key)) fail(`unexpected subject property: ${key}`);
		}
	}

	const entries = Object.entries(record.files?.entries || {});
	if (!entries.length) fail("files.entries is empty");
	for (const [key, entry] of entries) {
		const file = path.join(OUT, key);
		if (!fs.existsSync(file)) fail(`file not in ZIP: ${key}`);
		else if (fs.statSync(file).size !== entry.size) fail(`size mismatch for ${key}: sidecar ${entry.size}, file ${fs.statSync(file).size}`);
		used.add(key);
	}
});

const extracted = fs.readdirSync(OUT).filter((name) => name.endsWith(".pdf"));
for (const name of extracted) if (!used.has(name)) problems.push(`${issue}: extracted PDF referenced by no record: ${name}`);

if (problems.length) {
	for (const problem of problems) console.error(`  ✗ ${problem}`);
	console.error(`\n${problems.length} problem(s) in ${sidecar}`);
	process.exit(1);
}

console.log(`${records.length} records, ${extracted.length} PDFs, ${records.reduce((sum, record) => sum + (record.metadata.subjects?.length || 0), 0)} subjects — ready.`);
console.log(`\nExtracted to ${OUT}\n\nImport with:\n`);
console.log(`  KCWORKS_IMPORT_API_KEY=... python3 scripts/kcworks_api_importer.py \\
    --collection-id <throwaway-slug> \\
    --metadata ${path.relative(ROOT, sidecar)} \\
    --files ${path.relative(ROOT, OUT)}/*.pdf \\
    --output ${path.relative(ROOT, path.join(OUT, "import-response.json"))}\n`);
