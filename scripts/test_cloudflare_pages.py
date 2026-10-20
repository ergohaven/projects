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
    def public_probe_fixture(self):
        module = cf
        assert module is not None
        projects = {loc: project(name) for loc, name in module.PROJECTS.items()}
        expected = {"files": {loc: {"phenom/index.html": hashlib.sha256(loc.encode()).hexdigest()} for loc in projects}}
        def api(method, path, payload=None):
            name = next(n for n in module.PROJECTS.values() if n in path)
            if "/deployments/" not in path:
                return dict(project(name), canonical_deployment={"id": "deployment-id"})
            return {"id": "deployment-id", "project_name": name, "project_id": name + "-id",
                    "environment": "production", "latest_stage": {"name": "deploy", "status": "success"},
                    "deployment_trigger": {"metadata": {"commit_hash": SHA, "branch": "main"}},
                    "url": "https://fixture.pages.dev"}
        return module, projects, expected, api

    def test_public_auth_failure_is_not_retried(self):
        from email.message import Message
        from urllib.error import HTTPError
        module, projects, expected, api = self.public_probe_fixture()
        for status in (400, 401, 403):
            commands = []
            def fetch(url):
                raise HTTPError(url, status, "denied", Message(), None)
            with self.subTest(status=status), patch("cloudflare_pages.time.sleep") as sleep:
                with self.assertRaises(HTTPError) as raised:
                    module.publish(Path("bundle"), SHA, expected, projects, api,
                                   lambda args: commands.append(args), fetch, attempts=2)
                raised.exception.close()
                sleep.assert_not_called()
                self.assertEqual(len(commands), 1)

    def test_public_retry_budget_exhaustion_never_publishes_next_locale(self):
        from urllib.error import URLError
        module, projects, expected, api = self.public_probe_fixture()
        commands = []
        reads = []
        def fetch(url):
            reads.append(url)
            raise URLError("handshake not ready")
        with patch("cloudflare_pages.time.sleep") as sleep:
            with self.assertRaisesRegex(ValueError, "verification failed for ru.*handshake not ready"):
                module.publish(Path("bundle"), SHA, expected, projects, api,
                               lambda args: commands.append(args), fetch, attempts=2)
            sleep.assert_called_once_with(5)
        self.assertEqual(len(commands), 1)
        self.assertEqual(len(reads), 2)

    def test_retries_transient_public_tls_and_404_without_redeploying(self):
        import ssl
        from email.message import Message
        from urllib.error import HTTPError, URLError
        module = cf
        assert module is not None
        for transient in (URLError(ssl.SSLError("handshake not ready")),
                          HTTPError("https://fixture.pages.dev", 404, "not ready", Message(), None)):
            with self.subTest(error=type(transient).__name__):
                projects = {loc: project(name) for loc, name in module.PROJECTS.items()}
                expected = {"files": {loc: {"phenom/index.html": hashlib.sha256(loc.encode()).hexdigest()} for loc in projects}}
                commands = []
                reads = []
                def api(method, path, payload=None):
                    name = next(n for n in module.PROJECTS.values() if n in path)
                    if "/deployments/" not in path:
                        return dict(project(name), canonical_deployment={"id": "deployment-id"})
                    return {"id": "deployment-id", "project_name": name, "project_id": name + "-id",
                            "environment": "production", "latest_stage": {"name": "deploy", "status": "success"},
                            "deployment_trigger": {"metadata": {"commit_hash": SHA, "branch": "main"}},
                            "url": "https://fixture.pages.dev"}
                def fetch(url):
                    reads.append(url)
                    if len(reads) == 1:
                        raise transient
                    return ("ru" if len(commands) == 1 else "en").encode()
                with patch("cloudflare_pages.time.sleep") as sleep:
                    try:
                        result = module.publish(Path("bundle"), SHA, expected, projects, api,
                                                lambda args: commands.append(args), fetch, attempts=2)
                    except URLError as error:
                        self.fail("temporary first-read failure was not retried: " + str(error))
                self.assertEqual(set(result), {"ru", "en"})
                self.assertEqual(len(commands), 2)
                self.assertEqual(len(reads), 3)
                sleep.assert_called_once_with(5)

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
    def test_public_probe_identifies_publisher_without_api_credentials(self):
        import sys
        from unittest.mock import MagicMock
        module = cf
        assert module is not None
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b"public fixture"
        def publish(root, sha, expected, projects, api, run, fetch):
            self.assertEqual(fetch("https://fixture.pages.dev/phenom/"), b"public fixture")
            return {}
        with tempfile.TemporaryDirectory() as tmp:
            argv = ["cloudflare_pages.py", "publish", "--root", tmp, "--source-sha", SHA]
            with (patch.object(sys, "argv", argv),
                  patch("cloudflare_pages.verify_bundle", return_value={}),
                  patch("cloudflare_pages.CloudflareAPI"),
                  patch("cloudflare_pages.preflight", return_value={}),
                  patch("cloudflare_pages.publish", side_effect=publish),
                  patch("cloudflare_pages.urlopen", return_value=response) as opener):
                module.main()
            request = opener.call_args.args[0]
            self.assertEqual(request.get_header("User-agent"),
                             "Ergohaven-Phenom-Publisher/1.0 (+https://github.com/ergohaven/projects)")
            self.assertIsNone(request.get_header("Authorization"))
            self.assertNotIn("context", opener.call_args.kwargs)

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
