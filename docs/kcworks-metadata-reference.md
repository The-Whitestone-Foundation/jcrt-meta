# KCWorks metadata reference

This page describes the metadata produced by
`scripts/generate-archives.mjs`. It is a JCRT-specific companion to the
official [KCWorks metadata schema, vocabularies, and identifiers](https://mesh-research.github.io/knowledge-commons-works/reference/metadata.html).

## Source and generated record

The source is one article's YAML front matter in
`../jcrt-v2/content/archives/<issue>/<slug>.md`. The generator emits one object
in `archives/<issue>.metadata.json` and associates it with one PDF entry in
`archives/<issue>.zip`.

KCWorks requires an array at the JSON root even for one record. The JCRT shape
is:

```json
[
  {
    "metadata": {},
    "custom_fields": {},
    "parent": {},
    "files": { "enabled": true, "entries": {} }
  }
]
```

## Field mapping

| JCRT source | KCWorks target | Transformation |
| --- | --- | --- |
| `nanoid` | `metadata.identifiers[]`, scheme `import-recid` | Required stable reconciliation key. |
| issue directory + Markdown slug | `metadata.identifiers[]`, scheme `url` | `https://jcrt.org/archives/<issue>/<slug>/`. |
| `doi` | `metadata.identifiers[]`, scheme `doi` | Included only when already present. |
| `title` | `metadata.title` | Inline Markdown is stripped. |
| `author` or `authors` | `metadata.creators` | Split into personal creator objects; role is `author`. |
| `affiliation` | creator `affiliations` | Applied to generated creators when present. |
| author profile `orcid` / `sameAs` ISNI | creator identifiers | Matched by normalized author name. |
| `date`, then `year` | `metadata.publication_date` | Full `YYYY-MM-DD` when available, otherwise year. |
| `description`, then `abstract` | `metadata.description` | Empty string if neither is present. |
| `subjects` | `metadata.subjects` | Controlled URI and scheme normalization described below. |
| `keywords` | `custom_fields["kcr:user_defined_tags"]` | Free-text tag array. |
| `volume`, `issue`, `pages` | `custom_fields["journal:journal"]` | Issue-directory values provide volume/issue fallbacks. |
| `pdf`, then `<slug>.pdf` | `files.entries` | Exact ZIP filename and byte size. |
| `published: false` | no record | The source file is omitted. |

The generator supplies these fixed publication values:

| Field | Value |
| --- | --- |
| `metadata.resource_type.id` | `textDocument-journalArticle` |
| `metadata.publisher` | `Whitestone Publications` |
| `metadata.languages` | `[{"id":"eng"}]` |
| `custom_fields["journal:journal"].title` | `Journal for Cultural & Religious Theory` |
| `custom_fields["journal:journal"].issn` | `1530-5228` |
| rights | Author-held copyright, JCRT publication statement, and `https://jcrt.org/copyright/` |
| owner | Adam DJ Brett, matched by email and KC username |

KCWorks itself requires title, resource type, publication date, and at least
one creator. Language, description, rights, and controlled subjects are among
its recommended fields. JCRT validates a stricter project contract before
upload so a record cannot silently lose important journal metadata.

## Creators and identifiers

`author` may be an array or a string separated by semicolons or the word
`and`. The generator treats the last word as the family name and preceding
words as the given name, with special handling for generational suffixes such
as `Jr.` and `III`. Use the canonical author spelling consistently so ORCID or
ISNI metadata in `../jcrt-v2/content/authors/` can be matched.

If a published record has no author, the generator uses `JCRT Editors`. Do not
rely on that fallback when a personal creator is known.

Identifier roles are intentionally separate:

- `import-recid` identifies the same source item across the SSG, import
  response, and KCWorks record;
- `url` points to the JCRT article landing page;
- `doi` identifies an already deposited work and helps prevent duplicate
  creation; and
- the journal ISSN belongs in `journal:journal`, not in the article's
  `metadata.identifiers` array.

The official import API calls a returned `import-recid` value `source_id` and
uses it to identify each work in the response. See [identifying the work for
import](https://mesh-research.github.io/knowledge-commons-works/reference/api.html#identifying-the-work-for-import).

## Subjects and keywords

JCRT front matter retains descriptive fields useful to the website:

```yaml
subjects:
  - label: Religion
    scheme: FAST
    identifier: fst01093763
    uri: https://id.worldcat.org/fast/1093763
    category: topical
keywords:
  - religion
```

The KCWorks record receives:

```json
{
  "subjects": [
    {
      "id": "http://id.worldcat.org/fast/1093763",
      "subject": "Religion",
      "scheme": "FAST-topical"
    }
  ]
}
```

The generator normalizes the source representation because KCWorks vocabulary
lookups require exact identifier forms:

- FAST IDs become `http://id.worldcat.org/fast/<number>` and the source
  `category` becomes a supported `FAST-<facet>` scheme;
- Homosaurus IDs become `https://homosaurus.org/v3/<term>` with scheme
  `Homosaurus`; and
- unrecognized URIs or FAST facets fail generation.

Free-text `keywords` remain in `kcr:user_defined_tags`; they are not disguised
as controlled subjects. KCWorks documents the accepted FAST facets and
Homosaurus shape in its [subjects reference](https://mesh-research.github.io/knowledge-commons-works/reference/metadata.html#metadata-subjects).

## Files

`files.entries` names the file and declares its byte size:

```json
{
  "files": {
    "enabled": true,
    "entries": {
      "article.pdf": {
        "key": "article.pdf",
        "size": 123456
      }
    }
  }
}
```

KCWorks pairs uploaded files to metadata by exact filename. The generator
looks for an exact ZIP entry first and then allows a case-insensitive source
match, but emits the ZIP entry's real spelling in both `key` positions. The
preflight then confirms that the file exists and that its actual byte size
matches the sidecar. Every extracted PDF must be referenced by one generated
record.

## Validation boundaries

The checks are intentionally layered:

1. `generate-archives.mjs` rejects missing stable IDs, unknown subject URIs or
   facets, missing ZIPs, and missing PDFs while deriving metadata.
2. `preflight-import.mjs` validates the complete issue sidecar against JCRT's
   KCWorks contract and the extracted ZIP inventory.
3. `kcworks_api_importer.py` rejects malformed JSON or a non-array root before
   network access.
4. KCWorks applies its server-side schema and permission validation.

Passing a local check does not guarantee acceptance by a changing remote
service. Conversely, weakening server validation is not a substitute for
fixing source metadata.

