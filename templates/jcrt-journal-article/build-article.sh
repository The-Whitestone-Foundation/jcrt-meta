#!/bin/sh
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 ARTICLE.md [OUTPUT_DIR]" >&2
  exit 2
fi

input=$1
output_dir=${2:-$(dirname "$input")}
name=$(basename "$input")
stem=${name%.*}
template_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
logo_svg="$template_dir/jcrt-logo.svg"
TEXMFVAR=${TEXMFVAR:-${TMPDIR:-/tmp}/jcrt-luatex-cache}
export TEXMFVAR

if [ ! -f "$logo_svg" ]; then
  echo "Missing JCRT logo: $logo_svg" >&2
  exit 1
fi

mkdir -p "$output_dir"
mkdir -p "$TEXMFVAR"

pandoc "$input" \
  --from markdown \
  --template "$template_dir/jcrt-journal-article.tex" \
  --metadata logo="$template_dir/jcrt-logo.pdf" \
  --pdf-engine=lualatex \
  --citeproc \
  --output "$output_dir/$stem.pdf"

pandoc "$input" \
  --from markdown \
  --metadata logo="$logo_svg" \
  --lua-filter "$template_dir/docx-accessibility.lua" \
  --reference-doc "$template_dir/jcrt-reference.docx" \
  --citeproc \
  --output "$output_dir/$stem.docx"

printf '%s\n' "$output_dir/$stem.pdf" "$output_dir/$stem.docx"
