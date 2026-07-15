# JCRT metadata


[](https://github.com/the-Whitestone-Foundation/jcrt-meta#jcrt-metadata)

Generated KCWorks import metadata for JCRT. Each numbered archive issue has one `metadata/archives/<issue>/metadata.json` array containing its article records.

Run `npm run generate` after changing archive front matter in `../jcrt-v2`. Run `npm run check` to verify that committed metadata is current and valid.

The archive nanoid is exported as an `import-recid` identifier. Controlled subjects preserve the FAST or Homosaurus label, identifier, URI, scheme, and authority category from the source front matter.

## Rebuilding the archive metadata

1.  Update the numbered issue content in `../jcrt-v2/content/archives/`.
2.  Run `npm run generate` to regenerate every issue-level metadata file.
3.  Run `npm run check` to confirm the committed JSON is current.
4.  Review the changed files, then commit and push them to GitHub.

The generator omits unpublished records and known non-article files such as `index`, `bios`, `author-bios`, `table-of-contents`, and `abstracts`. Records without an author use `JCRT Editors` as a fallback creator.

## CHANGELOG
See [CHANGELOG.md](https://github.com/The-Whitestone-Foundation/jcrt-meta/blob/main/CHANGELOG.md) for the complete development record.


## JCRT Pandoc journal article template

This template package outputs both `.pdf` and `.docx`. The LuaLaTeX PDF has the
JCRT cover page; both formats include the article body and any bibliography
emitted by Pandoc's `--citeproc` option.

Both outputs preserve document metadata, semantic headings, bookmarks, and
external hyperlinks. The PDF is tagged as PDF/UA-2. PDF URI actions and DOCX
hyperlink relationships do not support HTML's `target="_blank"` attribute;
the reader application controls whether external links open a browser or new
window.
The JCRT logo uses this alt text: "a 2x2 grid with alternating black and red
squares the letters JCRT. one letter per square in high contrast."

The accessibility defaults use descriptive link labels, underlining, AAA-level
text/link contrast, document language, structured headings, bookmarks, image
alt text, and embedded publication metadata. The bundled Word reference file
sets hyperlinks to underlined dark navy (`#003366`) rather than Word's lower-
contrast default blue.

For printed copies, the canonical URL appears as plain text on the line below
the descriptive "Read this article on JCRT" hyperlink.

WCAG AAA includes requirements that depend on each article's prose, link
purpose, citations, tables, media, and reading order. Before publication, run
Microsoft Word's Accessibility Checker on the DOCX and a current PDF/UA
validator such as PAC or veraPDF on the PDF, followed by a manual WCAG review.

## Required metadata

```yaml
title: Article title
author: Author Name
affiliation: University or organization
volume: "24"
issue: "2"
season: Spring 2026
url: https://jcrt.org/archives/24.2/article/
```

`author` may also be a YAML list. The cover conditionally includes `abstract`
(falling back to `description`), `affiliation`, and comma-separated `keywords`.

## Publication metadata

The template embeds the title, author, abstract/description, keywords,
copyright, and license URL in the PDF. It defaults to:

- Publisher: Whitestone Publications
- ISSN: 1530-5228
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Rights holder: article author(s)
- Copyright year: `copyright-year`, falling back to `year`

Override these with `publisher`, `issn`, `license`, `license-url`,
`rights-holder`, `rights`, `copyright`, `copyright-year`, `subject`, or `lang`.
Use `bibliography` and optionally `csl` for references.

## Generate PDF and DOCX

Run from the `jcrt-meta` directory:

```sh
templates/jcrt-journal-article/build-article.sh article.md
```

This writes `article.pdf` and `article.docx` beside the source file. Pass an
output directory as the optional second argument:

```sh
templates/jcrt-journal-article/build-article.sh article.md output/articles
```

## Enable
- Enabled `pdfdisplaydoctitle` and rendered the PDF cover title as an unnumbered
  section for correct title semantics.

## Sample

The repository includes an article sample based on JCRT 24.2:

```sh
templates/jcrt-journal-article/build-article.sh samples/alencar.md samples
```

This creates `samples/alencar.pdf` and `samples/alencar.docx`.

An older, footnote-heavy article sample is also included:

```sh
templates/jcrt-journal-article/build-article.sh samples/crockett.md samples
```

This creates `samples/crockett.pdf` and `samples/crockett.docx`.

## macOS

1. Install [Pandoc](https://pandoc.org/installing.html) and a current
   [MacTeX](https://tug.org/mactex/) distribution. The full MacTeX installer
   includes LuaLaTeX and the packages needed for tagged PDF output.
2. Optional: install Book Antiqua. Without it, the template uses the bundled
   TeX Gyre Pagella fallback.
3. In Terminal, open the `jcrt-meta` directory and run:

   ```sh
   chmod +x templates/jcrt-journal-article/build-article.sh
   templates/jcrt-journal-article/build-article.sh article.md
   ```

Homebrew users can install Pandoc with `brew install pandoc`. Install
`librsvg` only if you need to regenerate `jcrt-logo.pdf` from the SVG.

## Windows PC

1. Install [Pandoc for Windows](https://pandoc.org/installing.html),
   [MiKTeX](https://miktex.org/download), and Git for Windows.
2. In MiKTeX Console, update all packages and enable automatic installation of
   missing packages.
3. Open Git Bash in the `jcrt-meta` directory and run:

   ```sh
   bash templates/jcrt-journal-article/build-article.sh article.md
   ```

The script is POSIX shell, so run it through Git Bash or WSL rather than
directly from Command Prompt. Book Antiqua is commonly available with
Microsoft Office; otherwise the template uses TeX Gyre Pagella.

## Ubuntu

Install Pandoc and a current TeX Live distribution:

```sh
sudo apt update
sudo apt install pandoc texlive-full
```

Then run from the `jcrt-meta` directory:

```sh
chmod +x templates/jcrt-journal-article/build-article.sh
templates/jcrt-journal-article/build-article.sh article.md
```

If Ubuntu's packaged Pandoc is too old for the Lua filter, install the current
`.deb` from the [official Pandoc releases](https://pandoc.org/installing.html).
Install `librsvg2-bin` only when regenerating the vector PDF logo.

## Verify the toolchain

All platforms should return versions for these commands:

```sh
pandoc --version
lualatex --version
```

The template uses Book Antiqua when installed and falls back to the compatible
TeX Gyre Pagella family. `jcrt-logo.pdf` is the vector PDF derivative used by
LuaLaTeX; its bundled source is `jcrt-logo.svg`, copied from
`jcrt-files/images/jcrt.svg`.
Refresh the derivative after changing the SVG with:

```sh
rsvg-convert --format=pdf \
  --output=templates/jcrt-journal-article/jcrt-logo.pdf \
  templates/jcrt-journal-article/jcrt-logo.svg
```

License
-------

[](https://github.com/the-Whitestone-Foundation/jcrt-meta#license)

This project is licensed under the GNU Affero General Public License v3.0 only. See [LICENSE](https://github.com/The-Whitestone-Foundation/jcrt-meta/blob/main/LICENSE).
