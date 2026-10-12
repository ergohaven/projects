#!/usr/bin/env python3
"""Real-browser Phenom icon geometry and continuous, viewport-aware Entropy playback."""
import argparse
import functools
import json
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
from check_phenom_browser import QuietHandler, ROOT, settle

STATE = """v => ({theme:v.dataset.themeVideo,paused:v.paused,time:v.currentTime,
ready:v.readyState,error:v.error && {code:v.error.code,message:v.error.message},
source:v.querySelector('source').getAttribute('src'),lazy:v.querySelector('source').dataset.src,
muted:v.muted,loop:v.loop,inline:v.playsInline,controls:v.controls,
rect:v.getBoundingClientRect().toJSON()})"""


def playing(page, theme):
    page.wait_for_function('theme => {const v=document.querySelector(`[data-theme-video="${theme}"]`);return !v.paused && v.currentTime > 0.1}', arg=theme, timeout=6000)
    active = page.locator(f'[data-theme-video="{theme}"]')
    before = active.evaluate('v => v.currentTime')
    page.wait_for_timeout(350)
    assert active.evaluate('v => v.currentTime') > before, 'Video frames do not advance'
    state = active.evaluate(STATE)
    assert state['muted'] and state['loop'] and state['inline'] and not state['controls']
    assert state['error'] is None, state
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--diagnose', action='store_true')
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--screenshots', type=Path)
    parser.add_argument('--headed', action='store_true', help='Use a real window (xvfb-run on headless hosts)')
    args = parser.parse_args()
    rows, failures, servers = [], [], []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=not args.headed)
            for lang in ('ru', 'en'):
                server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT / 'public' / lang)))
                servers.append(server)
                threading.Thread(target=server.serve_forever, daemon=True).start()
                for theme in ('light', 'dark'):
                    for mobile in (False, True):
                        for motion in ('no-preference', 'reduce'):
                            context = browser.new_context(viewport={'width':390 if mobile else 1280,'height':844 if mobile else 800}, color_scheme=theme, reduced_motion=motion)
                            page = context.new_page()
                            errors, network = [], []
                            page.on('pageerror', lambda e: errors.append(str(e)))
                            page.on('response', lambda r: network.append({'url':r.url,'status':r.status}) if '.mp4' in r.url else None)
                            row = {'lang':lang,'theme':theme,'mobile':mobile,'motion':motion,'network':network,'errors':errors}
                            try:
                                page.goto(f'http://127.0.0.1:{server.server_port}/phenom/')
                                page.evaluate('document.fonts.ready')
                                settle(page)
                                cue = page.locator('.phenom-scroll-cue')
                                size = cue.locator('svg').bounding_box()
                                expected = 44 if mobile else page.evaluate('parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.5')
                                assert abs(size['width'] - expected) < 0.1 and abs(size['height'] - expected) < 0.1, size
                                row['heroArrow'] = size
                                assert cue.bounding_box()['width'] >= size['width'], 'Arrow exceeds target'
                                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal overflow'
                                if not mobile:
                                    intro = page.locator('.product-hero__intro').bounding_box()
                                    target = cue.bounding_box()
                                    assert (intro['x'] + intro['width'] <= target['x'] or target['x'] + target['width'] <= intro['x'] or intro['y'] + intro['height'] <= target['y'] or target['y'] + target['height'] <= intro['y']), 'Hero cue overlaps intro'
                                if args.screenshots:
                                    args.screenshots.mkdir(parents=True, exist_ok=True)
                                    page.screenshot(path=str(args.screenshots / f'{lang}-{theme}-{"mobile" if mobile else "desktop"}-{motion}-hero.png'))
                                group = page.locator('[data-theme-video-group]')
                                assert group.locator('button').count() == 0, 'Visible/manual video controls remain'
                                assert group.locator('video').evaluate_all('vs => vs.every(v => v.paused && !v.querySelector("source").hasAttribute("src"))'), 'Distant media loads at hero'
                                group.scroll_into_view_if_needed()
                                row['playing'] = playing(page, theme)
                                inactive = group.locator(f'[data-theme-video="{"dark" if theme == "light" else "light"}"]')
                                assert inactive.evaluate('v => v.paused && !v.querySelector("source").hasAttribute("src")'), 'Inactive theme consumes media'
                                # Exercise a real loop boundary instead of waiting for the full demo.
                                active = group.locator(f'[data-theme-video="{theme}"]')
                                active.evaluate('v => {v.currentTime=v.duration-0.2}')
                                page.wait_for_function('theme => {const v=document.querySelector(`[data-theme-video="${theme}"]`);return v.currentTime < v.duration / 2 && !v.paused}', arg=theme)
                                row['looped'] = active.evaluate(STATE)
                                playing(page, theme)
                                if args.screenshots:
                                    page.screenshot(path=str(args.screenshots / f'{lang}-{theme}-{"mobile" if mobile else "desktop"}-{motion}-entropy.png'))
                                page.locator('[data-theme-toggle]').evaluate('button => button.click()')
                                other = 'dark' if theme == 'light' else 'light'
                                row['switched'] = playing(page, other)
                                assert active.evaluate('v => v.paused && !v.querySelector("source").hasAttribute("src")')
                                page.emulate_media(reduced_motion='reduce' if motion == 'no-preference' else 'no-preference')
                                row['motionChanged'] = playing(page, other)
                                # Try native visibility first; some automation builds keep
                                # pages visible. Label the injected lifecycle probe separately.
                                context.new_cdp_session(page).send('Emulation.setFocusEmulationEnabled', {'enabled': False})
                                background = context.new_page()
                                background.goto('about:blank')
                                background.bring_to_front()
                                page.wait_for_timeout(400)
                                if page.evaluate('document.hidden'):
                                    assert group.locator('video').evaluate_all('vs => vs.every(v => v.paused)')
                                    row['backgroundPaused'] = True
                                else:
                                    page.evaluate("Object.defineProperty(document, 'hidden', {configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange'))")
                                    page.wait_for_timeout(200)
                                    assert group.locator('video').evaluate_all('vs => vs.every(v => v.paused && !v.querySelector("source").hasAttribute("src"))')
                                    row['backgroundPaused'] = 'PASS: injected visibility lifecycle (automation keeps pages visible)'
                                    page.evaluate("delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))")
                                background.close()
                                page.bring_to_front()
                                playing(page, other)
                                page.evaluate('scrollTo(0,0)')
                                settle(page)
                                page.wait_for_timeout(400)
                                assert group.locator('video').evaluate_all('vs => vs.every(v => v.paused && !v.querySelector("source").hasAttribute("src"))'), 'Offscreen video keeps resources'
                                group.scroll_into_view_if_needed()
                                row['resumed'] = playing(page, other)
                                assert page.locator('footer').count() == 0, 'Phenom footer remains'
                                page.evaluate('scrollTo(0,document.body.scrollHeight)')
                                settle(page)
                                control = page.locator('[data-phenom-back-to-top]')
                                assert control.inner_text().strip() == '', 'Back-to-top has visible text'
                                assert control.get_attribute('aria-label') == ('Наверх' if lang == 'ru' else 'Back to top')
                                box = control.bounding_box()
                                if mobile:
                                    assert not control.is_visible(), 'Mobile return control obscures reading copy'
                                    row['backToTop'] = 'Intentionally hidden on phones'
                                else:
                                    assert box and 44 <= box['height'] <= 52 and 44 <= box['width'] <= 52, box
                                    arrow = control.locator('svg').bounding_box()
                                    assert abs(arrow['width'] - 24) < 0.1, arrow
                                    row['backToTop'] = {'target':box,'arrow':arrow}
                                if args.screenshots:
                                    page.screenshot(path=str(args.screenshots / f'{lang}-{theme}-{"mobile" if mobile else "desktop"}-{motion}-closing.png'))
                                assert not errors, errors
                                assert all(r['status'] in (200,206) for r in network), network
                                row['status'] = 'PASS'
                            except Exception as e:
                                row['status'], row['failure'] = 'FAIL', str(e)
                                failures.append(row['failure'])
                            rows.append(row)
                            print(json.dumps(row, ensure_ascii=False))
                            context.close()
            browser.close()
    finally:
        for server in servers:
            server.shutdown()
            server.server_close()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + '\n')
    if not args.diagnose:
        assert not failures, f'{len(failures)} failed scenarios; see {args.report}'
    print(f'{len(rows)} scenarios, {len(failures)} failures')


if __name__ == '__main__':
    main()
