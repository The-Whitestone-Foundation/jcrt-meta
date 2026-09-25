#!/usr/bin/env bash
# Render a JCRT flyleaf docx to PDF without LibreOffice: officecli's HTML
# renderer + headless Chrome print-to-pdf.
#
#   docx_to_pdf.sh IN.docx OUT.pdf
#
# Chrome runs twice: once to let officecli's pagination JS lay the document out
# (--dump-dom), once to print the settled DOM with its scripts stripped so the
# paginator does not run over its own output. Three officecli render bugs are
# repaired on the dumped DOM in between:
#   1. section 2's running head is applied to page 1, which is the flyleaf.
#   2. continuation pages inherit the FIRST section's footer, so every body page
#      gets the flyleaf's Whitestone colophon instead of the Religious Theory bar.
#   3. the footer PAGE field renders as an empty span; a CSS counter fills it,
#      started at -1 so the flyleaf is page 0 and the body opens at 1.
set -euo pipefail
in=$1; out=$2
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

officecli close "$in" >/dev/null 2>&1 || true
officecli view "$in" html -o "$tmp/page.html" >/dev/null

"$chrome" --headless --disable-gpu --no-sandbox --virtual-time-budget=30000 \
  --dump-dom "file://$tmp/page.html" 2>/dev/null > "$tmp/laid-out.html"

python3 - "$tmp/laid-out.html" "$tmp/print.html" <<'PY'
import re, sys
src, dst = sys.argv[1:3]
s = open(src, encoding="utf-8").read()
s = re.sub(r"<script\b.*?</script>", "", s, flags=re.S)   # paginator already ran

# every page after the flyleaf carries the body section's footer
wrappers = [m.start() for m in re.finditer(r'<div class="page-wrapper"', s)]
foot = re.compile(r'<div class="doc-footer".*?</div>\s*(?=</div>)', re.S)
body_footer = None
for start, end in zip(wrappers, wrappers[1:] + [len(s)]):
    m = foot.search(s, start, end)
    if m and "An Editorial Review Blog" in m.group(0):
        body_footer = m.group(0)
        break
if body_footer:
    out, prev = [], 0
    for i, (start, end) in enumerate(zip(wrappers, wrappers[1:] + [len(s)])):
        m = foot.search(s, start, end)
        if i and m:
            out.append(s[prev:m.start()]); out.append(body_footer); prev = m.end()
    out.append(s[prev:])
    s = "".join(out)

# The flyleaf masthead rule is a border-bottom on the ISSN paragraph, so it
# rides up to wherever that short text block ends instead of clearing the
# floated JCRT logo. Move it onto its own clear:left rule, which lands exactly
# at the logo's bottom edge the way Word and the earlier PDFs place it.
wrappers = [m.start() for m in re.finditer(r'<div class="page-wrapper"', s)]  # offsets moved
head_end = wrappers[1] if len(wrappers) > 1 else len(s)
rule = re.compile(r'(<p\b[^>]*?)border-bottom:1pt solid #000000;?\s*(?:padding-bottom:1pt;?)?([^>]*>.*?</p>)', re.S)
m = rule.search(s, 0, head_end)
if m:
    s = s[:m.start()] + m.group(1) + m.group(2) + '<div class="jcrt-rule"></div>' + s[m.end():]

# The Whitestone colophon indents "WHITESTONE PUBLICATIONS" with a Word tab
# stop that officecli emits as whitespace-only spans; they overshoot and leave
# the line looking centred. Dropping them sets the text flush against the
# floated stone logo, level with the "Publisher of..." line beneath it.
colophon = foot.search(s, 0, head_end)
if colophon:
    blank = r"(?:\s|&nbsp;)"   # Chrome serialises the tab run as &nbsp; entities
    fixed = re.sub(rf'<span style="[^"]*"><span style="display:inline-block;width:[\d.]+pt;"></span>{blank}*</span>', "", colophon.group(0))
    fixed = re.sub(rf'<span style="[^"]*font-weight:bold[^"]*">{blank}+</span>', "", fixed)
    s = s[:colophon.start()] + fixed + s[colophon.end():]

css = """<style>
@page { size: 8.5in 11in; margin: 0 }
@media print {
  html, body { background: #fff; margin: 0; padding: 0 }
  body { counter-reset: pg -1 }
  .page-wrapper { margin: 0 auto !important }
  /* exactly one PDF page per laid-out page, never a 1pt spill onto the next */
  .page { border-radius: 0; break-after: page; counter-increment: pg;
          height: 792pt; min-height: 0; overflow: hidden; box-sizing: border-box }
  .page-wrapper:first-of-type .doc-header { display: none }
  .doc-footer .atab-band[style*="right"] span:empty::after { content: counter(pg) }
  .jcrt-rule { clear: left; border-top: 1pt solid #000; margin-bottom: 5pt }
  /* both flyleaf logos carry a 9pt left margin that Word collapses against the
     page margin; keep them flush with the rules, as the earlier PDFs have them */
  .page-wrapper:first-of-type img[style*="float:left"] { margin-left: 0 !important }
}
</style>"""
open(dst, "w", encoding="utf-8").write(s.replace("</head>", css + "\n</head>", 1))
PY

"$chrome" --headless --disable-gpu --no-sandbox --virtual-time-budget=15000 \
  --run-all-compositor-stages-before-draw --no-pdf-header-footer \
  --print-to-pdf="$out" "file://$tmp/print.html" 2>/dev/null
echo "$out"
