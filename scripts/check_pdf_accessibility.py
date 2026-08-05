#!/usr/bin/env python3
"""Check the PDF accessibility invariants the archive build can verify locally."""

import sys
from pathlib import Path

from pypdf import PdfReader


def resolved(value):
    return value.get_object() if hasattr(value, "get_object") else value


def page_has_image(page):
    resources = resolved(page.get("/Resources", {}))
    xobjects = resolved(resources.get("/XObject", {})) if resources else {}
    return any(resolved(item).get("/Subtype") == "/Image" for item in xobjects.values())


root = Path(sys.argv[1])
pdfs = sorted(root.glob("[0-9]*.[0-9]/*.pdf"))
failures = []

for pdf in pdfs:
    try:
        reader = PdfReader(pdf)
        catalog = reader.root_object
        mark_info = resolved(catalog.get("/MarkInfo", {}))
        viewer = resolved(catalog.get("/ViewerPreferences", {}))
        checks = {
            "language": str(catalog.get("/Lang", "")).lower().startswith("en"),
            "tag tree": bool(catalog.get("/StructTreeRoot")) and bool(mark_info.get("/Marked")),
            "display title": bool(viewer.get("/DisplayDocTitle")),
            "bookmark": bool(reader.outline),
        }
        failures.extend(f"{pdf}: missing {name}" for name, passed in checks.items() if not passed)
        for number, page in enumerate(reader.pages, 1):
            if page_has_image(page) and not (page.extract_text() or "").strip():
                failures.append(f"{pdf}: image page {number} has no searchable text")
    except Exception as error:
        failures.append(f"{pdf}: {error}")

if failures:
    raise SystemExit("\n".join(failures))
print(f"Validated tags, language, title display, bookmarks, and image-page text for {len(pdfs)} PDFs.")
