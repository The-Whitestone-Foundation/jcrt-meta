# CHANGELOG

All notable changes to this project are documented in this file.

Each version below records one Git commit, in chronological order. Commit hashes
link to the corresponding repository diff.

## [0.0.7] - 2026-07-19 — jcrt-v2 archives: keywords, FAST subjects, indentation (round 2)

Second cleanup pass over `content/archives/` folders 01.*–04.* (116 `.md` files). Continues the entry below.

### Keywords (116/116 files)
- Added content-derived topical `keywords:` (lowercase hyphen-joined slugs, ~8–15 per article) to the 108 files that had empty `keywords: []`; the 8 already-populated files were left untouched. Derived from each article body; the 04.3 book-review stubs (frontmatter-only) drew from their referenced PDFs in `jcrt-files/archives/04.3/`.

### FAST subjects (115/116 files; `04.1/index2.md` is a TOC page, left empty)
- Added OCLC FAST subject headings to the 108 files with empty `subjects:` (8 already-populated skipped).
- Every heading **live-verified** against `fast.oclc.org/searchfast/fastsuggest` — authorized (`type:auth`) records only. `identifier` = FAST `idroot`; `uri` = `id.worldcat.org/fast/<idroot minus "fst"+leading zeros>`; `category` from MARC tag (100→personal, 130→uniform-title, 147/111→event, 150→topical, 151→geographic). Subjects alphabetized by label. Terms with no confident authorized match were **dropped, never fabricated**.
- 424 unique FAST identifiers written; all 116 frontmatter blocks parse as valid YAML; a 15-ID sample all resolve HTTP 200.
- Fixed a homograph: "Barth, Karl" used the wrong `fst00147863` (a `type:alt` cross-ref, 1896–1962 person) in `02.2/tatusko.md` and `04.3/michaud.md` → corrected to authorized theologian `fst00038092` (1886–1968).

### Separator normalization (round 2)
- Collapsed stacked/duplicated horizontal-rule runs (2+ consecutive indented `* * *` separated by blank lines) → single `***` in `01.3/kosky.md` (2 runs) and `02.1/sugimoto.md` (one 6-rule run). Isolated single rules preserved.

### Body-indentation cleanup (158 lines, 72 files)
- Flushed stray-indented body prose (migration left paragraphs indented 4–5 spaces, rendering as code blocks) to the left margin. **List-aware**: list items, blockquotes, and nested list-item continuations (e.g. `01.3/crockett.md`, `02.2/taylor.md` under `1. _The Logic of Sense_` / `2. _Difference and Repetition_`) were preserved. 0 stray-indented prose remain; all frontmatter still valid YAML.

### Notes / still open
- `03.2/taylor.md` `[^18]:` footnote still needs its citation text.
- `04.2` — `lambert.md` / `rabate-lambert.md` / `lambert-taylor.intro.md` have bodies that don't match their titles (migration shuffle); keywords/subjects were derived from each file's actual body content.
- `03.1/gooch.md`, `04.1/kosky.md` duplicate-definition footnote swaps still unaddressed.
- Reconstructed footnote/body ordering and keyword/subject accuracy still pending verification against the original PDFs.

## [0.0.6] - 2026-07-19 — jcrt-v2 archives cleanup (content/archives/, folders 01.*–04.*)

Bulk migration-artifact cleanup across the JCRT v2 archive markdown. All paths under `content/archives/`.

### Bracket / escaping fixes
- **Single-letter escaped brackets → bare letter** (`\[U\]` → `U`, etc.): 54 occurrences across 21 files in `content/archives/`. Special case: `Semiotext\[e\]` → `Semiotext(e)` in `04.1/hamner.md` (publisher name).
- **religioustheory single-letter brackets → bare letter**: 95 occurrences.
- **All remaining escaped word/phrase brackets → HTML entities** across `content/`: `\[` → `&#91;`, `\]` → `&#93;` (~1113 / ~1101). This preserves the visible brackets on editorial insertions like `[Church]` while fixing the markdown escaping.
- **Repaired footnote refs that the entity pass had mangled** (`&#91;^N]` → `[^N]`) in `03.1/gooch.md`, `04.1/kosky.md`, `04.1/mcgrath.md`.

### Footnote reconstruction (body/footnote swap from bad HTML→MD migration)
Diagnosis: `[^_ftnrefN]` entries were the real footnotes (missing the `:`), and plain `[^M]:` entries were article BODY paragraphs mislabeled as footnote definitions. Fixed 4 files by converting `[^_ftnrefN]` → `[^N]:` and lifting the `[^M]:` paragraphs back into the article body (file order preserved):
- `04.1/hamner.md` — 14 footnotes, 21 body paragraphs (restored under existing section headers).
- `04.1/egginton.md` — 36 footnotes, 44 body paragraphs (continuous body; two stray block quotes relocated by textual inference).
- `03.2/taylor.md` — 29 footnotes, 23 body paragraphs. NOTE: `[^18]:` is empty in source — needs its citation text filled by hand.
- `04.1/mcgrath.md` — 27 footnotes, 12 body paragraphs. Also collapsed 25 doubled inline refs (`[^N][^N]` → `[^N]`).
- All four verified: every in-text `[^n]` resolves to exactly one `[^n]:` definition and vice versa; zero `ftnref` remain in `content/archives/`.

