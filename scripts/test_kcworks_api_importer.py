import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import kcworks_api_importer as importer


class Response:
    def __init__(self, status_code, body, text=None):
        self.status_code = status_code
        self.body = body
        self.text = text if text is not None else json.dumps(body)

    def json(self):
        if isinstance(self.body, Exception):
            raise self.body
        return self.body


class ImportWorksTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.metadata = root / "metadata.json"
        self.upload = root / "article.pdf"
        self.output = root / "response.json"
        self.metadata.write_text("[]", encoding="utf-8")
        self.upload.write_bytes(b"pdf")

    def tearDown(self):
        self.temp.cleanup()

    def run_import(self, response, **kwargs):
        with mock.patch.object(importer.requests, "post", return_value=response) as post:
            importer.import_works(
                "secret",
                "collection",
                str(self.metadata),
                [str(self.upload)],
                str(self.output),
                **kwargs,
            )
        return post

    def test_201_succeeds_and_saves_json(self):
        body = {"data": [], "errors": [], "message": "ok"}
        post = self.run_import(Response(201, body))
        self.assertEqual(json.loads(self.output.read_text()), body)
        self.assertEqual(
            post.call_args.kwargs["timeout"],
            (importer.DEFAULT_CONNECT_TIMEOUT, importer.DEFAULT_READ_TIMEOUT),
        )

    def test_non_201_saves_json_and_fails(self):
        for status in (207, 500):
            with self.subTest(status=status):
                body = {"data": [], "errors": [], "status": status}
                with self.assertRaises(SystemExit):
                    self.run_import(Response(status, body))
                self.assertEqual(json.loads(self.output.read_text()), body)

    def test_timeout_warns_against_blind_retry(self):
        error = importer.requests.exceptions.Timeout("slow")
        stderr = io.StringIO()
        with mock.patch.object(importer.requests, "post", side_effect=error):
            with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit):
                importer.import_works(
                    "secret",
                    "collection",
                    str(self.metadata),
                    [str(self.upload)],
                )
        self.assertIn("outcome is unknown", stderr.getvalue())
        self.assertIn("before retrying", stderr.getvalue())

    def test_invalid_metadata_fails_before_request(self):
        for value in ("not json", "{}"):
            with self.subTest(value=value):
                self.metadata.write_text(value, encoding="utf-8")
                with mock.patch.object(importer.requests, "post") as post:
                    with self.assertRaises(SystemExit):
                        importer.import_works(
                            "secret",
                            "collection",
                            str(self.metadata),
                            [str(self.upload)],
                        )
                post.assert_not_called()

    def test_non_object_response_is_saved_and_fails(self):
        for body, text in ((ValueError("bad json"), "not json"), ([], "[]")):
            with self.subTest(text=text), self.assertRaises(SystemExit):
                self.run_import(Response(200, body, text))
            self.assertEqual(self.output.read_text(), text)

    def test_https_override_keeps_tls_verification(self):
        with mock.patch.dict(
            os.environ,
            {"KCWORKS_IMPORT_API_URL": "https://example.test/api/import"},
        ):
            post = self.run_import(Response(201, {"data": [], "errors": []}))
        self.assertEqual(
            post.call_args.args[0], "https://example.test/api/import/collection"
        )
        self.assertTrue(post.call_args.kwargs["verify"])


if __name__ == "__main__":
    unittest.main()
