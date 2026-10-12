/* Native scrolling stays available without JS; buttons are a touch/keyboard aid. */
(() => {
  // Release desktop-only phrase groups, but never strand a preposition/article
  // at a mobile line ending. Keep exact source strings for desktop restoration.
  const mobile = matchMedia('(max-width: 980px)');
  const ru = document.documentElement.lang.startsWith('ru');
  const shortWords = ru
    ? 'в|во|с|со|к|ко|у|о|об|обо|от|до|из|за|на|по|под|над|при|про|для|без|и|а|но|не|ни|или'
    : 'a|an|the|in|on|at|to|of|for|by|with|and|or';
  const glue = new RegExp(`(^|[^\\p{L}\\p{N}_])(${shortWords})[ \t]+(?=\\S)`, 'giu');
  const mobileCopy = original => {
    let text = original.replaceAll('\u00a0', ' ');
    let previous;
    do {
      previous = text;
      text = text.replace(glue, '$1$2\u00a0');
    } while (text !== previous);
    return text;
  };
  const textNodes = new Map();
  document.querySelectorAll('.product-story--phenom :is(h1,h2,h3,p,li,dt,dd)').forEach(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue.trim()) textNodes.set(node, node.nodeValue);
    }
  });
  // Desktop line spans can split an article from its noun ("Meet the" /
  // "Phenom series"). Compose those headings as one text run on mobile.
  const lineHeadings = [...document.querySelectorAll('.product-story--phenom h2[aria-label]')]
    .filter(heading => !heading.classList.contains('section-title--lead') && heading.querySelector('.section-title__line'))
    .map(heading => ({ heading, children: [...heading.childNodes],
      mobileText: document.createTextNode(mobileCopy(heading.getAttribute('aria-label'))) }));
  const wrapCopy = () => {
    textNodes.forEach((original, node) => {
      node.nodeValue = mobile.matches ? mobileCopy(original) : original;
    });
    lineHeadings.forEach(({ heading, children, mobileText }) => {
      heading.replaceChildren(...(mobile.matches ? [mobileText] : children));
    });
  };
  mobile.addEventListener('change', wrapCopy);
  wrapCopy();
  const stages = [...document.querySelectorAll('.product-story--phenom .key-layout-model-stage')];
  const placeTabs = () => stages.forEach(stage => {
    const tabs = stage.querySelector('.key-layout-tabs');
    // Keep the desktop reading order on mobile as well: explanation and
    // diagram first, layer controls immediately after the visual.
    stage.append(tabs);
  });
  mobile.addEventListener('change', placeTabs);
  placeTabs();

  // All layer descriptions occupy the same space on mobile. Measure the
  // longest at the current width (including other models and translations),
  // so switching a layer never nudges the keyboard up or down.
  const layout = document.querySelector('.product-story--phenom .key-layout-chapter[data-key-layout]');
  const sizeLayerCopy = () => {
    if (!layout) return;
    if (!mobile.matches) {
      layout.style.removeProperty('--phenom-layout-copy-height');
      return;
    }
    const probe = document.createElement('div');
    probe.className = 'key-layout-layer';
    probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;display:block;width:${layout.querySelector('.key-layout-chapter__inner').clientWidth}px;min-height:0;padding:0;--phenom-layout-copy-height:0px`;
    layout.append(probe);
    let height = 0;
    layout.querySelectorAll('.key-layout-model-stage .key-layout-layer__copy').forEach(copy => {
      const sample = copy.cloneNode(true);
      probe.replaceChildren(sample);
      height = Math.max(height, sample.getBoundingClientRect().height);
    });
    probe.remove();
    layout.style.setProperty('--phenom-layout-copy-height', `${Math.ceil(height)}px`);
  };
  mobile.addEventListener('change', sizeLayerCopy);
  let copyResizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(copyResizeFrame);
    copyResizeFrame = requestAnimationFrame(sizeLayerCopy);
  });
  document.fonts?.ready.then(sizeLayerCopy);
  sizeLayerCopy();

  // Keep the desktop grid and no-JS mobile fallback fully visible. On mobile,
  // enhance the existing specification groups into a one-at-a-time accordion.
  const specs = document.querySelector('#phenom-specs .specs-chapter__groups');
  if (specs) {
    const groups = [...specs.querySelectorAll('.specs-chapter__group')];
    let openIndex = 0;
    const buttons = new Map();
    const renderSpecs = () => {
      if (!mobile.matches) {
        specs.classList.remove('specs-chapter__groups--accordion');
        groups.forEach(group => {
          const entry = buttons.get(group);
          if (entry) {
            group.querySelector('h3').replaceChildren(entry.titleNode);
            buttons.delete(group);
          }
          group.classList.remove('is-open');
        });
        return;
      }
      groups.forEach((group, index) => {
        const heading = group.querySelector('h3');
        let entry = buttons.get(group);
        if (!entry) {
          const titleNode = heading.firstChild;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'specs-chapter__toggle';
          button.textContent = heading.textContent;
          heading.replaceChildren(button);
          entry = {button, titleNode};
          buttons.set(group, entry);
          const list = group.querySelector('dl');
          list.id = `${group.querySelector('h3').id}-items`;
          button.setAttribute('aria-controls', list.id);
          button.addEventListener('click', () => {
            openIndex = openIndex === index ? -1 : index;
            renderSpecs();
          });
        }
        const expanded = index === openIndex;
        group.classList.toggle('is-open', expanded);
        entry.button.setAttribute('aria-expanded', String(expanded));
      });
      specs.classList.add('specs-chapter__groups--accordion');
    };
    mobile.addEventListener('change', renderSpecs);
    renderSpecs();
  }

  const gallery = document.querySelector('.product-story--phenom .series-gallery');
  if (!gallery) return;
  // Show the complete pair inline; inspect the same source vectors in a modal.
  const dialog = document.createElement('dialog');
  dialog.className = 'phenom-layout-zoom';
  dialog.setAttribute('aria-labelledby', 'phenom-zoom-title');
  dialog.innerHTML = `<header class="phenom-layout-zoom__header">
    <h2 id="phenom-zoom-title"></h2><button type="button" data-zoom-close>${ru ? 'Закрыть' : 'Close'} ×</button>
    </header><div class="phenom-layout-zoom__controls">
    <button type="button" data-zoom-minus aria-label="${ru ? 'Уменьшить' : 'Zoom out'}">−</button>
    <output aria-live="polite"></output>
    <button type="button" data-zoom-plus aria-label="${ru ? 'Увеличить' : 'Zoom in'}">+</button>
    <button type="button" data-zoom-fit>${ru ? 'Целиком' : 'Fit'}</button>
    </div><p class="phenom-layout-zoom__hint">${ru ? 'Перемещайте схему пальцем, чтобы рассмотреть клавиши.' : 'Pan the diagram to inspect the keys.'}</p>
    <div class="phenom-layout-zoom__viewport" tabindex="0" aria-label="${ru ? 'Увеличенная раскладка' : 'Enlarged layout'}"><div class="phenom-layout-zoom__pair" role="img"></div></div>`;
  document.body.append(dialog);
  const viewport = dialog.querySelector('.phenom-layout-zoom__viewport');
  const pair = dialog.querySelector('.phenom-layout-zoom__pair');
  let zoom = 2;
  let fitting = false;
  let opener;
  let overflowBefore;
  const centerViewport = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    viewport.scrollTo({
      left: Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2),
      top: Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2),
      behavior: 'instant'
    });
  }));
  const centerWhenReady = () => {
    const images = [...pair.querySelectorAll('img')];
    Promise.all(images.map(image => image.complete
      ? Promise.resolve()
      : new Promise(resolve => {
          image.addEventListener('load', resolve, {once: true});
          image.addEventListener('error', resolve, {once: true});
        })))
      .then(() => { renderZoom(); centerViewport(); });
  };
  const fitZoom = () => {
    const images = [...pair.querySelectorAll('img')];
    if (!viewport.clientWidth || !images.length || images.some(image => !image.naturalWidth)) return 1;
    const style = getComputedStyle(pair);
    const horizontalSpace = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.columnGap);
    const verticalSpace = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const ratio = Math.max(...images.map(image => image.naturalHeight / image.naturalWidth));
    // Padding and the grid gap do not scale with the SVGs. Reserve that space
    // before fitting the tallest half into the available height.
    const widthForHeight = 2 * Math.max(0, viewport.clientHeight - verticalSpace) / ratio + horizontalSpace;
    return Math.min(1, widthForHeight / viewport.clientWidth);
  };
  const renderZoom = () => {
    const minimum = fitZoom();
    zoom = fitting ? minimum : Math.max(minimum, zoom);
    pair.style.width = `${zoom * 100}%`;
    dialog.querySelector('output').textContent = `${Math.round(zoom * 100)}%`;
    dialog.querySelector('[data-zoom-minus]').disabled = zoom <= minimum;
    dialog.querySelector('[data-zoom-plus]').disabled = zoom >= 4;
  };
  dialog.querySelector('[data-zoom-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-zoom-minus]').addEventListener('click', () => {
    zoom = Math.max(fitZoom(), zoom - 0.5); fitting = zoom <= fitZoom(); renderZoom();
  });
  dialog.querySelector('[data-zoom-plus]').addEventListener('click', () => { fitting = false; zoom = Math.min(4, zoom + 0.5); renderZoom(); });
  dialog.querySelector('[data-zoom-fit]').addEventListener('click', () => { fitting = true; renderZoom(); centerViewport(); });
  new ResizeObserver(() => {
    if (!dialog.open) return;
    renderZoom();
    if (fitting) centerViewport();
  }).observe(viewport);
  dialog.addEventListener('close', () => { document.body.style.overflow = overflowBefore; opener?.focus({preventScroll: true}); });
  mobile.addEventListener('change', () => { if (!mobile.matches && dialog.open) dialog.close(); });
  document.querySelectorAll('.product-story--phenom .key-layout-layer').forEach(panel => {
    const diagram = panel.querySelector('.key-layout-diagram');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'phenom-mobile-only phenom-layout-open';
    button.textContent = ru ? 'Рассмотреть раскладку ↗' : 'Enlarge layout ↗';
    button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', () => {
      opener = button;
      const model = panel.closest('.key-layout-model-stage').dataset.keyLayoutModelView;
      dialog.querySelector('h2').textContent = `${model[0].toUpperCase() + model.slice(1)} · ${panel.querySelector('h3').textContent}`;
      pair.replaceChildren(...[...diagram.querySelectorAll('img')].filter(img => getComputedStyle(img).display !== 'none').map(img => {
        const copy = img.cloneNode(); copy.className = 'phenom-layout-zoom__half'; copy.loading = 'eager';
        copy.removeAttribute('aria-hidden'); return copy;
      }));
      pair.setAttribute('aria-label', diagram.getAttribute('aria-label'));
      fitting = false; zoom = 2; renderZoom();
      overflowBefore = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.showModal();
      centerWhenReady();
    });
    diagram.after(button);
  });

})();
