(() => {
  'use strict';

  const root = document.documentElement;
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  const themeVideoGroups = Array.from(document.querySelectorAll('[data-theme-video-group]'));
  const themeVideoPauseTimers = new WeakMap();
  const themeVideoLoadPromises = new WeakMap();
  const themeVideoStates = new WeakMap();

  const storedTheme = () => {
    try {
      const value = localStorage.getItem('ergohaven-projects-theme');
      return value === 'light' || value === 'dark' ? value : null;
    } catch (_) {
      return null;
    }
  };

  const updateThemeButton = () => {
    if (!themeToggle) return;
    const isDark = root.dataset.theme === 'dark';
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.setAttribute(
      'aria-label',
      isDark ? themeToggle.dataset.labelLight : themeToggle.dataset.labelDark
    );
  };

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

  if ('IntersectionObserver' in window) {
    const loadObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const state = stateFor(entry.target);
        state.nearViewport = entry.isIntersecting;
        if (!entry.isIntersecting) state.visible = false;
        syncThemeVideoGroup(entry.target, state.theme);
      });
    }, { rootMargin: '75% 0px' });

    const playbackObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const state = stateFor(entry.target);
        state.visible = entry.isIntersecting && entry.intersectionRatio >= 0.12;
        syncThemeVideoGroup(entry.target, state.theme);
      });
    }, { threshold: [0, 0.12, 0.5] });

    themeVideoGroups.forEach((group) => {
      loadObserver.observe(group);
      playbackObserver.observe(group);
    });
  } else {
    themeVideoGroups.forEach((group) => {
      const state = stateFor(group);
      state.nearViewport = true;
      state.visible = true;
    });
  }

  const setTheme = (theme, persist = false) => {
    const changed = root.dataset.theme !== theme;
    root.dataset.theme = theme;
    syncThemeVideos(theme, changed);
    updateThemeButton();
    if (!persist) return;
    try {
      localStorage.setItem('ergohaven-projects-theme', theme);
    } catch (_) {
      // Theme switching still works when storage is unavailable.
    }
  };

  updateThemeButton();
  syncThemeVideos(root.dataset.theme);
  themeToggle?.addEventListener('click', () => {
    setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
  });
  preference.addEventListener?.('change', (event) => {
    if (!storedTheme()) setTheme(event.matches ? 'dark' : 'light');
  });
  document.addEventListener('visibilitychange', refreshThemeVideos);
})();

(() => {
  'use strict';

  const scrollCue = document.querySelector('[data-phenom-scroll-cue]');
  const backToTop = document.querySelector('[data-phenom-back-to-top]');
  if (!scrollCue && !backToTop) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;

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

  const updateBackToTop = () => {
    frame = 0;
    if (!backToTop) return;
    const scrollableHeight = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    const revealAfter = scrollableHeight / 3;
    const visible = window.scrollY > revealAfter;
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

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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

  const switchLayoutView = (container, items, target) => {
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

  const prewarmLayoutImages = (root) => {
    root.querySelectorAll('.key-layout-diagram img').forEach((image) => {
      image.loading = 'eager';
      image.decode?.().catch(() => {});
    });
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

    if (
      document.body.classList.contains('product-page--phenom')
      && 'IntersectionObserver' in window
    ) {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        prewarmLayoutImages(root);
        observer.disconnect();
      }, { rootMargin: '100% 0px' });
      observer.observe(root);
    } else if (document.body.classList.contains('product-page--phenom')) {
      prewarmLayoutImages(root);
    }

    modelControls.forEach((control) => {
      control.addEventListener('change', () => {
        if (control.checked) activateModel(control);
      });
    });

    modelStages.forEach((stage) => {
      const tabs = Array.from(stage.querySelectorAll('[data-key-layout-layer-target]'));

      tabs.forEach((tab, index) => {
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
