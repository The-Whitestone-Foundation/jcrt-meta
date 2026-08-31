# KCWorks and static-site generators

A static site and a repository such as KCWorks should exchange durable
identifiers and metadata at publication time, not depend on each other for
every page request. JCRT implements that pattern with Eleventy, but the same
design works with Hugo, Jekyll, Astro, or another SSG.

## The durable pattern

Use one editorial source, one stable local key, and an explicit return path:

```text
content file ──build/export──> repository deposit
     │                              │
     │ stable local ID              │ minted DOI + repository record ID
     └──────────── reconcile <──────┘
                    │
                    └─ write DOI to content, rebuild, deploy
```

The important choices are:

1. **Content remains canonical.** Titles, creators, dates, abstracts,
   subjects, and file references are edited in version-controlled source.
2. **A stable source ID crosses the boundary.** Do not reconcile by title,
   filename, array position, or URL; all can change. JCRT maps `nanoid` to the
   KCWorks `import-recid` scheme.
3. **Generated payloads are reviewable artifacts.** The metadata JSON and ZIP
   can be checked before any network request.
4. **Repository identifiers return to source.** Once KCWorks mints a DOI, the
   workflow writes the bare DOI into front matter and rebuilds the site.
5. **No runtime API dependency is required.** Published HTML already contains
   DOI, citation, discovery, and PDF metadata even if KCWorks is temporarily
   unavailable.

