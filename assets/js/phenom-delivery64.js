/* Exact approved photo bytes; the outer reading window owns canvas delivery.
   Inert URL attributes prevent the preload scanner racing shell replacement. */
(() => {
  'use strict';
  const framed = !!window.__phenomDesktopCanvas;
  const outerShell = !framed && navigator.maxTouchPoints > 0 && screen.width < 1000 &&
    Math.min(screen.width, screen.height) < 768 && innerWidth >= 960 && innerWidth > screen.width + 16;
  const pictures = new Set();
  let open = false, queued = 0;
  const restore = picture => {
    const img = picture.querySelector('img');
    if (!img) return;
    // If an approved responsive resource fails, retry its untouched JPEG master.
    img.addEventListener('error', () => {
      // Keep media-selected JPEG sources, otherwise a dark WebP failure
      // would incorrectly fall back to the light photograph in img.src.
      picture.querySelectorAll('source[type="image/webp"]').forEach(source => source.removeAttribute('srcset'));
      img.src = img.dataset.deliveryFallback;
    }, {once:true});
    picture.querySelectorAll('[data-delivery-srcset]').forEach(source => {
      source.setAttribute('srcset', source.dataset.deliverySrcset);
      source.removeAttribute('data-delivery-srcset');
    });
    img.src = img.dataset.deliverySrc;
    img.removeAttribute('data-delivery-src');
  };
  const size = picture => {
    const img = picture.querySelector('img'), r = img.getBoundingClientRect();
    const ratio = Number(img.getAttribute('width')) / Number(img.getAttribute('height'));
    // Rect includes authored scale/zoom. Cover can require more source width
    // than the visible box. Outer CSS transform and mobile page zoom both
    // reduce the painted pixel requirement; devicePixelRatio remains native.
    const fit = getComputedStyle(img).objectFit;
    const width = fit === 'cover' ? Math.max(r.width, r.height * ratio) : r.width;
    const frame = window.frameElement;
    const scale = frame.getBoundingClientRect().width / innerWidth;
    const zoom = parent.visualViewport?.scale || 1;
    // Preserve the approved 2304px detail floor for these two canvas photos.
    // Previously an outer transform transition admitted that resolution only
    // transiently; resource optimization must not reduce the selected detail.
    const preserveDetail = /\/(?:01-hero-detail|03-modularity-trackballs)\.jpg(?:$|\?)/.test(img.dataset.deliveryFallback || '');
    const minimum = preserveDetail ? 2304 / devicePixelRatio : 0;
    const admittedWidth = Math.ceil(Math.max(width * scale * zoom, minimum));
    picture.querySelectorAll('source').forEach(source => { source.sizes = `${admittedWidth}px`; });
  };
  const check = () => {
    queued = 0;
    if (!framed) return;
    const frame = window.frameElement;
    if (!frame?.isConnected || !frame.style.transform) return;
    const scale = frame.getBoundingClientRect().width / innerWidth;
    const origin = frame.getBoundingClientRect().top;
    // One tenth of the real outer viewport prefetches a bounded upcoming edge,
    // not the full-height iframe's misleading native lazy-load viewport.
    const margin = parent.innerHeight * .1;
    pictures.forEach(picture => {
      if (!picture.isConnected) { pictures.delete(picture); return; }
      const r = picture.querySelector('img').getBoundingClientRect();
      const visible = origin + r.bottom * scale >= -margin && origin + r.top * scale <= parent.innerHeight + margin;
      if (!visible) return;
      size(picture);
      const img = picture.querySelector('img');
      if (img.hasAttribute('data-delivery-src')) { img.loading = 'eager'; restore(picture); }
    });
  };
  const schedule = () => { if (!queued) queued = parent.requestAnimationFrame(check); };
  window.__phenomDelivery64 = {
    mount(picture) {
      pictures.add(picture);
      if ((!framed && !outerShell) || open) restore(picture);
    },
    releaseShell() { pictures.clear(); },
    failOpen() {
      open = true;
      pictures.forEach(picture => { if (picture.isConnected && picture.querySelector('[data-delivery-src]')) restore(picture); });
      document.documentElement.style.visibility = '';
    }
  };
  if (framed) {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        check();
        parent.addEventListener('scroll', schedule, {passive:true});
        parent.addEventListener('resize', schedule, {passive:true});
        parent.visualViewport?.addEventListener('resize', schedule, {passive:true});
        new ResizeObserver(schedule).observe(document.body);
        new MutationObserver(schedule).observe(window.frameElement, {attributes:true, attributeFilter:['style']});
      } catch (_) { window.__phenomDelivery64.failOpen(); }
    }, {once:true});
  } else if (outerShell) {
    // A missing/failed shell controller must never leave authored content empty.
    setTimeout(() => { if (!document.querySelector('iframe[data-phenom-desktop-canvas]')) window.__phenomDelivery64.failOpen(); }, 8000);
  }
})();
