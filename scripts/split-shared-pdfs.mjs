#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.resolve(ROOT, "..", "jcrt-v2", "content", "archives");
const FILES = path.resolve(ROOT, "..", "jcrt-files", "archives");
const groups = new Map();

for (const issue of fs.readdirSync(SITE).filter((name) => /^\d+\.\d+$/.test(name))) {
	for (const name of fs.readdirSync(path.join(SITE, issue)).filter((name) => name.endsWith(".md"))) {
		const file = path.join(SITE, issue, name);
		const text = fs.readFileSync(file, "utf8");
		if (/^published:\s*false\s*$/m.test(text)) continue;
		const slug = path.basename(name, ".md");
		const pdf = text.match(/^pdf:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim() || `${slug}.pdf`;
		const key = `${issue}/${path.basename(pdf)}`;
		groups.set(key, [...(groups.get(key) || []), { issue, slug, file, text, pdf: path.basename(pdf) }]);
	}
}

let created = 0;
for (const [key, records] of groups) {
	if (records.length < 2) continue;
	const stem = path.basename(records[0].pdf, ".pdf").toLowerCase();
	const keeper = records.find(({ slug }) => slug.toLowerCase() === stem) || records[0];
	const source = path.join(FILES, key);
	if (!fs.existsSync(source)) throw new Error(`Missing shared source PDF: ${source}`);
	for (const record of records) {
		if (record === keeper) continue;
		const nextName = `${record.slug}.pdf`;
		const target = path.join(FILES, record.issue, nextName);
		if (!fs.existsSync(target)) fs.copyFileSync(source, target);
		const nextText = /^pdf:/m.test(record.text)
			? record.text.replace(/^pdf:[^\r\n]*$/m, `pdf: ${nextName}`)
			: record.text.replace(/^doi:[^\r\n]*$/m, (line) => `${line}\npdf: ${nextName}`);
		fs.writeFileSync(record.file, nextText);
		created++;
	}
}
console.log(`${created} shared JCRT records now use distinct slug-named PDFs.`);
