/* Route ownership is decided before any stylesheet/runtime URL becomes live.
   Keep inert URLs, rather than media-only gates: preload scanners fetch those. */
(() => {
  'use strict';
  const root = document.documentElement;
  const canvas = window.__phenomDesktopCanvas;
  const shell = !canvas && navigator.maxTouchPoints > 0 && screen.width < 1000 &&
    Math.min(screen.width, screen.height) < 768 && innerWidth >= 960 && innerWidth > screen.width + 16;
  let fallback, restorePhotos;
  const styles = (parser = false) => {
    const font = !canvas && matchMedia('(min-width: 981px) and (hover: hover) and (pointer: fine)').matches ? 'local' : 'handheld';
    const links = [...document.querySelectorAll(`[data-phenom-${canvas ? 'canvas' : 'native'}-style], [data-phenom-font-${font}]`)];
    return Promise.all(links.map(link => new Promise(resolve => {
      if (parser) {
        const active = link.cloneNode();
        active.disabled = false; active.removeAttribute('disabled'); active.media = 'all';
        active.href = active.dataset.href;
        active.setAttribute('onerror', 'window.__phenomBootstrap89.failed=true');
        document.write(active.outerHTML);
        link.remove();
        resolve(); return;
      }
      if (link.sheet) { resolve(); return; }
      link.onload = link.onerror = resolve;
      link.disabled = false;
      link.media = 'all';
      link.href = link.dataset.href;
    })));
  };
  const runtime = () => [...document.querySelectorAll('script[data-phenom-runtime]')];
  window.__phenomBootstrap89 = {
    failed: false,
    captureDelivery() {
      if (!shell) return;
      restorePhotos = window.__phenomDelivery64.failOpen.bind(window.__phenomDelivery64);
      // Retain delivery64's independent missing/hung-controller watchdog, but
      // restore the shell assets before it can expose the authored document.
      window.__phenomDelivery64.failOpen = () => this.failOpen();
    },
    start() {
      if (shell) return;
      styles(true);
      // Parser-inserted defer preserves both execution order and DOM readiness.
      runtime().forEach(node => document.write('<script defer src="' + node.dataset.src + '" integrity="' + node.integrity + '" onerror="window.__phenomBootstrap89.failed=true"><\/script>'));
    },
    failOpen() {
      if (!shell) { window.__phenomDelivery64?.failOpen(); return Promise.resolve(); }
      if (fallback) return fallback;
      this.opened = true;
      root.style.visibility = 'hidden';
      fallback = new Promise(resolve => {
        const restore = async () => {
          await styles();
          // Shell content has been restored before activation. Load in the same
          // order as defer, once only; an unavailable enhancement must not trap UI.
          for (const node of runtime()) {
            await new Promise(done => {
              const script = document.createElement('script');
              script.src = node.dataset.src; script.integrity = node.integrity;
              script.onload = script.onerror = done;
              document.head.append(script);
            });
          }
          await document.fonts.ready;
          restorePhotos?.();
          root.style.visibility = '';
          resolve();
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restore, {once:true});
        else restore();
      });
      return fallback;
    }
  };
})();
