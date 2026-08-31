# JCRT metadata

Generated KCWorks import metadata and PDF ZIPs for JCRT. `archives/` contains
one `<issue>.zip` and one `<issue>.metadata.json` array for every published issue.
Expanded PDFs are build artifacts and are not committed.

Run `npm run generate` after changing archive front matter in `../jcrt-v2`.
Run `npm run check` to verify that committed metadata is current and valid.

The archive nanoid is exported as an `import-recid` identifier. Controlled
subjects are emitted in the KCWorks shape — `id`, `subject`, `scheme` — with the
front matter's `category` folded into the scheme as `FAST-<facet>` (for example
`FAST-topical`, `FAST-formgenre`). Because KCWorks keys its authority
vocabularies on exact id strings, the generator normalizes the front matter
`uri` on the way out: FAST URIs become `http://id.worldcat.org/fast/<n>` and
Homosaurus URIs become `https://homosaurus.org/v3/<term>`. An unrecognized
category or URI fails the build rather than emitting an id KCWorks cannot
match. The `fstNNNNNNN` form is not exported.

The ISSN is a journal identifier, not an article identifier, so it appears only
in `custom_fields["journal:journal"].issn` — never in `metadata.identifiers`.

Detailed operator and integration documentation is indexed in
[`docs/README.md`](docs/README.md).

## Rebuilding the archive metadata

1. Update the numbered issue content in `../jcrt-v2/content/archives/`.
2. Run `npm run generate` to regenerate every published issue's metadata sidecar from its ZIP.
3. Run `npm run check` to confirm the committed JSON is current.
4. Review the changed files, then commit and push them to GitHub.

Run `npm run archives:build` to rebuild ZIPs and sidecars together. Validation
commands extract ZIPs into a temporary directory, so `archives/` remains flat.

Articles with no scanned PDF in `../jcrt-files` have theirs built from Markdown
by Pandoc. `archives:build` seeds its workspace from the committed ZIPs and
skips any PDF that already exists, so those generated PDFs go stale when their
Markdown is edited. Run `npm run archives:rebuild` to discard and regenerate
them; it takes roughly 15 seconds per article.

The generator omits records marked `published: false` in the source front
matter. Everything else in a numbered issue directory is deposited, including
`bios`, `table-of-contents`, and other front-matter pages. Records without an
author fall back to `JCRT Editors` as the creator.

## Importing an issue into KCWorks

