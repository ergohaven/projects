#!/usr/bin/env python3
"""Stage one approved landing and shared assets, leaving draft pages unpublished."""
import argparse
import html
import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit

SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"


def stage(source: Path, destination: Path, page: str, language: str) -> None:
    source = source.resolve()
    destination = destination.resolve()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", page):
        raise ValueError("page must be a single lowercase URL slug")
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError("source and destination must not overlap")
    if destination.exists():
        raise ValueError("destination must not already exist")
    if not (source / page / "index.html").is_file():
        raise ValueError("landing is missing from the Hugo output")
    if any(path.is_symlink() for path in source.rglob("*")):
        raise ValueError("Hugo output must not contain symbolic links")

    sitemap = ET.parse(source / "sitemap.xml")
    root = sitemap.getroot()
    canonical = None
    for entry in list(root):
        location = entry.find(f"{{{SITEMAP_NS}}}loc")
        url = urlsplit(location.text or "") if location is not None else None
        if location is not None and url and url.scheme == "https" and url.hostname and url.path == f"/{page}/":
            canonical = location.text
        else:
            root.remove(entry)
    if canonical is None or len(root) != 1:
        raise ValueError("sitemap must contain exactly one HTTPS URL for the landing")

    destination.mkdir(parents=True)
    for path in source.iterdir():
        if path.is_dir():
            # Hugo page directories have an index.html; all other directories are assets.
            if path.name == page or not (path / "index.html").is_file():
                shutil.copytree(path, destination / path.name)
        elif path.name != "sitemap.xml" and (path.suffix != ".html" or path.name == "404.html"):
            shutil.copy2(path, destination / path.name)

    ET.register_namespace("", SITEMAP_NS)
    sitemap.write(destination / "sitemap.xml", encoding="utf-8", xml_declaration=True)
    (destination / "index.html").write_text(
        f'<!doctype html>\n<html lang="{html.escape(language, quote=True)}">\n'
        '<meta charset="utf-8">\n'
        f'<title>{html.escape(page)}</title>\n'
        f'<link rel="canonical" href="{html.escape(canonical, quote=True)}">\n'
        f'<meta http-equiv="refresh" content="0; url=/{page}/">\n'
        f'<a href="/{page}/">{html.escape(page)}</a>\n</html>\n',
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--destination", required=True, type=Path)
    parser.add_argument("--page", required=True)
    parser.add_argument("--language", required=True, choices=("en", "ru"))
    args = parser.parse_args()
    try:
        stage(args.source, args.destination, args.page, args.language)
    except (OSError, ValueError, ET.ParseError) as error:
        parser.exit(1, f"Production staging failed: {error}\n")


if __name__ == "__main__":
    main()
