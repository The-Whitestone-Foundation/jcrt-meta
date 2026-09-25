#!/usr/bin/env python3
"""Deposit a Religious Theory book review into KC Works, one record at a time.

`import.sh` only handles numbered issues (`^\\d\\d\\.\\d+$`) in bulk; reviews live in
`jcrt-v2/content/religioustheory/posts/` and have always been deposited by hand. This
wraps that hand work, in the order the PDF pipeline actually requires:

    reviews.py status   POST.md                  where this review stands right now
    reviews.py metadata POST.md                  print the deposit JSON, touch no network
    reviews.py reserve  POST.md [--write-doi]    create the draft, reserve its DOI
    reviews.py publish  POST.md                  attach the PDF, publish into the collection

The DOI has to exist BEFORE the PDF is built, because `set_review_metadata.py` stamps it
onto the flyleaf and into the XMP. So the sequence is:

    1. reviews.py reserve <post>.md --write-doi      -> DOI in front matter, draft waiting
    2. build_review_docx.py ... && export to PDF
    3. set_review_metadata.py <post>.md in.pdf ../jcrt-files/religioustheory/<slug>.pdf
    4. reviews.py publish <post>.md                  -> DOI goes live

Stopping after step 1 and never reaching step 4 is what leaves a draft with a reserved
DOI and no file — doi.org 404s while the draft sits there unpublished. `status` names
that state, and `publish` is what recovers it; you do not need a new DOI.

Needs KCWORKS_IMPORT_API_KEY in the environment (`set -a; . ./.env; set +a`) and an
interpreter with requests + PyYAML + pikepdf.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

MISSING = []
try:
    import requests
except ImportError:
    MISSING.append("requests")
try:
    import yaml
except ImportError:
    MISSING.append("PyYAML")
if MISSING:
    sys.exit(
        f"Missing Python dependency: {', '.join(MISSING)}.\n"
        "Run with an interpreter that has them, e.g. ../.venv/bin/python, or:\n"
        "  python3 -m venv .venv && .venv/bin/pip install requests PyYAML pikepdf"
    )

API_ROOT = os.environ.get("KCWORKS_API_ROOT", "https://works.hcommons.org/api")
COLLECTION = "jcrt-religious-theory"
FILES_DIR = Path("../jcrt-files/religioustheory")
TZ = ZoneInfo("America/New_York")

# Fixed for every Religious Theory review; see docs/kcworks-metadata-reference.md.
JOURNAL_TITLE = "JCRT • Religious Theory"
ISSN = "1530-5228"
PUBLISHER = "Whitestone Publications"
IMPRINT_PLACE = "Boulder, CO"
BASE_TAGS = ["religion", "religious studies", "book review"]
# Religious Theory also runs interviews, which are the same flyleaf PDF under a
# different resource type, byline role, and genre term. See build_review_docx.py --kind.
KINDS = {
    "review": ("textDocument-review", "author", BASE_TAGS),
    "interview": ("textDocument-interviewTranscript", "interviewer",
                  ["religion", "religious studies", "interview"]),
}
LANDING = "https://jcrt.org/religioustheory/posts/{slug}/"

# FAST genre/form terms. Front matter files these under `category: topical`, but the
# published records scheme them as FAST-form, so correct them on the way out.
FAST_FORM_IDS = {
    "fst01423756",  # Book reviews
    "fst01423760",  # Reviews
    "fst01423832",  # Interviews
}


def parse_creator(spec: str) -> dict:
    """`Family, Given|role|orcid|affiliation|ror` — everything after the name optional.

    For an interview the interviewee is not in the post's front matter (the CMS
    schema has one author), so they are named on the command line at reserve time.
    """
    name, role, orcid, affiliation, ror = ([p.strip() for p in spec.split("|")] + [""] * 4)[:5]
    family, _, given = (part.strip() for part in name.partition(","))
    person = {"type": "personal", "name": name, "given_name": given, "family_name": family}
    if orcid:
        person["identifiers"] = [{"identifier": orcid, "scheme": "orcid"}]
    creator = {"person_or_org": person, "role": {"id": role or "author"}}
    if affiliation:
        creator["affiliations"] = [{"id": ror, "name": affiliation} if ror else {"name": affiliation}]
    return creator


# ---------------------------------------------------------------- front matter


def split_front_matter(path: Path) -> tuple[str, dict, str]:
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---\n"):
        sys.exit(f"{path}: no front matter")
    _, fm, body = raw.split("---\n", 2)
    return raw, yaml.safe_load(fm), body


def eastern_date(value) -> str:
    """Front matter `date` -> YYYY-MM-DD as it reads in Eastern time."""
    text = str(value)
    try:
        stamp = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return text[:10]
    if stamp.tzinfo is None:
        return stamp.date().isoformat()
    return stamp.astimezone(TZ).date().isoformat()


def split_name(full: str) -> tuple[str, str]:
    parts = full.split()
    if len(parts) < 2:
        return "", full
    return " ".join(parts[:-1]), parts[-1]


FLYLEAF_MARKER = "Stable URL"  # printed on the flyleaf and nowhere else


def page_text(pdf: Path, page: int) -> str | None:
    """One page as text via poppler. None when pdftotext is unavailable."""
    import subprocess

    try:
        out = subprocess.run(
            ["pdftotext", "-f", str(page), "-l", str(page), str(pdf), "-"],
            capture_output=True, text=True, timeout=60,
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return None
    return out.stdout if out.returncode == 0 else None


def pdf_content_pages(pdf: Path, notes: list[str]) -> int | None:
    """Content pages, not counting the flyleaf — the review's own first page is page 1.

    Not every review PDF has a flyleaf (9780593493205 starts straight into the review),
    so detect it rather than always subtracting one.
    """
    try:
        import pikepdf
    except ImportError:
        notes.append("pikepdf missing, cannot count pages — pass --pages")
        return None
    with pikepdf.open(pdf) as doc:
        total = len(doc.pages)

    first = page_text(pdf, 1)
    if first is None:
        notes.append("pdftotext unavailable, cannot tell if there is a flyleaf — pass --pages")
        return None
    content = total - 1 if FLYLEAF_MARKER in first else total
    notes.append(
        f"{pdf.name}: {total} pages, {'flyleaf on p1' if content < total else 'no flyleaf'} -> 1-{content}"
    )

    # The printed folio on the last page should agree, or the PDF numbers the flyleaf.
    last = page_text(pdf, total) or ""
    folios = re.findall(r"\b(\d{1,3})\b", last.strip().splitlines()[-1] if last.strip() else "")
    if folios and int(folios[-1]) != content:
        notes.append(
            f"WARNING {pdf.name} prints {folios[-1]} on its last page but has {content} content "
            "pages — the PDF is counting the flyleaf. Rebuild it before depositing."
        )
    return content


def isbn_from(meta: dict, body: str) -> str | None:
    if meta.get("isbn"):
        return str(meta["isbn"])
    heading = next((ln for ln in body.splitlines() if ln.startswith("## ")), "")
    found = re.search(r"ISBN:?\s*([0-9][0-9Xx-]{9,})", heading)
    if found:
        return found.group(1)
    slug = str(meta.get("slug", ""))
    return slug if slug.isdigit() and len(slug) in (10, 13) else None


# ---------------------------------------------------------------- deposit body


def build_metadata(post: Path, pages: str | None, isbn: str | None, notes: list[str], args=None) -> dict:
    _, meta, body = split_front_matter(post)
    for key in ("title", "slug", "author"):
        if not meta.get(key):
            sys.exit(f"{post}: front matter needs `{key}`")
    slug = str(meta["slug"])

    given, family = split_name(str(meta["author"]))
    person = {
        "type": "personal",
        "name": f"{family}, {given}".strip(", "),
        "given_name": given,
        "family_name": family,
    }
    if meta.get("orcid"):
        person["identifiers"] = [{"identifier": str(meta["orcid"]), "scheme": "orcid"}]
    kind = getattr(args, "kind", None) or "review"
    resource_type, author_role, base_tags = KINDS[kind]
    creator: dict = {"person_or_org": person, "role": {"id": author_role}}
    if meta.get("affiliation"):
        ror = getattr(args, "author_ror", None)
        creator["affiliations"] = [{"id": ror, "name": str(meta["affiliation"])} if ror
                                   else {"name": str(meta["affiliation"])}]
        if not ror:
            notes.append(
                "affiliation sent by name only — pass --author-ror, or add the id in KC Works"
            )
    creators = [creator] + [parse_creator(spec) for spec in (getattr(args, "creator", None) or [])]

    subjects = []
    for subject in meta.get("subjects") or []:
        ident = str(subject.get("identifier", ""))
        category = "form" if ident in FAST_FORM_IDS else subject.get("category", "topical")
        if ident in FAST_FORM_IDS and subject.get("category") not in (None, "form"):
            notes.append(f'subject "{subject.get("label")}" schemed as FAST-form, not FAST-{subject.get("category")}')
        subjects.append(
            {
                "id": str(subject.get("uri", "")).replace("https://", "http://"),
                "subject": subject.get("label"),
                "scheme": f"FAST-{category}",
            }
        )

    # bibliographic_abstract is the metadata-only abstract, so it wins when present.
    description = meta.get("bibliographic_abstract") or meta.get("abstract") or meta.get("description") or ""

    record: dict = {
        "metadata": {
            "resource_type": {"id": resource_type},
            "creators": creators,
            "title": str(meta["title"]),
            "publisher": PUBLISHER,
            "publication_date": eastern_date(meta.get("date", "")),
            "languages": [{"id": "eng"}],
            "identifiers": [{"identifier": LANDING.format(slug=slug), "scheme": "url"}],
            "rights": [{"id": "cc-by-4.0"}],
            "description": str(description),
            "subjects": subjects,
        },
        "custom_fields": {
            "journal:journal": {"title": JOURNAL_TITLE, "issn": ISSN},
            "imprint:imprint": {"place": IMPRINT_PLACE},
            "kcr:ai_usage": {"ai_used": bool(meta.get("ai_used", False))},
        },
        "access": {"record": "public", "files": "public"},
        "files": {"enabled": True},
    }

    if isbn:
        record["metadata"]["related_identifiers"] = [
            {
                "identifier": isbn,
                "scheme": "isbn",
                "relation_type": {"id": "reviews"},
                "resource_type": {"id": "textDocument-book"},
            }
        ]
        if "-" not in isbn:
            notes.append(f"ISBN {isbn} is unhyphenated; pass --isbn 978-…-… to match the other records")
    else:
        notes.append("no ISBN found — the record will not say which book it reviews")

    if pages:
        record["custom_fields"]["journal:journal"]["pages"] = pages
    else:
        notes.append("no page range — pass --pages, or keep the PDF where --pdf can find it")

    tags = meta.get("kcworks_tags") or base_tags + list(meta.get("keywords") or [])
    record["custom_fields"]["kcr:user_defined_tags"] = list(dict.fromkeys(str(t) for t in tags))
    return record


# ---------------------------------------------------------------- http


class Works:
    def __init__(self, root: str = API_ROOT):
        key = os.environ.get("KCWORKS_IMPORT_API_KEY")
        if not key:
            sys.exit("KCWORKS_IMPORT_API_KEY is not set. Run: set -a; . ./.env; set +a")
        self.root = root.rstrip("/")
        self.s = requests.Session()
        self.s.headers["Authorization"] = f"Bearer {key}"

    def call(self, method: str, path: str, *, ok=(200, 201, 202), **kw):
        r = self.s.request(method, f"{self.root}{path}", timeout=300, **kw)
        if r.status_code not in ok:
            sys.exit(f"{method} {path} -> {r.status_code}\n{r.text[:800]}")
        return r.json() if r.content and "json" in r.headers.get("Content-Type", "") else {}

    def status(self, path: str) -> int:
        return self.s.request("GET", f"{self.root}{path}", timeout=60).status_code

    def community_id(self, slug: str) -> str:
        return self.call("GET", f"/communities/{slug}")["id"]


def recid_of(doi: str) -> str:
    """KC Works DOIs are 10.17613/<recid>."""
    return doi.strip().strip("\"'").split("/", 1)[-1]


def report(notes: list[str]) -> None:
    """Notes go to stderr so `reviews.py metadata post.md > deposit.json` stays clean."""
    for note in dict.fromkeys(notes):
        print(f"  note: {note}", file=sys.stderr)


# ---------------------------------------------------------------- commands


def cmd_metadata(args) -> None:
    notes: list[str] = []
    record = build_metadata(args.post, resolve_pages(args, notes), resolve_isbn(args), notes, args)
    print(json.dumps(record, indent=2, ensure_ascii=False))
    report(notes)


def resolve_pages(args, notes: list[str]) -> str | None:
    if args.pages:
        return args.pages
    pdf = locate_pdf(args, required=False)
    if pdf and pdf.exists():
        n = pdf_content_pages(pdf, notes)
        if n:
            return f"1-{n}"
    return None


def resolve_isbn(args) -> str | None:
    if getattr(args, "isbn", None):
        return args.isbn
    _, meta, body = split_front_matter(args.post)
    return isbn_from(meta, body)


def locate_pdf(args, required=True) -> Path | None:
    if getattr(args, "pdf", None):
        pdf = Path(args.pdf)
    else:
        _, meta, _ = split_front_matter(args.post)
        name = meta.get("pdf") or f"{meta.get('slug')}.pdf"
        pdf = (Path(__file__).resolve().parent.parent / FILES_DIR / name).resolve()
    if required and not pdf.exists():
        sys.exit(f"PDF not found: {pdf}\nBuild it first, or pass --pdf.")
    return pdf


def cmd_status(args) -> None:
    _, meta, _ = split_front_matter(args.post)
    doi = str(meta.get("doi") or "").strip()
    print(f"post:  {args.post}")
    print(f"front matter doi: {doi or '(empty)'}")
    if not doi:
        print("\nverdict: never deposited. Run `reviews.py reserve` to create the draft.")
        return

    recid = recid_of(doi)
    w = Works(args.api_root)
    public = w.status(f"/records/{recid}")
    datacite = requests.get(f"https://api.datacite.org/dois/{doi}", timeout=60).status_code
    print(f"public record /records/{recid}: {public}")
    print(f"datacite {doi}: {datacite}")

    if public == 200:
        rec = w.call("GET", f"/records/{recid}")
        files = rec.get("files", {})
        comms = (rec.get("parent") or {}).get("communities") or {}
        print(f"  files: {files.get('count')} ({files.get('total_bytes')} bytes)")
        print(f"  collection: {comms.get('default') or '(none)'}")
        verdict = "published and live" if datacite == 200 else "published, but DataCite has not caught up"
        print(f"\nverdict: {verdict}.")
        return

    draft = w.s.get(f"{w.root}/records/{recid}/draft", timeout=60)
    if draft.status_code != 200:
        print(f"draft: {draft.status_code}")
        print("\nverdict: the DOI resolves nowhere and there is no draft to recover. Mint a new one.")
        return

    d = draft.json()
    files = d.get("files", {})
    print(f"draft: 200  (revision {d.get('revision_id')})")
    print(f"  files: {files.get('count')} ({files.get('total_bytes')} bytes)")
    print(f"  publication_date: {d['metadata'].get('publication_date')}")
    print(f"  pages: {(d.get('custom_fields', {}).get('journal:journal') or {}).get('pages')}")
    print(f"  collection: {((d.get('parent') or {}).get('communities') or {}).get('default') or '(none)'}")
    print(f"  validation errors: {json.dumps(d.get('errors'))}")
    if files.get("count"):
        print("\nverdict: STUCK — file attached but never published. Run `reviews.py publish`.")
    else:
        print(
            "\nverdict: STUCK — draft exists with a reserved DOI and NO file, which is why\n"
            "doi.org 404s. The DOI is fine; attach the PDF and publish:  reviews.py publish"
        )


def cmd_reserve(args) -> None:
    _, meta, _ = split_front_matter(args.post)
    existing = str(meta.get("doi") or "").strip()
    if existing and not args.force:
        sys.exit(
            f"{args.post} already has doi: {existing}\n"
            "Run `reviews.py status` first — you probably want `publish`, not another draft.\n"
            "Pass --force only if you really mean to create a second record."
        )

    notes: list[str] = []
    record = build_metadata(args.post, resolve_pages(args, notes), resolve_isbn(args), notes, args)
    report(notes)
    if args.dry_run:
        print(json.dumps(record, indent=2, ensure_ascii=False))
        print("\n(dry run — nothing created)")
        return

    w = Works(args.api_root)
    draft = w.call("POST", "/records", json=record)
    recid = draft["id"]
    doi = ((draft.get("pids") or {}).get("doi") or {}).get("identifier")
    if not doi:
        doi = w.call("POST", f"/records/{recid}/draft/pids/doi")["pids"]["doi"]["identifier"]
    print(f"\ndraft {recid} created")
    print(f"doi reserved: {doi}   (NOT yet registered — publish to activate)")
    print(f"edit form: https://works.hcommons.org/uploads/{recid}")

    if args.write_doi:
        write_doi(args.post, doi)
        print(f"wrote doi into {args.post}")
    else:
        print(f"\nnext: put `doi: {doi}` in the front matter, build the PDF, then `reviews.py publish`")


def write_doi(post: Path, doi: str) -> None:
    raw = post.read_text(encoding="utf-8")
    head, fm, body = raw.split("---\n", 2)
    if re.search(r"^doi:", fm, re.M):
        fm = re.sub(r"^doi:.*$", f"doi: {doi}", fm, count=1, flags=re.M)
    else:
        fm = re.sub(r"^(nanoid:.*\n)", rf"\1doi: {doi}\n", fm, count=1, flags=re.M)
    post.write_text(f"{head}---\n{fm}---\n{body}", encoding="utf-8")


def cmd_publish(args) -> None:
    _, meta, _ = split_front_matter(args.post)
    doi = str(meta.get("doi") or "").strip()
    if not doi:
        sys.exit(f"{args.post} has no doi. Run `reviews.py reserve` first.")
    recid = recid_of(doi)
    pdf = locate_pdf(args)
    w = Works(args.api_root)

    draft = w.s.get(f"{w.root}/records/{recid}/draft", timeout=60)
    if draft.status_code != 200:
        sys.exit(f"No draft for {recid} ({draft.status_code}). Run `reviews.py status`.")
    if draft.json().get("is_published"):
        sys.exit(f"{recid} is already published: https://doi.org/{doi}")

    # Refresh the two fields that drift while the PDF is being built. PUT replaces the
    # whole draft, so send back what the server gave us with only those changed.
    notes: list[str] = []
    wanted = build_metadata(args.post, resolve_pages(args, notes), resolve_isbn(args), notes, args)
    report(notes)
    body = {k: v for k, v in draft.json().items() if k in ("access", "files", "metadata", "custom_fields", "pids")}
    body["metadata"]["publication_date"] = wanted["metadata"]["publication_date"]
    pages = wanted["custom_fields"]["journal:journal"].get("pages")
    if pages:
        body["custom_fields"].setdefault("journal:journal", {})["pages"] = pages
    w.call("PUT", f"/records/{recid}/draft", json=body)
    print(f"metadata: publication_date={body['metadata']['publication_date']} pages={pages}")

    key = pdf.name
    have = {e["key"] for e in w.call("GET", f"/records/{recid}/draft/files").get("entries", [])}
    if key not in have:
        w.call("POST", f"/records/{recid}/draft/files", json=[{"key": key}])
    with pdf.open("rb") as fh:
        w.call(
            "PUT",
            f"/records/{recid}/draft/files/{key}/content",
            data=fh,
            headers={"Content-Type": "application/octet-stream"},
        )
    entry = w.call("POST", f"/records/{recid}/draft/files/{key}/commit")

    local = hashlib.md5(pdf.read_bytes()).hexdigest()
    if entry.get("checksum") != f"md5:{local}" or entry.get("size") != pdf.stat().st_size:
        sys.exit(
            f"Upload mismatch — refusing to publish.\n"
            f"  local  md5:{local} ({pdf.stat().st_size} bytes)\n"
            f"  remote {entry.get('checksum')} ({entry.get('size')} bytes)"
        )
    print(f"file: {key}  {entry['size']} bytes  {entry['checksum']}  ok")

    if not args.yes:
        print(
            f"\nAbout to publish {recid} into {args.collection}.\n"
            "This registers the DOI at DataCite and locks the file bucket permanently."
        )
        if input("Type 'publish' to continue: ").strip() != "publish":
            sys.exit("aborted — the draft is left staged, nothing was published")

    community = w.community_id(args.collection)
    w.call("PUT", f"/records/{recid}/draft/review", json={"receiver": {"community": community}, "type": "community-submission"})
    review = w.call("POST", f"/records/{recid}/draft/actions/submit-review", json={})
    if review.get("status") != "accepted":
        print(f"review request {review.get('number')} is {review.get('status')} — a curator must accept it")
        return

    rec = w.call("GET", f"/records/{recid}")
    print(f"\npublished: https://doi.org/{doi}")
    print(f"  files: {rec['files']['count']}  collection: {(rec['parent']['communities'] or {}).get('default')}")
    print("  DataCite registration can lag a minute; `reviews.py status` will confirm.")


# ---------------------------------------------------------------- cli


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--api-root", default=API_ROOT, help=argparse.SUPPRESS)
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp, pdf=False, isbn=False):
        sp.add_argument("post", type=Path, help="jcrt-v2/content/religioustheory/posts/<slug>.md")
        sp.add_argument("--pages", help='page range, e.g. "1-2"; default is PDF pages minus the flyleaf')
        if isbn:
            sp.add_argument("--isbn", help="hyphenated ISBN of the reviewed book")
        if pdf:
            sp.add_argument("--pdf", help="override the PDF path (default ../jcrt-files/religioustheory/)")
        sp.add_argument("--kind", choices=sorted(KINDS), default="review",
                        help="review (default) or interview")
        sp.add_argument("--author-ror", help="ROR id for the front matter author's affiliation")
        sp.add_argument("--creator", action="append", metavar="SPEC",
                        help='extra creator "Family, Given|role|orcid|affiliation|ror"; repeatable')

    s = sub.add_parser("status", help="where this review stands (no writes)")
    s.add_argument("post", type=Path)
    s.set_defaults(func=cmd_status)

    s = sub.add_parser("metadata", help="print the deposit JSON, touch no network")
    common(s, pdf=True, isbn=True)
    s.set_defaults(func=cmd_metadata)

    s = sub.add_parser("reserve", help="create the draft and reserve its DOI")
    common(s, pdf=True, isbn=True)
    s.add_argument("--write-doi", action="store_true", help="write the reserved DOI into the post's front matter")
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--force", action="store_true", help="create a draft even though the post already has a DOI")
    s.set_defaults(func=cmd_reserve)

    s = sub.add_parser("publish", help="attach the PDF and publish into the collection")
    common(s, pdf=True, isbn=True)
    s.add_argument("--collection", default=COLLECTION)
    s.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    s.set_defaults(func=cmd_publish)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
