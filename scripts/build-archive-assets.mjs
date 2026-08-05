#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V2 = path.resolve(ROOT, "..", "jcrt-v2");
const FILES = path.resolve(ROOT, "..", "jcrt-files");
const SOURCE = path.join(V2, "content", "archives");
const ARCHIVES = path.join(ROOT, "archives");
const require = createRequire(path.join(V2, "package.json"));
const yaml = require("js-yaml");
const check = process.argv.includes("--check");
const pdfUaCheck = process.argv.includes("--pdf-ua-check");

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

const publishedIssues = issues.filter((issue) => publishedFiles(issue).length);

function extractArchives(work) {
	for (const issue of publishedIssues) {
		const target = path.join(work, issue);
		fs.mkdirSync(target, { recursive: true });
		const zip = path.join(ARCHIVES, `${issue}.zip`);
		if (fs.existsSync(zip)) run("unzip", ["-q", zip, "-d", target]);
		else if (check || pdfUaCheck) throw new Error(`Missing ZIP: ${zip}`);
	}
}

function validate(work) {
	if (publishedIssues.length !== 66) throw new Error(`Expected 66 published issues, found ${publishedIssues.length}`);
	const expected = new Set(publishedIssues.flatMap((issue) => [`${issue}.zip`, `${issue}.metadata.json`]));
	const unexpected = fs.readdirSync(ARCHIVES).filter((name) => !expected.has(name));
	const missing = [...expected].filter((name) => !fs.existsSync(path.join(ARCHIVES, name)));
	if (unexpected.length || missing.length) throw new Error(`Archive layout mismatch; unexpected: ${unexpected.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}`);

	const pdfs = publishedIssues.flatMap((issue) => fs.readdirSync(path.join(work, issue))
		.filter((name) => name.endsWith(".pdf"))
		.map((name) => path.join(work, issue, name)));
	if (pdfs.length !== 785) throw new Error(`Expected 785 PDFs, found ${pdfs.length}`);
	run("python3", [path.join(ROOT, "scripts", "check_pdf_accessibility.py"), work]);
	for (const pdf of pdfs) {
		run("qpdf", ["--check", pdf], { capture: true });
		const info = run("pdfinfo", [pdf], { capture: true });
		for (const expectedValue of [/^Title:\s+\S/m, /^Tagged:\s+yes$/m, /^Encrypted:\s+no$/m]) {
			if (!expectedValue.test(info)) throw new Error(`PDF metadata check failed (${expectedValue}): ${pdf}`);
		}
		if (!run("pdftotext", [pdf, "-"], { capture: true }).trim()) throw new Error(`PDF has no extractable text: ${pdf}`);
	}
	for (const issue of publishedIssues) {
		const dir = path.join(work, issue);
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
	const records = publishedIssues.reduce((sum, issue) => sum + JSON.parse(fs.readFileSync(path.join(ARCHIVES, `${issue}.metadata.json`))).length, 0);
	if (records !== 819) throw new Error(`Expected 819 metadata records, found ${records}`);
	console.log(`Validated ${pdfs.length} PDFs, ${publishedIssues.length} ZIP/metadata pairs, and ${records} records.`);
}

function build(work) {
	for (const issue of fs.readdirSync(path.join(FILES, "archives"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
		const source = path.join(FILES, "archives", issue);
		const target = path.join(work, issue);
		fs.mkdirSync(target, { recursive: true });
		for (const name of fs.readdirSync(source).filter((name) => name.endsWith(".pdf"))) fs.copyFileSync(path.join(source, name), path.join(target, name));
	}

	for (const issue of publishedIssues) {
		const target = path.join(work, issue);
		fs.mkdirSync(target, { recursive: true });
		for (const { name, data } of publishedFiles(issue)) {
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

	for (const issue of publishedIssues) {
		const dir = path.join(work, issue);
		const pdfs = fs.readdirSync(dir).filter((name) => name.endsWith(".pdf")).sort().map((name) => path.join(dir, name));
		const zip = path.join(ARCHIVES, `${issue}.zip`);
		const next = path.join(ARCHIVES, `.${issue}.next.zip`);
		try {
			if (fs.existsSync(next)) fs.unlinkSync(next);
			run("zip", ["-j", "-q", next, ...pdfs]);
			fs.renameSync(next, zip);
		} finally {
			if (fs.existsSync(next)) fs.unlinkSync(next);
		}
	}
	run("node", [path.join(ROOT, "scripts", "generate-archives.mjs")]);
	validate(work);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "jcrt-meta-"));
try {
	extractArchives(work);
	if (pdfUaCheck) run("verapdf", ["-f", "ua1", "--format", "text", "--processes", "4", "-r", work]);
	else if (check) validate(work);
	else build(work);
} finally {
	fs.rmSync(work, { recursive: true, force: true });
}
