# Changelog

All notable changes to this project are documented in this file.

## [0.0.1] - 2026-07-14

Initial version created from the JCRT metadata development chat.

### Repository setup

- Created the standalone `jcrt-meta` project.
- Created `metadata/archives/` with one `metadata.json` array for each numbered
  issue directory in `../jcrt-v2/content/archives/`.
- Added `package.json` commands for deterministic generation and validation.
- Added this README with regeneration instructions.
- Declared package version `0.0.1`.

### Metadata generation

- Studied the existing JCRT archive front matter, FAIR exports, and local
  KCWorks import examples before defining the output format.
- Added `scripts/generate-archives.mjs` to read archive YAML front matter and
  regenerate the repository metadata without manually editing JSON.
- Generated 67 issue-level metadata files containing 801 article records.
- Preserved journal title, volume, issue, pages, publication date, publisher,
  ISSN, descriptions, creators, keywords, URLs, DOI values, and PDF entries
  when present.
- Mapped each source `nanoid` to a KCWorks identifier using the
  `import-recid` scheme.
- Added the requested owner to every record at `parent.access.owned_by`:
  Adam DJ Brett, `adam@adamdjbrett.com`, KC username `adamdjbrett`.
- Excluded records marked `published: false`.
- Excluded known non-article slugs: `index`, `bios`, `author-bios`,
  `table-of-contents`, and `abstracts`.
- Added `JCRT Editors` as the fallback creator for otherwise authorless
  article records.

### Controlled subjects

- Copied the controlled FAST and Homosaurus subjects generated in `jcrt-v2`
  into KCWorks metadata.
- Preserved each subject's label, vocabulary scheme, identifier, canonical
  URI, and authority category.
- Exported 1,900 FAST subjects and 4 Homosaurus subjects.
- Retained the vocabulary precedence established during enrichment:
  DataCite, FAIR, FAST, then Homosaurus.

### Journal article publishing

- Added the reusable Pandoc journal article template under
  `templates/jcrt-journal-article/` with relative, team-portable paths.
- Added PDF and DOCX generation, a styled reference DOCX, the JCRT SVG logo,
  Book Antiqua-compatible typography, cover-page metadata, copyright and
  license information, abstracts, keywords, bookmarks, and external links.
- Added macOS, Windows, and Ubuntu setup and usage instructions.
- Added the Crockett sample source and regenerated PDF and DOCX outputs.
- Added the printable “Read this article on JCRT” link followed by its full
  URL.

### Accessibility

- Added descriptive alternative text for the JCRT logo.
- Added language, title, author, subject, keyword, rights, ISSN, URL, and
  license metadata to generated documents.
- Enabled the PDF document-title display preference required by Acrobat's
  Title accessibility check.
- Changed PDF output to Acrobat-compatible PDF/UA-1 and PDF 1.7 tagging.
- Corrected list tagging so every `Lbl` and `LBody` is nested under an `LI`.
- Mapped the front matter `title` to the single semantic `H1`, shifted article
  sections to begin at `H2`, and removed duplicate body title headings.
- Verified the Crockett PDF as tagged, free of suspect content, and
  structurally valid; the DOCX accessibility audit reported no findings.

### Archive PDF collection

- Normalized legacy archive heading syntax in `jcrt-v2`, replacing Setext
  headings and ensuring source articles use `##` as their highest level.
- Created `archives/` with 25 mirrored numbered issue folders.
- Sequentially generated 131 accessible PDFs for every numbered-folder
  Markdown article whose front matter contains `pdf: false`.
- Confirmed the generated manifest exactly matches the 131 eligible source
  articles, with no missing or unexpected PDFs.
- Validated every generated PDF with `qpdf`; all 131 are tagged and report no
  suspect content.

### Validation

- Parsed all 67 generated JSON files successfully.
- Confirmed all 801 records have unique `import-recid` identifiers.
- Confirmed every record contains the requested owner block.
- Confirmed no emitted record has an empty creator list.
- Confirmed every controlled subject has a label, scheme, identifier, URI,
  and category.
- Added `npm run check`; deterministic validation reported zero outdated
  issue files.

### Licensing and publication preparation

- Added the official GNU Affero General Public License version 3 text.
- Declared the project license as `AGPL-3.0-only` in `package.json`.
- Added repository publication instructions using Git and GitHub CLI:
  initialize Git, create the first commit, and create
  `The-Whitestone-Foundation/jcrt-meta` with `gh repo create`.

[0.0.1]: https://github.com/The-Whitestone-Foundation/jcrt-meta/releases/tag/v0.0.1
