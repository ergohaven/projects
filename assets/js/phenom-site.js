(() => {
  'use strict';

  // A full-height desktop canvas has no useful inner viewport. Project its
  // resource bounds into the same-origin outer reading window instead.
  const readingWatchers = new Set();
  let readingFrame = 0;
  const checkReadingWindows = () => {
    readingFrame = 0;
    const frame = window.frameElement;
    if (!frame?.isConnected || !frame.style.transform) return;
    const bounds = frame.getBoundingClientRect();
    const scale = bounds.width / innerWidth;
    if (!(scale > 0)) return;
    const viewport = parent.visualViewport;
    const top = viewport?.offsetTop || 0;
    const height = viewport?.height || parent.innerHeight;
    readingWatchers.forEach(watcher => {
      const rect = watcher.element.getBoundingClientRect();
      const start = bounds.top + rect.top * scale;
      const end = bounds.top + rect.bottom * scale;
      const margin = height * watcher.margin;
      const overlap = Math.max(0, Math.min(end, top + height) - Math.max(start, top));
      const visible = end > top - margin && start < top + height + margin
        && (!watcher.threshold || overlap / Math.max(1, rect.height * scale) >= watcher.threshold);
      if (visible !== watcher.visible) {
        watcher.visible = visible;
        watcher.change(visible);
      }
      if (visible && watcher.once) readingWatchers.delete(watcher);
    });
  };
  const scheduleReadingWindows = () => {
    if (!readingFrame) readingFrame = parent.requestAnimationFrame(checkReadingWindows);
  };
  const observeReadingWindow = (element, margin, threshold, change, once = false) => {
    if (window.__phenomDesktopCanvas && window.frameElement) {
      if (!readingWatchers.size) {
        // Shared scheduling is idle between outer scroll/resize/layout changes.
        parent.addEventListener('scroll', scheduleReadingWindows, { passive: true });
        parent.addEventListener('resize', scheduleReadingWindows, { passive: true });
        parent.visualViewport?.addEventListener('resize', scheduleReadingWindows, { passive: true });
        parent.visualViewport?.addEventListener('scroll', scheduleReadingWindows, { passive: true });
        new ResizeObserver(scheduleReadingWindows).observe(document.body);
        new MutationObserver(scheduleReadingWindows).observe(window.frameElement, { attributes: true, attributeFilter: ['style'] });
      }
      readingWatchers.add({ element, margin, threshold, change, once, visible: false });
      scheduleReadingWindows();
    } else if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const visible = entry.isIntersecting && entry.intersectionRatio >= threshold;
          change(visible);
          if (visible && once) observer.disconnect();
        });
      }, { rootMargin: `${Math.round(innerHeight * margin)}px 0px`, threshold: threshold ? [0, threshold, 0.5] : 0 });
      observer.observe(element);
    } else {
      // Preserve the native no-IO fail-open behavior.
      change(true);
    }
  };

