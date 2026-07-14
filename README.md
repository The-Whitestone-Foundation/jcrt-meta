# JCRT metadata

Generated KCWorks import metadata for JCRT. Each numbered archive issue has one
`metadata/archives/<issue>/metadata.json` array containing its article records.

Run `npm run generate` after changing archive front matter in `../jcrt-v2`.
Run `npm run check` to verify that committed metadata is current and valid.

The archive nanoid is exported as an `import-recid` identifier. Controlled
subjects preserve the FAST or Homosaurus label, identifier, URI, scheme, and
authority category from the source front matter.

## Rebuilding the archive metadata

1. Update the numbered issue content in `../jcrt-v2/content/archives/`.
2. Run `npm run generate` to regenerate every issue-level metadata file.
3. Run `npm run check` to confirm the committed JSON is current.
4. Review the changed files, then commit and push them to GitHub.

The generator omits unpublished records and known non-article files such as
`index`, `bios`, `author-bios`, `table-of-contents`, and `abstracts`. Records
without an author use `JCRT Editors` as a fallback creator.

See [CHANGELOG.md](CHANGELOG.md) for the complete `0.0.1` development record.

## License

This project is licensed under the GNU Affero General Public License v3.0 only.
See [LICENSE](LICENSE).
