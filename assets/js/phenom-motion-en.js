/* Phenom motion24: gentler entry; preserve decoding and the reading gate. */
(() => {
  'use strict';
  const story = document.querySelector('.product-story--phenom');
  if (!story || !('IntersectionObserver' in window) || typeof Element.prototype.animate !== 'function') return;
  const reduced = ({matches:false, addEventListener(){}, removeEventListener(){}});
  if (reduced.matches || document.hidden) return;

  const canvas = window.__phenomDesktopCanvas && window.parent !== window;
  const scrollHost = canvas ? window.parent : window;
  const visible = new Set();
  let checkFrame = 0;
  const pending = new Set();
  const active = new Map();
  const photoJobs = new Map();
  const readyPhotos = new WeakSet();
  const desktopPhotoPreference = matchMedia('(min-width: 981px) and (hover: hover) and (pointer: fine)');
  const desktopPhotoLoading = () => !canvas && desktopPhotoPreference.matches;
  const photoDecodes = new WeakMap();
  let preparedAhead = null;
  let observer;
  const media = '.visual-chapter__media, .product-stage, .series-card__visual, .detail-sequence__item, .key-layout-model-stages';
  const selectors = [
    '.product-hero__copy > h1', '.product-hero__intro', '.product-stage',
    '.series-showcase__intro > h2', '.series-showcase__intro > p',
    '.series-card__visual', '.series-card__caption', '.series-card__mobile-heading',
    '.visual-chapter__media', '.visual-chapter__copy > h2', '.visual-chapter__copy > p', '.visual-chapter__action',
    '.key-layout-chapter__intro > h2', '.key-layout-chapter__intro > p', '.key-layout-model-stages',
    '.detail-sequence__intro h2', '.detail-sequence__intro > p', '.detail-sequence__item',
    '.specs-chapter__header h2', '.specs-chapter__header > p', '.specs-chapter__group'
  ].join(',');

  const release = (element) => {
    if (preparedAhead === element) preparedAhead = null;
    photoDecodes.delete(element);
    photoJobs.get(element)?.();
    photoJobs.delete(element);
    pending.delete(element);
    visible.delete(element);
    element.removeAttribute('data-phenom-reveal-pending');
    observer?.unobserve(element);
  };
  const settle = () => {
    cancelAnimationFrame(checkFrame);
    checkFrame = 0;
    scrollHost.removeEventListener('scroll', scheduleCheck);
    scrollHost.removeEventListener('resize', resizeCheck);
    if (canvas) window.removeEventListener('resize', resizeCheck);
    pending.forEach(release);
    active.forEach(animation => animation.cancel());
    active.clear();
    observer?.disconnect();
  };
  const measure = document.createElement('canvas').getContext('2d');
  let riseKey = 0;
  const riseLines = (element) => {
    if (!measure || !element.matches('h1,h2,p,.series-card__mobile-heading')) return null;
    const box = element.getBoundingClientRect();
    const range = document.createRange();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const rows = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      const style = getComputedStyle(node.parentElement);
      measure.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const ink = measure.measureText(node.textContent);
      if (!Number.isFinite(ink.fontBoundingBoxAscent)) return null;
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue;
        const top = rect.top + ink.fontBoundingBoxAscent - ink.actualBoundingBoxAscent;
        const bottom = rect.top + ink.fontBoundingBoxAscent + ink.actualBoundingBoxDescent;
        let row = rows.find(item => Math.min(item.rawBottom, rect.bottom) - Math.max(item.rawTop, rect.top) > Math.min(item.rawBottom - item.rawTop, rect.height) * 0.5);
        if (!row) rows.push({ rawTop: rect.top, rawBottom: rect.bottom, top, bottom, left: rect.left, right: rect.right });
        else {
          row.rawTop = Math.min(row.rawTop, rect.top); row.rawBottom = Math.max(row.rawBottom, rect.bottom);
          row.top = Math.min(row.top, top); row.bottom = Math.max(row.bottom, bottom);
          row.left = Math.min(row.left, rect.left); row.right = Math.max(row.right, rect.right);
        }
      }
    }
    if (!rows.length) return null;
    rows.sort((a, b) => a.top - b.top);
    if (rows.some((row, i) => i && row.top < rows[i - 1].bottom)) return null;

    // Snapshot styles once, before writes. Temporary, inert visual copies keep
    // the original DOM, line wrapping, accessibility and layout untouched.
    // Copy only the text/layout contract, not ~477 computed properties per node.
    // Explicit values keep the body-mounted inert copy independent of selectors.
    const properties = ('display position box-sizing width height min-width max-width margin padding border font-family font-size font-weight font-style font-stretch font-variant font-feature-settings font-variation-settings font-kerning font-optical-sizing line-height letter-spacing word-spacing color text-align text-align-last text-indent text-transform text-decoration text-wrap white-space word-break overflow-wrap hyphens direction writing-mode vertical-align visibility -webkit-text-size-adjust text-rendering').split(' ');
    const css = style => properties.map(name => `${name}:${style.getPropertyValue(name)} !important;`).join('');
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 0;
    const pseudo = (node, kind) => {
      const style = getComputedStyle(node, kind);
      if (style.display === 'none' || !style.content.startsWith('"')) return null;
      try { const text = JSON.parse(style.content); return text ? { text, css: css(style) } : null; } catch (_) { return null; }
    };
    const originals = [element, ...element.querySelectorAll('*')];
    const styles = originals.map(node => ({ css: css(getComputedStyle(node)), before: pseudo(node, '::before'), after: pseudo(node, '::after') }));
    const base = element.cloneNode(true);
    const copies = [base, ...base.querySelectorAll('*')];
    copies.forEach((node, index) => {
      [...node.attributes].forEach(attribute => node.removeAttribute(attribute.name));
      node.style.cssText = styles[index].css;
      node.style.setProperty('animation', 'none', 'important');
      node.style.setProperty('transition', 'none', 'important');
      for (const [side, content] of [['before', styles[index].before], ['after', styles[index].after]]) {
        if (!content) continue;
        const span = document.createElement('span'); span.style.cssText = content.css; span.textContent = content.text;
        if (side === 'before') node.prepend(span); else node.append(span);
      }
    });
    const set = (node, values) => Object.entries(values).forEach(([name, value]) => node.style.setProperty(name, value, 'important'));
    set(base, { position: 'absolute', margin: '0', width: `${box.width}px`, height: `${box.height}px`, transform: 'none', translate: 'none', rotate: 'none', scale: 'none', opacity: '1', 'pointer-events': 'none' });
    const key = String(++riseKey);
    const layer = document.createElement('div');
    layer.dataset.phenomRiseLayer = key;
    layer.setAttribute('aria-hidden', 'true'); layer.inert = true;
    set(layer, { position: 'absolute', left: `${box.left + scrollX}px`, top: `${box.top + scrollY}px`, width: `${box.width}px`, height: `${box.height}px`, 'pointer-events': 'none', 'z-index': '5', overflow: 'visible' });
    const left = Math.min(-3, ...rows.map(row => row.left - box.left - 3));
    // The ink allowance may exceed the text box, but its temporary line masks
    // must not exceed the document's layout scrollport. A full-width mobile
    // paragraph otherwise adds 3px of empty mask geometry to scrollWidth,
    // expanding the effective viewport while its reveal is in flight. Keep
    // legitimate ink outside narrower heading boxes everywhere still visible.
    const right = Math.min(document.documentElement.clientWidth - box.left - scrollX,
      Math.max(box.width + 3, ...rows.map(row => row.right - box.left + 3)));
    const edges = [Math.min(-3, rows[0].top - box.top - 3), ...rows.slice(1).map((row, i) => (rows[i].bottom + row.top) / 2 - box.top), Math.max(box.height + 3, rows.at(-1).bottom - box.top + 3)];
    const step = Math.min(80, 200 / Math.max(1, rows.length - 1));
    const duration = 680;
    const movers = [];
    const children = [];
    let timeline;
    const cancel = () => {
      children.forEach(animation => animation.cancel());
      layer.remove();
      timeline?.cancel();
      element.removeAttribute('data-phenom-rise-key');
    };
    try {
      rows.forEach((row, index) => {
        const clip = document.createElement('div');
        set(clip, { position: 'absolute', left: `${left}px`, top: `${edges[index]}px`, width: `${right - left}px`, height: `${edges[index + 1] - edges[index]}px`, overflow: 'hidden', 'pointer-events': 'none' });
        const mover = document.createElement('div'); mover.dataset.phenomRiseMover = '';
        set(mover, { position: 'absolute', inset: '0', 'pointer-events': 'none' });
        const copy = base.cloneNode(true);
        set(copy, { left: `${-left}px`, top: `${-edges[index]}px`, 'clip-path': `polygon(${left}px ${edges[index]}px, ${right}px ${edges[index]}px, ${right}px ${edges[index + 1]}px, ${left}px ${edges[index + 1]}px)` });
        mover.append(copy); clip.append(mover); layer.append(clip);
        movers.push({ mover, distance: Math.max(lineHeight, edges[index + 1] - edges[index]) + 3, index });
      });
      timeline = element.animate([{ opacity: 0 }, { opacity: 0 }], { duration: duration + step * (rows.length - 1), fill: 'both' });
      document.body.append(layer);
      element.dataset.phenomRiseKey = key;
      movers.forEach(({ mover, distance, index }) => children.push(mover.animate([
        { transform: `translateY(${distance}px)` }, { transform: 'translateY(0px)' }
      ], { duration, delay: index * step, easing: 'cubic-bezier(0.25, 0.65, 0.3, 1)', fill: 'both' })));
      return { finished: timeline.finished, cancel };
    } catch (error) { cancel(); throw error; }
  };

  // headings81: the tag's 1s / 20Hz scramble, once at the existing reading gate.
  // Keep accessible authored text and proportional line layout untouched. Only
  // temporary, inert glyph cells change; their measured positions cannot reflow.
  const scrambleHeading = element => {
    if (!measure) return null;
    const fittedGlyphs = element.id === "phenom-format-word" || element.id === "key-layout-title";
    const box = element.getBoundingClientRect();
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+-=?/';
    const cells = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const style = getComputedStyle(node.parentElement);
      const font = ['font-family', 'font-size', 'font-weight', 'font-style',
        'font-stretch', 'font-feature-settings', 'font-variation-settings',
        'text-transform', 'color'].map(name => `${name}:${style.getPropertyValue(name)};`).join('');
      measure.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const alphabet = [...glyphs].map(char => ({char, width:measure.measureText(char).width}));
      const narrowest = alphabet.reduce((a, b) => a.width < b.width ? a : b);
      let offset = 0;
      for (const char of node.textContent) {
        range.setStart(node, offset); offset += char.length; range.setEnd(node, offset);
        if (/\s/u.test(char)) continue;
        const rect = range.getBoundingClientRect();
        if (rect.width && rect.height) {
          const pool = fittedGlyphs ? glyphs : alphabet.filter(glyph => glyph.width <= rect.width).map(glyph => glyph.char).join('');
          cells.push({char, rect, font, alphabet, pool:pool || narrowest.char, fontSize:style.fontSize,
            randomSize:pool ? style.fontSize : `${parseFloat(style.fontSize)*rect.width/narrowest.width*.98}px`});
        }
      }
    }
    if (!cells.length) return null;
    const left = Math.max(0, Math.min(box.left, ...cells.map(cell => cell.rect.left)));
    const top = Math.min(box.top, ...cells.map(cell => cell.rect.top));
    const right = Math.min(document.documentElement.clientWidth,
      Math.max(box.right, ...cells.map(cell => cell.rect.right)) + 2);
    const bottom = Math.max(box.bottom, ...cells.map(cell => cell.rect.bottom)) + 2;
    const layer = document.createElement('div');
    layer.dataset.phenomHeadingScramble = element.id;
    layer.setAttribute('aria-hidden', 'true'); layer.inert = true;
    layer.style.cssText = `position:absolute;left:${left+scrollX}px;top:${top+scrollY}px;width:${right-left}px;height:${bottom-top}px;overflow:hidden;pointer-events:none;z-index:5;`;
    cells.forEach(cell => {
      const span = document.createElement('span');
      span.style.cssText = `${cell.font}position:absolute;left:${cell.rect.left-left}px;top:${cell.rect.top-top}px;width:${cell.rect.width}px;height:${cell.rect.height}px;line-height:${cell.rect.height}px;white-space:pre;text-align:center;overflow:hidden;letter-spacing:0;`;
      layer.append(span); cell.node = span;
      if (fittedGlyphs) {
        const ink=document.createElement('span');
        ink.style.cssText='position:absolute;left:50%;top:0;white-space:pre;transform-origin:50% 50%';
        span.append(ink);cell.ink=ink;
      }
    });
    let timer = 0, timeline;
    const cancel = () => {
      clearTimeout(timer); layer.remove(); timeline?.cancel();
      element.removeAttribute('data-phenom-heading-key');
    };
    try {
      timeline = element.animate([{opacity:0}, {opacity:0}], {duration:1000, fill:'both'});
      if(element.id==='phenom-format-word' && formatSlot){const host=formatSlot.getBoundingClientRect();layer.style.left=(left-host.left)+'px';layer.style.top=(top-host.top)+'px';formatSlot.append(layer);}else document.body.append(layer);
      element.dataset.phenomHeadingKey = '';
      const start = performance.now();
      const tick = () => {
        const elapsed = performance.now()-start;
        if (elapsed >= 1000) return;
        const progress = Math.max(0, (elapsed-500)/500);
        const resolved = Math.floor(cells.length*(1-Math.pow(1-progress, 2)));
        cells.forEach((cell, index) => {
          if (fittedGlyphs) {
            const locked=index<resolved,char=locked?cell.char:cell.pool[Math.floor(Math.random()*cell.pool.length)];
            const width=locked?cell.rect.width:cell.alphabet.find(g=>g.char===char).width;
            cell.node.style.fontSize=cell.fontSize;cell.ink.textContent=char;
            cell.ink.style.transform=`translateX(-50%) scaleX(${locked?1:Math.min(1,cell.rect.width*.98/width)})`;
          } else {
            cell.node.style.fontSize = index < resolved ? cell.fontSize : cell.randomSize;
            cell.node.textContent = index < resolved ? cell.char : cell.pool[Math.floor(Math.random()*cell.pool.length)];
          }
        });
        timer = setTimeout(tick, 50);
      };
      tick();
      return {finished:timeline.finished, cancel};
    } catch (error) { cancel(); throw error; }
  };

  // formatword83: English explorer; stable line layout, centered visible ink.
  const formatHeading = story.querySelector('#key-layout-title');
  const formatSection = formatHeading?.closest('.key-layout-chapter');
  const formatWords = ['layout', 'format', 'Phenom'];
  let formatWord = null, formatPrefix = null, formatSlot = null, wordIndex = 0, wordTimer = 0, wordFrame = 0;
  let wordAnimation = null, wordNeedsMeasure = false, wordFailed = false, wordSuspended = false;
  const alignFormatWord = (animate = false) => {
    if (!formatWord || !formatSlot || !formatPrefix) return;
    const maximum = parseFloat(formatSlot.style.width) || 0;
    const delta = Math.max(0, (maximum - formatWord.getBoundingClientRect().width) / 2);
    const wrapped = Math.abs(formatSlot.getBoundingClientRect().top-formatPrefix.getBoundingClientRect().top)>2;
    const transition = animate ? 'transform 240ms cubic-bezier(.25,.65,.3,1)' : 'none';
    formatPrefix.style.transition = formatSlot.style.transition = transition;
    formatPrefix.style.transform = `translateX(${wrapped ? 0 : delta}px)`;
    formatSlot.style.transform = `translateX(${delta}px)`;
  };
  const pauseFormatWord = () => {
    clearTimeout(wordTimer); wordTimer = 0;
    const animation = wordAnimation; wordAnimation = null;
    if (animation) { active.delete(formatWord); animation.cancel(); }
    wordIndex = 0;
    if (formatWord && formatWord.textContent !== formatWords[0]) formatWord.textContent = formatWords[0];
    alignFormatWord();
  };
  const measureFormatWord = () => {
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;white-space:pre;pointer-events:none;font:inherit;letter-spacing:inherit';
    formatHeading.append(probe);
    try {
      const width = Math.max(...formatWords.map(word => { probe.textContent = word; return probe.getBoundingClientRect().width; }));
      formatSlot.style.width = `${Math.ceil(width*64)/64}px`;
      wordNeedsMeasure = false;
    } finally { probe.remove(); }
    alignFormatWord();
  };
  const formatWordVisible = () => {
    if (!formatWord?.isConnected || wordFailed || wordSuspended || reduced.matches || document.hidden || scrollHost.document.hidden) return false;
    const scale = canvas ? parent.document.documentElement.clientWidth/1440 : 1;
    const top = canvas ? parent.scrollY/scale : scrollY;
    const box = formatSection.getBoundingClientRect();
    return box.width && box.height && box.top+scrollY < top+scrollHost.innerHeight/scale && box.bottom+scrollY > top;
  };
  const refreshFormatWord = () => {
    wordFrame = 0;
    if (!formatWord) return;
    if (!formatWordVisible()) { pauseFormatWord(); return; }
    if (pending.has(formatHeading) || active.has(formatHeading) || wordAnimation) return;
    if (wordNeedsMeasure) measureFormatWord();
    if (wordTimer) return;
    wordTimer = setTimeout(() => {
      wordTimer = 0;
      if (!formatWordVisible()) { pauseFormatWord(); return; }
      wordIndex = (wordIndex+1)%formatWords.length;
      formatWord.textContent = formatWords[wordIndex];
      alignFormatWord(true);
      try {
        const animation = scrambleHeading(formatWord);
        if (!animation) { wordFailed = true; pauseFormatWord(); return; }
        wordAnimation = animation; active.set(formatWord, animation);
        const complete = () => {
          if (wordAnimation !== animation) return;
          active.delete(formatWord); wordAnimation = null; animation.cancel();
          refreshFormatWord();
        };
        animation.finished.then(complete, complete);
      } catch (_) { wordFailed = true; pauseFormatWord(); }
    }, 3000);
  };
  const scheduleFormatWord = () => {
    if (!wordFrame) wordFrame = scrollHost.requestAnimationFrame(refreshFormatWord);
  };
  const resizeFormatWord = () => {
    pauseFormatWord(); wordNeedsMeasure = true; scheduleFormatWord();
  };
  const initializeFormatWord = () => {
    if (!/^en(?:-|$)/i.test(document.documentElement.lang) || formatHeading?.textContent.trim() !== 'Choose your layout') return;
    formatWord = document.createElement('span');
    formatWord.id = 'phenom-format-word'; formatWord.setAttribute('aria-hidden', 'true');
    formatWord.style.cssText = 'display:inline-block;white-space:nowrap;text-align:left;vertical-align:baseline';
    formatWord.textContent = formatWords[0];
    formatPrefix = document.createElement('span'); formatPrefix.dataset.phenomFormatPrefix='';
    formatPrefix.textContent = 'Choose your';
    formatPrefix.style.cssText = 'display:inline-block;white-space:nowrap;vertical-align:baseline';
    formatSlot = document.createElement('span'); formatSlot.dataset.phenomFormatSlot='';
    formatSlot.style.cssText = 'display:inline-block;position:relative;text-align:left;vertical-align:baseline;white-space:nowrap';
    formatSlot.append(formatWord);
    formatHeading.setAttribute('aria-label', 'Choose your layout');
    formatHeading.replaceChildren(formatPrefix, document.createTextNode(' '), formatSlot);
    measureFormatWord();
    const visibility = new IntersectionObserver(scheduleFormatWord);
    visibility.observe(formatSection);
    scrollHost.addEventListener('scroll', scheduleFormatWord, {passive:true});
    scrollHost.addEventListener('resize', resizeFormatWord, {passive:true});
    if (canvas) window.addEventListener('resize', resizeFormatWord, {passive:true});
    reduced.addEventListener('change', refreshFormatWord);
    document.addEventListener('visibilitychange', refreshFormatWord);
    window.addEventListener('pagehide', () => {
      wordSuspended = true; pauseFormatWord(); scrollHost.cancelAnimationFrame(wordFrame); wordFrame = 0;
    });
    window.addEventListener('pageshow', () => { wordSuspended = false; scheduleFormatWord(); });
    document.fonts.ready.then(() => { if (formatWord.isConnected) { wordNeedsMeasure = true; scheduleFormatWord(); } });
  };

  const photoMedia = '.visual-chapter__media, .product-stage, .series-card__visual, .detail-sequence__item';
  const decodeDesktopPhoto = (element) => {
    const existing = photoDecodes.get(element);
    if (existing) return existing.promise;
    const images = [...element.querySelectorAll('img')];
    const record = { promise: null };
    photoDecodes.set(element, record);
    record.promise = Promise.all(images.map(image => {
      image.loading = 'eager';
      if (typeof image.decode === 'function') return image.decode();
      return new Promise((resolve, reject) => {
        const cleanup = () => { image.removeEventListener('load', loaded); image.removeEventListener('error', failed); };
        const loaded = () => { cleanup(); if (image.naturalWidth > 0) resolve(); else reject(new Error('Photo has no pixels')); };
        const failed = () => { cleanup(); reject(new Error('Photo failed to load')); };
        image.addEventListener('load', loaded, { once: true });
        image.addEventListener('error', failed, { once: true });
        if (image.complete) loaded();
      });
    })).then(() => {
      // Only a current, successful preparation can remove gate-time decoding.
      if (photoDecodes.get(element) === record && pending.has(element) && !reduced.matches && !document.hidden) {
        readyPhotos.add(element);
        scheduleCheck();
      }
    }, error => {
      if (photoDecodes.get(element) === record) photoDecodes.delete(element);
      throw error;
    });
    return record.promise;
  };

  // A lazy photo must have pixels ready before its one-shot fade starts.
  // Keep the existing hidden state while decoding; never block text or videos.
  const preparePhoto = (element) => {
    if (readyPhotos.has(element) || !element.matches(photoMedia)) return true;
    const images = [...element.querySelectorAll('img')];
    if (!images.length) return true;
    if (photoJobs.has(element)) return false;
    let cancelled = false;
    let timer;
    const cancel = () => { cancelled = true; clearTimeout(timer); };
    photoJobs.set(element, cancel);
    const finish = () => {
      if (cancelled) return;
      cancel();
      photoJobs.delete(element);
      readyPhotos.add(element);
      scheduleCheck();
    };
    // A failed/hung request must not leave authored content concealed forever.
    timer = setTimeout(finish, 4000);
    const load = desktopPhotoLoading() ? decodeDesktopPhoto(element) : Promise.all(images.map(image => {
      image.loading = 'eager';
      return typeof image.decode === 'function' ? image.decode().catch(() => {}) : Promise.resolve();
    }));
    load.then(finish, finish);
    return false;
  };

  // Keep character entry only on the five explicitly selected chapters.
  // Photographic chapter headings use the same original line entry as prose.
  const characterHeadingIds = new Set(['series-title', 'key-layout-title',
    'phenom-curves-title', 'phenom-entropy-title', 'phenom-specs-title']);
  const reveal = (element, intro = false) => {
    if (!intro && !preparePhoto(element)) return;
    release(element);
    if (reduced.matches || document.hidden) return;
    const fadeOnly = element.matches(media + ', .visual-chapter__action');
    const animation = (characterHeadingIds.has(element.id) ? scrambleHeading(element) : fadeOnly ? null : riseLines(element)) || element.animate([
      { opacity: intro ? 0.65 : 0 }, { opacity: 1 }
    ], { duration: 900, easing: 'cubic-bezier(0.25, 0.46, 0.25, 1)', fill: 'backwards' });
    active.set(element, animation);
    const clean = () => {
      if (active.get(element) === animation) active.delete(element);
      animation.cancel();
      if (element === formatHeading) refreshFormatWord();
    };
    animation.finished.then(clean, () => { if (active.get(element) === animation) active.delete(element); });
  };

  // The gate uses the actual outer reading window, including the expanded
  // desktop iframe. IO keeps this work limited to currently intersecting targets.
  const checkVisible = () => {
    checkFrame = 0;
    const scale = canvas ? parent.document.documentElement.clientWidth / 1440 : 1;
    const top = canvas ? parent.scrollY / scale : scrollY;
    // The final CTA cannot move farther up once the page reaches its end.
    const atEnd = scrollHost.scrollY + scrollHost.innerHeight >= scrollHost.document.documentElement.scrollHeight - 2;
    const readingRatio = atEnd ? 1 : 0.9;
    const bottom = canvas ? (parent.scrollY + parent.innerHeight * readingRatio) / scale : scrollY + innerHeight * readingRatio;
    try {
      const boxes = [...visible].map(element => ({ element, box: element.getBoundingClientRect() }));
      boxes.forEach(({ element, box }) => {
        if (!pending.has(element)) return;
        if (box.bottom + scrollY <= top) release(element);
        else if (box.top + scrollY < bottom) reveal(element);
      });
      if (desktopPhotoLoading()) {
        if (preparedAhead && (!pending.has(preparedAhead) || !visible.has(preparedAhead))) preparedAhead = null;
        if (!preparedAhead) {
          const next = boxes.filter(({ element, box }) => pending.has(element)
            && element.matches(photoMedia) && element.querySelector('img')
            && box.top + scrollY >= bottom && box.top < innerHeight + Math.min(innerHeight, 1000))
            .sort((a, b) => a.box.top - b.box.top)[0];
          if (next) {
            preparedAhead = next.element;
            decodeDesktopPhoto(next.element).catch(() => {});
          }
        }
      }
    } catch (_) { settle(); }
  };
  const scheduleCheck = () => {
    if (!checkFrame && visible.size && !reduced.matches && !document.hidden) {
      checkFrame = requestAnimationFrame(checkVisible);
    }
  };

  const resizeCheck = () => {
    if (desktopPhotoLoading()) {
      preparedAhead = null;
      pending.forEach(element => {
        if (!photoDecodes.has(element)) return;
        photoJobs.get(element)?.();
        photoJobs.delete(element);
        photoDecodes.delete(element);
        readyPhotos.delete(element);
      });
    }
    // Only measured line copies become stale on resize. Opacity-only media
    // fades remain valid, including phone browser chrome changing viewport height.
    active.forEach((animation, element) => {
      if (element.hasAttribute('data-phenom-rise-key') || element.hasAttribute('data-phenom-heading-key')) {
        animation.cancel();
        active.delete(element);
      }
    });
    scheduleCheck();
  };

  try {
    observer = new IntersectionObserver(entries => {
      try {
        entries.forEach(entry => {
          if (!pending.has(entry.target)) return;
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        });
        scheduleCheck();
      } catch (_) { settle(); }
    }, { threshold: 0, rootMargin: desktopPhotoLoading() ? '0px 0px 1000px 0px' : '0px' });
    scrollHost.addEventListener('scroll', scheduleCheck, { passive: true });
    scrollHost.addEventListener('resize', resizeCheck, { passive: true });
    if (canvas) window.addEventListener('resize', resizeCheck, { passive: true });

    // Snapshot geometry once, before any style writes. In the expanded desktop
    // canvas innerHeight is the whole document, not the physical reading window.
    const scale = canvas ? parent.document.documentElement.clientWidth / 1440 : 1;
    const bottom = canvas ? (parent.scrollY + parent.innerHeight) / scale : innerHeight;
    const top = canvas ? parent.scrollY / scale : scrollY;
    initializeFormatWord();
    const elements = [...story.querySelectorAll(selectors)];
    const geometry = elements.map(element => ({ element, box: element.getBoundingClientRect() }));
    geometry.forEach(({ element, box }) => {
      if (!box.width || !box.height) return;
      element.dataset.phenomReveal = '';
      const y = box.top + scrollY;
      if (y >= bottom || (element.matches('h2') && box.bottom + scrollY > top)) {
        observer.observe(element); // Connect before adding the opt-in hidden state.
        pending.add(element);
        element.dataset.phenomRevealPending = '';
      } else if (box.bottom + scrollY > top && element.closest('.product-hero') && top < 1) {
        reveal(element, true);
      }
    });
    reduced.addEventListener('change', event => { if (event.matches) settle(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); });
    document.addEventListener('focusin', event => {
      // Keyboard/anchor focus must never land in an invisible pending target.
      const containsFocus = element => element === event.target || element.contains(event.target);
      pending.forEach(element => { if (containsFocus(element)) release(element); });
      active.forEach((animation, element) => {
        if (containsFocus(element)) {
          animation.cancel();
          active.delete(element);
        }
      });
    });
    window.addEventListener('pagehide', settle, { once: true });
  } catch (_) {
    // Initialization is transactional: failure always restores readable content.
    settle();
  }
})();
