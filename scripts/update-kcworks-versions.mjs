#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isNewPolis = path.basename(ROOT) === "journal.thenewpolis.com.meta";
const PDF_ROOT = path.resolve(ROOT, "..", isNewPolis ? "journal.thenewpolis.com/content/archives" : "jcrt-files/archives");
const API = process.env.KCWORKS_API_ROOT || "https://works.hcommons.org/api";
const TOKEN = process.env.KCWORKS_IMPORT_API_KEY;
const dryRun = process.argv.includes("--dry-run");
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7);
const previousNanoid = process.argv.find((arg) => arg.startsWith("--previous-nanoid="))?.slice(18);
const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.slice(8) || Infinity);
const STATE_FILE = path.join(ROOT, "_logs", "version-updates.json");
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
if (!dryRun && !TOKEN) throw new Error("Set KCWORKS_IMPORT_API_KEY before updating KC Works");
if (previousNanoid && !only) throw new Error("--previous-nanoid requires --only=<new-nanoid>");

const headers = { Accept: "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };
async function request(method, url, options = {}) {
	for (let attempt = 0; attempt < 8; attempt++) {
		const response = await fetch(url, {
			method,
			headers: { ...headers, ...(options.json ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
			body: options.json ? JSON.stringify(options.json) : options.body,
			signal: AbortSignal.timeout(180_000),
		});
		if (response.status === 429 || response.status >= 500) {
			await pause(Math.min(30_000, 1_000 * 2 ** attempt));
			continue;
		}
		const text = await response.text();
		const data = text ? JSON.parse(text) : null;
		if (!response.ok) throw new Error(`${method} ${url} returned ${response.status}: ${text.slice(0, 500)}`);
		return data;
	}
	throw new Error(`${method} ${url} did not recover after retries`);
}

function md5(file) { return `md5:${crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex")}`; }
function parentDoi(record) { return decodeURIComponent(record.links?.parent_doi || record.parent?.pids?.doi?.identifier || "").match(/10\.17613\/[a-z0-9-]+/i)?.[0]; }
function saveState(state) {
	fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
	fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}
async function latest(nanoid, expectedParentDoi) {
	const result = await request("GET", `${API}/records?q=${encodeURIComponent(JSON.stringify(nanoid))}&size=20`);
	const matches = result.hits.hits
		.filter((hit) => hit.versions?.is_latest && parentDoi(hit) === expectedParentDoi && hit.metadata?.identifiers?.some((id) => id.scheme === "import-recid" && id.identifier === nanoid))
		.sort((a, b) => (b.versions?.index || 0) - (a.versions?.index || 0) || String(b.updated).localeCompare(String(a.updated)));
	if (!matches.length) throw new Error(`${nanoid}: no latest record found for parent DOI ${expectedParentDoi}`);
	return matches[0];
}

const mappings = JSON.parse(fs.readFileSync(path.join(ROOT, "_logs", "parent-dois.json"), "utf8"));
const deposits = new Map();
for (const name of fs.readdirSync(path.join(ROOT, "archives")).filter((name) => name.endsWith(".metadata.json"))) {
	const issue = name.replace(".metadata.json", "");
	for (const record of JSON.parse(fs.readFileSync(path.join(ROOT, "archives", name), "utf8"))) {
		const nanoid = String(record.metadata.identifiers.find((id) => id.scheme === "import-recid")?.identifier || "");
		const filenames = Object.keys(record.files?.entries || {});
		if (!nanoid || filenames.length !== 1) throw new Error(`${issue}: every record must have one import-recid and one file`);
		deposits.set(nanoid, { issue, filename: filenames[0] });
	}
}
const usage = new Map();
for (const { issue, filename } of deposits.values()) usage.set(`${issue}/${filename}`,(usage.get(`${issue}/${filename}`) || 0) + 1);
let queue = mappings
	.map((item) => previousNanoid && item.nanoid === previousNanoid ? { ...item, nanoid: only, lookup_nanoid: previousNanoid } : item)
	.filter((item) => !only || item.nanoid === only);
if (!isNewPolis) {
	const shared = queue.filter((item) => { const d = deposits.get(item.nanoid); return usage.get(`${d.issue}/${d.filename}`) > 1; });
	queue = queue.filter((item) => !shared.includes(item));
	if (shared.length) console.log(`Skipping ${shared.length} JCRT records that share ${new Set(shared.map((item) => { const d = deposits.get(item.nanoid); return `${d.issue}/${d.filename}`; })).size} PDFs.`);
}
queue = queue.slice(0, limit);
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
let updated = 0;

for (const [index, item] of queue.entries()) {
	const deposit = deposits.get(item.nanoid);
	if (!deposit) throw new Error(`${item.nanoid}: missing archive sidecar record`);
	const pdf = path.join(PDF_ROOT, deposit.issue, deposit.filename);
	if (!fs.existsSync(pdf)) throw new Error(`${item.nanoid}: missing ${pdf}`);
	const firstPage = spawnSync("pdftotext", ["-f", "1", "-l", "1", pdf, "-"], { encoding: "utf8" }).stdout || "";
	if (!firstPage.includes(`DOI (newest version): ${item.parent_doi}`)) throw new Error(`${item.nanoid}: PDF flyleaf does not contain ${item.parent_doi}`);
	const checksum = md5(pdf);
	if (!dryRun && state[item.nanoid]?.status === "published" && state[item.nanoid]?.checksum === checksum) {
		console.log(`[${index + 1}/${queue.length}] ${item.nanoid}: audit-log current (${state[item.nanoid].record_id})`);
		continue;
	}
	const current = await latest(item.lookup_nanoid || item.nanoid, item.parent_doi);
	const remoteFiles = Object.values(current.files?.entries || {});
	const remoteNanoid = current.metadata?.identifiers?.find((identifier) => identifier.scheme === "import-recid")?.identifier;
	if (remoteNanoid === item.nanoid && remoteFiles.length === 1 && remoteFiles[0].key === deposit.filename && remoteFiles[0].checksum === checksum) {
		console.log(`[${index + 1}/${queue.length}] ${item.nanoid}: already current (${current.id})`);
		state[item.nanoid] = { status: "published", record_id: current.id, parent_doi: item.parent_doi, checksum };
		saveState(state);
		continue;
	}
	if (dryRun) {
		console.log(`[${index + 1}/${queue.length}] ${item.nanoid}: would version ${current.id}`);
		continue;
	}

	let draft;
	const savedDraft = state[item.nanoid]?.status === "draft" && state[item.nanoid]?.draft_id;
	if (savedDraft) {
		draft = await request("GET", `${API}/records/${savedDraft}/draft`);
	} else {
		draft = await request("POST", `${API}/records/${current.id}/versions`);
		state[item.nanoid] = { status: "draft", draft_id: draft.id, parent_doi: item.parent_doi, checksum };
		saveState(state);
	}
	const draftUrl = `${API}/records/${draft.id}/draft`;
	const metadata = structuredClone(current.metadata);
	metadata.identifiers = (metadata.identifiers || []).map((identifier) => identifier.scheme === "import-recid" ? { ...identifier, identifier: item.nanoid } : identifier);
	draft = await request("PUT", draftUrl, { json: { metadata, custom_fields: current.custom_fields, access: draft.access, files: draft.files } });
	let files = await request("GET", `${draftUrl}/files`);
	let entry = files.entries?.find?.(({ key }) => key === deposit.filename);
	if (!entry) {
		files = await request("POST", `${draftUrl}/files`, { json: [{ key: deposit.filename }] });
		entry = files.entries.find(({ key }) => key === deposit.filename);
	}
	if (entry.status !== "completed") {
		await request("PUT", entry.links.content, { body: fs.readFileSync(pdf), headers: { "Content-Type": "application/octet-stream" } });
		entry = await request("POST", entry.links.commit);
	}
	if (entry.checksum !== checksum) throw new Error(`${item.nanoid}: uploaded checksum ${entry.checksum} != ${checksum}`);
	const published = await request("POST", draft.links?.publish || `${draftUrl}/actions/publish`);
	const publishedParentDoi = parentDoi(published);
	if (!published.versions?.is_latest || publishedParentDoi !== item.parent_doi || Object.values(published.files?.entries || {})[0]?.checksum !== checksum) throw new Error(`${item.nanoid}: published version verification failed`);
	if (!published.metadata?.identifiers?.some((identifier) => identifier.scheme === "import-recid" && identifier.identifier === item.nanoid)) throw new Error(`${item.nanoid}: published import-recid verification failed`);
	state[item.nanoid] = { status: "published", record_id: published.id, version: published.versions.index, version_doi: published.pids?.doi?.identifier, parent_doi: publishedParentDoi, checksum };
	saveState(state);
	updated++;
	console.log(`[${index + 1}/${queue.length}] ${item.nanoid}: published v${published.versions.index} ${published.id}`);
	await pause(750);
}
console.log(`${updated} new KC Works versions published; ${queue.length - updated} already current or dry-run only.`);
