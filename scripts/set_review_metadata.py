#!/usr/bin/env python3
"""Set Info dictionary + XMP on a Religious Theory review PDF from its post front matter.

usage: set_review_metadata.py POST.md IN.pdf OUT.pdf
Mirrors the metadata written on 9781481324250.pdf (CC BY 4.0, PDF/UA-1 flag kept).
"""
import sys
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape as esc
import pikepdf, yaml

md, src, out = sys.argv[1:4]
_, fm, _ = Path(md).read_text(encoding="utf-8").split("---\n", 2)
m = yaml.safe_load(fm)
title = m["title"]; author = m["author"]; doi = m["doi"]
slug = m["slug"]; url = f"https://jcrt.org/religioustheory/posts/{slug}/"
date = str(m["date"])[:10]
desc = m.get("description", "")
keywords = list(m.get("keywords", [])) + ["Book review"] + [t for t in m.get("tags", []) if t != "theoryPosts"]
kw = ", ".join(dict.fromkeys(keywords))
rights = ("© the author(s). Published in the Journal for Cultural and Religious Theory under a "
          "Creative Commons Attribution 4.0 International (CC BY 4.0) license. Authors retain copyright.")
cc = "https://creativecommons.org/licenses/by/4.0/"
creator = "JCRT flyleaf-review template (python-docx)"

pdf = pikepdf.open(src)
now = datetime.now(timezone.utc)
stamp = now.strftime("D:%Y%m%d%H%M%S+00'00")
producer = str(pdf.docinfo.get("/Producer", "LibreOffice"))
info = {
    "/Title": title, "/Author": author, "/Subject": desc, "/Keywords": kw,
    "/Creator": creator, "/Producer": producer,
    "/CreationDate": stamp, "/ModDate": stamp,
    "/DOI": doi, "/ISSN": "1530-5228", "/Publisher": "Whitestone Publications",
    "/Permalink": url, "/PublicationDate": date,
    "/Copyright": rights, "/CopyrightURL": cc,
}
for k in list(pdf.docinfo.keys()): del pdf.docinfo[k]
for k, v in info.items():
    pdf.docinfo[k] = pikepdf.String(v)

iso = now.strftime("%Y-%m-%dT%H:%M:%SZ")
xmp = f"""<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:prism="http://prismstandard.org/namespaces/basic/1.0/" rdf:about="">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">{esc(title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>{esc(author)}</rdf:li></rdf:Seq></dc:creator>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">{esc(desc)}</rdf:li></rdf:Alt></dc:description>
   <dc:subject><rdf:Seq>{''.join(f'<rdf:li>{esc(k)}</rdf:li>' for k in dict.fromkeys(keywords))}</rdf:Seq></dc:subject>
   <dc:publisher><rdf:Seq><rdf:li>Whitestone Publications</rdf:li></rdf:Seq></dc:publisher>
   <dc:language><rdf:Seq><rdf:li>en-US</rdf:li></rdf:Seq></dc:language>
   <dc:type><rdf:Seq><rdf:li>Text</rdf:li></rdf:Seq></dc:type>
   <dc:identifier>https://doi.org/{doi}</dc:identifier>
   <dc:relation><rdf:Seq><rdf:li>{url}</rdf:li></rdf:Seq></dc:relation>
   <dc:source>The Journal for Cultural and Religious Theory, ISSN 1530-5228</dc:source>
   <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">{esc(rights)}</rdf:li></rdf:Alt></dc:rights>
   <dc:date><rdf:Seq><rdf:li>{date}</rdf:li></rdf:Seq></dc:date>
   <xmpRights:WebStatement>{cc}</xmpRights:WebStatement>
   <xmpRights:Marked>True</xmpRights:Marked>
   <prism:doi>{doi}</prism:doi>
   <prism:issn>1530-5228</prism:issn>
   <prism:publicationName>JCRT • Religious Theory</prism:publicationName>
   <prism:url>{url}</prism:url>
  </rdf:Description>
  <rdf:Description xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/" rdf:about=""><pdfuaid:part>1</pdfuaid:part></rdf:Description>
  <rdf:Description xmlns:pdf="http://ns.adobe.com/pdf/1.3/" rdf:about="">
   <pdf:Producer>{esc(producer)}</pdf:Producer>
   <pdf:Keywords>{esc(kw)}</pdf:Keywords>
   <pdf:PDFVersion>1.7</pdf:PDFVersion>
  </rdf:Description>
  <rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" rdf:about="">
   <xmp:CreatorTool>{creator}</xmp:CreatorTool>
   <xmp:CreateDate>{iso}</xmp:CreateDate>
   <xmp:ModifyDate>{iso}</xmp:ModifyDate>
   <xmp:MetadataDate>{iso}</xmp:MetadataDate>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>"""
stream = pikepdf.Stream(pdf, xmp.encode("utf-8"))
stream["/Type"] = pikepdf.Name("/Metadata"); stream["/Subtype"] = pikepdf.Name("/XML")
pdf.Root["/Metadata"] = pdf.make_indirect(stream)
vp = pdf.Root.get("/ViewerPreferences", pikepdf.Dictionary())
vp["/DisplayDocTitle"] = True
pdf.Root["/ViewerPreferences"] = vp
pdf.Root["/Lang"] = pikepdf.String("en-US")
pdf.save(out, min_version="1.7", linearize=False)
print(out)
