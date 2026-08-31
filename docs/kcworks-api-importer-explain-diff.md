# KCWorks API importer: Ponytail audit and explain-diff

## Provenance

`scripts/kcworks_api_importer.py` was vendored from
`MESH-Research/knowledge-commons-works` commit
`f25a0d192b10c931dcf64d752c8acf37a7cb5633` (2026-02-06). JCRT later gained a
second copy at the repository root containing one extra non-201 exit check.
This change keeps the attributed `scripts/` copy, routes `import.sh` to it, and
deletes the root duplicate so the two copies cannot drift again.

## Audit findings

Ranked by operational risk:

1. **Non-201 JSON responses exited successfully.** HTTP 207 and 500 bodies were
   printed and saved, but the process returned zero. A wrapper could therefore
   continue to DOI synchronization after a failed or partial import.
2. **A request could wait forever.** `requests.post()` had no timeout. Adding a
   bound is necessary, but a timed-out POST has an unknown server outcome and
   must not be retried blindly.
3. **An API URL override disabled TLS verification.** Pointing
   `KCWORKS_IMPORT_API_URL` at an HTTPS service silently set `verify=False`.
4. **Malformed boundary data failed unclearly.** Invalid metadata reached the
   remote API, while a JSON response whose root was not an object crashed the
   formatter.
5. **Two importer copies had already diverged.** The live wrapper called the
   root copy while repository history still described the `scripts/` copy as
   canonical.
6. **The spinner added a thread and cleanup path for cosmetic output.** A static
   progress line provides the same operational signal.

## Annotated diff

### One canonical entry point

```diff
- "$python" kcworks_api_importer.py \
+ "$python" scripts/kcworks_api_importer.py \
```

The root copy was deleted. The README and embedded examples now name the same
canonical path.

### Bounded request with honest timeout semantics

```diff
-response = requests.post(api_url, headers=headers, files=files, data=data,
-                         verify=verify_ssl)
+response = requests.post(
+    api_url,
+    headers=headers,
+    files=files,
+    data=data,
+    verify=not testing,
+    timeout=(10.0, timeout),
+)
```

`--timeout` and `KCWORKS_IMPORT_TIMEOUT` configure the response read timeout;
the default is 600 seconds. Connection establishment is capped at 10 seconds.
A `requests.exceptions.Timeout` exits nonzero and says that the server outcome
is unknown and submitted `import-recid` values must be reconciled before retry.

### Non-success responses fail after being preserved

```diff
 if output_path:
     json.dump(response_json, output_file, indent=2)
+if response.status_code != 201:
+    sys.exit(1)
```

The response is still printed and written first, retaining KCWorks messages and
error IDs for diagnosis. HTTP 201 remains the sole success contract; 207 and
all 4xx/5xx responses return exit status 1.

### Validate both sides of the JSON boundary

```diff
 metadata_json = metadata_file.read()
+metadata = json.loads(metadata_json)
+if not isinstance(metadata, list):
+    _print_error("Metadata JSON must contain an array at its root")
+    sys.exit(1)
```

Metadata must be valid JSON with the API-required array root before any request
is made. Response JSON must be an object before the formatter uses `.get()`;
otherwise the raw body is saved and the command fails cleanly.

### Preserve TLS verification for endpoint overrides

```diff
-if api_url_env:
-    verify_ssl = False
+api_root = api_url_env or default_api_root
+verify_ssl = not testing
```

An alternate HTTPS endpoint now receives normal certificate verification.
Only the explicit `--testing` mode retains the existing self-signed-localhost
behavior.

### Delete cosmetic concurrency

```diff
-import threading
-spinner_thread = threading.Thread(...)
-spinner_thread.start()
-...
-spinner_thread.join()
+print("\nImporting records...")
```

`contextlib.ExitStack` now owns all upload handles, replacing the manual handle
list and `finally` loop with standard-library context management.

## Observed KCWorks failures

The migration retained three generic HTTP 500 response IDs:

- `e54e719e13cc441ba699b26e40e5acd4`
- `80e109ecb7cf4f099744e780d42f6395`
- `91058a2074ed423fa81be180fe15c203`

These were server responses, not `requests` timeout exceptions. Two subsequent
smaller requests exposed invalid FAST or Homosaurus identifiers, so the 500s
may have masked server-side validation failures. Client timeout handling must
therefore remain distinct from HTTP status handling.

## Deliberately skipped

- **Automatic POST retries:** unsafe without an idempotency key because the
  server may create records before the client receives a response.
- **Generic batching:** matching metadata entries to files and reconciling live
  `import-recid` values is workflow-specific and belongs outside this generic
  importer.
- **New dependencies or abstractions:** `argparse`, `contextlib`, `json`, and the
  already-required `requests` package cover the change.
- **Full API-schema duplication:** the local check validates only JSON syntax
  and the required array root; KCWorks remains authoritative for record fields.

## Verification

The change is checked without making live KCWorks requests:

```text
python3 -m py_compile scripts/kcworks_api_importer.py
.venv/bin/python -m unittest discover -s scripts -p 'test_kcworks_api_importer.py'
.venv/bin/python scripts/kcworks_api_importer.py --help
./import.sh --check 25.1
rg -n 'kcworks_api_importer\.py' README.md import.sh scripts CHANGELOG.md
git diff --check
```

Expected result: compilation succeeds, six focused tests pass, CLI help lists
the timeout option, preflight completes without remote requests, executable
references use the `scripts/` path, and the diff has no whitespace errors.