### Blockquote & separator normalization
- **De-indented over-indented blockquotes** in 42 `pdf: false` files (272 lines): `     > …` (rendered as code blocks) → flush `> …`.
- **Collapsed the empty-bio-placeholder block** (`* * *` / empty `>` / `* * *`) → single `***` in 79 files.

### bios file
- `18.3/bios.md`: rejoined blank-line-split paragraphs, merged shattered italic titles into clean spans, fixed double spaces / space-before-punctuation / escaped hyphen / double underscore. Content fixes: `in a doctoral student` → `is a`, `Emmanuel Faique` → `Emmanuel Falque`, `Associate professor` → `Associate Professor`, `(Routledge 2016)` → `(Routledge, 2016)`.

### Frontmatter standardization (116 files, folders 01.*–04.*)
- Reordered every file's frontmatter to the canonical 15-field order: `nanoid, doi, atproto, article_number, volume, issue, pages, title, author, affiliation, description, pdf, date, keywords, subjects`.
- Renamed `affilation` → `affiliation` (templates already read `affiliation or affilation`, so safe).
- Added missing target fields as empty keys; multiline `keywords`/`subjects` YAML preserved verbatim.
- **Preserved** legacy fields `abstract`, `year`, `sort_id`, `season`, `tags` (appended after `subjects`) rather than renaming/dropping — the site templates depend on them: `year` = sort key in `eleventy.config.js` + SEO date; `abstract` = rendered in `archive_article.njk`; `sort_id` = TOC ordering; `season` = issue index display.
- **Filled `volume`/`issue`/`year`** in all 116 files from each folder's `index.njk` (source of truth): 01.1=(1,1,1999) 01.2=(1,2,2000) 01.3=(1,3,2000) 02.1=(2,1,2000) 02.2=(2,2,2001) 02.3=(2,3,2001) 03.1=(3,1,2001) 03.2=(3,2,2002) 03.3=(3,3,2002) 04.1=(4,1,2002) 04.2=(4,2,2003) 04.3=(4,3,2003). (99 files changed; 17 already matched.)

### Open follow-ups (not yet done)
- Verify reconstructed footnote/body ordering and section placement against the original published PDFs (placement was inferred from file order).
- `03.2/taylor.md` `[^18]:` needs its citation text.
- `03.1/gooch.md` and `04.1/kosky.md` have the same body/footnote swap in a different form (duplicate `[^N]:` definitions, no `ftnref`) — not yet fixed.
- Optional: fully migrate `abstract` → `description` and `year` → `date`, dropping the legacy keys, which also requires updating the template references noted above.

## [0.0.5] - 2026-07-14

