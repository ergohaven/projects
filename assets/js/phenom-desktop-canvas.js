/* Preserve the existing desktop composition in one uniformly scaled canvas.
   Native desktop and native mobile do not enter this rendering path. */
(() => {
  'use strict';
  const canvasName = 'phenom-desktop-canvas';
  const framed = window !== window.top && window.name === canvasName;
  const root = document.documentElement;
  window.__phenomDesktopCanvas = framed;
  const isDesktopPhone = () => navigator.maxTouchPoints > 0 && screen.width < 1000 &&
    Math.min(screen.width, screen.height) < 768 && innerWidth >= 960 && innerWidth > screen.width + 16;
  if (!framed && isDesktopPhone()) root.style.visibility = 'hidden';

  const ready = fn => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn();
  if (framed) {
    ready(() => {
      root.style.scrollSnapType = 'none';
      const reportSize = () => window.parent.__phenomCanvasUpdate?.();
      new ResizeObserver(reportSize).observe(document.body);
      document.fonts.ready.then(reportSize);
      new MutationObserver(() => {
        window.parent.document.documentElement.dataset.theme = root.dataset.theme;
      }).observe(root, {attributes:true, attributeFilter:['data-theme']});
      document.addEventListener('click', event => {
        const a = event.target.closest('a[href]');
        if (!a) return;
        const url = new URL(a.href, location.href);
        if (a.matches('[data-phenom-back-to-top]') || (url.origin === location.origin && url.pathname === location.pathname && url.hash)) {
          const target = a.matches('[data-phenom-back-to-top]') ? document.querySelector('.product-hero') : document.getElementById(decodeURIComponent(url.hash.slice(1)));
          if (target) {
            event.preventDefault(); event.stopImmediatePropagation();
            window.parent.__phenomCanvasScroll?.(a.matches('[data-phenom-back-to-top]') ? 0 : target.getBoundingClientRect().top, url.hash);
          }
        } else if (url.origin !== location.origin || !/^\/(?:ru\/)?phenom\/?$/.test(url.pathname)) {
          if (a.target !== '_blank' && !a.hasAttribute('download')) a.target = '_top';
        }
      }, true);
    });
    return;
  }

  let shell;
  const start = () => {
    if (shell || !isDesktopPhone()) { if (!shell) root.style.visibility = ''; return; }
    shell = document.createElement('div');
    const frame = document.createElement('iframe');
    frame.name = canvasName;
    frame.title = document.title;
    frame.dataset.phenomDesktopCanvas = '';
    const url = new URL(location.href); url.searchParams.set('desktop-canvas', '1');
    frame.src = url.href;
    frame.style.cssText = 'position:absolute;top:0;left:0;width:1440px;height:900px;border:0;transform-origin:0 0;display:block';
    frame.allow = 'autoplay; fullscreen';
    shell.style.cssText = 'position:relative;width:100%;overflow:hidden';
    shell.append(frame);
    document.body.replaceChildren(shell);
    document.body.className = 'phenom-desktop-shell';
    document.body.style.cssText = 'margin:0;padding:0;min-height:0;width:100%;overflow-x:hidden';
    root.style.scrollSnapType = 'none'; root.style.overflowX = 'hidden';
    let queued = 0, bottomGap = 32;
    const scale = () => document.documentElement.clientWidth / 1440;
    const update = () => {
      queued = 0;
      const doc = frame.contentDocument;
      if (!doc?.body || !doc.querySelector('.product-story--phenom')) return;
      const height = Math.ceil(doc.body.getBoundingClientRect().height);
      if (height < 900) return;
      frame.style.height = height + 'px';
      frame.style.transform = `scale(${scale()})`;
      shell.style.height = height * scale() + 'px';
      root.dataset.theme = doc.documentElement.dataset.theme;
      const button = doc.querySelector('[data-phenom-back-to-top]');
      if (button) {
        if (!button.dataset.canvasPinned) {
          bottomGap = parseFloat(frame.contentWindow.getComputedStyle(button).bottom) || 32;
          button.dataset.canvasPinned = 'true';
        }
        button.style.position = 'absolute'; button.style.bottom = 'auto';
        button.style.top = `${(scrollY + innerHeight) / scale() - bottomGap - button.getBoundingClientRect().height}px`;
        const visible = scrollY > Math.max(0, height * scale() - innerHeight) / 3;
        button.classList.toggle('is-visible', visible);
        button.setAttribute('aria-hidden', String(!visible)); button.tabIndex = visible ? 0 : -1;
      }
      root.style.visibility = '';
    };
    const schedule = () => { if (!queued) queued = requestAnimationFrame(update); };
    window.__phenomCanvasUpdate = schedule;
    window.__phenomCanvasScroll = (top, hash) => {
      scrollTo({top:top * scale(), behavior:matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth'});
      if (hash) { const dest = new URL(location.href); dest.hash = hash; history.replaceState(null, '', dest); }
    };
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument;
      if (!doc?.querySelector('.product-story--phenom')) { root.style.visibility = ''; return; }
      const dest = new URL(frame.contentWindow.location.href); dest.searchParams.delete('desktop-canvas');
      history.replaceState(null, '', dest); document.title = doc.title;
      Promise.resolve(doc.fonts.ready).then(() => {
        update();
        if (dest.hash) {
          const target = doc.getElementById(decodeURIComponent(dest.hash.slice(1)));
          if (target) scrollTo({top:target.getBoundingClientRect().top * scale(), behavior:'instant'});
        }
      });
    });
    addEventListener('resize', schedule, {passive:true});
    addEventListener('scroll', schedule, {passive:true});
  };
  ready(start);
  addEventListener('resize', start, {passive:true});
})();
