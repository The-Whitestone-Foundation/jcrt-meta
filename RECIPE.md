# JCRT Archive PDF Build Recipe

How to generate accessible (PDF/UA) journal-article PDFs for the JCRT archive from the Markdown sources in `jcrt-v2`. The pipeline is **Pandoc → LuaLaTeX** via the template in `templates/jcrt-journal-article/`.

## Pipeline at a glance

- **Source:** `../jcrt-v2/content/archives/<issue>/<article>.md` (YAML frontmatter + Markdown body).
- **Builder:** `templates/jcrt-journal-article/build-article.sh <input.md> [output_dir]` — emits both a `.pdf` and a `.docx`.
- **Engine:** Pandoc drives **LuaLaTeX** (`--pdf-engine=lualatex`) with the `jcrt-journal-article.tex` template, the `docx-accessibility.lua` filter, and `--citeproc`.
- **Output:** committed PDFs live under `archives/<issue>/<article>.pdf`.

> Note: `scripts/generate-archives.mjs` does **not** build PDFs — it only generates KCWorks import metadata JSON under `metadata/archives/`. PDF generation is `build-article.sh` only.

## Dependencies

| Tool | Role | Notes |
|---|---|---|
| Pandoc (3.10+) | Markdown → LaTeX/DOCX driver; runs the Lua filter, template, `--citeproc` | required |
| LuaLaTeX (TeX Live 2025, full) | `--pdf-engine`; compiles the templated `.tex` → tagged PDF | required — must be LuaLaTeX (not xelatex/pdflatex/tectonic) |
| `qpdf` | validate the tagged PDF after build | recommended |
| Fonts | Book Antiqua if present, else bundled **TeX Gyre Pagella** | Pagella ships with TeX Live, so builds work without Book Antiqua |
| node / npm | only for `generate-archives.mjs` (metadata JSON), **not** for PDFs | not needed for PDF builds |

The template header uses `\DocumentMetadata{ pdfstandard=ua-1, pdfversion=1.7, testphase={phase-III} }`, which requires a recent LaTeX kernel (tagged-PDF phase-III) — TeX Live 2025 satisfies this.

## Build a single PDF (and DOCX)

Run from the repo root (`jcrt-meta/`), because the template/filter/logo paths are relative:

```sh
cd /path/to/jcrt-meta
templates/jcrt-journal-article/build-article.sh \
  ../jcrt-v2/content/archives/01.1/crockett.md \
  archives/01.1
# -> archives/01.1/crockett.pdf  (and crockett.docx)
```

- Arg 1 (required): the source `.md`.
- Arg 2 (optional): output dir (defaults to the source file's directory — always pass an explicit dir so you don't write into the `jcrt-v2` content tree).
- Output filename = input basename with the extension swapped.

## Build PDF only (skip the DOCX)

The wrapper always emits both; for PDF-only, call Pandoc directly:

```sh
cd /path/to/jcrt-meta
T=templates/jcrt-journal-article
TEXMFVAR="${TMPDIR:-/tmp}/jcrt-luatex-cache" pandoc INPUT.md \
  --from markdown \
  --shift-heading-level-by=-1 \
  --lua-filter "$T/docx-accessibility.lua" \
  --template "$T/jcrt-journal-article.tex" \
  --metadata logo="$PWD/$T/jcrt-logo.pdf" \
  --pdf-engine=lualatex \
  --citeproc \
  --output OUTPUT_DIR/STEM.pdf
```

## Batch-build folders 01.*–04.*

```sh
cd /path/to/jcrt-meta
T=templates/jcrt-journal-article
for md in ../jcrt-v2/content/archives/0[1-4].*/*.md; do
  issue=$(basename "$(dirname "$md")")
  stem=$(basename "${md%.md}")
  out="archives/$issue"; mkdir -p "$out"
  TEXMFVAR="${TMPDIR:-/tmp}/jcrt-luatex-cache" pandoc "$md" \
    --from markdown --shift-heading-level-by=-1 \
    --lua-filter "$T/docx-accessibility.lua" --template "$T/jcrt-journal-article.tex" \
    --metadata logo="$PWD/$T/jcrt-logo.pdf" \
    --pdf-engine=lualatex --citeproc --output "$out/$stem.pdf" \
    && echo "OK  $issue/$stem" || echo "FAIL $issue/$stem"
done
```

Approx. 15 s per file. Builds can be parallelized (e.g. `xargs -P 4`); the LuaLaTeX font/format cache under `TEXMFVAR` should be warmed by one build first so parallel workers only read it.

## Frontmatter → PDF mapping

| Frontmatter key | Where it appears in the PDF |
|---|---|
| `title` | PDF title/bookmark, cover heading |
| `author` (string or list) | `\pdfauthor`, cover byline (list joined with `; `) |
| `affiliation` | italic line under the author on the cover |
| `year` / `copyright-year` | copyright line (`copyright-year` wins) |
| `volume` + `issue` | cover `volume.issue`, running header `Vol. volume.issue` |
| `doi` | PDF metadata + cover (if present) |
| `abstract` (falls back to `description`) | PDF subject + cover Abstract block |
| `keywords` (list) | PDF keywords + cover "Keywords:" line |
| `url` | cover "Read this article on JCRT" link |
| `season` | cover `volume.issue | season` line |
| defaults | publisher "Whitestone Publications", ISSN 1530-5228, CC BY 4.0, lang en-US (all overridable) |

`pages`, `nanoid`, `atproto`, `article_number`, `subjects`, `pdf` are consumed by the metadata JSON pipeline, not the PDF template.

## Input assumptions

- Frontmatter is YAML delimited by `---`. Missing optional fields (abstract, affiliation, url, keywords, doi) are silently omitted from the cover; the build still succeeds.
- The article body's highest heading must be `##` (H2) — the build applies `--shift-heading-level-by=-1` so the cover title becomes the single H1. A body `#` would collide.
- If the body repeats the title as a heading, the Lua filter removes the duplicate.
- Images must resolve relative to the source `.md`. The JCRT logo is supplied via `--metadata logo=`.
- `templates/jcrt-journal-article/jcrt-logo.svg` must exist or `build-article.sh` aborts.

## Validation

```sh
qpdf --check archives/<issue>/<article>.pdf
```

All committed archive PDFs are expected to be valid tagged (PDF/UA) documents.

## Notes / gotchas

- **Run from the repo root.** The `--template`, `--lua-filter`, and relative logo paths assume `cwd = jcrt-meta/`.
- **04.3 articles are frontmatter-only stubs** (no Markdown body). Building them yields contentless cover-only PDFs, so they are **not** generated from Markdown — their real source PDFs live in `../jcrt-files/archives/04.3/`.
- The wrapper emits a `.docx` alongside each `.pdf`; use the PDF-only Pandoc call above if you only want PDFs.
- `samples/crockett.{md,pdf,docx}` is the golden reference build used to validate the toolchain.
