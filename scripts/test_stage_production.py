#!/usr/bin/env python3
"""Exercise production scoping without changing the shared Hugo build."""
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

SCRIPT = Path(__file__).with_name("stage_production.py")
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}


class ProductionStage(unittest.TestCase):
    def test_publishes_phenom_without_other_product_drafts(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            destination = root / "production"
            source.mkdir()
            for page in ("phenom", "k04", "macropad"):
                (source / page).mkdir()
                (source / page / "index.html").write_text(f"<h1>{page}</h1>")
            (source / "css").mkdir()
            (source / "css/site.css").write_text("body{color:#111}")
            (source / "images").mkdir()
            (source / "images/photo.webp").write_bytes(b"test image fixture")
            (source / "index.html").write_text("<a href='/k04/'>Draft menu</a>")
            (source / "404.html").write_text("<a href='/'>Home</a>")
            (source / "robots.txt").write_text("Sitemap: https://projects.eh.works/sitemap.xml\n")
            locations = ["", "phenom/", "k04/", "macropad/"]
            (source / "sitemap.xml").write_text(
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                + "".join(f"<url><loc>https://projects.eh.works/{page}</loc></url>" for page in locations)
                + "</urlset>"
            )
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--source", str(source),
                 "--destination", str(destination), "--page", "phenom", "--language", "ru"],
                text=True, capture_output=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((destination / "phenom/index.html").read_bytes(),
                             (source / "phenom/index.html").read_bytes())
            self.assertFalse((destination / "k04").exists())
            self.assertFalse((destination / "macropad").exists())
            self.assertEqual((destination / "images/photo.webp").read_bytes(), b"test image fixture")
            self.assertEqual((destination / "css/site.css").read_bytes(), (source / "css/site.css").read_bytes())
            self.assertEqual((destination / "404.html").read_bytes(), (source / "404.html").read_bytes())
            self.assertEqual((destination / "robots.txt").read_bytes(), (source / "robots.txt").read_bytes())
            self.assertIn('url=/phenom/', (destination / "index.html").read_text())
            self.assertIn('lang="ru"', (destination / "index.html").read_text())
            self.assertIn('href="https://projects.eh.works/phenom/"', (destination / "index.html").read_text())
            sitemap = ET.parse(destination / "sitemap.xml")
            self.assertEqual([node.text for node in sitemap.findall("s:url/s:loc", NS)],
                             ["https://projects.eh.works/phenom/"])
            self.assertEqual((source / "index.html").read_text(), "<a href='/k04/'>Draft menu</a>")

    def test_rejects_unsafe_page_without_creating_destination(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            destination = root / "production"
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--source", str(root / "source"),
                 "--destination", str(destination), "--page", "../draft", "--language", "en"],
                text=True, capture_output=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("single lowercase URL slug", result.stderr)
            self.assertFalse(destination.exists())

    def test_does_not_overwrite_an_existing_destination(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            destination = root / "production"
            destination.mkdir()
            (destination / "index.html").write_text("previous production")
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--source", str(root / "source"),
                 "--destination", str(destination), "--page", "phenom", "--language", "en"],
                text=True, capture_output=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("must not already exist", result.stderr)
            self.assertEqual((destination / "index.html").read_text(), "previous production")

    def test_rejects_symlinks_before_staging(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            destination = root / "production"
            (source / "phenom").mkdir(parents=True)
            (source / "phenom/index.html").write_text("landing")
            (source / "escape").symlink_to(root)
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--source", str(source),
                 "--destination", str(destination), "--page", "phenom", "--language", "en"],
                text=True, capture_output=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("must not contain symbolic links", result.stderr)
            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
