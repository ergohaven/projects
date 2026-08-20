#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.h1_count = 0
        self.images = 0
        self.empty_urls: list[tuple[str, str]] = []
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "h1":
            self.h1_count += 1
        if tag == "img":
            self.images += 1
        if values.get("id"):
            self.ids.add(values["id"] or "")
        for key in ("href", "src"):
            if key in values and not values[key]:
                self.empty_urls.append((tag, key))


def check_page(path: Path, language: str, domain: str) -> list[str]:
    source = path.read_text(encoding="utf-8")
    parser = PageParser()
    parser.feed(source)
    errors: list[str] = []
    if parser.h1_count != 1:
        errors.append(f"{path}: expected one h1, found {parser.h1_count}")
    if parser.images:
        errors.append(f"{path}: product imagery must remain absent, found {parser.images} img elements")
    if parser.empty_urls:
        errors.append(f"{path}: empty href/src attributes: {parser.empty_urls}")
    if f"<html lang={language}" not in source:
        errors.append(f"{path}: wrong or missing html language {language}")
    if f"rel=canonical href={domain}" not in source:
        errors.append(f"{path}: canonical URL is not on {domain}")
    if "id=main-content" not in source:
        errors.append(f"{path}: main content target is missing")
    if re.search(r"style=|onclick=", source):
        errors.append(f"{path}: inline presentation or behavior leaked into HTML")
    return errors


def main() -> int:
    project = Path(__file__).resolve().parents[1]
    pages = {
        "en": (project / "public/en", "en-US", "https://projects.eh.industries/"),
        "ru": (project / "public/ru", "ru-RU", "https://projects.eh.works/"),
    }
    errors: list[str] = []
    for root_name, (root, language, domain) in pages.items():
        expected = ["index.html", "k04/index.html", "phenom/index.html", "macropad/index.html", "404.html"]
        for relative in expected:
            path = root / relative
            if not path.is_file():
                errors.append(f"{root_name}: missing {relative}")
                continue
            errors.extend(check_page(path, language, domain))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("HTML contract OK: 10 pages, paired locales, zero product images")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