(() => {
  'use strict';

  const root = document.documentElement;
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  const themeVideoGroups = Array.from(document.querySelectorAll('[data-theme-video-group]'));
  const themeVideoPauseTimers = new WeakMap();
  const themeVideoLoadPromises = new WeakMap();
  const themeVideoStates = new WeakMap();

  const stateFor = (group) => {
    if (!themeVideoStates.has(group)) {
      themeVideoStates.set(group, {
        nearViewport: false,
        visible: false,
        revision: 0,
        theme: root.dataset.theme,
      });
    }
    return themeVideoStates.get(group);
  };

  const sourceFor = (video) => video.querySelector('source');

  const releaseVideo = (video) => {
    video.pause();
    const source = sourceFor(video);
    if (!source?.hasAttribute('src')) return;
    source.removeAttribute('src');
    themeVideoLoadPromises.delete(video);
    video.load();
  };

  const loadVideo = (video) => {
    const source = sourceFor(video);
    if (!source?.dataset.src) return Promise.resolve();
    if (source.hasAttribute('src')) {
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
      if (themeVideoLoadPromises.has(video)) return themeVideoLoadPromises.get(video);
    }

    const pending = new Promise((resolve) => {
      const settle = () => {
        video.removeEventListener('loadedmetadata', settle);
        video.removeEventListener('error', settle);
        themeVideoLoadPromises.delete(video);
        resolve();
      };
      video.addEventListener('loadedmetadata', settle, { once: true });
      video.addEventListener('error', settle, { once: true });
      source.setAttribute('src', source.dataset.src);
      video.load();
    });
    themeVideoLoadPromises.set(video, pending);
    return pending;
  };

  const syncThemeVideoGroup = (group, theme, crossfade = false) => {
    const state = stateFor(group);
    const revision = ++state.revision;
    state.theme = theme;
    const videos = Array.from(group.querySelectorAll('[data-theme-video]'));
    const active = videos.find((video) => video.dataset.themeVideo === theme);
    const outgoing = videos.find((video) => video !== active);
    if (!active) return;

    const previousTimer = themeVideoPauseTimers.get(group);
    if (previousTimer) window.clearTimeout(previousTimer);

    // Keep the selected poster inert until the demo approaches the reading window.
    if (state.nearViewport && active.dataset.poster && !active.hasAttribute('poster')) active.poster = active.dataset.poster;
    active.setAttribute('aria-hidden', 'false');
    videos.filter((video) => video !== active).forEach((video) => {
      video.setAttribute('aria-hidden', 'true');
      video.pause();
    });

    // The Entropy demo intentionally loops even with reduced motion. Other
    // page transitions retain their motion preference; hidden media is idle.
    if (!state.nearViewport || document.hidden) {
      videos.forEach(releaseVideo);
      return;
    }

    const outgoingProgress = outgoing
      && Number.isFinite(outgoing.duration)
      && outgoing.duration > 0
      ? outgoing.currentTime / outgoing.duration
      : null;

    loadVideo(active).then(() => {
      if (state.revision !== revision || state.theme !== theme) return;
      if (
        crossfade
        && outgoingProgress !== null
        && Number.isFinite(active.duration)
        && active.duration > 0
      ) {
        active.currentTime = outgoingProgress * active.duration;
      }
      if (state.visible && !document.hidden) {
        // Muted inline playback normally needs no gesture. If browser policy
        // rejects it, retain the original poster without introducing controls.
        if (active.paused) active.play().catch(() => {});
      } else {
        active.pause();
      }
    });

    const releaseInactive = () => {
      const currentTheme = stateFor(group).theme;
      videos
        .filter((video) => video.dataset.themeVideo !== currentTheme)
        .forEach(releaseVideo);
    };
    if (crossfade) {
      themeVideoPauseTimers.set(group, window.setTimeout(releaseInactive, 320));
    } else {
      releaseInactive();
    }
  };

  const syncThemeVideos = (theme, crossfade = false) => {
    themeVideoGroups.forEach((group) => syncThemeVideoGroup(group, theme, crossfade));
  };

  const refreshThemeVideos = () => {
    themeVideoGroups.forEach((group) => {
      syncThemeVideoGroup(group, stateFor(group).theme);
    });
  };

  themeVideoGroups.forEach((group) => {
    observeReadingWindow(group, 0.75, 0, (near) => {
      const state = stateFor(group);
      state.nearViewport = near;
      if (!near) state.visible = false;
      syncThemeVideoGroup(group, state.theme);
    });
    observeReadingWindow(group, 0, 0.12, (visible) => {
      const state = stateFor(group);
      state.visible = visible;
      syncThemeVideoGroup(group, state.theme);
    });
  });

  const setTheme = (theme) => {
    const changed = root.dataset.theme !== theme;
    root.dataset.theme = theme;
    syncThemeVideos(theme, changed);
  };

  setTheme(preference.matches ? 'dark' : 'light');
  preference.addEventListener?.('change', (event) => {
    setTheme(event.matches ? 'dark' : 'light');
  });
  document.addEventListener('visibilitychange', refreshThemeVideos);
})();