Commit [`823a867`](https://github.com/The-Whitestone-Foundation/jcrt-meta/commit/823a867d1ddf8972c8e563c93d580e2cbb1ed728) — `edit: CHANGELOG`

### Project documentation and versioning

- Added `CHANGELOG.md` with the complete initial development record covering
  repository setup, metadata generation, controlled subjects, article
  publishing, accessibility work, archive PDFs, validation, and licensing.
- Expanded `README.md` with a four-step metadata rebuild workflow using
  `npm run generate` and `npm run check`.
- Documented generator exclusions for unpublished records and non-article
  slugs, plus the `JCRT Editors` fallback for records without an author.
- Linked the README to the changelog and declared package version `0.0.1` in
  `package.json`.

### Archive PDF collection

- Added 49 generated archive PDFs across issues `04.1`, `04.2`, `08.1`,
  `10.2`, `12.2`, `13.1`, `13.2`, `14.2`, `15.1`, `16.1`, `16.3`, `18.1`,
  `18.3`, `19.3`, `20.3`, and `21.3`.
- Completed the issue `04.1` set with 10 articles and issue `04.2` with nine
  articles, then added 30 PDFs for later issues.
- Recorded 52 changed files and 16,837 inserted lines in the commit.

## [0.0.4] - 2026-07-14

Commit [`214b8fc`](https://github.com/The-Whitestone-Foundation/jcrt-meta/commit/214b8fcd2277f1dacc1fd9e06c67c792cc858abe) — `md to pdf convert`

### Archive PDF collection

- Created 82 generated article PDFs under `archives/`, mirroring the first
  nine numbered issue directories from `01.1` through `03.3`.
- Added 28 PDFs for volume 1, 26 for volume 2, and 28 for volume 3.
- Preserved source-derived filenames, including multi-author names such as
  `reinhard_lupton.pdf`, `taylor_raschke.pdf`, and
  `wyschogrod_raschke.pdf`.
- This was a binary-output-only commit: it added no source lines and removed
  none.

## [0.0.3] - 2026-07-14

Commit [`d62e337`](https://github.com/The-Whitestone-Foundation/jcrt-meta/commit/d62e3375aed022e3d661a93382cd8eec98b00383) — `edit template for md/only posts working`

### Accessible article output corrections

- Applied the DOCX accessibility Lua filter to PDF generation as well as DOCX
  generation, allowing shared removal of duplicate article-title headings.
- Shifted Markdown heading levels down by one during both output builds so the
  cover title becomes the single semantic `H1` and article sections begin at
  `H2`.
- Changed journal name, issue, and author cover elements from headings to
  paragraphs; retained the article title and abstract as structured headings
  and rendered keywords as an emphasized paragraph.
- Changed tagged PDF output from PDF/UA-2 with PDF 2.0 to the more broadly
  compatible PDF/UA-1 with PDF 1.7.
- Enabled `pdfdisplaydoctitle` and rendered the PDF cover title as an unnumbered
  section for correct title semantics.
- Regenerated the Crockett PDF and DOCX samples with the corrected templates.

## [0.0.2] - 2026-07-14

Commit [`676fd07`](https://github.com/The-Whitestone-Foundation/jcrt-meta/commit/676fd07d923db6056eeaf2305d767092f6546f62) — `edit: adding template for md/html only posts`

### Journal article publishing template

- Added the reusable `templates/jcrt-journal-article/` Pandoc toolchain for
  producing both LuaLaTeX PDF and reference-styled DOCX files from Markdown.
- Added `npm run article:build` and an executable POSIX build script with input
  validation, optional output-directory support, a portable template path,
  LuaTeX cache setup, citation processing, and emitted output paths.
- Added a 208-line LaTeX template with tagged PDF metadata, Book Antiqua or TeX
  Gyre Pagella typography, JCRT colors and page furniture, cover metadata,
  abstracts, keywords, citations, bookmarks, external links, rights, license,
  publisher, and ISSN fields.
- Added an 88-line Lua filter that builds an accessible DOCX cover, supplies
  metadata defaults, adds descriptive logo alternative text, and preserves a
  printable canonical article URL.
- Added the SVG JCRT logo and its vector PDF derivative, plus a styled DOCX
  reference file with accessible hyperlink presentation.
- Added the 215-line Crockett Markdown sample and generated matching PDF and
  DOCX examples.
- Added cross-platform requirements, commands, accessibility guidance, and
  verification instructions for macOS, Windows, and Ubuntu.

## [0.0.1] - 2026-07-14

Initial version created from the JCRT metadata development chat.

Commit [`4dfcd03`](https://github.com/The-Whitestone-Foundation/jcrt-meta/commit/4dfcd03946c9fb4511510b1b2e3ad9cdedbed0f4) — `license`

### Commit-specific licensing changes

- Added the complete 661-line GNU Affero General Public License version 3 as
  `LICENSE`.
- Declared the SPDX license identifier `AGPL-3.0-only` in `package.json`.
- Added the README license section and linked it to the repository license
  file.

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

## [0.0.0] - 2026-07-13

Commit [`95e7656`](https://github.com/The-Whitestone-Foundation/jcrt-meta/commit/95e765606edb9540b86a2f8a3fb9e06adf563c07) — `:rocket: init commit meta data`

### Initial repository and metadata generator

- Created the `jcrt-meta` repository structure, `.gitignore`, concise usage
  README, and private ESM `package.json`.
- Added `npm run generate` for deterministic archive regeneration and
  `npm run check` for validating committed output without rewriting it.
- Added the 161-line `scripts/generate-archives.mjs` generator to read JCRT
  archive front matter and construct KCWorks-ready metadata records.
- Created 67 issue-level `metadata.json` files under `metadata/archives/`,
  covering numbered issue directories `01.1` through `25.1`, plus the empty
  `28.2` issue output.
- Generated 801 article records while excluding unpublished content and known
  non-article pages.
- Preserved bibliographic fields, DOI and PDF data, controlled FAST and
  Homosaurus subjects, unique `import-recid` identifiers, ownership metadata,
  and fallback creator data.
- Recorded 71 new files and 88,758 inserted lines in the root commit.

[0.0.5]: https://github.com/The-Whitestone-Foundation/jcrt-meta/releases/tag/v0.0.5
[0.0.4]: https://github.com/The-Whitestone-Foundation/jcrt-meta/releases/tag/v0.0.4
[0.0.3]: https://github.com/The-Whitestone-Foundation/jcrt-meta/releases/tag/v0.0.3
[0.0.2]: https://github.com/The-Whitestone-Foundation/jcrt-meta/releases/tag/v0.0.2
[0.0.1]: https://github.com/The-Whitestone-Foundation/jcrt-meta/releases/tag/v0.0.1
[0.0.0]: https://github.com/The-Whitestone-Foundation/jcrt-meta/releases/tag/v0.0.0
