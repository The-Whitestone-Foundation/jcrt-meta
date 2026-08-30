#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// Titles may carry inline markdown (e.g. *Confessions*). Deposit records are
// plain text, so reuse the jcrt-v2 helper rather than keeping a second rule here.
import { stripMarkdown } from "../../jcrt-v2/_config/markdownTitle.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.resolve(ROOT, "..", "jcrt-v2", "content", "archives");
const AUTHOR_SOURCE = path.resolve(ROOT, "..", "jcrt-v2", "content", "authors");
const ARCHIVES = path.join(ROOT, "archives");
const require = createRequire(path.join(ROOT, "..", "jcrt-v2", "package.json"));
const yaml = require("js-yaml");

const check = process.argv.includes("--check");
const RIGHTS_TEXT = "Copyright held by the author(s). Published in the Journal for Cultural and Religious Theory.";
const RIGHTS_URL = "https://jcrt.org/copyright/";
const zipEntries = new Map();

const owner = {
  access: {
    owned_by: [{
      full_name: "Adam DJ Brett",
      email: "adam@adamdjbrett.com",
      identifiers: [{ identifier: "adamdjbrett", scheme: "kc_username" }],
    }],
  },
};

function frontMatter(file) {
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/);
  if (!match) throw new Error(`Missing front matter: ${file}`);
  return yaml.load(match[1]) || {};
}

function nameKey(value) {
  return String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const authorIdentifiers = new Map();
for (const name of fs.readdirSync(AUTHOR_SOURCE).filter((name) => name.endsWith(".md"))) {
  const data = frontMatter(path.join(AUTHOR_SOURCE, name));
  const identifiers = [];
  const orcid = String(data.orcid || "").match(/(?:orcid\.org\/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i)?.[1];
  if (orcid) identifiers.push({ identifier: orcid, scheme: "orcid" });
  for (const value of Array.isArray(data.sameAs) ? data.sameAs : []) {
    const isni = String(value).match(/isni\.org\/isni\/([\dX]+)/i)?.[1];
    if (isni) identifiers.push({ identifier: isni, scheme: "isni" });
  }
  if (identifiers.length && data.name) authorIdentifiers.set(nameKey(data.name), identifiers);
}

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

function authors(value, affiliation) {
  const names = (Array.isArray(value) ? value : String(value || "").split(/\s*;\s*|\s+and\s+/)).filter(Boolean);
  const creators = names.map((name) => {
    const parts = String(name).trim().split(/\s+/);
    // A generational suffix is not the family name: "John B. Cobb Jr." must
    // deposit as Cobb / John B., not as family_name "Jr.".
    let suffix = "";
    if (parts.length > 2 && NAME_SUFFIXES.has(parts[parts.length - 1].replace(/\.$/, "").toLowerCase())) {
      suffix = parts.pop();
    }
    const family_name = parts.pop() || "";
    const given_name = parts.join(" ");
    const inverted = given_name ? `${family_name}, ${given_name}` : family_name;
    const creator = {
      person_or_org: {
        type: "personal",
        name: suffix ? `${inverted}, ${suffix}` : inverted,
        given_name,
        family_name,
      },
      role: { id: "author" },
    };
    const identifiers = authorIdentifiers.get(nameKey(name));
    if (identifiers) creator.person_or_org.identifiers = identifiers;
    if (affiliation) creator.affiliations = [{ name: String(affiliation) }];
    return creator;
  });
  return creators.length ? creators : [{
    person_or_org: {
      type: "personal",
      name: "JCRT Editors",
      given_name: "JCRT",
      family_name: "Editors",
    },
    role: { id: "author" },
  }];
}

function date(value, year) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value || year || "");
  return text.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || text.match(/^\d{4}/)?.[0] || "";
}

const FAST_FACETS = new Map([
  ["topical", "FAST-topical"],
  ["geographic", "FAST-geographic"],
  ["corporate", "FAST-corporate"],
  ["form-genre", "FAST-formgenre"],
  ["event", "FAST-event"],
  ["meeting", "FAST-meeting"],
  ["personal", "FAST-personal"],
  ["title", "FAST-title"],
  ["chronological", "FAST-chronological"],
]);

// KCWorks keys its authority vocabularies on exact id strings: FAST on
// http://id.worldcat.org/fast/<n> and Homosaurus on the v3 URI. The front
// matter stores https FAST URIs and v5 Homosaurus URIs, so normalize here
// rather than rewriting 821 source files.
function subjectId(uri, file) {
  const fast = String(uri || "").match(/^https?:\/\/id\.worldcat\.org\/fast\/(\d+)$/);
  if (fast) return `http://id.worldcat.org/fast/${fast[1]}`;
  const homosaurus = String(uri || "").match(/^https?:\/\/homosaurus\.org\/v\d+\/(homoit\d+)$/);
  if (homosaurus) return `https://homosaurus.org/v3/${homosaurus[1]}`;
  throw new Error(`Unrecognized subject URI (${uri}): ${file}`);
}

