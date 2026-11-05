#!/usr/bin/env python3
"""Deployment-only checks; the shared product contract remains in check.sh."""
import argparse
import base64
import hashlib
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit

from stage_production import pages_base
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


def check(root, base_url):
    base_url, url_prefix = pages_base(base_url)
    origin = urlsplit(base_url).netloc
    root = root.resolve()
    expected = {prefix + name for prefix in ("", "ru/")
                for name in ("index.html", "404.html", "phenom/index.html")}
    assert {str(p.relative_to(root)) for p in root.rglob("*.html")} == expected, "HTML inventory is not Phenom-only"
    assert not any(p.is_symlink() for p in root.rglob("*")), "symlink in artifact"
    references = 0

    def local(url, document):
        parsed = urlsplit(urljoin(document, url))
        if parsed.netloc != origin:
            return None
        assert parsed.scheme == "https" and parsed.path.startswith(url_prefix), f"outside project prefix: {url}"
        relative = unquote(parsed.path[len(url_prefix):])
        target = (root / relative).resolve()
        assert target == root or root in target.parents, f"unsafe URL: {url}"
        if parsed.path.endswith("/"):
            target = target / "index.html"
        assert target.is_file(), f"missing local resource: {url}"
        return target

    for relative in sorted(expected):
        text = (root / relative).read_text(encoding="utf-8")
        page = Page(text)
        language = "ru" if relative.startswith("ru/") else "en"
        prefix = "ru/" if language == "ru" else ""
        document = base_url + relative
        assert any(tag == "html" and attrs.get("lang") in (language, "ru-RU" if language == "ru" else "en-US") for tag, attrs in page.tags), f"wrong language: {relative}"
        canonicals = [a.get("href") for t, a in page.tags if t == "link" and a.get("rel") == "canonical"]
        if relative.endswith("phenom/index.html") or relative == prefix + "index.html":
            assert canonicals == [base_url + prefix + "phenom/"], f"wrong canonical: {relative}"
        if relative.endswith("phenom/index.html"):
            alternates = {a.get("hreflang"): a.get("href") for t, a in page.tags if t == "link" and a.get("rel") == "alternate"}
            assert alternates == {"en": base_url + "phenom/", "ru": base_url + "ru/phenom/", "x-default": base_url + "phenom/"}, f"wrong hreflang: {relative}"
        if relative == prefix + "index.html":
            assert any(t == "meta" and a.get("http-equiv", "").lower() == "refresh" and
                       a.get("content", "").endswith("url=" + url_prefix + prefix + "phenom/")
                       for t, a in page.tags), f"wrong root redirect: {relative}"
        for tag, attrs in page.tags:
            urls = [attrs[key] for key in ("href", "src", "poster", "data-href", "data-src", "data-poster", "data-layout-src") if attrs.get(key)]
            for key in ("srcset", "data-srcset"):
                urls.extend(part.strip().split()[0] for part in attrs.get(key, "").split(",") if part.strip())
            if tag == "meta" and attrs.get("property") in ("og:url", "og:image"):
                urls.append(attrs.get("content", ""))
            for url in urls:
                assert not re.search(r"projects\.eh\.(works|industries)", url), f"old publication domain: {url}"
                assert not re.search(r"/(k04|macropad)/", url), f"draft navigation: {url}"
                if local(url, document):
                    references += 1
            if attrs.get("integrity"):
                resource = next((attrs[k] for k in ("src", "href", "data-src", "data-href") if attrs.get(k)), None)
                assert resource, "SRI without resource"
                path = local(resource, document)
                assert path, "external SRI unsupported"
                digest = base64.b64encode(hashlib.sha256(path.read_bytes()).digest()).decode()
                assert attrs["integrity"] == "sha256-" + digest, f"SRI mismatch: {resource}"
        for url in re.findall(r'url\([\"\']?([^\)\"\']+)', text):
            local(url, document)
    for path in root.rglob("*.css"):
        for url in re.findall(r'url\([\"\']?([^\)\"\']+)', path.read_text()):
            if not url.startswith("data:"):
                local(url, base_url + str(path.relative_to(root)))
    for language, prefix in (("en", ""), ("ru", "ru/")):
        sitemap = ET.parse(root / language / "sitemap.xml")
        assert [n.text for n in sitemap.findall("s:url/s:loc", NS)] == [base_url + prefix + "phenom/"], "unfiltered locale sitemap"
    index = ET.parse(root / "sitemap.xml")
    assert [n.text for n in index.findall("s:sitemap/s:loc", NS)] == [base_url + lang + "/sitemap.xml" for lang in ("en", "ru")], "wrong sitemap index"
    return references


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public", required=True, type=Path)
    parser.add_argument("--pages-base-url", required=True)
    args = parser.parse_args()
    try:
        references = check(args.public, args.pages_base_url)
    except (AssertionError, OSError, ValueError, ET.ParseError) as error:
        parser.exit(1, f"Pages validation failed: {error}\n")
    print(f"Pages OK: 6 HTML files, EN/RU canonicals/hreflang/redirects, filtered sitemaps, {references} local references and SRI")


if __name__ == "__main__":
    main()
