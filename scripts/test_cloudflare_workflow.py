#!/usr/bin/env python3
"""Offline checks of real workflow routing, not hosted deployment evidence.

Requires PyYAML; CI installs python3-yaml and uses /usr/bin/python3.
"""
import ast
import fnmatch
import json
import re
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/cloudflare-pages.yml"


def expression(value, event, ref):
    """Evaluate the workflow's limited boolean/string expression subset."""
    text = value.strip()
    if text.startswith("${{") and text.endswith("}}"):
        text = text[3:-2].strip()
    text = text.replace("github.event_name", "event").replace("github.ref", "ref")
    text = text.replace("&&", " and ").replace("||", " or ")
    tree = ast.parse(text, mode="eval")
    allowed = (ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.Compare, ast.Eq,
               ast.NotEq, ast.Name, ast.Load, ast.Constant, ast.UnaryOp, ast.Not)
    if any(not isinstance(node, allowed) for node in ast.walk(tree)):
        raise ValueError("workflow expression exceeds the tested subset")
    if any(node.id not in {"event", "ref"} for node in ast.walk(tree) if isinstance(node, ast.Name)):
        raise ValueError("unexpected workflow expression context")
    return eval(compile(tree, str(WORKFLOW), "eval"), {"__builtins__": {}}, {"event": event, "ref": ref})


def triggered(workflow, event, ref, path):
    events = workflow["on"]
    if event not in events:
        return False
    route = events[event] or {}
    if "branches" in route and ref.removeprefix("refs/heads/") not in route["branches"]:
        return False
    return not route.get("paths") or any(fnmatch.fnmatchcase(path, pattern) for pattern in route["paths"])


class WorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # BaseLoader preserves the YAML `on` key and Actions scalar expressions.
        cls.workflow = yaml.load(WORKFLOW.read_text(), Loader=yaml.BaseLoader)

    def test_main_merges_publish_all_site_input_changes(self):
        for path in ("content/ru/phenom/index.md", "content/en/phenom/index.md",
                     "assets/images/products/phenom/01-hero.jpg", "assets/css/site.css",
                     "layouts/partials/phenom.html", "data/key_layouts/phenom.json",
                     "config/russian.yaml", "hugo.yaml", ".hugo-version",
                     "scripts/stage_production.py", "README.md"):
            with self.subTest(path=path):
                self.assertTrue(triggered(self.workflow, "push", "refs/heads/main", path))
                self.assertTrue(expression(self.workflow["jobs"]["publish"]["if"], "push", "refs/heads/main"))

    def test_all_production_writes_share_one_non_cancelling_group(self):
        config = self.workflow["concurrency"]
        template = config["group"]
        prefix, remainder = template.split("${{", 1)
        value, suffix = remainder.split("}}", 1)

        def group(event, ref):
            return prefix + str(expression(value, event, ref)) + suffix

        self.assertEqual(group("push", "refs/heads/main"),
                         group("workflow_dispatch", "refs/heads/main"))
        self.assertNotEqual(group("pull_request", "refs/pull/1/merge"),
                            group("push", "refs/heads/main"))
        self.assertNotEqual(group("pull_request", "refs/pull/1/merge"),
                            group("pull_request", "refs/pull/2/merge"))
        self.assertEqual(config["cancel-in-progress"], "false")

    def test_only_main_push_and_main_manual_dispatch_can_publish(self):
        gate = self.workflow["jobs"]["publish"]["if"]
        for event, ref, expected in (
            ("push", "refs/heads/main", True),
            ("push", "refs/heads/feature", False),
            ("workflow_dispatch", "refs/heads/main", True),
            ("workflow_dispatch", "refs/heads/feature", False),
            ("pull_request", "refs/pull/1/merge", False),
            ("pull_request", "refs/heads/main", False),
            ("pull_request_target", "refs/heads/main", False),
        ):
            with self.subTest(event=event, ref=ref):
                self.assertEqual(bool(expression(gate, event, ref)), expected)
        self.assertEqual(self.workflow["jobs"]["publish"]["needs"], "build")
        self.assertNotIn("pull_request_target", self.workflow["on"])

    def test_pr_checks_are_credential_free_and_publish_uses_trusted_helpers(self):
        build = self.workflow["jobs"]["build"]
        self.assertNotIn("secrets.", json.dumps(build))
        self.assertEqual(self.workflow["permissions"], {"contents": "read"})
        publish = self.workflow["jobs"]["publish"]
        checkout = publish["steps"][0]
        self.assertEqual(checkout["with"]["ref"], "${{ github.workflow_sha }}")
        self.assertEqual(checkout["with"]["persist-credentials"], "false")
        install = next(s for s in publish["steps"] if "npm install" in s.get("run", ""))
        self.assertNotIn("secrets.", json.dumps(install))
        download = next(s for s in publish["steps"] if "download-artifact@" in s.get("uses", ""))
        self.assertEqual(download["with"]["name"], "phenom-production")
        self.assertNotIn("run-id", download["with"])
        self.assertIn("trusted/scripts/cloudflare_pages.py publish", publish["steps"][-1]["run"])

    def test_manual_rollback_keeps_explicit_ancestor_sha_and_locale_scope(self):
        manual = self.workflow["on"]["workflow_dispatch"]["inputs"]["source_ref"]
        self.assertEqual(manual["required"], "true")
        build = self.workflow["jobs"]["build"]
        source = next(s for s in build["steps"] if s.get("id") == "source")
        self.assertIn('test "$sha" = "$SOURCE_REF"', source["run"])
        self.assertIn('merge-base --is-ancestor "$sha" refs/remotes/origin/main', source["run"])
        staging = next(s for s in build["steps"] if "stage_production.py --source" in s.get("run", ""))
        self.assertIn("for locale in ru en", staging["run"])
        self.assertIn("--page phenom", staging["run"])
        self.assertIn("check_phenom_isolation.py", staging["run"])


if __name__ == "__main__":
    unittest.main()
