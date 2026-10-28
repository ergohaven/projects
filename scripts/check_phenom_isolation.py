#!/usr/bin/env python3
"""Check the isolated Phenom build; optional baseline and canonical fidelity.

Build both production locales with scripts/build.sh first.
Example: python3 scripts/check_phenom_isolation.py --baseline ../baseline/public
"""
import argparse
import hashlib
import re
import base64
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]


class Document(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.ids = []
        self.headings = {}
        self.heading = None
        self.feed(text)

    def handle_data(self, data):
        if self.heading is not None:
            self.headings[self.heading] += data + ' '

    def handle_endtag(self, tag):
        if tag in ('h1', 'h2'):
            self.heading = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if tag in ('h1', 'h2'):
            self.heading = attrs.get('id')
            if self.heading is not None:
                self.headings[self.heading] = ''
        if 'id' in attrs:
            self.ids.append(attrs['id'])


def local_resources(document):
    for tag, attrs in document.tags:
        if tag == 'link' and attrs.get('rel') not in ('stylesheet', 'icon', 'apple-touch-icon', 'preload'):
            continue
        for key in ('src', 'poster', 'data-src', 'data-poster', 'data-layout-src',
                    'data-delivery-src', 'data-delivery-fallback') + (('href', 'data-href') if tag == 'link' else ()):
            if attrs.get(key):
                yield attrs[key]
        for key in ('srcset', 'data-delivery-srcset'):
            for candidate in attrs.get(key, '').split(','):
                if candidate.strip():
                    yield candidate.split()[0]


def normalize_asset_names(text):
    # Only the isolated entry point names/hashes/integrities may differ.
    text = re.sub(r'(?:phenom-)?site\.min\.[a-f0-9]+\.(css|js)', r'site.\1', text)
    text = re.sub(r'phenom-mobile\.min\.[a-f0-9]+\.css', 'phenom-mobile.css', text)
    return re.sub(r' integrity=[^ >]+', '', text)


def check(public, baseline=None, canonical=None):
    pages = 0
    resources = 0
    for lang in ('en', 'ru'):
        locale = public / lang
        text = (locale / 'phenom/index.html').read_text()
        doc = Document(text)
        heading_ids = ['product-title', 'series-title', 'modularity-title', 'key-layout-title',
                       'phenom-finger-geometry-title', 'phenom-curves-title',
                       'phenom-additive-manufacturing-title', 'phenom-keycaps-switches-title',
                       'phenom-entropy-title', 'phenom-wired-title', 'phenom-specs-title', 'phenom-cta-title']
        headings = {
            'en': ['Engineered to perfection', 'Meet the Phenom series', 'Modules for your tasks',
                   'Choose your layout', 'Every key fits for your finger', 'A true ergonomic beauty',
                   'Made possible only with additive technology', 'Feel the difference',
                   'Best-in-class software', 'Wired, not wireless', 'Phenom at a glance', 'Crafted in every detail'],
            'ru': ['СОВЕРШЕНСТВО В ДЕТАЛЯХ', 'Знакомьтесь с серией Phenom', 'Модули под ваши задачи',
                   'Подберите подходящий формат', 'Каждая клавиша на своём месте', 'Настоящая красота эргономики',
                   'Только при помощи аддитивных технологий', 'Почувствуйте разницу',
                   'Лучшее программное обеспечение в классе', 'Стабильность и скорость',
                   'Главное о Phenom', 'Продумана каждая деталь'],
        }
        for heading_id, expected in zip(heading_ids, headings[lang]):
            assert ' '.join(doc.headings[heading_id].split()) == expected, (lang, heading_id, doc.headings[heading_id])
        assert len(doc.ids) == len(set(doc.ids)), (lang, 'duplicate ids')
        assert any(tag == 'body' and 'product-page--phenom' in attrs.get('class', '')
                   for tag, attrs in doc.tags), (lang, 'missing isolated body')
        assert not any(tag == 'footer' for tag, _ in doc.tags), (lang, 'Phenom footer remains')
        assert not any('data-theme-video-play' in attrs for _, attrs in doc.tags)
        assert not any('language-link' in attrs.get('class', '') for _, attrs in doc.tags)
        assert sum('data-key-layout-model-control' in a for _, a in doc.tags) == 3
        assert sum('data-key-layout-layer-target' in a for _, a in doc.tags) == 14
        assert sum('data-key-layout-layer-panel' in a for _, a in doc.tags) == 14
        assert sum('data-theme-video' in a for _, a in doc.tags) == 2
        assert sum('specs-chapter__group' in a.get('class', '').split() for _, a in doc.tags) == 6
        assert [a['data-product-chapter'] for _, a in doc.tags if 'data-product-chapter' in a] == [
            'finger-geometry', 'curves', 'additive-manufacturing', 'keycaps-switches',
            'entropy', 'wired', 'specs', 'cta']
        assert '3840w' in text and '6000w' in text
        assert not any('data-media-placeholder' in a for _, a in doc.tags)
        assert sum('visual-chapter__action' in a.get('class', '').split() for _, a in doc.tags) == 2
        # Parse the JS-enabled DOM separately; HTMLParser otherwise counts
        # noscript fallback children as if they were simultaneously active.
        active = Document(re.sub(r'<noscript\b[^>]*>.*?</noscript>', '', text, flags=re.S))
        fallback = Document(''.join(re.findall(r'<noscript\b[^>]*>(.*?)</noscript>', text, flags=re.S)))
        pending_layouts = [a for t, a in active.tags if t == 'img' and 'data-layout-src' in a]
        fallback_layouts = [a for t, a in fallback.tags if t == 'img' and '/phenom/layouts/' in a.get('src', '')]
        assert len(pending_layouts) == len(fallback_layouts) == 56, (lang, 'layout delivery/fallback count')
        assert Counter(a['data-layout-src'] for a in pending_layouts) == Counter(a['src'] for a in fallback_layouts), (lang, 'layout fallbacks differ')
        assert all(a.get('alt') in (None, '') and 'alt' in a for a in fallback_layouts), (lang, 'decorative layout fallback')
        assert sum(t == 'picture' for t, _ in active.tags) == 14
        assert sum(t == 'picture' for t, _ in fallback.tags) == 15  # Includes the Entropy poster.
        assert Counter(a['data-delivery-src'] for t, a in active.tags if t == 'img' and 'data-delivery-src' in a) == Counter(a['src'] for t, a in fallback.tags if t == 'img' and '/phenom/layouts/' not in a.get('src', '') and 'chapter-media__video' not in a.get('class', '')), (lang, 'photo fallbacks differ')
        assert sum('data-phenom-native-style' in a for _, a in active.tags) == 6
        assert sum('data-phenom-canvas-style' in a for _, a in active.tags) == 6
        assert sum('data-phenom-runtime' in a for _, a in active.tags) == 8
        assert Counter(a['data-delivery-srcset'] for _, a in active.tags if 'data-delivery-srcset' in a) == Counter(a['srcset'] for _, a in fallback.tags if 'srcset' in a and a.get('type') in ('image/webp', 'image/jpeg')), (lang, 'photo variant fallbacks differ')
        assert all(a.get('alt') for t, a in fallback.tags if t == 'img' and '/phenom/layouts/' not in a.get('src', '')), (lang, 'fallback image alt')
        # Callouts are created by the delayed runtime, not static HTML actions.
        cta_urls = [a['data-src'] for t, a in active.tags if t == 'script' and '/js/phenom-cta.min.' in a.get('data-src', '')]
        assert len(cta_urls) == 1, (lang, 'CTA runtime missing/duplicated')
        cta_runtime = (locale / cta_urls[0].lstrip('/')).read_text()
        assert re.findall(r'\{id:"([^"]+)",row:', cta_runtime) == ['keys', 'usb', 'controls', 'formats', 'split', 'platform', 'fit'], (lang, 'seven CTA callouts changed')
        entries = list(local_resources(doc))
        assert any('/css/phenom-site.min.' in value for value in entries)
        assert any('/js/phenom-site.min.' in value for value in entries)
        assert not any(re.search(r'/(?:css|js)/site\.min\.', value) for value in entries)
        assert not any('/products/k04/' in value or '/products/macropad/' in value for value in entries)
        # Follow CSS url()/@import dependencies as well as both DOM branches.
        visited_css = set()
        for value in entries:
            parsed = urlsplit(value)
            if parsed.scheme or parsed.netloc or not parsed.path.startswith('/'):
                continue
            asset = locale / unquote(parsed.path).lstrip('/')
            assert asset.is_file(), (lang, 'missing resource', value)
            resources += 1
            if asset.suffix == '.css' and asset not in visited_css:
                visited_css.add(asset)
                css = asset.read_text()
                dependencies = re.findall(r'url\(\s*[\'\"]?([^\'\"\)\s]+)', css)
                dependencies += re.findall(r'@import\s+[\'\"]([^\'\"]+)', css)
                entries.extend(urljoin(value, dependency) for dependency in dependencies)
        for tag, attrs in doc.tags:
            if (tag == 'script' and (attrs.get('src') or attrs.get('data-src'))) or (tag == 'link' and attrs.get('rel') == 'stylesheet'):
                assert attrs.get('integrity'), (lang, 'missing resource integrity', attrs)
            if attrs.get('integrity'):
                value = attrs.get('src') or attrs.get('href') or attrs.get('data-src') or attrs.get('data-href')
                assert value, (lang, 'integrity without resource URL')
                digest = base64.b64encode(hashlib.sha256((locale / value.lstrip('/')).read_bytes()).digest()).decode()
                assert attrs['integrity'] == 'sha256-' + digest, (lang, value, 'integrity')
            for key in ('aria-controls', 'aria-labelledby'):
                for target in attrs.get(key, '').split():
                    assert target in doc.ids, (lang, key, target)
        if canonical:
            original = (canonical / lang / 'phenom/index.html').read_text()
            assert normalize_asset_names(text) == normalize_asset_names(original), (lang, 'canonical HTML differs')
        if baseline:
            expected = {p.relative_to(baseline / lang) for p in (baseline / lang).rglob('*.html')
                        if p.relative_to(baseline / lang) != Path('phenom/index.html')}
            actual = {p.relative_to(locale) for p in locale.rglob('*.html')
                      if p.relative_to(locale) != Path('phenom/index.html')}
            assert actual == expected, (lang, 'non-Phenom page set changed', actual ^ expected)
            for rel in sorted(expected):
                after = locale / rel
                before = baseline / lang / rel
                assert after.read_bytes() == before.read_bytes(), (lang, rel, 'non-Phenom HTML changed')
                for value in local_resources(Document(after.read_text())):
                    parsed = urlsplit(value)
                    if not parsed.scheme and not parsed.netloc and parsed.path.startswith('/'):
                        asset = unquote(parsed.path).lstrip('/')
                        assert (locale / asset).read_bytes() == (baseline / lang / asset).read_bytes(), (lang, rel, asset)
                pages += 1
    print(f'PASS: EN/RU Phenom contract; {resources} local resource references and integrity/accessibility links')
    if canonical:
        print('PASS: EN/RU Phenom HTML matches current canonical landing (isolated asset names/hashes only)')
    if baseline:
        print(f'PASS: {pages} non-Phenom HTML pages and their CSS/JS/media are byte-identical to baseline')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public', type=Path, default=ROOT / 'public')
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--canonical', type=Path)
    args = parser.parse_args()
    check(args.public.resolve(), args.baseline.resolve() if args.baseline else None,
          args.canonical.resolve() if args.canonical else None)
