#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V2 = path.resolve(ROOT, "..", "jcrt-v2");
const FILES = path.resolve(ROOT, "..", "jcrt-files");
const SOURCE = path.join(V2, "content", "archives");
const ARCHIVES = path.join(ROOT, "archives");
const METADATA = path.join(ROOT, "metadata", "archives");
const require = createRequire(path.join(V2, "package.json"));
const yaml = require("js-yaml");
const check = process.argv.includes("--check");

function run(command, args, options = {}) {
	const result = spawnSync(command, args, { cwd: ROOT, encoding: options.binary ? null : "utf8", maxBuffer: 256 * 1024 * 1024, stdio: options.capture ? "pipe" : "inherit" });
	if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed${result.stderr ? `: ${String(result.stderr).trim()}` : ""}`);
	return result.stdout || "";
}

function frontMatter(file) {
	const match = fs.readFileSync(file, "utf8").match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
	if (!match) throw new Error(`Missing front matter: ${file}`);
	return yaml.load(match[1]) || {};
}

function sha256(file) {
	return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const issues = fs.readdirSync(SOURCE, { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && /^\d+\.\d+$/.test(entry.name))
	.map((entry) => entry.name)
	.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

function publishedFiles(issue) {
	return fs.readdirSync(path.join(SOURCE, issue))
		.filter((name) => name.endsWith(".md"))
		.map((name) => ({ name, data: frontMatter(path.join(SOURCE, issue, name)) }))
		.filter(({ data }) => data.published !== false);
}

function validate() {
	const publishedIssues = issues.filter((issue) => publishedFiles(issue).length);
	const pdfs = publishedIssues.flatMap((issue) => {
		const dir = path.join(ARCHIVES, issue);
		if (!fs.existsSync(dir)) throw new Error(`Missing archive directory: ${dir}`);
		return fs.readdirSync(dir).filter((name) => name.endsWith(".pdf")).map((name) => path.join(dir, name));
	});
	if (publishedIssues.length !== 66) throw new Error(`Expected 66 published issues, found ${publishedIssues.length}`);
	if (pdfs.length !== 785) throw new Error(`Expected 785 PDFs, found ${pdfs.length}`);
	run("python3", [path.join(ROOT, "scripts", "check_pdf_accessibility.py"), ARCHIVES]);
	for (const pdf of pdfs) {
		run("qpdf", ["--check", pdf], { capture: true });
		const info = run("pdfinfo", [pdf], { capture: true });
		for (const expected of [/^Title:\s+\S/m, /^Tagged:\s+yes$/m, /^Encrypted:\s+no$/m]) {
			if (!expected.test(info)) throw new Error(`PDF metadata check failed (${expected}): ${pdf}`);
		}
		const text = run("pdftotext", [pdf, "-"], { capture: true }).trim();
		if (!text) throw new Error(`PDF has no extractable text: ${pdf}`);
		const zip = path.join(ARCHIVES, `${path.basename(path.dirname(pdf))}.zip`);
		if (!fs.existsSync(zip)) throw new Error(`Missing ZIP: ${zip}`);
	}
	for (const issue of publishedIssues) {
		const dir = path.join(ARCHIVES, issue);
		const pdfNames = fs.readdirSync(dir).filter((name) => name.endsWith(".pdf")).sort();
		const zip = path.join(ARCHIVES, `${issue}.zip`);
		const entries = run("unzip", ["-Z1", zip], { capture: true }).trim().split("\n").filter(Boolean).sort();
		if (JSON.stringify(entries) !== JSON.stringify(pdfNames) || entries.some((name) => path.basename(name) !== name || !/^[^.].*\.pdf$/.test(name))) {
			throw new Error(`ZIP contents do not exactly match PDFs: ${zip}`);
		}
		for (const name of entries) {
			const extracted = run("unzip", ["-p", zip, name], { capture: true, binary: true });
			const digest = crypto.createHash("sha256").update(extracted).digest("hex");
			if (digest !== sha256(path.join(dir, name))) throw new Error(`ZIP checksum mismatch: ${zip}:${name}`);
		}
	}
	const metadataFiles = issues.filter((issue) => fs.existsSync(path.join(METADATA, issue, "metadata.json")));
	const records = metadataFiles.reduce((sum, issue) => sum + JSON.parse(fs.readFileSync(path.join(METADATA, issue, "metadata.json"))).length, 0);
	if (metadataFiles.length !== 67 || records !== 819) throw new Error(`Expected 67 metadata files and 819 records, found ${metadataFiles.length} and ${records}`);
	console.log(`Validated ${pdfs.length} PDFs, ${publishedIssues.length} PDF-only ZIPs, ${metadataFiles.length} metadata files, and ${records} records.`);
}

if (check) {
	validate();
	process.exit(0);
}

for (const issue of fs.readdirSync(path.join(FILES, "archives"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
	const source = path.join(FILES, "archives", issue);
	const target = path.join(ARCHIVES, issue);
	fs.mkdirSync(target, { recursive: true });
	for (const name of fs.readdirSync(source).filter((name) => name.endsWith(".pdf"))) fs.copyFileSync(path.join(source, name), path.join(target, name));
}

for (const issue of issues) {
	const published = publishedFiles(issue);
	if (!published.length) continue;
	const target = path.join(ARCHIVES, issue);
	fs.mkdirSync(target, { recursive: true });
	for (const { name, data } of published) {
		const pdf = data.pdf ? path.basename(String(data.pdf)) : `${path.basename(name, ".md")}.pdf`;
		if (fs.existsSync(path.join(target, pdf))) continue;
		run("sh", [path.join(ROOT, "templates", "jcrt-journal-article", "build-article.sh"), path.join(SOURCE, issue, name), target]);
		const docx = path.join(target, `${path.basename(name, ".md")}.docx`);
		if (fs.existsSync(docx)) fs.unlinkSync(docx);
	}
	for (const pdf of fs.readdirSync(target).filter((name) => name.endsWith(".pdf")).map((name) => path.join(target, name))) {
		if (run("pdftotext", [pdf, "-"], { capture: true }).trim()) continue;
		run("ocrmypdf", ["--mode", "skip", "--output-type", "pdf", "--optimize", "1", pdf, pdf]);
	}
	const citations = path.join(FILES, "citations", "archives", issue);
	run("python3", [
		path.join(FILES, "scripts", "update_pdf_metadata.py"),
		"--updates-dir", target,
		"--archive-dir", target,
		"--existing-metadata-dir", target,
		"--content-dir", path.join(SOURCE, issue),
		"--archive-base-url", `https://jcrt.org/archives/${issue}`,
		...(fs.existsSync(citations) ? ["--citations-dir", citations] : []),
	]);
}

run("node", [path.join(ROOT, "scripts", "generate-archives.mjs")]);

for (const issue of issues.filter((name) => publishedFiles(name).length)) {
	const dir = path.join(ARCHIVES, issue);
	const pdfs = fs.readdirSync(dir).filter((name) => name.endsWith(".pdf")).sort().map((name) => path.join(dir, name));
	const zip = path.join(ARCHIVES, `${issue}.zip`);
	if (fs.existsSync(zip)) fs.unlinkSync(zip);
	run("zip", ["-j", "-q", zip, ...pdfs]);
}

validate();
