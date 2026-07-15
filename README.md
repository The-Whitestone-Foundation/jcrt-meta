# JCRT metadata

Generated KCWorks import metadata for JCRT. Each numbered archive issue has one
`metadata/archives/<issue>/metadata.json` array containing its article records.

Run `npm run generate` after changing archive front matter in `../jcrt-v2`.
Run `npm run check` to verify that committed metadata is current and valid.

The archive nanoid is exported as an `import-recid` identifier. Controlled
subjects preserve the FAST or Homosaurus label, identifier, URI, scheme, and
authority category from the source front matter.

## Rebuilding the archive metadata

1. Update the numbered issue content in `../jcrt-v2/content/archives/`.
2. Run `npm run generate` to regenerate every issue-level metadata file.
3. Run `npm run check` to confirm the committed JSON is current.
4. Review the changed files, then commit and push them to GitHub.

The generator omits unpublished records and known non-article files such as
`index`, `bios`, `author-bios`, `table-of-contents`, and `abstracts`. Records
without an author use `JCRT Editors` as a fallback creator.

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
