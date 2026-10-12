#!/usr/bin/env python3
"""Real Chromium regressions for PR #1 (run after scripts/build.sh).

Install playwright in a venv, then `playwright install chromium`.
Run: python scripts/check_phenom_browser.py --case all --report /path/report.json
No production server or external credentials are needed.
"""
import argparse
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def settle(page):
    page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    page.wait_for_timeout(250)


def focus_test(page):
    page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    settle(page)
    link = page.locator('[data-phenom-back-to-top]')
    link.focus()
    page.keyboard.press('Enter')
    page.wait_for_function('scrollY === 0')
    settle(page)
    active = page.evaluate("({tag:document.activeElement.tagName,id:document.activeElement.id,hidden:document.activeElement.getAttribute('aria-hidden')})")
    assert active['hidden'] != 'true', f'Focus remains aria-hidden: {active}'
    page.keyboard.press('Tab')
    settle(page)
    result = page.evaluate("({y:scrollY,active:document.activeElement.outerHTML,atStart:document.activeElement === document.querySelector('.skip-link')})")
    assert result['atStart'] and result['y'] < 100, f'Next Tab does not restart at the top: {result}'
    return {'afterEnter': active, 'afterTab': result}


def dimensions(page):
    return page.locator('.phenom-layout-zoom__viewport').evaluate("v => ({width:v.clientWidth,height:v.clientHeight,scrollWidth:v.scrollWidth,scrollHeight:v.scrollHeight,zoom:document.querySelector('dialog output').textContent})")


def assert_fit(page):
    settle(page)
    size = dimensions(page)
    assert size['scrollWidth'] <= size['width'] + 1 and size['scrollHeight'] <= size['height'] + 1, f'Fit requires panning: {size}'
    return size


def fit_test(page):
    page.set_viewport_size({'width': 844, 'height': 390})
    results = []
    for model in ('standard', 'mini', 'micro'):
        page.locator(f'label[for="key-layout-model-{model}"]').click()
        stage = page.locator(f'[data-key-layout-model-view="{model}"]')
        for layer in stage.locator('[data-key-layout-layer-target]').all():
            layer.click()
            layer_name = layer.get_attribute('data-key-layout-layer-target')
            opener = stage.locator(f'#key-layout-panel-{model}-{layer_name} .phenom-layout-open')
            opener.click()
            page.locator('dialog img').first.wait_for()
            page.wait_for_function("[...document.querySelectorAll('dialog img')].every(i => i.complete && i.naturalWidth > 0)")
            page.locator('[data-zoom-fit]').click()
            landscape = assert_fit(page)
            page.locator('[data-zoom-plus]').click()
            assert dimensions(page)['zoom'] != landscape['zoom'], 'Zoom in does not enlarge'
            for _ in range(8):
                minus = page.locator('[data-zoom-minus]')
                if minus.is_disabled():
                    break
                minus.click()
            assert_fit(page)
            # Fit mode must track available dimensions in both directions.
            page.locator('[data-zoom-fit]').click()
            page.set_viewport_size({'width': 390, 'height': 844})
            portrait = assert_fit(page)
            page.set_viewport_size({'width': 844, 'height': 390})
            assert_fit(page)
            page.keyboard.press('Escape')
            settle(page)
            assert opener.evaluate('e => e === document.activeElement'), 'Close did not restore opener focus'
            results.append({'model': model, 'layer': layer.get_attribute('data-key-layout-layer-target'), 'landscape': landscape, 'portrait': portrait})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=('focus', 'fit', 'all'), default='all')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    results = []
    servers = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            for lang in ('en', 'ru'):
                server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT / 'public' / lang)))
                servers.append(server)
                threading.Thread(target=server.serve_forever, daemon=True).start()
                for theme in ('light', 'dark'):
                    for motion in ('reduce', 'no-preference'):
                        context = browser.new_context(viewport={'width': 1280, 'height': 800}, color_scheme=theme, reduced_motion=motion)
                        page = context.new_page()
                        errors = []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.goto(f'http://127.0.0.1:{server.server_port}/phenom/')
                        page.evaluate('document.fonts.ready')
                        row: dict = {'lang': lang, 'theme': theme, 'motion': motion}
                        for case, test in [('focus', focus_test), ('fit', fit_test)]:
                            if args.case not in ('all', case):
                                continue
                            try:
                                row[case] = {'status': 'PASS', 'evidence': test(page)}
                            except AssertionError as error:
                                row[case] = {'status': 'FAIL', 'error': str(error)}
                        assert not errors, errors
                        results.append(row)
                        print(json.dumps(row, ensure_ascii=False))
                        context.close()
            browser.close()
    finally:
        for server in servers:
            server.shutdown()
            server.server_close()
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(results, indent=2, ensure_ascii=False) + '\n')
    failures = sum(value.get('status') == 'FAIL' for row in results for value in row.values() if isinstance(value, dict))
    assert not failures, f'{failures} regression checks failed'
    print(f'PASS: {len(results)} EN/RU × light/dark × reduced/normal-motion scenarios')


if __name__ == '__main__':
    main()
