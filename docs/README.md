# KCWorks and static-site documentation

These documents describe the maintained JCRT workflow and the reusable pattern
behind it.

- [KCWorks import runbook](kcworks-import-runbook.md) — prepare, validate,
  import, reconcile, and recover one JCRT issue.
- [KCWorks metadata reference](kcworks-metadata-reference.md) — map JCRT
  front matter to the KCWorks import schema.
- [KCWorks and static-site generators](kcworks-ssg-integration.md) — keep an
  SSG and an external repository synchronized without making either one a
  fragile runtime dependency.
- [Importer explain-diff](kcworks-api-importer-explain-diff.md) — audit and
  annotated changes to the vendored importer.

The repository scripts are the authority for executable behavior. These pages
explain that behavior and the operational decisions around it. External API
claims were checked against the KCWorks 0.8.2 documentation on 2026-08-31.

