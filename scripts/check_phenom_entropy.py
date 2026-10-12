#!/usr/bin/env python3
"""Real-browser Entropy playback and Phenom-only closing-control regressions."""
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
muted:v.muted,rect:v.getBoundingClientRect().toJSON()})"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--diagnose', action='store_true')
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--screenshots', type=Path)
    parser.add_argument('--autoplay-blocked', action='store_true', help='Inject a strict user-gesture-only play policy for fallback regression coverage')
    args = parser.parse_args()
    rows = []
    failures = []
    servers = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for lang in ('ru', 'en'):
                server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT / 'public' / lang)))
                servers.append(server)
                threading.Thread(target=server.serve_forever, daemon=True).start()
                for theme in ('light', 'dark'):
                    for mobile in (False, True):
                        for motion in ('no-preference', 'reduce'):
                            context = browser.new_context(viewport={'width':390 if mobile else 1280,'height':844 if mobile else 800}, color_scheme=theme, reduced_motion=motion)
                            if args.autoplay_blocked:
                                context.add_init_script("""(() => {
                                  let gesture = false;
                                  document.addEventListener('click', () => { gesture = true; setTimeout(() => { gesture = false; }, 0); }, true);
                                  const play = HTMLMediaElement.prototype.play;
                                  HTMLMediaElement.prototype.play = function () {
                                    return gesture ? play.call(this) : Promise.reject(new DOMException('Test policy: user gesture required', 'NotAllowedError'));
                                  };
                                })();""")
                            page = context.new_page()
                            errors, network = [], []
                            page.on('pageerror', lambda e: errors.append(str(e)))
                            page.on('response', lambda r: network.append({'url':r.url,'status':r.status}) if '.mp4' in r.url else None)
                            page.goto(f'http://127.0.0.1:{server.server_port}/phenom/')
                            group = page.locator('[data-theme-video-group]')
                            group.scroll_into_view_if_needed()
                            page.wait_for_timeout(1800)
                            row = {'lang':lang,'theme':theme,'mobile':mobile,'motion':motion,'initial':group.locator('video').evaluate_all('(vs) => vs.map(v => (' + STATE + ')(v))'), 'network':network,'errors':errors}
                            try:
                                active = group.locator(f'[data-theme-video="{theme}"]')
                                if motion == 'reduce' or args.autoplay_blocked:
                                    if motion == 'reduce':
                                        assert active.evaluate('v => v.paused && !v.querySelector("source").hasAttribute("src")'), 'Reduced motion unexpectedly autoplays/loads'
                                    control = group.locator('[data-theme-video-play]')
                                    assert control.is_visible(), 'No accessible manual play control when reduced motion suppresses autoplay'
                                    control.focus()
                                    page.keyboard.press('Enter')
                                page.wait_for_function('theme => {const v=document.querySelector(`[data-theme-video="${theme}"]`);return !v.paused && v.currentTime > 0.1}', arg=theme, timeout=6000)
                                before = active.evaluate('v => v.currentTime')
                                page.wait_for_timeout(350)
                                assert active.evaluate('v => v.currentTime') > before, 'Video frames do not advance'
                                row['playing'] = active.evaluate(STATE)
                                if motion == 'reduce':
                                    control = group.locator('[data-theme-video-play]')
                                    assert control.get_attribute('aria-label') == control.get_attribute('data-label-pause')
                                    control.click()
                                    page.wait_for_timeout(300)
                                    assert active.evaluate('v => v.paused'), 'Manual pause does not stop playback'
                                    control.click()
                                    page.wait_for_function('theme => !document.querySelector(`[data-theme-video="${theme}"]`).paused', arg=theme)
                                if args.screenshots:
                                    args.screenshots.mkdir(parents=True, exist_ok=True)
                                    page.screenshot(path=str(args.screenshots / f'{lang}-{theme}-{"mobile" if mobile else "desktop"}-{motion}-entropy.png'))
                                if args.autoplay_blocked:
                                    # This policy probe checks explicit playback only, not automatic theme continuation.
                                    row['policyProbe'] = 'injected strict gesture-only policy'
                                page.locator('[data-theme-toggle]').evaluate('button => button.click()')
                                other = 'dark' if theme == 'light' else 'light'
                                if args.autoplay_blocked:
                                    page.wait_for_timeout(500)
                                    group.locator('[data-theme-video-play]').click()
                                page.wait_for_function('theme => {const v=document.querySelector(`[data-theme-video="${theme}"]`);return !v.paused && v.currentTime > 0.1}', arg=other, timeout=6000)
                                row['switched'] = group.locator(f'[data-theme-video="{other}"]').evaluate(STATE)
                                if not args.autoplay_blocked:
                                    # Changing OS motion preference must revoke earlier manual consent.
                                    page.emulate_media(reduced_motion='no-preference')
                                    page.wait_for_timeout(200)
                                    page.emulate_media(reduced_motion='reduce')
                                    page.wait_for_timeout(400)
                                    assert group.locator('video').evaluate_all('vs => vs.every(v => v.paused && !v.querySelector("source").hasAttribute("src"))'), 'Motion preference change did not suppress playback'
                                    assert group.locator('[data-theme-video-play]').is_visible()
                                page.evaluate('scrollTo(0,0)')
                                settle(page)
                                page.wait_for_timeout(400)
                                assert group.locator('video').evaluate_all('vs => vs.every(v => v.paused)'), 'Offscreen video continues playing'
                                assert page.locator('footer').count() == 0, 'Phenom footer remains'
                                page.evaluate('scrollTo(0,document.body.scrollHeight)')
                                settle(page)
                                control = page.locator('[data-phenom-back-to-top]')
                                if not mobile:
                                    box = control.bounding_box()
                                    assert box and 44 <= box['height'] <= 52 and 44 <= box['width'] <= 160, f'Back-to-top is not a discreet touch target: {box}'
                                    row['backToTop'] = box
                                if args.screenshots and motion == 'no-preference':
                                    page.screenshot(path=str(args.screenshots / f'{lang}-{theme}-{"mobile" if mobile else "desktop"}-closing.png'))
                                assert not errors, errors
                                row['status'] = 'PASS'
                            except Exception as e:
                                row['status'] = 'FAIL'
                                row['failure'] = str(e)
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