`scripts/kcworks_api_importer.py` is vendored from
[MESH-Research/knowledge-commons-works](https://github.com/MESH-Research/knowledge-commons-works)
and needs Python 3.9+ with `requests`. Keep the token and output pattern in the
gitignored `.env`:

```sh
python3 -m venv .venv
.venv/bin/pip install requests
KCWORKS_IMPORT_API_KEY=...
KCWORKS_IMPORT_OUTPUT_PATH=_logs/{issue}.log
KCWORKS_IMPORT_TIMEOUT=600
```

Use the interactive wrapper one issue at a time:

```sh
./import.sh --check 25.1
./import.sh 25.1
```

The wrapper creates `JCRT <issue>` at `jcrt-<issue-without-dot>`, tags the
collection as `Journal`, generates and validates its profile PNG, runs the
existing preflight, sets the token user as a public owner, and pauses for
approval before collection creation, image upload, and import. API responses go
to `_logs/<issue>.log`; successful imports then copy each KC Works DOI into the
matching `../jcrt-v2/content/archives/<issue>/*.md` front matter. Recover that
last step alone with `./import.sh --sync-dois <issue>`. A collection slug cannot
be reused after deletion; `--notify-record-owners` remains off.

See [CHANGELOG.md](CHANGELOG.md) for the complete `0.0.1` development record.

## Creating a reusable Markdown-to-DOCX/PDF template

The template developed for this project is in
`templates/jcrt-journal-article/`. Its reusable parts are:

- `jcrt-journal-article.tex`: PDF page design and PDF metadata.
- `jcrt-reference.docx`: Word styles, margins, fonts, and heading appearance.
- `docx-accessibility.lua`: shared metadata, cover content, alternative text,
  heading normalization, and duplicate-title handling.
- `jcrt-logo.svg` and `jcrt-logo.pdf`: vector artwork for Word and LaTeX.
- `build-article.sh`: one command that produces both output formats.

To create a similar template for another publication:

1. Create a template directory and copy these files as a starting point.
2. Replace the publication name, logo, ISSN, publisher, license, colors, and
   typography in the TeX template and Lua filter.
3. Generate a default Pandoc reference document, open it in Word, edit its
   Normal and Heading styles, and save it in the template directory:

   ```sh
   pandoc --print-default-data-file reference.docx \
     > templates/my-journal/reference.docx
   ```

4. If starting without this project's TeX file, generate Pandoc's default
   LaTeX template and adapt it:

   ```sh
   pandoc --print-default-template=latex > templates/my-journal/article.tex
   ```

5. Use YAML front matter in every article. At minimum, provide `title`,
   `author`, `volume`, `issue`, `season`, and `year`. Add `affiliation`, `url`,
   `abstract`, and `keywords` when available:

   ```yaml
   ---
   title: "Article title"
   author: "Author Name"
   affiliation: "University Name"
   volume: 1
   issue: 1
   season: winter
   year: 2026
   url: https://example.org/articles/article-name/
   abstract: "Article abstract."
   keywords:
     - first keyword
     - second keyword
   ---
   ```

6. Keep the source article's highest heading at `##`. The build applies
   `--shift-heading-level-by=-1`, maps the front matter title to the single
   output `H1`, and emits article sections as `H2`.
7. Test both formats with a representative article. Check the DOCX in Word and
   the PDF in Acrobat, including headings, lists, alternative text, links,
   document title, language, bookmarks, and reading order.

The complete implementation details are documented in
[`templates/jcrt-journal-article/README.md`](templates/jcrt-journal-article/README.md).

## Converting Markdown from the command line

### macOS

Install Pandoc and a LaTeX distribution:

```sh
brew install pandoc
brew install --cask mactex-no-gui
```

After installing MacTeX, open a new Terminal window. From the `jcrt-meta`
directory, make the wrapper executable once, then build an article:

```sh
chmod +x templates/jcrt-journal-article/build-article.sh
templates/jcrt-journal-article/build-article.sh article.md output
```

This creates `output/article.docx` and `output/article.pdf`. The same wrapper
is available through npm:

```sh
npm run article:build -- article.md output
```

To run the Pandoc commands separately:

```sh
# PDF
pandoc article.md --from markdown --shift-heading-level-by=-1 \
  --lua-filter templates/jcrt-journal-article/docx-accessibility.lua \
  --template templates/jcrt-journal-article/jcrt-journal-article.tex \
  --metadata logo=templates/jcrt-journal-article/jcrt-logo.pdf \
  --pdf-engine=lualatex --citeproc --output output/article.pdf

# DOCX
pandoc article.md --from markdown --shift-heading-level-by=-1 \
  --metadata logo=templates/jcrt-journal-article/jcrt-logo.svg \
  --lua-filter templates/jcrt-journal-article/docx-accessibility.lua \
  --reference-doc templates/jcrt-journal-article/jcrt-reference.docx \
  --citeproc --output output/article.docx
```

### Windows

Install Pandoc and MiKTeX in PowerShell or Windows Terminal:

```powershell
winget install --id JohnMacFarlane.Pandoc --exact
winget install --id MiKTeX.MiKTeX --exact
```

Restart the terminal after installation. If Git for Windows is installed, use
Git Bash to run the same wrapper used on macOS:

```sh
templates/jcrt-journal-article/build-article.sh article.md output
```

For native PowerShell, run Pandoc directly:

```powershell
# PDF
pandoc .\article.md --from markdown --shift-heading-level-by=-1 `
  --lua-filter .\templates\jcrt-journal-article\docx-accessibility.lua `
  --template .\templates\jcrt-journal-article\jcrt-journal-article.tex `
  --metadata logo=.\templates\jcrt-journal-article\jcrt-logo.pdf `
  --pdf-engine=lualatex --citeproc --output .\output\article.pdf

# DOCX
pandoc .\article.md --from markdown --shift-heading-level-by=-1 `
  --metadata logo=.\templates\jcrt-journal-article\jcrt-logo.svg `
  --lua-filter .\templates\jcrt-journal-article\docx-accessibility.lua `
  --reference-doc .\templates\jcrt-journal-article\jcrt-reference.docx `
  --citeproc --output .\output\article.docx
```

Create the output directory first when using the direct commands:

```powershell
New-Item -ItemType Directory -Force .\output
```

Confirm both required programs are available with `pandoc --version` and
`lualatex --version`. Run all commands from the repository root so the relative
template and logo paths resolve consistently.

## License

This project is licensed under the GNU Affero General Public License v3.0 only.
See [LICENSE](LICENSE).
