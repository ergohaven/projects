(() => {
  'use strict';
  const tags = [...document.querySelectorAll('[data-phenom-tag]')];
  if (!tags.length) return;
  const reduced = ({matches:false, addEventListener(){}, removeEventListener(){}});
  const compact = window.matchMedia('(max-width: 980px)');
  const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+-=?/';
  const states = tags.map(tag => ({
    tag,
    lines: [...tag.querySelectorAll('[data-tag-line]')].map(node => ({ node, text: node.dataset.tagLine, chars: [...node.dataset.tagLine] })),
    visible: false, running: false, timer: 0
  }));

  function settle(state) {
    clearTimeout(state.timer);
    state.timer = 0;
    state.running = false;
    state.lines.forEach(line => { if (line.node.textContent !== line.text) line.node.textContent = line.text; });
  }

  // Decorative tags yield while the same chapter's reading copy is entering.
  // Keep their static accessible label visible; do not compete with headlines.
  function attentionBusy(state) {
    const section = state.tag.closest('section');
    return !!section?.querySelector('h2[data-phenom-reveal-pending], h2[data-phenom-heading-key], h2[data-phenom-rise-key], .visual-chapter__copy > p[data-phenom-rise-key]');
  }

  function resumeAfterCopy(state) {
    if (!state.visible || state.running || state.timer || reduced.matches || document.hidden) return;
    state.timer = setTimeout(() => { state.timer = 0; play(state); }, 1200);
  }

  function play(state) {
    if (!state.visible || state.running || reduced.matches || document.hidden) return;
    if (attentionBusy(state)) { settle(state); return; }
    clearTimeout(state.timer);
    state.running = true;
    const start = performance.now();
    function tick() {
      if (attentionBusy(state)) { settle(state); return; }
      const elapsed = performance.now() - start;
      if (elapsed >= 1000) {
        settle(state);
        state.timer = setTimeout(() => play(state), 3000);
        return;
      }
      const progress = Math.max(0, (elapsed - 500) / 500);
      state.lines.forEach((line, index) => {
        if (compact.matches && index > 0) return;
        const resolved = Math.floor(line.chars.length * (1 - Math.pow(1 - progress, 2)));
        line.node.textContent = line.chars.map((char, index) => char === ' ' || index < resolved ? char : glyphs[Math.floor(Math.random() * glyphs.length)]).join('');
      });
      // Glyphs change at 20 Hz, so do not wake a 60/120 Hz RAF just to skip it.
      // One cancellable timer covers the burst and the readable 3s hold.
      state.timer = setTimeout(tick, 50);
    }
    tick();
  }

  // Captions follow the photograph, not the mobile heading above it.
  const setStyle = (node, name, value) => {
    if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
  };
  let placementFrame = 0;
  const placeAll = () => {
    placementFrame = 0;
    const header = document.querySelector('.site-header__inner');
    const link = document.querySelector('.brand--return');
    // The phone shell may have detached the original caption tree.
    if (!header || !link) return;
    const grid = header.getBoundingClientRect();
    const color = getComputedStyle(link).color;
    // Read all layout inputs before any positioning writes.
    const positions = states.filter(state => state.tag.isConnected).map(state => {
      const section = state.tag.closest('.visual-chapter');
      if (!section) return {state};
      return {state, image:section.querySelector('.visual-chapter__media').getBoundingClientRect(), section:section.getBoundingClientRect(), border:section.clientTop};
    });
    setStyle(document.documentElement, '--phenom-grid-gutter', `${grid.left}px`);
    setStyle(document.documentElement, '--phenom-tag-color', color);
    positions.forEach(({state, image, section, border}) => {
      const label = compact.matches ? state.lines[0].text : state.lines.map(line => line.text).join(' / ');
      if (state.tag.getAttribute('aria-label') !== label) state.tag.setAttribute('aria-label', label);
      if (section) {
        setStyle(state.tag, '--tag-media-top', `${image.top-section.top-border}px`);
        setStyle(state.tag, '--tag-media-height', `${image.height}px`);
        setStyle(state.tag, '--tag-grid-gutter', `${grid.left}px`);
        setStyle(state.tag, '--tag-grid-left', `${grid.left-section.left}px`);
        setStyle(state.tag, '--tag-grid-right', `${section.right-grid.right}px`);
        if (!state.tag.hasAttribute('data-placed')) state.tag.dataset.placed = '';
      }
    });
    // One batched marker measurement phase after positioning, then only writes.
    const markers = positions.map(({state}) => {
      const box = state.tag.getBoundingClientRect();
      const text = state.tag.querySelector('[data-tag-line]').getBoundingClientRect();
      const size = parseFloat(getComputedStyle(state.tag).fontSize);
      return {tag:state.tag, left:`${text.left-box.left-size*.67}px`};
    });
    markers.forEach(({tag,left}) => setStyle(tag, '--tag-marker-left', left));
  };
  const requestPlacement = () => {
    if (!placementFrame) placementFrame = requestAnimationFrame(placeAll);
  };
  placeAll();
  if ('ResizeObserver' in window) {
    const sizeObserver = new ResizeObserver(requestPlacement);
    states.forEach(state => {
      const section = state.tag.closest('.visual-chapter');
      if (section) {
        sizeObserver.observe(section);
        sizeObserver.observe(section.querySelector('.visual-chapter__media'));
      }
    });
  }
  window.addEventListener('resize', requestPlacement, { passive: true });
  if (document.fonts) document.fonts.ready.then(requestPlacement);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', requestPlacement);
  if (!('IntersectionObserver' in window)) return;

  const story = document.querySelector('.product-story--phenom');
  if (story) new MutationObserver(() => {
    states.forEach(state => {
      if (!state.visible) return;
      if (attentionBusy(state)) settle(state);
      else resumeAfterCopy(state);
    });
  }).observe(story, {subtree:true, attributes:true, attributeFilter:[
    'data-phenom-reveal-pending', 'data-phenom-heading-key', 'data-phenom-rise-key'
  ]});

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const state = states.find(item => item.tag === entry.target);
      state.visible = entry.isIntersecting;
      if (state.visible) play(state);
      else settle(state);
    });
  }, { rootMargin: '0px' });
  states.forEach(state => {
    observer.observe(state.tag);
    state.tag.addEventListener('pointerenter', () => play(state));
  });
  function refreshMotion() {
    states.forEach(state => { settle(state); play(state); });
  }
  reduced.addEventListener('change', refreshMotion);
  document.addEventListener('visibilitychange', refreshMotion);
})();