KCWorks specifically requires a unique import identifier and returns it as
`source_id` beside each created `record_id`. Its documentation also warns that
metadata and file equality do not prevent duplicate deposits. See the
[streamlined import API](https://mesh-research.github.io/knowledge-commons-works/reference/api.html#streamlined-import-api).

## JCRT's concrete implementation

| Concern | JCRT implementation |
| --- | --- |
| Canonical content | `jcrt-v2/content/archives/<issue>/*.md` |
| Stable source key | Front matter `nanoid` |
| Deposit transformation | `jcrt-meta/scripts/generate-archives.mjs` |
| Local import validation | `jcrt-meta/scripts/preflight-import.mjs` |
| Import orchestration | `jcrt-meta/import.sh` |
| HTTP client | `jcrt-meta/scripts/kcworks_api_importer.py` |
| Durable response | `jcrt-meta/_logs/<issue>.log` (private, gitignored) |
| Return mapping | KCWorks `source_id`/`import-recid` → JCRT `nanoid` |
| Returned identifier | Bare DOI in front matter `doi` |

The metadata exporter reads neighboring `jcrt-v2` directly. That small amount
of repository coupling is intentional: it avoids a second manually maintained
catalog. If the repositories stop being siblings, change the source boundary
once in the exporter or pass a path through the build environment; do not copy
metadata into both repositories.

## Front matter contract

A representative published archive record is:

```yaml
---
nanoid: "T4s4RL"
doi: "10.17613/jp50n-7y514"
layout: archives.njk
article_number: "08"
volume: "25"
issue: "1"
pages: "137-139"
title: "Article title"
author: "First Author; Second Author"
affiliation: "University"
description: "Abstract or summary."
pdf: "article.pdf"
date: 2026-04-16
keywords:
  - example-keyword
subjects:
  - label: Religion
    scheme: FAST
    identifier: fst01093763
    uri: https://id.worldcat.org/fast/1093763
    category: topical
---
```

Keep the DOI as the bare identifier (`10.…`), not a `doi:` label or resolver
URL. Templates can then create `https://doi.org/<doi>` consistently. Keep the
repository source key immutable after first publication.

See [KCWorks metadata reference](kcworks-metadata-reference.md) for the exact
deposit transformation.

## What the SSG should publish

Once the DOI is in source, generate it everywhere from the same field:

- a visible DOI link or citation;
- `<meta name="citation_doi">` for scholarly discovery;
- Dublin Core identifiers;
- Schema.org/JSON-LD `identifier` and `sameAs`;
- RIS and CSL JSON citation downloads;
- DataCite-style discovery metadata when the site provides it; and
- OAI-PMH or sitemap records where appropriate.

The JCRT Eleventy site already uses the archive front matter to produce Google
Scholar citation meta tags, Dublin Core and PRISM fields, Schema.org JSON-LD,
JATS metadata, DataCite XML, RIS/CSL JSON, OAI-PMH records, and local sitemaps.
Its article pages link directly to PDFs on `files.jcrt.org`; if no local PDF
URL is present, the archive template may fall back to the DOI URL.

These are build-time projections, not new sources of truth. Fix incorrect
metadata in front matter, regenerate the deposit artifact, update KCWorks
through its supported edit/version flow, and rebuild the site.

## Framework-neutral implementation

Every SSG needs only three small pieces:

1. **A content schema** that validates a stable source ID and publication
   metadata.
2. **An export command** that converts published content into a KCWorks JSON
   array and builds the file bundle.
3. **A reconciliation command** that maps successful response entries back to
   source by stable ID and writes the DOI only when the mapping is unique.

The framework changes where those pieces live, not the data model:

| SSG | Content data | Build-time rendering |
| --- | --- | --- |
| Eleventy | YAML front matter and data cascade | Nunjucks/Liquid templates and JS data files |
| Hugo | YAML/TOML front matter | Go templates |
| Jekyll | YAML front matter | Liquid templates |
| Astro | Markdown/MDX front matter or content collections | Astro components and schema-validated collections |

Avoid fetching KCWorks in a page template at build time unless the repository
is intentionally the metadata authority. That creates a network-sensitive
build and makes an API outage block publication. A scheduled audit can compare
the two systems without putting that risk in the critical path.

## Publication sequence

For a new issue or article:

1. Finalize content, front matter, and PDFs.
2. Build the site and deposit artifacts locally.
3. Validate both artifact sets.
4. Import into KCWorks once.
5. Reconcile the response by stable source ID.
6. Write minted DOIs into canonical content.
7. Rebuild and deploy the site.
8. Verify DOI resolution, repository landing pages, site metadata, citation
   exports, and PDF links.

This order avoids publishing a DOI before it exists and avoids depositing
unfinished metadata. If the site must go live first, publish without the DOI,
then perform steps 4–8 as a second reviewed deployment.

## Changes after publication

Separate three kinds of change:

| Change | Site action | KCWorks action |
| --- | --- | --- |
| HTML-only presentation or typo outside deposited metadata | Rebuild/deploy | None |
| Deposited metadata correction | Edit source and rebuild | Create/publish a metadata update draft |
| PDF/content replacement | Update source/file and rebuild | Create a new record version; published files are not modified in place |

KCWorks documents that metadata changes to a published work proceed through a
draft, while file changes require a new version. See the official [REST API
limitations and update behavior](https://mesh-research.github.io/knowledge-commons-works/reference/api.html#the-inveniordm-rest-api).

Never create a fresh deposit merely to correct an existing one. That can mint
a second DOI and split citations.

## Failure handling and drift control

The system has three checkpoints:

- **before POST:** validate source, generated metadata, and files;
- **after POST:** preserve the full response and reconcile every source ID;
- **after deploy:** verify the public DOI, KCWorks record, HTML metadata, and
  PDF.

A client timeout is an ambiguous outcome, not proof of failure. Reconcile the
submitted source IDs against the collection before retrying. HTTP 207 is also
not success for automation: retain its partial results and repair only the
known failures. The detailed response procedure is in the [KCWorks import
runbook](kcworks-import-runbook.md#errors-and-safe-recovery).

For ongoing maintenance, a simple periodic comparison is enough: each
published source record should have one stable ID, one DOI, one KCWorks record,
one expected PDF, and matching core bibliographic fields. Add automated remote
auditing only when observed drift justifies the network dependency.

