#!/usr/bin/env python3
"""Trusted Cloudflare Direct Upload publisher. No credentials needed for packaging/tests."""
import re
import json
import hashlib
from pathlib import Path
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import argparse
import os
import subprocess


class CloudflareAPI:
    def __init__(self, account, token):
        if not re.fullmatch(r"[0-9a-fA-F]{32}", account) or not token:
            raise ValueError("configure CLOUDFLARE_ACCOUNT_ID (32 hex) and CLOUDFLARE_API_TOKEN")
        self.base = "https://api.cloudflare.com/client/v4/accounts/" + account
        self.token = token

    def __call__(self, method, path, payload=None):
        request = Request(self.base + path, method=method,
                          data=json.dumps(payload).encode() if payload is not None else None,
                          headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=60) as response:
                data = json.loads(response.read())
        except HTTPError as error:
            if method == "GET" and error.code == 404:
                return None
            raise RuntimeError("Cloudflare API HTTP " + str(error.code)) from None
        if data.get("success") is not True or not isinstance(data.get("result"), dict):
            raise RuntimeError("Cloudflare API returned an unsuccessful or invalid envelope")
        return data["result"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("validate", "manifest", "publish"))
    parser.add_argument("--root", type=Path, default=Path("production"))
    parser.add_argument("--source-sha", required=True, type=source_sha)
    parser.add_argument("--wrangler", default="wrangler")
    args = parser.parse_args()
    if args.command == "validate":
        return
    if args.command == "manifest":
        (args.root / "manifest.json").write_text(json.dumps(manifest(args.root, args.source_sha), indent=2) + "\n")
        return
    expected = verify_bundle(args.root, args.source_sha)
    api = CloudflareAPI(os.environ.get("CLOUDFLARE_ACCOUNT_ID", ""), os.environ.get("CLOUDFLARE_API_TOKEN", ""))
    projects = preflight(api)
    def fetch(url):
        with urlopen(Request(url, headers={"Cache-Control": "no-cache"}), timeout=60) as response:
            return response.read()
    result = publish(args.root, args.source_sha, expected, projects, api,
                     lambda command: subprocess.run([args.wrangler] + command, check=True, cwd=args.root.parent), fetch)
    (args.root / "publication.json").write_text(json.dumps(result, indent=2) + "\n")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as output:
            output.write("### Verified Cloudflare publication\n\n```json\n" + json.dumps(result, indent=2) + "\n```\n")


def publish(root, sha, expected, projects, api, run, fetch, attempts=30):
    results = {}
    for locale, project in projects.items():
        name = PROJECTS[locale]
        branch = project["production_branch"]
        run(["pages", "deploy", str((root / locale).resolve()), "--project-name=" + name,
             "--branch=" + branch, "--commit-hash=" + source_sha(sha), "--commit-dirty=false"])
        for attempt in range(attempts):
            current = api("GET", "/pages/projects/" + name)
            deployment_id = (current.get("canonical_deployment") or {}).get("id")
            data = api("GET", "/pages/projects/" + name + "/deployments/" + deployment_id) if deployment_id else {}
            metadata = (data.get("deployment_trigger") or {}).get("metadata", {})
            if (data.get("id") == deployment_id and data.get("project_name") == name
                    and data.get("project_id") == project["id"] and data.get("environment") == "production"
                    and metadata.get("commit_hash") == sha and metadata.get("branch") == branch
                    and (data.get("latest_stage") or {}).get("name") == "deploy"
                    and (data.get("latest_stage") or {}).get("status") == "success"):
                url = data.get("url", "")
                parsed = urlsplit(url)
                if (parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".pages.dev")
                        or parsed.username or parsed.password or parsed.port or parsed.path not in ("", "/")
                        or parsed.query or parsed.fragment):
                    raise ValueError("unexpected deployment URL")
                if hashlib.sha256(fetch(url.rstrip("/") + "/phenom/")).hexdigest() == expected["files"][locale]["phenom/index.html"]:
                    results[locale] = {"deployment_id": deployment_id, "url": url, "source_sha": sha}
                    break
            if attempt + 1 < attempts:
                time.sleep(5)
        else:
            raise ValueError("deployment readback/public HTML verification failed for " + locale)
    return results


def manifest(root, sha):
    files = {}
    for locale in PROJECTS:
        directory = root / locale
        if not (directory / "phenom/index.html").is_file():
            raise ValueError("missing Phenom output")
        files[locale] = {}
        for path in sorted(directory.rglob("*")):
            if path.is_symlink():
                raise ValueError("symlinks are forbidden")
            if path.is_file():
                files[locale][path.relative_to(directory).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"source_sha": source_sha(sha), "files": files}


def verify_bundle(root, sha):
    expected = json.loads((root / "manifest.json").read_text())
    if expected != manifest(root, sha):
        raise ValueError("artifact provenance or content mismatch")
    return expected

PROJECTS = {"ru": "ergohaven-projects-ru", "en": "ergohaven-projects-en"}


def validate_project(data, name):
    if (not isinstance(data, dict) or data.get("name") != name or not data.get("id")
            or data.get("source") is not None or data.get("uses_functions")
            or not isinstance(data.get("production_branch"), str)
            or not data["production_branch"].strip()
            or (data.get("build_config") or {}).get("build_command")):
        raise ValueError("project must be the expected static Direct Upload project")
    return data


def preflight(api):
    projects = {}
    for locale, name in PROJECTS.items():
        data = api("GET", "/pages/projects/" + name)
        projects[locale] = validate_project(data, name) if data is not None else None
    for locale, name in PROJECTS.items():
        if projects[locale] is None:
            created = api("POST", "/pages/projects", {"name": name, "production_branch": "main"})
            readback = validate_project(api("GET", "/pages/projects/" + name), name)
            if readback["id"] != created["id"] or readback["production_branch"] != "main":
                raise ValueError("created project readback mismatch")
            projects[locale] = readback
    return projects


def source_sha(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ValueError("source_ref must be a full lowercase 40-character commit SHA")
    return value


if __name__ == "__main__":
    main()
