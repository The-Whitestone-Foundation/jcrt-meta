# JCRT flyleaf Pandoc template

Use YAML metadata with `type` (`Article` or `Review`), `title`, `author`, and either `stable-url`, `doi`, or `url`.

```sh
pandoc article.md \
  --template templates/jcrt-flyleaf/jcrt-flyleaf.tex \
  --pdf-engine=lualatex \
  --output article-with-flyleaf.pdf
```

The template defaults to `Article`, JCRT as the source, and Whitestone Publications as the publisher. Markdown body content, when present, begins on page 2.
