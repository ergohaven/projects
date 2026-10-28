/* Phenom motion35: bounded mouse-wheel glide + directional proximity alignment.
   Native touch/trackpad, direct navigation and reduced motion retain priority. */
(() => {
  'use strict';
  const story = document.querySelector('.product-story--phenom');
  const desktop = matchMedia('(min-width: 981px)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const root = document.documentElement;
  let snapOverride = null;
  const restoreNativeSnap = () => {
    if (!snapOverride) return;
    const previous = snapOverride; snapOverride = null;
    if (root.style.getPropertyValue('scroll-snap-type') !== 'none' || root.style.getPropertyPriority('scroll-snap-type') !== 'important') return;
    if (previous.value) root.style.setProperty('scroll-snap-type', previous.value, previous.priority);
    else root.style.removeProperty('scroll-snap-type');
  };
  const useWheelSnap = () => {
    if (snapOverride) return;
    snapOverride = {value:root.style.getPropertyValue('scroll-snap-type'), priority:root.style.getPropertyPriority('scroll-snap-type')};
    root.style.setProperty('scroll-snap-type', 'none', 'important');
  };
  const reduced = ({matches:false, addEventListener(){}, removeEventListener(){}});
  // Phone desktop-canvas and native mobile retain their existing behavior.
  if (!story || window.__phenomDesktopCanvas || !desktop.matches) return;
  let idle = 0;
  let frame = 0;
  let armed = false;
  let direction = 0;
  let gestureY = scrollY;
  let destination = null;
  let wheelTarget = null;
  let lastWrittenY = null;
  const finish = () => {
    clearTimeout(idle);
    cancelAnimationFrame(frame);
    idle = frame = 0;
    armed = false;
    destination = null;
    wheelTarget = null;
    lastWrittenY = null;
  };
  const cancel = finish;
  const align = () => {
    idle = 0;
    if (!armed || !desktop.matches || document.hidden) return finish();
    // Do not attach alignment to a still-moving glide. Its completion schedules
    // a fresh quiet interval; native scroll events likewise reset that interval.
    if (wheelTarget !== null) return;
    armed = false;
    // Settle from the actual quiet position, never from a stale queued target.
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    const radius = Math.min(160, innerHeight * 0.18);
    // Read existing authored snap points only after the gesture has stopped.
    const points = [...story.children].filter(section => getComputedStyle(section).scrollSnapAlign.includes('start'))
      .map(section => Math.max(0, Math.min(max, section.getBoundingClientRect().top + scrollY)))
      .filter(point => direction * (point - y) > 1 && Math.abs(point - y) <= radius)
      .sort((a, b) => Math.abs(a - y) - Math.abs(b - y));
    if (!points.length) return finish();
    destination = points[0];
    // Reduced motion removes decorative movement, not functional alignment.
    // One instantaneous quiet-time settlement; never a glide/animation loop.
    if (reduced.matches) {
      window.scrollTo({top:destination, behavior:'instant'});
      return finish();
    }
    // Only the short <=160px settling movement uses RAF. Unlike a native
    // smooth-scroll transaction, it can stop without swallowing a fresh wheel.
    const started = performance.now();
    const distance = destination - y;
    const step = now => {
      const progress = Math.min(1, (now - started) / 240);
      const ease = progress * progress * (3 - 2 * progress);
      window.scrollTo({ top: y + distance * ease, behavior: 'instant' });
      if (progress < 1) frame = requestAnimationFrame(step);
      else finish();
    };
    frame = requestAnimationFrame(step);
  };
  const schedule = () => {
    clearTimeout(idle);
    idle = setTimeout(align, 180);
  };
  const glide = target => {
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    wheelTarget = Math.max(0, Math.min(max, target));
    let position = scrollY;
    let previous = performance.now();
    const step = now => {
      if (!desktop.matches || reduced.matches || document.hidden) return finish();
      const elapsed = Math.max(0, Math.min(64, now - previous));
      previous = now;
      position += (wheelTarget - position) * (1 - Math.exp(-elapsed / 140));
      const settled = Math.abs(wheelTarget - position) < .65;
      window.scrollTo({ top: settled ? wheelTarget : position, behavior: 'instant' });
      lastWrittenY = scrollY;
      if (!settled) frame = requestAnimationFrame(step);
      else {
        frame = 0;
        wheelTarget = null;
        schedule();
      }
    };
    frame = requestAnimationFrame(step);
  };
  const nestedScroller = (target, delta) => {
    for (let node = target instanceof Element ? target : null; node && node !== document.body; node = node.parentElement) {
      if (node.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return true;
      if (node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY)
        && (delta > 0 ? node.scrollTop + node.clientHeight < node.scrollHeight - 1 : node.scrollTop > 0)) return true;
    }
    return false;
  };
  window.addEventListener('wheel', event => {
    if (!desktop.matches || document.hidden || event.ctrlKey || event.shiftKey || event.defaultPrevented
      || nestedScroller(event.target, event.deltaY)) return cancel();
    // Zero/cross-axis tail events are not a new vertical intent. In particular,
    // do not discard an armed snap just because inertia decayed below one pixel.
    if (!Number.isFinite(event.deltaY) || event.deltaY === 0
      || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (!fine.matches) {
      if (!event.isTrusted) return cancel();
      // Keep actual wheel movement compositor-native. Only the idle, bounded
      // directional settlement is ours; touch restores authored native snap.
      useWheelSnap();
    }
    const continuing = armed;
    const carry = wheelTarget !== null && destination === null && Math.sign(event.deltaY) === direction ? wheelTarget : scrollY;
    cancel();
    if (!continuing || Math.abs(event.deltaY) >= 1) {
      direction = Math.sign(event.deltaY);
      gestureY = scrollY;
    }
    armed = true;
    // Smooth coarse wheel notches, not precision/fractional trackpad gestures.
    // A fresh reversal discards the old target immediately, never coasting away.
    const coarse = event.deltaMode !== 0 || (Math.abs(event.deltaY) >= 40 && Number.isInteger(event.deltaY));
    if (fine.matches && !reduced.matches && event.cancelable && coarse) {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
      glide(carry + event.deltaY * unit);
    }
    schedule();
  }, { passive: false });
  window.addEventListener('scroll', () => {
    if (wheelTarget !== null) {
      if (lastWrittenY !== null && Math.abs(scrollY - lastWrittenY) > 2) return cancel();
      return; // Our own glide writes are not fresh user input.
    }
    if (!armed) return;
    const moved = scrollY - gestureY;
    // Follow a real slow reversal, not a single opposite-sign fractional tick.
    if (Math.abs(moved) >= 2) {
      direction = Math.sign(moved);
      gestureY = scrollY;
    }
    schedule();
  }, { passive: true });
  // All direct navigation wins over proximity alignment. Never capture keys/focus.
  for (const event of ['pointerdown', 'keydown', 'hashchange', 'resize', 'pagehide']) window.addEventListener(event, cancel, { passive: true });
  document.addEventListener('focusin', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  window.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') restoreNativeSnap();
  }, {passive:true});
  for (const type of ['resize', 'pagehide']) window.addEventListener(type, restoreNativeSnap, {passive:true});
  document.addEventListener('visibilitychange', () => { if (document.hidden) restoreNativeSnap(); });
  fine.addEventListener('change', () => { restoreNativeSnap(); cancel(); });
  desktop.addEventListener('change', () => { restoreNativeSnap(); cancel(); });
  reduced.addEventListener('change', cancel);
})();
