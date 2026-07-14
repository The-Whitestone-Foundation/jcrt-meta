#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.resolve(ROOT, "..", "jcrt-v2", "content", "archives");
const FILES = path.resolve(ROOT, "..", "jcrt-files", "archives");
const OUT = path.join(ROOT, "metadata", "archives");
const require = createRequire(path.join(ROOT, "..", "jcrt-v2", "package.json"));
const yaml = require("js-yaml");
const check = process.argv.includes("--check");
const NON_ARTICLES = new Set(["index", "bios", "author-bios", "table-of-contents", "abstracts"]);

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

function authors(value, affiliation) {
  const names = (Array.isArray(value) ? value : String(value || "").split(/\s*;\s*|\s+and\s+/)).filter(Boolean);
  const creators = names.map((name) => {
    const parts = String(name).trim().split(/\s+/);
    const family_name = parts.pop() || "";
    const given_name = parts.join(" ");
    const creator = {
      person_or_org: {
        type: "personal",
        name: given_name ? `${family_name}, ${given_name}` : family_name,
        given_name,
        family_name,
      },
      role: { id: "author" },
    };
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

function subjects(value) {
  return (Array.isArray(value) ? value : []).map(({ label, scheme, identifier, uri, category }) => ({
    subject: label,
    scheme,
    identifier,
    uri,
    category,
  }));
}

function pdfEntry(issue, pdf) {
  if (!pdf || /^https?:\/\//i.test(String(pdf))) return null;
  const key = String(pdf).replace(/^\/+/, "");
  const local = path.join(FILES, issue, key);
  return fs.existsSync(local) ? { [key]: { size: fs.statSync(local).size, key } } : { [key]: { key } };
}

function record(issue, file) {
  const data = frontMatter(file);
  if (data.published === false) return null;
  if (!data.nanoid) throw new Error(`Missing nanoid: ${file}`);
  const slug = path.basename(file, ".md");
  if (NON_ARTICLES.has(slug.toLowerCase())) return null;
  const pdf = typeof data.pdf === "string" ? data.pdf.trim() : "";
  const identifiers = [
    { identifier: String(data.nanoid), scheme: "import-recid" },
    { identifier: "1530-5228", scheme: "issn" },
    { identifier: `https://jcrt.org/archives/${issue}/${slug}/`, scheme: "url" },
  ];
  if (data.doi) identifiers.push({ identifier: String(data.doi), scheme: "doi" });
  const metadata = {
    resource_type: { id: "textDocument-journalArticle" },
    creators: authors(data.author || data.authors, data.affiliation),
    title: String(data.title || slug),
    publisher: "Whitestone Publications",
    publication_date: date(data.date, data.year),
    languages: [{ id: "eng" }],
    identifiers,
    rights: [{ id: "cc-by-4.0", title: { en: "Creative Commons Attribution 4.0 International" } }],
    description: String(data.description || data.abstract || ""),
  };
  const controlled = subjects(data.subjects);
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
    files: { enabled: Boolean(pdf) },
  };
  const entries = pdfEntry(issue, pdf);
  if (entries) result.files.entries = entries;
  return result;
}

const issues = fs.readdirSync(SOURCE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d+\.\d+$/.test(entry.name))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

let articles = 0;
let controlled = 0;
let changed = 0;
for (const issue of issues) {
  const dir = path.join(SOURCE, issue);
  const records = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => record(issue, path.join(dir, name)))
    .filter(Boolean);
  articles += records.length;
  controlled += records.reduce((sum, item) => sum + (item.metadata.subjects?.length || 0), 0);
  const output = `${JSON.stringify(records, null, 2)}\n`;
  const target = path.join(OUT, issue, "metadata.json");
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current !== output) {
    changed += 1;
    if (!check) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, output);
    }
  }
}

console.log(`${issues.length} issues, ${articles} articles, ${controlled} controlled subjects, ${changed} ${check ? "outdated" : "written"}`);
if (check && changed) process.exitCode = 1;