(() => {
  'use strict';

  const scrollCue = document.querySelector('[data-phenom-scroll-cue]');
  const backToTop = document.querySelector('[data-phenom-back-to-top]');
  if (!scrollCue && !backToTop) return;

  const reducedMotion = ({matches:false, addEventListener(){}, removeEventListener(){}});
  let frame = 0;

  const cueGraphic = scrollCue?.querySelector('svg');
  if (cueGraphic && 'IntersectionObserver' in window) {
    // Intersection clipping includes the outer viewport of the desktop iframe.
    // No extra scroll handler or idle animation frame is needed for the cue.
    const cueObserver = new IntersectionObserver(([entry]) => {
      cueGraphic.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
    });
    cueObserver.observe(scrollCue);
  }

  const scrollBehavior = () => reducedMotion.matches ? 'auto' : 'smooth';

  scrollCue?.addEventListener('click', (event) => {
    const target = document.querySelector(scrollCue.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  });

  backToTop?.addEventListener('click', (event) => {
    const target = document.querySelector(backToTop.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    // Move the sequential keyboard starting point before this link is hidden.
    // Keep the top target out of the normal tab order and restore its markup.
    if (!target.hasAttribute('tabindex')) {
      target.tabIndex = -1;
      target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    }
    target.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  });

  let backToTopVisible;
  const updateBackToTop = () => {
    frame = 0;
    if (!backToTop) return;
    const scrollableHeight = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    const revealAfter = scrollableHeight / 3;
    const visible = window.scrollY > revealAfter;
    if (visible === backToTopVisible) return;
    backToTopVisible = visible;
    backToTop.classList.toggle('is-visible', visible);
    backToTop.setAttribute('aria-hidden', String(!visible));
    backToTop.tabIndex = visible ? 0 : -1;
  };

  const requestUpdate = () => {
    if (!frame) frame = window.requestAnimationFrame(updateBackToTop);
  };

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
  updateBackToTop();
})();

(() => {
  'use strict';

  const reducedMotion = ({matches:false, addEventListener(){}, removeEventListener(){}});
  const transitionStates = new WeakMap();

  const settleLayoutTransition = (container, state, visible) => {
    state.animations.forEach((animation) => animation.cancel());
    state.items.forEach((item) => {
      item.hidden = item !== visible;
      item.classList.remove('is-layout-entering', 'is-layout-leaving');
      item.removeAttribute('aria-hidden');
    });
    container.classList.remove('is-layout-transitioning');
    transitionStates.delete(container);
  };

  const commitLayoutView = (container, items, target) => {
    const interrupted = transitionStates.get(container);
    const current = interrupted?.target || items.find((item) => !item.hidden);

    if (interrupted) settleLayoutTransition(container, interrupted, current);
    if (current === target) return;

    if (
      !current
      || reducedMotion.matches
      || typeof current.animate !== 'function'
      || !document.body.classList.contains('product-page--phenom')
    ) {
      items.forEach((item) => { item.hidden = item !== target; });
      return;
    }

    target.hidden = false;
    current.setAttribute('aria-hidden', 'true');
    target.setAttribute('aria-hidden', 'false');
    current.classList.add('is-layout-leaving');
    target.classList.add('is-layout-entering');
    container.classList.add('is-layout-transitioning');

    const animations = [
      current.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 90, easing: 'ease-out', fill: 'forwards' }
      ),
      target.animate(
        [{ opacity: 0.72 }, { opacity: 1 }],
        { duration: 140, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' }
      )
    ];
    const state = { animations, items, target };
    transitionStates.set(container, state);

    Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (transitionStates.get(container) === state) {
        settleLayoutTransition(container, state, target);
      }
    });
  };

  // Load only the selected diagram on every Phenom route; keep its theme pair
  // ready and preserve the painted view while a requested replacement decodes.
  const selectiveLayoutLoading = () => document.body.classList.contains('product-page--phenom');
  const decodedLayoutImages = new WeakSet();
  const layoutImageLoads = new WeakMap();
  const pendingLayoutViews = new WeakMap();
  const layoutImages = (root) => [...root.querySelectorAll('.key-layout-diagram img')].filter(image => {
    for (let node = image.parentElement; node && node !== root; node = node.parentElement) {
      if (node.hidden) return false;
    }
    return true;
  });
  const prewarmLayoutImages = (root) => {
    if (!selectiveLayoutLoading()) {
      root.querySelectorAll('.key-layout-diagram img').forEach(image => {
        image.loading = 'eager';
        image.decode?.().catch(() => {});
      });
      return Promise.resolve();
    }
    return Promise.all(layoutImages(root).map(image => {
      if (decodedLayoutImages.has(image)) return Promise.resolve();
      if (layoutImageLoads.has(image)) return layoutImageLoads.get(image);
      image.loading = 'eager';
      if (image.dataset.layoutSrc) image.src = image.dataset.layoutSrc;
      const load = typeof image.decode === 'function' ? image.decode() : new Promise((resolve, reject) => {
        const cleanup = () => {
          image.removeEventListener('load', loaded);
          image.removeEventListener('error', failed);
        };
        const loaded = () => {
          cleanup();
          if (image.naturalWidth > 0) resolve();
          else reject(new Error('Layout image has no pixels'));
        };
        const failed = () => { cleanup(); reject(new Error('Layout image failed to load')); };
        image.addEventListener('load', loaded, { once: true });
        image.addEventListener('error', failed, { once: true });
        if (image.complete) loaded();
      });
      const settled = load.then(() => { decodedLayoutImages.add(image); }, () => {}).finally(() => { layoutImageLoads.delete(image); });
      layoutImageLoads.set(image, settled);
      return settled;
    }));
  };
  const switchLayoutView = (container, items, target) => {
    const previous = pendingLayoutViews.get(container);
    if (previous) { clearTimeout(previous.timer); pendingLayoutViews.delete(container); }
    container.removeAttribute('aria-busy');
    if (!selectiveLayoutLoading() || layoutImages(target).every(image => decodedLayoutImages.has(image))) {
      commitLayoutView(container, items, target);
      return;
    }
    const request = { timer: 0 };
    pendingLayoutViews.set(container, request);
    container.setAttribute('aria-busy', 'true');
    const show = () => {
      if (pendingLayoutViews.get(container) !== request) return;
      clearTimeout(request.timer);
      pendingLayoutViews.delete(container);
      container.removeAttribute('aria-busy');
      commitLayoutView(container, items, target);
    };
    // Keep the painted view while its replacement loads. A late promise must
    // never override a newer model/tab choice; failures cannot leave busy stuck.
    request.timer = setTimeout(show, 4000);
    prewarmLayoutImages(target).then(show, show);
  };

  document.querySelectorAll('[data-key-layout]').forEach((root) => {
    const modelControls = Array.from(
      root.querySelectorAll('[data-key-layout-model-control]')
    );
    const modelStages = Array.from(root.querySelectorAll('[data-key-layout-model-view]'));

    const activateLayer = (stage, tab, moveFocus = false) => {
      const target = tab.dataset.keyLayoutLayerTarget;
      const tabs = Array.from(stage.querySelectorAll('[data-key-layout-layer-target]'));
      const panels = Array.from(stage.querySelectorAll('[data-key-layout-layer-panel]'));

      tabs.forEach((candidate) => {
        const active = candidate === tab;
        candidate.classList.toggle('is-active', active);
        candidate.setAttribute('aria-selected', String(active));
        candidate.tabIndex = active ? 0 : -1;
      });

      const targetPanel = panels.find((panel) => panel.dataset.keyLayoutLayerPanel === target);
      if (targetPanel) switchLayoutView(stage.querySelector('.key-layout-panels'), panels, targetPanel);

      tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (moveFocus) tab.focus();
    };

    const activateModel = (control) => {
      const target = control.dataset.keyLayoutModelControl;
      const targetStage = modelStages.find((stage) => stage.dataset.keyLayoutModelView === target);
      const stageContainer = root.querySelector('.key-layout-model-stages');
      if (stageContainer && targetStage) switchLayoutView(stageContainer, modelStages, targetStage);
    };

    if (selectiveLayoutLoading()) {
      observeReadingWindow(root, 1, 0, (near) => {
        if (near) prewarmLayoutImages(root);
      }, true);
    }

    modelControls.forEach((control) => {
      const warmModel = () => {
        if (!selectiveLayoutLoading()) return;
        const stage = modelStages.find(item => item.dataset.keyLayoutModelView === control.dataset.keyLayoutModelControl);
        if (stage) prewarmLayoutImages(stage);
      };
      control.addEventListener('focus', warmModel);
      root.querySelector(`label[for="${control.id}"]`)?.addEventListener('pointerenter', warmModel);
      control.addEventListener('change', () => {
        if (control.checked) activateModel(control);
      });
    });

    modelStages.forEach((stage) => {
      const tabs = Array.from(stage.querySelectorAll('[data-key-layout-layer-target]'));

      tabs.forEach((tab, index) => {
        const warmLayer = () => {
          if (!selectiveLayoutLoading()) return;
          const panel = stage.querySelector(`[data-key-layout-layer-panel="${tab.dataset.keyLayoutLayerTarget}"]`);
          if (panel) prewarmLayoutImages(panel);
        };
        tab.addEventListener('pointerenter', warmLayer);
        tab.addEventListener('focus', warmLayer);
        tab.addEventListener('click', () => activateLayer(stage, tab));
        tab.addEventListener('keydown', (event) => {
          let nextIndex = null;

          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            nextIndex = (index + 1) % tabs.length;
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            nextIndex = (index - 1 + tabs.length) % tabs.length;
          } else if (event.key === 'Home') {
            nextIndex = 0;
          } else if (event.key === 'End') {
            nextIndex = tabs.length - 1;
          }

          if (nextIndex === null) return;
          event.preventDefault();
          activateLayer(stage, tabs[nextIndex], true);
        });
      });
    });
  });
  // Chapter 07 remains the positioning reference, including its intrinsic width.
  const fingerCopy = document.querySelector('#phenom-finger-geometry .visual-chapter__copy');
  const keycapsTitle = document.querySelector('#phenom-keycaps-switches h2');
  if (fingerCopy && keycapsTitle) {
    const alignFingerCopy = () => {
      const reference = keycapsTitle.getBoundingClientRect();
      const gutter = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.25;
      fingerCopy.style.setProperty('--photo-copy-width', `${reference.width}px`);
      fingerCopy.style.setProperty('--photo-heading-room', `${Math.max(reference.width, window.innerWidth - reference.left - gutter)}px`);
    };
    const copyObserver = new ResizeObserver(alignFingerCopy);
    copyObserver.observe(keycapsTitle);
    window.addEventListener('resize', alignFingerCopy, { passive: true });
    document.fonts.ready.then(alignFingerCopy);
    alignFingerCopy();
  }
})();
})();
