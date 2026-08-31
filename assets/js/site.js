(() => {
  'use strict';

  const root = document.documentElement;
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const preference = window.matchMedia('(prefers-color-scheme: dark)');

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

  const setTheme = (theme, persist = false) => {
    root.dataset.theme = theme;
    updateThemeButton();
    if (!persist) return;
    try {
      localStorage.setItem('ergohaven-projects-theme', theme);
    } catch (_) {
      // Theme switching still works when storage is unavailable.
    }
  };

  updateThemeButton();
  themeToggle?.addEventListener('click', () => {
    setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
  });
  preference.addEventListener?.('change', (event) => {
    if (!storedTheme()) setTheme(event.matches ? 'dark' : 'light');
  });
})();

(() => {
  'use strict';

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

      panels.forEach((panel) => {
        panel.hidden = panel.dataset.keyLayoutLayerPanel !== target;
      });

      tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (moveFocus) tab.focus();
    };

    const activateModel = (control) => {
      const target = control.dataset.keyLayoutModelControl;

      modelStages.forEach((stage) => {
        stage.hidden = stage.dataset.keyLayoutModelView !== target;
      });
    };

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
})();
