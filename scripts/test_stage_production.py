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

    def test_pages_composes_prefixes_and_filters_native_sitemaps(self, base="https://ergohaven.github.io/projects/"):
        from urllib.parse import urlsplit
        url_prefix = urlsplit(base).path
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, destination = root / "source", root / "production"
            for locale, subdir in (("en", ""), ("ru", "ru/")):
                for page in ("phenom", "k04", "macropad"):
                    path = source / subdir / page / "index.html"
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(f'<link rel="alternate" hreflang="x-default" href="{base}phenom/"><meta property="og:image" content="{base}images/share.jpg">')
                (source / subdir / "index.html").write_text("draft menu")
                (source / subdir / "404.html").write_text(f'<html lang="{locale}">404</html>')
                sitemap = source / locale / "sitemap.xml"
                sitemap.parent.mkdir(exist_ok=True)
                sitemap.write_text('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(
                    f'<url><loc>{base}{subdir}{page}/</loc></url>'
                    for page in ("phenom", "k04", "macropad")) + '</urlset>')
            (source / "sitemap.xml").write_text('<sitemapindex/>')
            (source / "css").mkdir()
            (source / "css/site.css").write_text("fixture")
            result = subprocess.run([sys.executable, str(SCRIPT), "--source", str(source),
                "--destination", str(destination), "--page", "phenom", "--language", "en", "--github-pages", "--pages-base-url", base],
                text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(sorted(str(p.relative_to(destination)) for p in destination.rglob("*.html")),
                ["404.html", "index.html", "phenom/index.html", "ru/404.html", "ru/index.html", "ru/phenom/index.html"])
            for prefix in ("", "ru/"):
                self.assertIn(f'url={url_prefix}{prefix}phenom/', (destination / prefix / "index.html").read_text())
                self.assertNotIn("projects.eh.industries", (destination / prefix / "phenom/index.html").read_text())
                self.assertIn(f'content="{base}images/share.jpg"',
                              (destination / prefix / "phenom/index.html").read_text())
            for locale, prefix in (("en", ""), ("ru", "ru/")):
                tree = ET.parse(destination / locale / "sitemap.xml")
                self.assertEqual([n.text for n in tree.findall("s:url/s:loc", NS)],
                    [f"{base}{prefix}phenom/"])
            self.assertEqual((destination / "css/site.css").read_text(), "fixture")

    def test_pages_checker_accepts_scoped_output_and_rejects_counterexamples(self, base="https://ergohaven.github.io/projects/"):
        from urllib.parse import urlsplit
        url_prefix = urlsplit(base).path
        import base64
        import hashlib
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "css").mkdir()
            asset = b"body{}"
            (root / "css/site.css").write_bytes(asset)
            integrity = base64.b64encode(hashlib.sha256(asset).digest()).decode()
            for locale, prefix in (("en", ""), ("ru", "ru/")):
                folder = root / prefix
                (folder / "phenom").mkdir(parents=True)
                canonical = base + prefix + "phenom/"
                (folder / "index.html").write_text(f'<html lang="{locale}"><meta http-equiv="refresh" content="0; url={url_prefix}{prefix}phenom/"><link rel="canonical" href="{canonical}">')
                (folder / "404.html").write_text(f'<html lang="{locale}-{"RU" if locale == "ru" else "US"}">404')
                (folder / "phenom/index.html").write_text(f'<html lang="{locale}"><link rel="canonical" href="{canonical}">' +
                    ''.join(f'<link rel="alternate" hreflang="{lang}" href="{base}{sub}phenom/">' for lang, sub in (("en", ""), ("ru", "ru/"), ("x-default", ""))) +
                    f'<link rel="stylesheet" href="{url_prefix}css/site.css" integrity="sha256-{integrity}"><div data-layout-reference="{hashlib.sha256(asset).hexdigest()}">')
                sitemap = root / locale / "sitemap.xml"
                sitemap.parent.mkdir(exist_ok=True)
                sitemap.write_text(f'<urlset xmlns="{NS["s"]}"><url><loc>{canonical}</loc></url></urlset>')
            (root / "sitemap.xml").write_text(f'<sitemapindex xmlns="{NS["s"]}">' + ''.join(f'<sitemap><loc>{base}{locale}/sitemap.xml</loc></sitemap>' for locale in ("en", "ru")) + '</sitemapindex>')
            command = [sys.executable, str(SCRIPT.with_name("check_github_pages.py")), "--public", str(root), "--pages-base-url", base]
            result = subprocess.run(command, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            page = root / "phenom/index.html"
            original = page.read_text()
            for broken in (original.replace(url_prefix + "css/site.css", "/css/site.css"),
                           original.replace("sha256-", "sha384-"),
                           original.replace('hreflang="ru"', 'hreflang="de"'),
                           original + '<a href="/projects/k04/">Draft</a>',
                           original.replace('rel="canonical"', 'rel="wrong"')):
                page.write_text(broken)
                self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            page.write_text(original)
            (root / "k04").mkdir()
            (root / "k04/index.html").write_text("draft")
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)

    def test_pages_nondefault_base(self):
        self.test_pages_composes_prefixes_and_filters_native_sitemaps("https://preview.example/nested/site/")
        self.test_pages_checker_accepts_scoped_output_and_rejects_counterexamples("https://preview.example/nested/site/")

    def test_pages_preserves_landing_bytes(self):
        from stage_production import stage_github_pages
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            payload = b'<link hreflang="x-default" href="https://projects.eh.industries/phenom/">\r\n'
            for locale, prefix in (("en", ""), ("ru", "ru/")):
                landing = source / prefix / "phenom/index.html"
                landing.parent.mkdir(parents=True)
                landing.write_bytes(payload)
                sitemap = source / locale / "sitemap.xml"
                sitemap.parent.mkdir(exist_ok=True)
                sitemap.write_text(f'<urlset xmlns="{NS["s"]}"><url><loc>https://ergohaven.github.io/projects/{prefix}phenom/</loc></url></urlset>')
            stage_github_pages(source, root / "dest", "phenom", "en", base_url="https://ergohaven.github.io/projects/")
            for prefix in ("", "ru/"):
                self.assertEqual((root / "dest" / prefix / "phenom/index.html").read_bytes(), payload)

    def test_pages_workflow_uploads_only_validated_scoped_artifact(self):
        workflow = SCRIPT.parents[1] / ".github/workflows/pages.yml"
        text = workflow.read_text()
        self.assertIn("stage_production.py --github-pages", text)
        self.assertIn("check_github_pages.py --public public-pages", text)
        self.assertLess(text.index("check_github_pages.py"), text.index("actions/upload-pages-artifact@"))
        self.assertIn("python3 scripts/test_stage_production.py", text)
        self.assertIn("--destination public-pages-build", text)

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
