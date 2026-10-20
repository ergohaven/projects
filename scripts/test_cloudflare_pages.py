#!/usr/bin/env python3
"""Offline contract tests; Cloudflare responses below are fixtures, not live evidence."""
import importlib.util
import unittest
import tempfile
import json
import hashlib
from pathlib import Path
from unittest.mock import patch


class PackageTests(unittest.TestCase):
    def test_manifest_hashes_both_locales_and_detects_tampering(self):
        self.assertTrue(hasattr(cf, "manifest"), "provenance manifest is missing")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for locale in ("ru", "en"):
                page = root / locale / "phenom/index.html"
                page.parent.mkdir(parents=True)
                page.write_text(locale)
            data = cf.manifest(root, SHA)
            self.assertEqual(data["source_sha"], SHA)
            self.assertEqual(data["files"]["ru"]["phenom/index.html"], hashlib.sha256(b"ru").hexdigest())
            (root / "manifest.json").write_text(json.dumps(data))
            self.assertEqual(cf.verify_bundle(root, SHA), data)
            (root / "ru/phenom/index.html").write_text("changed")
            with self.assertRaises(ValueError):
                cf.verify_bundle(root, SHA)

spec = importlib.util.find_spec("cloudflare_pages")
cf = __import__("cloudflare_pages") if spec else None
SHA = "15af5e1d2c382ceb5425abfd71c9d916e313cb88"


class SourceTests(unittest.TestCase):
    def test_only_full_lowercase_commit_sha_is_accepted(self):
        self.assertIsNotNone(cf, "source validation helper is missing")
        self.assertEqual(cf.source_sha(SHA), SHA)
        for invalid in ("main", "HEAD", SHA[:7], SHA.upper(), SHA + "\n", "x" * 40):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                cf.source_sha(invalid)


def project(name, branch="main", **extra):
    return dict(name=name, id=name + "-id", production_branch=branch,
                source=None, subdomain=name + ".pages.dev", **extra)


class ProjectTests(unittest.TestCase):
    def test_preflight_preserves_branch_and_reads_back_creation(self):
        self.assertTrue(hasattr(cf, "preflight"), "project preflight is missing")
        calls = []
        names = list(cf.PROJECTS.values())
        def api(method, path, payload=None):
            calls.append((method, path, payload))
            name = path.rsplit("/", 1)[-1]
            if method == "POST":
                return project(payload["name"])
            if name == names[0]:
                return project(name, "production")
            return None if len(calls) == 2 else project(name)
        result = cf.preflight(api)
        self.assertEqual(result["ru"]["production_branch"], "production")
        self.assertEqual([c[0] for c in calls], ["GET", "GET", "POST", "GET"])
        self.assertEqual(calls[2][2], {"name": names[1], "production_branch": "main"})

    def test_incompatible_second_project_blocks_all_writes(self):
        self.assertTrue(hasattr(cf, "preflight"), "project preflight is missing")
        for change in ({"source": {"type": "github"}}, {"uses_functions": True},
                       {"name": "unexpected"}, {"production_branch": ""}):
            calls = []
            def api(method, path, payload=None):
                calls.append(method)
                if path.endswith("-ru"):
                    return None
                data = project("ergohaven-projects-en")
                data.update(change)
                return data
            with self.subTest(change=change), self.assertRaises(ValueError):
                cf.preflight(api)
            self.assertEqual(calls, ["GET", "GET"])


class PublishTests(unittest.TestCase):
    def test_publish_reads_back_exact_deployment_and_checks_public_hash(self):
        self.assertTrue(hasattr(cf, "publish"), "verified publication is missing")
        calls = []
        projects = {loc: project(name, "release") for loc, name in cf.PROJECTS.items()}
        expected = {"files": {loc: {"phenom/index.html": hashlib.sha256(loc.encode()).hexdigest()} for loc in projects}}
        def api(method, path, payload=None):
            calls.append(path)
            name = next(n for n in cf.PROJECTS.values() if n in path)
            if "/deployments/" not in path:
                return dict(project(name), canonical_deployment={"id": "deployment-id"})
            return {"id": "deployment-id", "project_name": name, "project_id": name + "-id",
                    "environment": "production", "latest_stage": {"name": "deploy", "status": "success"},
                    "deployment_trigger": {"metadata": {"commit_hash": SHA, "branch": "release"}},
                    "url": "https://actual-deployment.pages.dev"}
        commands = []
        def fetch(url):
            return ("ru" if len(commands) == 1 else "en").encode()
        result = cf.publish(Path("bundle"), SHA, expected, projects, api,
                            lambda args: commands.append(args), fetch, attempts=1)
        self.assertEqual(len(result), 2)
        self.assertIn("--branch=release", commands[0])
        self.assertIn("--commit-hash=" + SHA, commands[0])
        self.assertEqual(len(calls), 4)
        self.assertTrue(calls[1].endswith("/deployments/deployment-id"))
        with self.assertRaises(ValueError):
            cf.publish(Path("bundle"), SHA, expected, projects, api,
                       lambda args: None, lambda url: b"wrong content", attempts=1)


class AdapterTests(unittest.TestCase):
    def test_api_checks_envelope_and_never_treats_auth_failure_as_missing(self):
        self.assertTrue(hasattr(cf, "CloudflareAPI"), "HTTP adapter is missing")
        import io
        from urllib.error import HTTPError
        api = cf.CloudflareAPI("a" * 32, "fixture-token-not-real")
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"success":true,"result":{"name":"fixture"}}'
        with patch("cloudflare_pages.urlopen", return_value=response) as request:
            self.assertEqual(api("GET", "/pages/projects/fixture"), {"name": "fixture"})
            self.assertIn("/accounts/" + "a" * 32 + "/pages/projects/fixture", request.call_args.args[0].full_url)
        for code in (403, 500):
            with patch("cloudflare_pages.urlopen", side_effect=HTTPError("url", code, "error", {}, io.BytesIO(b"private"))):
                with self.assertRaises(RuntimeError) as error:
                    api("GET", "/pages/projects/fixture")
                self.assertNotIn("private", str(error.exception))
        with patch("cloudflare_pages.urlopen", side_effect=HTTPError("url", 404, "missing", {}, io.BytesIO())):
            self.assertIsNone(api("GET", "/pages/projects/fixture"))
        response.__enter__.return_value.read.return_value = b'{"success":false,"result":{}}'
        with patch("cloudflare_pages.urlopen", return_value=response), self.assertRaises(RuntimeError):
            api("GET", "/pages/projects/fixture")

    def test_cli_manifest_requires_valid_sha_without_credentials(self):
        import subprocess
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for locale in ("ru", "en"):
                page = root / locale / "phenom/index.html"
                page.parent.mkdir(parents=True)
                page.write_text(locale)
            result = subprocess.run(["python3", str(Path(__file__).with_name("cloudflare_pages.py")),
                                     "manifest", "--root", tmp, "--source-sha", SHA], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((root / "manifest.json").exists(), "CLI must create provenance")


if __name__ == "__main__":
    unittest.main()
