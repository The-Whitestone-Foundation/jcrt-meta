# KCWorks import runbook

This is the operator guide for depositing one numbered JCRT issue into
[Knowledge Commons Works](https://works.hcommons.org/) (KCWorks). Run commands
from the `jcrt-meta` repository root. The workflow makes live changes only when
`./import.sh <issue>` reaches its confirmed import step.

## What the workflow does

The two sibling repositories have separate jobs:

```text
jcrt-v2 Markdown front matter + article body
                  │
                  ├─ jcrt-meta generator ─> issue metadata JSON
                  │                         issue PDF ZIP
                  │
                  └─ Eleventy build ──────> article HTML, discovery metadata,
                                            citations, feeds, and PDF links

metadata JSON + PDF ZIP ──> KCWorks collection ──> record IDs and DOIs
                                                        │
                                                        └─> DOI front matter
                                                            in jcrt-v2
```

KCWorks calls collections “communities” in its underlying InvenioRDM API. The
JCRT wrapper creates or reuses one public collection per issue:

| JCRT issue | Collection title | Collection slug |
| --- | --- | --- |
| `25.1` | `JCRT 25.1` | `jcrt-251` |

The streamlined import endpoint accepts a metadata array and its files in one
multipart request. It can publish directly into a collection when the token
user has the required role. See the official [KCWorks import API
reference](https://mesh-research.github.io/knowledge-commons-works/reference/api.html#streamlined-import-api).

## Files and ownership

| Path | Role | Commit it? |
| --- | --- | --- |
| `../jcrt-v2/content/archives/<issue>/*.md` | Canonical article content and front matter | Yes |
| `archives/<issue>.zip` | PDFs sent with the import | Yes |
| `archives/<issue>.metadata.json` | Generated KCWorks metadata array | Yes |
| `images/<issue>.profile.png` | Collection profile image | Yes |
| `import/<issue>/` | Preflight extraction workspace | No; gitignored |
| `_logs/<issue>.log` | Full API response and DOI-sync input | No; gitignored, but retain securely |
| `.env` | API token and local settings | No; gitignored |

Treat front matter as the editorial source of truth. Treat KCWorks as the
authority for its record IDs and minted DOIs. The `nanoid` in each Markdown
file bridges the two systems through the KCWorks `import-recid` identifier; do
not change it after deposit.

## Prerequisites

The sibling layout must be:

```text
github/
├── jcrt-meta/
└── jcrt-v2/
```

Required command-line tools are Node.js/npm, Python 3.9+, `requests`, `jq`,
`curl`, `rg`, `unzip`, `sips`, `rsvg-convert`, and ImageMagick's `magick`.
Create the Python environment once:

```sh
python3 -m venv .venv
.venv/bin/pip install requests
```

Put secrets and local importer settings in `.env`:

```sh
KCWORKS_IMPORT_API_KEY=replace-with-token
KCWORKS_IMPORT_OUTPUT_PATH=_logs/{issue}.log
KCWORKS_IMPORT_TIMEOUT=600
```

`KCWORKS_IMPORT_TIMEOUT` is the response read timeout in seconds. The importer
always uses a 10-second connection timeout. Do not commit `.env`, print the
token, pass it on a shared command line, or attach it to an issue report.

The token user must be permitted to publish into the target collection. The
official rules depend on the collection review policy: owner is sufficient;
manager or curator may also suffice when that policy lets them skip review.

## Prepare a new issue

1. Complete the issue's Markdown files under
   `../jcrt-v2/content/archives/<issue>/`. Each published record needs a stable
   `nanoid`, title, creator information, publication date, volume, issue,
   pages, description, keywords/subjects as available, and a PDF name.
2. Ensure the article PDFs are represented in the issue ZIP. The archive build
   can make PDFs from Markdown when no scanned PDF is available.
3. Rebuild the ZIP and generated metadata:

   ```sh
   npm run archives:build
   ```

   Use `npm run archives:rebuild` instead when Markdown-derived PDFs must be
   regenerated; the ordinary build deliberately reuses existing PDFs.
4. Check that all committed sidecars agree with their sources:

   ```sh
   npm run check
   npm run archives:check
   ```

5. Review the issue-specific JSON and ZIP changes. Metadata generation covers
   every published Markdown record in the numbered issue directory, including
   front-matter records such as biographies or contents pages. A file marked
   `published: false` is omitted.

For metadata rules and the complete field mapping, see [KCWorks metadata
reference](kcworks-metadata-reference.md).

## Perform the local preflight

Run:

```sh
./import.sh --check 25.1
```

Replace `25.1` with the target issue. This mode does not call KCWorks. It:

- checks the issue name and required ZIP/JSON paths;
- creates an 800×800 collection image when missing, reports its dimensions,
  and validates its size and 72 DPI setting;
- prints the collection, record count, filenames, and profile details;
- extracts the ZIP to `import/<issue>/`;
- validates the root metadata array, required values, dates, creator IDs,
  owner, journal ISSN, controlled subjects, file names, and byte sizes; and
- fails if a PDF is missing, extra, or associated with the wrong record.

Fix source front matter or the archive inputs, regenerate, and repeat the
check. Do not hand-edit generated JSON unless diagnosing a generator bug; the
next generation will overwrite it.

## Import the issue

Run:

```sh
./import.sh 25.1
```

The wrapper is intentionally interactive because collection creation and
record publication are consequential. It will:

1. run the same local preflight;
2. load the token from `.env`;
3. create `JCRT <issue>` or ask before reusing an existing collection;
4. tag the collection as a journal;
5. optionally upload the issue profile image;
6. confirm that the token user is a collection owner and make that membership
   public when necessary;
7. ask once more before sending the metadata array and ZIP;
8. save the response to `_logs/<issue>.log`;
9. accept only HTTP 201 as success; and
10. fetch each created record and write its DOI into the matching JCRT
    Markdown file.

The wrapper disables owner notification for this import. The upstream API
supports email notification, but a bulk backfile deposit should not surprise
record owners. The import endpoint defaults to strict validation and
all-or-none behavior; the JCRT importer does not weaken those settings.

For diagnostics, the canonical importer can also be run directly with
`python scripts/kcworks_api_importer.py --help`. Command-line values take
precedence over `KCWORKS_IMPORT_*` environment variables, which take
precedence over prompts. `--timeout SECONDS` overrides
`KCWORKS_IMPORT_TIMEOUT`. Do not normally set `KCWORKS_IMPORT_API_URL`; it
changes only the import endpoint, while `KCWORKS_API_ROOT` changes the wrapper's
collection and record endpoints. An HTTPS URL override still verifies TLS.
Only the importer's explicit `--testing` mode disables certificate
verification for a local test instance.

After DOI synchronization, the wrapper pauses for human review. Check:

- the collection is public and has the correct title, type, website, and image;
- the result count equals `jq length archives/<issue>.metadata.json`;
- every record has the intended title, creators, date, journal fields,
  subjects, rights, PDF, owner, and DOI;
- the PDF opens and corresponds to the record; and
- `_logs/<issue>.log` contains no errors.

Then inspect the changed `doi:` lines in `../jcrt-v2`, run that repository's
normal checks/build, and deploy the SSG so DOI links and discovery metadata go
live.

## Restore DOI synchronization only

If the import returned a complete HTTP 201 response but the local DOI update
was interrupted, do not import again. Preserve `_logs/<issue>.log`, then run:

```sh
./import.sh --sync-dois 25.1
```

Preview the edits first when useful:

```sh
JCRT_DOI_DRY_RUN=1 ./import.sh --sync-dois 25.1
```

The sync refuses to run unless the log has exactly the expected number of
successful records and zero errors. For each `record_id`, it fetches the
published record, reads its `import-recid` and DOI, requires exactly one
Markdown file with the matching `nanoid`, and refuses to replace a different
existing DOI.

## Errors and safe recovery

The response log is evidence. Preserve it before changing inputs or retrying.

| Result | Meaning | Action |
| --- | --- | --- |
| `201 Created` | Complete success | Verify count, sync DOIs, review records. |
| `207 Multi-Status` | The server reports mixed results | The importer saves the body and exits nonzero. Reconcile every successful and failed item; never resend the complete issue blindly. |
| `400` | Invalid request or metadata | Read saved field errors, correct the source/generator, regenerate, and preflight again. |
| `403` | Token or collection permissions are insufficient | Confirm the token identity and collection role before another request. |
| `409` | A registered unique identifier already exists | Follow the response `Location`; reconcile instead of creating a duplicate. |
| `500` or `504` response | KCWorks or its gateway returned an error | Save the response and any error ID. Check the collection before retrying; send the error ID and request context to KCWorks support if needed. |
| Client timeout or connection loss | The client did not receive a conclusive response | Outcome is unknown. Search the collection for the submitted `import-recid` values and reconcile all items before any retry. |
| Non-JSON/non-object response | Proxy/server returned an unexpected body | The importer saves the raw body and exits nonzero. Preserve it for diagnosis. |

KCWorks documents cleanup after an import that the server knows failed. That
does not make a client-side timeout safe to retry: the request may have
completed after the client stopped waiting. KCWorks also warns that metadata,
filenames, and file contents alone do not prevent duplicates, and a duplicate
request can receive a newly minted DOI. See [failure cleanup and duplicate
imports](https://mesh-research.github.io/knowledge-commons-works/reference/api.html#what-happens-to-an-import-request-that-fails).

Reconciliation means comparing the submitted metadata array with the target
collection, using `metadata.identifiers[scheme=import-recid]` as the key. For
each submitted value, establish exactly one of:

- one matching published record exists: record it and do not resubmit it;
- no matching record exists: it may be safe to submit that record after the
  server-side failure is understood; or
- more than one exists: stop and ask KCWorks administrators to resolve the
  duplicate.

The current wrapper sends one whole issue and has no automatic retry or
generic batching mode. That is deliberate: a POST retry is unsafe without an
idempotency guarantee, and recovery needs evidence about which records exist.

## Updating a published record

Do not run the import workflow to “update” an existing deposit. Correct the
canonical JCRT front matter first, then use the KCWorks record editing/version
workflow and keep the DOI stable.

KCWorks/InvenioRDM treats published records as persistent:

- a metadata edit creates a draft that replaces the published metadata only
  when the draft is published; and
- changing a published file requires a new version of the work.

The API details are in the official [KCWorks API
reference](https://mesh-research.github.io/knowledge-commons-works/reference/api.html#the-inveniordm-rest-api).
The JCRT scripts do not automate published-record edits or new versions. Make
those changes in KCWorks with an authorized, reviewed procedure, then rebuild
and deploy `jcrt-v2` if the site-facing metadata or PDF link also changed.

## Operational checklist

Before import:

- [ ] Source front matter and PDFs are final.
- [ ] `nanoid` values are present, unique, and stable.
- [ ] `npm run archives:build` or `archives:rebuild` completed.
- [ ] `npm run check` and `npm run archives:check` pass.
- [ ] `./import.sh --check <issue>` passes.
- [ ] The token and target issue/collection were verified.

After import:

- [ ] The saved response is HTTP 201 with the expected count and no errors.
- [ ] DOI sync updated the intended Markdown files only.
- [ ] Collection and record metadata were reviewed in KCWorks.
- [ ] Every PDF opens and belongs to its record.
- [ ] The `jcrt-v2` checks/build pass and the site is deployed.
- [ ] Secrets and response logs remain outside version control.