function subjects(value, file) {
  return (Array.isArray(value) ? value : []).map(({ label, scheme, uri, category }) => {
    const facet = FAST_FACETS.get(String(category || ""));
    if (scheme === "FAST" && !facet) throw new Error(`Unrecognized FAST category (${category}): ${file}`);
    return {
      id: subjectId(uri, file),
      subject: label,
      scheme: scheme === "FAST" ? facet : scheme,
    };
  });
}

function pdfEntry(issue, pdf) {
	if (/^https?:\/\//i.test(String(pdf))) return null;
	const key = String(pdf).replace(/^\/+/, "");
	const archive = path.join(ARCHIVES, `${issue}.zip`);
	if (!fs.existsSync(archive)) throw new Error(`Missing ZIP: ${archive}`);
	if (!zipEntries.has(issue)) {
		const listed = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
		if (listed.status !== 0) throw new Error(`Cannot read ZIP: ${archive}`);
		zipEntries.set(issue, listed.stdout.trim().split("\n").filter(Boolean));
	}
	const entry = zipEntries.get(issue).find((name) => name === key) || zipEntries.get(issue).find((name) => name.toLowerCase() === key.toLowerCase());
	if (!entry) throw new Error(`Missing PDF in ZIP: ${archive}:${key}`);
	const result = spawnSync("unzip", ["-p", archive, entry], { encoding: null, maxBuffer: 256 * 1024 * 1024 });
	if (result.status !== 0) throw new Error(`Missing PDF in ZIP: ${archive}:${key}`);
	// Key on the real ZIP entry, not the requested name: the lookup above falls
	// back to a case-insensitive match, and KCWorks pairs uploaded files to
	// entries by exact filename (22.1/grane.md asks for Grane.pdf, file is grane.pdf).
	return { [entry]: { size: result.stdout.length, key: entry } };
}

function record(issue, file) {
  const data = frontMatter(file);
  if (data.published === false) return null;
	if (!data.nanoid) throw new Error(`Missing nanoid: ${file}`);
	const slug = path.basename(file, ".md");
	const pdf = typeof data.pdf === "string" && data.pdf.trim() ? data.pdf.trim() : `${slug}.pdf`;
  const identifiers = [
    { identifier: String(data.nanoid), scheme: "import-recid" },
    { identifier: `https://jcrt.org/archives/${issue}/${slug}/`, scheme: "url" },
  ];
  if (data.doi) identifiers.push({ identifier: String(data.doi), scheme: "doi" });
  const metadata = {
    resource_type: { id: "textDocument-journalArticle" },
    creators: authors(data.author || data.authors, data.affiliation),
    title: stripMarkdown(String(data.title || slug)),
    publisher: "Whitestone Publications",
    publication_date: date(data.date, data.year),
    languages: [{ id: "eng" }],
    identifiers,
		rights: [{ title: { en: RIGHTS_TEXT }, link: RIGHTS_URL }],
    description: String(data.description || data.abstract || ""),
  };
  const controlled = subjects(data.subjects, file);
  if (controlled.length) metadata.subjects = controlled;
  const result = {
    metadata,
    custom_fields: {
      "journal:journal": {
        title: "Journal for Cultural & Religious Theory",
        issue: String(data.issue || issue.split(".")[1] || ""),
        volume: String(data.volume || Number(issue.split(".")[0]) || ""),
        pages: String(data.pages || ""),
        issn: "1530-5228",
      },
      "kcr:user_defined_tags": Array.isArray(data.keywords) ? data.keywords : [],
    },
    parent: owner,
		files: { enabled: true },
	};
	const entries = pdfEntry(issue, pdf);
	result.files.entries = entries;
  return result;
}

const issues = fs.readdirSync(SOURCE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d+\.\d+$/.test(entry.name))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

let articles = 0;
let controlled = 0;
let changed = 0;
const expected = new Set();
for (const issue of issues) {
  const dir = path.join(SOURCE, issue);
  const records = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => record(issue, path.join(dir, name)))
    .filter(Boolean);
  articles += records.length;
  controlled += records.reduce((sum, item) => sum + (item.metadata.subjects?.length || 0), 0);
  if (!records.length) continue;
  const output = `${JSON.stringify(records, null, 2)}\n`;
  const target = path.join(ARCHIVES, `${issue}.metadata.json`);
  expected.add(path.basename(target));
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current !== output) {
    changed += 1;
    if (!check) fs.writeFileSync(target, output);
  }
}

for (const name of fs.readdirSync(ARCHIVES).filter((name) => name.endsWith(".metadata.json") && !expected.has(name))) {
  changed += 1;
  if (!check) fs.unlinkSync(path.join(ARCHIVES, name));
}

console.log(`${expected.size} published issues, ${articles} articles, ${controlled} controlled subjects, ${changed} ${check ? "outdated" : "written"}`);
if (check && changed) process.exitCode = 1;
