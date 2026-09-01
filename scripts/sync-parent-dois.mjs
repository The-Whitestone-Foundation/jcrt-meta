#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isNewPolis = path.basename(ROOT) === "journal.thenewpolis.com.meta";
const SITE = path.resolve(ROOT, "..", isNewPolis ? "journal.thenewpolis.com" : "jcrt-v2");
const CONTENT = path.join(SITE, "content", "archives");
const ARCHIVES = path.join(ROOT, "archives");
const API = process.env.KCWORKS_API_ROOT || "https://works.hcommons.org/api";
const check = process.argv.includes("--check");
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function search(nanoid) {
	const url = `${API}/records?q=${encodeURIComponent(JSON.stringify(nanoid))}&size=20`;
	for (let attempt = 0; attempt < 8; attempt++) {
		const response = await fetch(url);
		if (response.ok) return response.json();
		if (response.status !== 429 && response.status < 500) throw new Error(`${nanoid}: KC Works search returned ${response.status}`);
		await pause(Math.min(30_000, 1_000 * 2 ** attempt));
	}
	throw new Error(`${nanoid}: KC Works search remained rate-limited`);
}

const sidecars = fs.readdirSync(ARCHIVES).filter((name) => name.endsWith(".metadata.json")).sort();
const records = sidecars.flatMap((name) => {
	const issue = name.replace(".metadata.json", "");
	return JSON.parse(fs.readFileSync(path.join(ARCHIVES, name), "utf8")).map((record) => ({ issue, record }));
});
const markdown = fs.readdirSync(CONTENT, { recursive: true })
	.filter((name) => name.endsWith(".md"))
	.map((name) => path.join(CONTENT, name));
const byNanoid = new Map();
for (const file of markdown) {
	const text = fs.readFileSync(file, "utf8");
	const nanoid = text.match(/^nanoid:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
	if (nanoid) {
		if (byNanoid.has(nanoid)) throw new Error(`Duplicate nanoid ${nanoid}`);
		byNanoid.set(nanoid, { file, text });
	}
}

async function lookup({ issue, record }) {
	const nanoid = record.metadata?.identifiers?.find(({ scheme }) => scheme === "import-recid")?.identifier;
	if (!nanoid) throw new Error(`${issue}: missing import-recid`);
	const source = byNanoid.get(String(nanoid));
	if (!source) throw new Error(`${issue}: no Markdown for ${nanoid}`);
	const body = await search(nanoid);
	const matches = body.hits.hits.filter((hit) => hit.versions?.is_latest && hit.metadata?.identifiers?.some((id) => id.scheme === "import-recid" && id.identifier === String(nanoid)));
	if (matches.length !== 1) throw new Error(`${nanoid}: expected one latest KC Works record, found ${matches.length}`);
	const hit = matches[0];
	const parentDoi = decodeURIComponent(hit.links?.parent_doi || "").match(/10\.17613\/[a-z0-9-]+/i)?.[0];
	if (!parentDoi) throw new Error(`${nanoid}: KC Works record ${hit.id} has no parent DOI`);
	const current = source.text.match(/^doi:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1];
	return { issue, nanoid: String(nanoid), record_id: hit.id, parent_doi: parentDoi, current_doi: current, file: source.file };
}

const mapped = [];
for (let offset = 0; offset < records.length; offset += 2) {
	mapped.push(...await Promise.all(records.slice(offset, offset + 2).map(lookup)));
	process.stdout.write(`\rMapped ${mapped.length}/${records.length}`);
	await pause(750);
}
process.stdout.write("\n");

let changed = 0;
for (const item of mapped) {
	if (item.current_doi === item.parent_doi) continue;
	if (!item.current_doi) throw new Error(`${item.nanoid}: missing current DOI in ${item.file}`);
	changed++;
	if (!check) {
		const text = fs.readFileSync(item.file, "utf8");
		fs.writeFileSync(item.file, text.replace(/^doi:[^\r\n]*$/m, `doi: "${item.parent_doi}"`));
	}
}

if (!check) {
	const logDir = path.join(ROOT, "_logs");
	fs.mkdirSync(logDir, { recursive: true });
	fs.writeFileSync(path.join(logDir, "parent-dois.json"), `${JSON.stringify(mapped, null, 2)}\n`);
}
console.log(`${mapped.length} records mapped; ${changed} DOI entries ${check ? "differ" : "updated"}.`);
if (check && changed) process.exitCode = 1;
