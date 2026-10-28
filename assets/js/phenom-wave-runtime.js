/* Specs-only matrix. Every mark uses the waves' 1.7-unit round micro-dot. */
(function(root){
  'use strict';
  const noise=(i,salt)=>{const n=Math.sin(i*127.1+salt*311.7)*43758.5453;return n-Math.floor(n)};
  function prepare(){const dots=[];for(let row=0;row<22;row++)for(let col=0;col<46;col++){
    // More samples inside the same envelope, not a larger or shifted cloud.
    const r=row*18/21,c=col*39/45,i=row*49+col;
    if(c+r<8||c+r>49||noise(i,5)<.08)continue;
    dots.push({x:213+c*26,y:174+r*24,row:r,col:c,alpha:.35+noise(i,3)*.65});
  }return dots;}
  function project(dots,phase){const buckets=Array.from({length:5},()=>[]);for(const p of dots){
    // A faster travelling scan carries compact groups through the lattice.
    // Positions actually move; visibility is not just an opacity shimmer.
    const scan=Math.pow(.5+.5*Math.cos((p.col+p.row)/6-phase*.75),3);
    const alpha=p.alpha*(.3+.7*scan);
    const bucket=Math.max(0,Math.min(4,Math.round((alpha-.18)/.205)));
    const strength=.45+.55*scan;
    buckets[bucket].push({id:p.row*43+p.col,
      x:p.x+Math.sin(phase*.8+p.row*.28)*18*strength,
      y:p.y+Math.cos(phase*.7+p.col*.25)*13*strength});
  }return buckets;}
  function svg(){const groups=project(prepare(),0);return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 780"><g fill="none" stroke="black" stroke-width="1.7" stroke-linecap="round">'+groups.map((g,i)=>'<path opacity="'+(.18+i*.205).toFixed(3)+'" d="'+g.map(p=>'M'+p.x.toFixed(2)+' '+p.y.toFixed(2)+'h.01').join('')+'"/>').join('')+'</g></svg>';}
  const api={prepare,project,svg};if(typeof module==='object'&&module.exports)module.exports=api;else root.PhenomSpecsMatrix=api;
})(typeof globalThis!=='undefined'?globalThis:this);

/* motion40: four desktop layout corners; original forms/response12 and touch pair. */
(() => {
  'use strict';
  const story = document.querySelector('.product-story--phenom');
  if (!story) return;
  const reduced = ({matches:false, addEventListener(){}, removeEventListener(){}});
  const mobile = matchMedia('(max-width: 980px)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const gradientInk = CSS.supports('color', 'color-mix(in srgb, black 8%, transparent)');
  const canvasShell = window.__phenomDesktopCanvas && parent !== window;
  const host = canvasShell ? parent : window;
  // Different topology, not five offsets of the same surface. Coefficients
  // are cached once; live drawing still evaluates only the visible chapters.
  const profiles = {
    'series-title': {name:'broad-crest', a:[2.35,1,108], b:[4.25,-1.35,28], depth:185, perspective:85, skew:35, tilt:0, saddle:0, bowl:0, restScale:'1 1', restAngle:'0deg'},
    'key-layout-title': {name:'double-ridge', a:[5.8,1.6,86], b:[9,-1.1,34], depth:180, perspective:60, skew:-20, tilt:-10, saddle:0, bowl:0, restScale:'1.12 .78', restAngle:'-8deg'},
    'key-layout-right': {name:'counter-ridge', a:[3.9,-1.8,76], b:[7.4,1.3,30], depth:175, perspective:100, skew:45, tilt:18, saddle:-35, bowl:10, restScale:'-1 .82', restAngle:'10deg'},
    'phenom-curves-title': {name:'saddle', a:[2.8,-2.4,84], b:[5.4,1.5,40], depth:170, perspective:95, skew:-55, tilt:0, saddle:120, bowl:0, restScale:'-1 1.12', restAngle:'8deg'},
    'phenom-entropy-title': {name:'diagonal-ribbon', a:[3.2,3.7,92], b:[6.8,-2.2,38], depth:110, perspective:90, skew:130, tilt:95, saddle:40, bowl:0, restScale:'1.12 .65', restAngle:'-18deg'},
    'phenom-specs-title': {name:'matrix',kind:'matrix',restScale:'1 1',restAngle:'0deg'}
  };
  const buildSurface = profile => {
    const buckets = Array.from({length:5}, () => []);
    for (let row = 0; row < 30; row++) {
      const v = -1 + 2*row/29;
      for (let col = 0; col < 88; col++) {
        const u = -1 + 2*col/87;
        const edge = Math.pow(Math.max(0, 1-u*u), .7) * Math.pow(Math.max(0, 1-v*v), .55);
        if (edge < .04) continue;
        const a = u*profile.a[0] + v*profile.a[1], b = u*profile.b[0] + v*profile.b[1];
        buckets[Math.min(4, Math.floor(edge*5))].push({
          x:720+u*(570+profile.perspective*v)+profile.skew*v,
          y:390+v*profile.depth+u*profile.tilt+u*v*profile.saddle+(u*u-.3)*profile.bowl,
          a:profile.a[2]*Math.sin(a), b:profile.a[2]*Math.cos(a),
          c:profile.b[2]*Math.cos(b), d:profile.b[2]*Math.sin(b)
        });
      }
    }
    return buckets;
  };
  const createLayer = (owner, profile, side) => {
    const layer = document.createElement('span');
    layer.className = 'phenom-wave'; layer.setAttribute('aria-hidden', 'true');
    layer.dataset.waveShape = profile.name;
    const field = document.createElement('span'); field.className = 'phenom-wave__field';
    if (side) field.dataset.waveSide = side;
    if (profile.kind === 'matrix') field.style.setProperty('--phenom-wave-image', 'var(--phenom-specs-matrix-image)');
    field.style.setProperty('--wave-rest-scale', profile.restScale);
    field.style.setProperty('--wave-rest-angle', profile.restAngle);
    const bitmap = document.createElement('canvas'); bitmap.width = bitmap.height = 0;
    field.append(bitmap); layer.append(field); owner.append(layer);
    return {owner, layer, field, bitmap, profile, kind:profile.kind, points:profile.kind === 'matrix' ? window.PhenomSpecsMatrix.prepare() : buildSurface(profile), ink:getComputedStyle(owner).color, phase:NaN};
  };
  const layers = [...story.querySelectorAll('#product-series, .key-layout-chapter, #phenom-curves, #phenom-entropy, #phenom-specs, #phenom-cta')].flatMap(owner => {
    if (owner.id === 'phenom-cta') {
      return [createLayer(owner, profiles['key-layout-title']), createLayer(owner, profiles['key-layout-right'], 'right')];
    }
    const primary = createLayer(owner, profiles[owner.getAttribute('aria-labelledby')]);
    return owner.matches('.key-layout-chapter')
      ? [primary, createLayer(owner, profiles['key-layout-right'], 'right')]
      : [primary];
  });
  if (!layers.length) return;
  const ctaLayers = layers.filter(layer => layer.owner.id === 'phenom-cta');
  const formatOwner = story.querySelector('.key-layout-chapter');
  let animatedLayers = [];
  let frame = 0, fullUpdate = true, autoPhase = 0, autoLastTime = 0, lastIdlePaint = 0;
  let formatLastTime = 0, formatClock = 0, formatKey = '';
  const stop = () => { cancelAnimationFrame(frame); frame = 0; autoLastTime = formatLastTime = lastIdlePaint = 0; };
  const release = layer => {
    if (layer.bitmap.width || layer.bitmap.height) layer.bitmap.width = layer.bitmap.height = 0;
    delete layer.field.dataset.waveLive;
    delete layer.layer.dataset.waveBakedMask;
    for (const property of ['left','width','right']) layer.bitmap.style.removeProperty(property);
    layer.phase = NaN;
  };
  const reduceMotion = () => {
    stop();
    layers.forEach(layer => { release(layer); layer.field.style.transform = ''; });
  };
  const paint = (layer, width, height, phase, motifWidth, geometry) => {
    if (layer.unavailable) return;
    // Lazy visible-only bitmaps, capped independently of phone Retina density.
    const density = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(2000000/(width*height)));
    const fullWidth = Math.max(1, Math.floor(width*density)), h = Math.max(1, Math.floor(height*density));
    const bakeMask = !canvasShell && !mobile.matches && finePointer.matches &&
      layer.owner.matches('.key-layout-chapter') && gradientInk;
    // Keep the original density and pixel grid: crop only pixels clipped by
    // the owner, with two pixels of bleed. Do not refit/enlarge the motif.
    const cssPixel = (bakeMask ? geometry?.cssWidth ?? parseFloat(getComputedStyle(layer.field).width) : width)/fullWidth;
    const fieldLeft = bakeMask ? geometry?.left ?? layer.field.offsetLeft : 0;
    const ownerWidth = bakeMask ? geometry?.ownerWidth ?? layer.owner.offsetWidth : 0;
    const cropX = bakeMask ? Math.max(0, Math.floor(-fieldLeft/cssPixel)-2) : 0;
    const cropEnd = bakeMask ? Math.min(fullWidth, Math.ceil((ownerWidth-fieldLeft)/cssPixel)+2) : fullWidth;
    const w = Math.max(1, cropEnd-cropX);
    if (Math.abs(phase-layer.phase) < .0005 && layer.bitmap.width === w && layer.bitmap.height === h && layer.cropX === cropX && layer.paintedWidth === width && layer.paintedInk === layer.ink && layer.paintedMotifWidth === motifWidth) return;
    try {
      const ctx = layer.ctx || (layer.ctx = layer.bitmap.getContext('2d'));
      if (!ctx) { layer.unavailable = true; return; }
      if (layer.bitmap.width !== w || layer.bitmap.height !== h) {
        layer.bitmap.width = w; layer.bitmap.height = h;
      }
      if (bakeMask) {
        layer.bitmap.style.left = `${cropX*cssPixel}px`;
        layer.bitmap.style.width = `${w*cssPixel}px`;
        layer.bitmap.style.right = 'auto';
      } else {
        layer.bitmap.style.removeProperty('left');
        layer.bitmap.style.removeProperty('width');
        layer.bitmap.style.removeProperty('right');
      }
      ctx.setTransform(density, 0, 0, density, -cropX, 0);
      ctx.clearRect(0, 0, width, height);
      const unit = motifWidth/1440, tileHeight = 780*unit, left = (width-motifWidth)/2;
      let origin = (height-tileHeight)/2;

      const cos = Math.cos(phase), sin = Math.sin(phase);
      const cos2 = Math.cos(phase*.65), sin2 = Math.sin(phase*.65);
      // motion35: bake the owner-aligned horizontal fade into point ink,
      // avoiding two chapter-sized CSS compositing surfaces every frame.
      // X never changes during the Y-only scrub; fallback/touch keep CSS masks.
      let ink = layer.ink;
      if (bakeMask) {
        const left = fieldLeft;
        ink = ctx.createLinearGradient(-left, 0, ownerWidth-left, 0);
        const faint = `color-mix(in srgb, ${layer.ink} 8%, transparent)`;
        for (const [stop, color] of [[0,layer.ink],[.26,layer.ink],[.42,faint],[.58,faint],[.74,layer.ink],[1,layer.ink]]) {
          ink.addColorStop(stop, color);
        }
      }
      ctx.lineCap = 'round'; ctx.lineWidth = 1.7*unit; ctx.strokeStyle = ink;
      const matrix = layer.kind === 'matrix';
      const buckets = matrix ? window.PhenomSpecsMatrix.project(layer.points, phase) : layer.points;
      const morph = layer.morph;
      for (let bucket = 0; bucket < buckets.length; bucket++) {
        ctx.beginPath(); ctx.globalAlpha = .18 + bucket*.205;
        for (let top = origin; top < height; top += tileHeight) {
          for (let index = 0; index < buckets[bucket].length; index++) {
            const p = buckets[bucket][index], q = morph?.to[bucket][index];
            const mix = morph?.mix || 0;
            const x = left+(q ? p.x+(q.x-p.x)*mix : p.x)*unit;
            const py = q ? p.y+(q.y-p.y)*mix
              -(p.a+(q.a-p.a)*mix)*cos-(p.b+(q.b-p.b)*mix)*sin
              -(p.c+(q.c-p.c)*mix)*cos2-(p.d+(q.d-p.d)*mix)*sin2
              : matrix ? p.y : p.y-p.a*cos-p.b*sin-p.c*cos2-p.d*sin2;
            const y = top+py*unit;
            if (x < -2 || x > width+2 || y < -2 || y > height+2) continue;
            ctx.moveTo(x, y); ctx.lineTo(x+.01*unit, y);
          }
          break; // One composed fragment, never a repeating wallpaper.
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (bakeMask) layer.layer.dataset.waveBakedMask = '';
      else delete layer.layer.dataset.waveBakedMask;
      layer.phase = phase; layer.paintedInk = layer.ink;
      layer.cropX = cropX; layer.paintedWidth = width; layer.paintedMotifWidth = motifWidth;
      layer.field.dataset.waveLive = '';
    } catch (_) { release(layer); layer.unavailable = true; }
  };
  const update = () => {
    frame = 0;
    // A running frame can observe the preference before its change callback.
    // Reconcile the fallback here too; merely returning retains live bitmaps.
    if (reduced.matches) { reduceMotion(); return; }
    if (document.hidden) return;
    const tick = performance.now();
    // Only idle decoration is capped; real scroll/resize updates remain immediate.
    if (!fullUpdate && animatedLayers.length && tick-lastIdlePaint < 1000/30 - 1) {
      frame = requestAnimationFrame(update); return;
    }
    lastIdlePaint = tick;
    const scale = canvasShell ? parent.document.documentElement.clientWidth/1440 : 1;
    const top = canvasShell ? parent.scrollY/scale : scrollY, height = host.innerHeight/scale;
    // Desktop artwork follows the same root unit as type; native phone art
    // follows its 412px reference width, not fixed 620/900px raster floors.
    const waveUnit = mobile.matches ? document.documentElement.clientWidth/412
      : parseFloat(getComputedStyle(document.documentElement).fontSize);
    const ownerBoxes = new Map();
    const updating = fullUpdate ? layers : animatedLayers;
    fullUpdate = false;
    const desktopVisibility = !canvasShell && !mobile.matches && finePointer.matches;
    const boxes = updating.filter(({owner}) => owner.isConnected)
      .map(layer => {
        if (!ownerBoxes.has(layer.owner)) ownerBoxes.set(layer.owner, layer.owner.getBoundingClientRect());
        const box = ownerBoxes.get(layer.owner);
        if (!desktopVisibility) return {layer, box};
        // Read every desktop field before any transform, Canvas or dataset write.
        // Predict the LIVE pose from layout offsets, not the fallback's rotated /
        // scaled rect (removing data-wave-live changes that rect). Live fields
        // only translate in Y; the lower Entropy reflection keeps the same bounds.
        const clip = layer.layer.getBoundingClientRect();
        const y = box.top+scrollY-top;
        const progress = Math.min(1, Math.max(0, (height-y)/(height+box.height)));
        const shift = +((progress-.5)*28).toFixed(2);
        const geometry = {width:layer.field.offsetWidth, height:layer.field.offsetHeight,
          left:layer.field.offsetLeft, top:layer.field.offsetTop,
          layerHeight:layer.layer.clientHeight, ownerWidth:layer.owner.offsetWidth,
          cssWidth:layer.owner === formatOwner ? parseFloat(getComputedStyle(layer.field).width) : 0};
        // Two CSS pixels cover integer offset rounding and boundary antialiasing.
        // Intersect BOTH the actual clipping layer and the viewport, never owner
        // visibility alone. Re-entry is painted in this same scheduled frame.
        const left = clip.left+geometry.left, fieldTop = clip.top+geometry.top+shift;
        geometry.visible = Math.min(clip.right, left+geometry.width+2, innerWidth) > Math.max(clip.left, left-2, 0)
          && Math.min(clip.bottom, fieldTop+geometry.height+2, height) > Math.max(clip.top, fieldTop-2, 0);
        return {layer, box, geometry};
      });
    const now = performance.now();
    const ctaVisible = boxes.some(({layer, box}) => layer.owner.id === 'phenom-cta'
      && box.width && box.height && box.top+scrollY-top < height && box.bottom+scrollY-top > 0);
    const formatVisible = boxes.some(({layer, box}) => layer.owner === formatOwner
      && box.width && box.height && box.top+scrollY-top < height && box.bottom+scrollY-top > 0);
    // Keep just the owners in the actual reading viewport in the idle loop.
    animatedLayers = boxes.filter(({layer,box,geometry}) => box.width && box.height
      && box.top+scrollY-top < height && box.bottom+scrollY-top > 0
      && (geometry ? geometry.layerHeight : layer.layer.clientHeight)).map(({layer}) => layer);
    if (animatedLayers.length) {
      if (autoLastTime) autoPhase = (autoPhase + Math.min(now-autoLastTime,64)*.00018) % (40*Math.PI);
      autoLastTime = now;
    } else autoLastTime = 0;
    if (formatVisible) {
      if (formatLastTime) {
        const dt = Math.min(now-formatLastTime, 64);
        formatClock += dt;
      }
      formatLastTime = now;
    } else formatLastTime = 0;
    boxes.forEach(({layer, box, geometry}) => {
      const y = box.top+scrollY-top;
      if (!box.width || !box.height || y >= height || y+box.height <= 0 || !(geometry ? geometry.layerHeight : layer.layer.clientHeight)) { release(layer); return; }
      // Calibrate morphing against the real reading viewport, not the full
      // chapter height: a wheel step must visibly change folds on wide screens.
      const width = geometry ? geometry.width : layer.field.offsetWidth;
      const motifWidth = mobile.matches ? Math.max(width, 620*waveUnit) : layer.motifRem*waveUnit;
      if (layer.morph) {
        const t = Math.min(1, (formatClock-layer.morph.start)/900);
        layer.morph.mix = t*t*(3-2*t);
        if (t === 1) { layer.points = layer.morph.to; layer.morph = null; }
      }
      // Preserve initial paint, owner-lifetime allocation, morphs and autoplay
      // clocks. Skip only REDRAWS; never release at this inner boundary or
      // switch to the differently transformed fallback.
      if (geometry && !geometry.visible && layer.field.hasAttribute('data-wave-live')) return;
      const progress = Math.min(1, Math.max(0, (height-y)/(height+box.height)));
      const transform = `translate3d(0, ${((progress-.5)*28).toFixed(2)}px, 0)`;
      if (layer.field.style.transform !== transform) layer.field.style.transform = transform;
      const autoplay = autoPhase;
      paint(layer, width, geometry ? geometry.height : layer.field.offsetHeight, 2.1-y/height*12 + autoplay, motifWidth, geometry);
    });
    // No visible bitmap means no idle renderer and no retained offscreen work.
    if (animatedLayers.some(layer => !layer.unavailable && layer.bitmap.width)) frame = requestAnimationFrame(update);
  };
  const schedule = () => {
    fullUpdate = true;
    if (reduced.matches) { reduceMotion(); return; }
    if (!frame && !document.hidden) frame = requestAnimationFrame(update);
  };
  const ctaOwner = ctaLayers[0]?.owner;
  const syncCTAEnvelope = () => {
    if (!ctaOwner?.isConnected) return;
    const image = ctaOwner.querySelector('.chapter-media__image');
    if (!image) return;
    const owner = ctaOwner.getBoundingClientRect(), box = image.getBoundingClientRect();
    const sourceWidth = image.naturalWidth || +image.getAttribute('width');
    const sourceHeight = image.naturalHeight || +image.getAttribute('height');
    if (!sourceWidth || !sourceHeight || !box.width || !box.height) return;
    const style = getComputedStyle(image);
    const fit = style.objectFit === 'contain' ? Math.min : Math.max;
    const imageScale = fit(box.width/sourceWidth, box.height/sourceHeight);
    const renderedHeight = sourceHeight*imageScale;
    const position = style.objectPosition.trim().split(/\s+/)[1] || '50%';
    const align = position.endsWith('%') ? parseFloat(position)/100 : .5;
    const unit = parseFloat(getComputedStyle(document.documentElement).fontSize);
    // The closing master has all keyboard housing above source Y=74%.
    // Project that protected boundary through object-fit/crop, plus 1rem air.
    const safeY = Math.max(0, box.top-owner.top + (box.height-renderedHeight)*align + renderedHeight*.74 + unit);
    const value = `${safeY.toFixed(2)}px`;
    if (ctaOwner.style.getPropertyValue('--cta-wave-safe-y') !== value) {
      ctaOwner.style.setProperty('--cta-wave-safe-y', value);
      schedule();
    }
  };
  if (ctaOwner) {
    const image = ctaOwner.querySelector('.chapter-media__image');
    image?.addEventListener('load', syncCTAEnvelope);
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(syncCTAEnvelope);
      observer.observe(ctaOwner);
      if (image) observer.observe(image);
    }
  }
  const layoutPair = layers.filter(layer => layer.owner.matches('.key-layout-chapter'));
  const readFormat = () => {
    const controls = [...formatOwner.querySelectorAll('[data-key-layout-model-control]')];
    const model = Math.max(0, controls.findIndex(control => control.checked));
    const name = controls[model]?.dataset.keyLayoutModelControl;
    const stage = [...formatOwner.querySelectorAll('[data-key-layout-model-view]')]
      .find(item => item.dataset.keyLayoutModelView === name);
    const tabs = [...(stage?.querySelectorAll('[data-key-layout-layer-target]') || [])];
    const layer = Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'));
    return {model, layer, key:`${name}:${tabs[layer]?.dataset.keyLayoutLayerTarget || 'base'}`};
  };
  const formatProfile = (profile, model, layer) => {
    const variation = [{frequency:1, depth:1, skew:0, bowl:0, saddle:0},
      {frequency:.76, depth:.88, skew:45, bowl:100, saddle:45},
      {frequency:1.22, depth:.76, skew:-45, bowl:-90, saddle:-65}][model] ||
      {frequency:1, depth:1, skew:0, bowl:0, saddle:0};
    return {...profile,
      a:[profile.a[0]*variation.frequency+layer*.5, profile.a[1]+layer*.28, profile.a[2]*(1+layer*.09)],
      b:[profile.b[0]*(1+layer*.045), profile.b[1]-layer*.2, profile.b[2]*(1+layer*.1)],
      depth:profile.depth*variation.depth, perspective:profile.perspective+layer*15,
      skew:profile.skew+variation.skew, tilt:profile.tilt+layer*6,
      saddle:profile.saddle+variation.saddle+Math.sin(layer*1.2)*70,
      bowl:profile.bowl+variation.bowl+layer*25};
  };
  const syncFormat = (immediate = false) => {
    if (!formatOwner) return;
    const state = readFormat();
    if (!immediate && state.key === formatKey) return;
    formatKey = state.key;
    layers.filter(layer => layer.owner === formatOwner).forEach(layer => {
      if (layer.morph) {
        const {to, mix} = layer.morph;
        layer.points = layer.points.map((bucket, b) => bucket.map((point, i) => {
          const target = to[b][i], result = {};
          for (const key of ['x','y','a','b','c','d']) result[key] = point[key]+(target[key]-point[key])*mix;
          return result;
        }));
      }
      const target = buildSurface(formatProfile(layer.profile, state.model, state.layer));
      if (immediate || reduced.matches) { layer.points = target; layer.morph = null; }
      else layer.morph = {to:target, start:formatClock, mix:0};
      layer.phase = NaN;
      layer.field.dataset.waveForm = state.key;
    });
    schedule();
  };
  if (formatOwner) {
    formatOwner.addEventListener('change', event => {
      if (event.target.matches('[data-key-layout-model-control]')) syncFormat();
    });
    formatOwner.addEventListener('click', event => {
      if (event.target.closest('[data-key-layout-layer-target]')) syncFormat();
    });
    formatOwner.addEventListener('keydown', event => {
      if (event.target.matches('[data-key-layout-layer-target]') &&
        ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) syncFormat();
    });
  }
  let lowerCorners = [];
  const syncLayoutCorners = () => {
    const enabled = !canvasShell && !mobile.matches && finePointer.matches;
    layoutPair.forEach((layer, index) => {
      release(layer);
      if (enabled) layer.field.dataset.waveCorner = index ? 'top-right' : 'top-left';
      else delete layer.field.dataset.waveCorner;
    });
    if (enabled && layoutPair.length && !lowerCorners.length) {
      const owner = layoutPair[0].owner;
      lowerCorners = [createLayer(owner, profiles['key-layout-right']), createLayer(owner, profiles['key-layout-title'], 'right')];
      lowerCorners.forEach((layer, index) => { layer.field.dataset.waveCorner = index ? 'bottom-right' : 'bottom-left'; });
      layers.push(...lowerCorners);
    } else if (!enabled && lowerCorners.length) {
      lowerCorners.forEach(layer => { release(layer); layer.layer.remove(); layers.splice(layers.indexOf(layer), 1); });
      lowerCorners = [];
    }
    syncEntropyPockets();
    // Corner attributes change the design-size token; cache after the DOM
    // update rather than reading computed styles for every layer/scroll frame.
    layers.forEach(layer => { layer.motifRem = parseFloat(getComputedStyle(layer.field).getPropertyValue('--wave-motif-rem')) || 56.25; });
    animatedLayers = [];
    syncFormat(true);
    schedule();
  };
  const entropy = layers.find(layer => layer.owner.id === 'phenom-entropy');
  // revision80: a single quiet ribbon, reflected around the reading block.
  // Keep the native field's original point object and attributes for resizing.
  const entropyNativePoints = entropy?.points;
  const entropyRibbon = {...profiles['phenom-entropy-title'], name:'paired-ribbon',
    a:[2.35,1,68], b:[4.7,-1,18], depth:100, perspective:50,
    skew:55, tilt:25, saddle:0, bowl:0};
  let entropyRibbonPoints, entropyRibbonImage, entropyLower = null;
  const prepareEntropyRibbon = () => {
    if (entropyRibbonPoints) return;
    entropyRibbonPoints = buildSurface(entropyRibbon);
    // The static/reduced-motion fallback uses the identical surface and glyph,
    // not the unrelated generic wave mask. Both pockets share this one source.
    const phase = 2.1;
    const paths = entropyRibbonPoints.map((bucket, index) => {
      const path = bucket.map(p => {
        const y = p.y-p.a*Math.cos(phase)-p.b*Math.sin(phase)
          -p.c*Math.cos(phase*.65)-p.d*Math.sin(phase*.65);
        return `M${p.x.toFixed(2)},${y.toFixed(2)}h.01`;
      }).join('');
      return `<path opacity="${.18+index*.205}" d="${path}"/>`;
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 780"><g fill="none" stroke="black" stroke-width="1.7" stroke-linecap="round">${paths}</g></svg>`;
    entropyRibbonImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  };
  const syncEntropyPockets = () => {
    if (!entropy?.owner.isConnected) return;
    const owner = entropy.owner;
    if (mobile.matches) {
      if (entropy.points !== entropyNativePoints) {
        release(entropy);
        entropy.points = entropyNativePoints;
        entropy.layer.dataset.waveShape = entropy.profile.name;
        entropy.field.style.removeProperty('--phenom-wave-image');
      }
      delete entropy.layer.dataset.entropyPocket;
      entropy.layer.style.removeProperty('display');
      if (entropyLower) {
        release(entropyLower); entropyLower.layer.remove();
        layers.splice(layers.indexOf(entropyLower), 1); entropyLower = null;
      }
      entropy.motifRem = parseFloat(getComputedStyle(entropy.field).getPropertyValue('--wave-motif-rem')) || 105.625;
      schedule();
      return;
    }
    const heading = owner.querySelector('h2'), action = owner.querySelector('.visual-chapter__action');
    const copy = owner.querySelector('.visual-chapter__copy');
    if (!heading || !action || !copy) return;
    const box = owner.getBoundingClientRect(), title = heading.getBoundingClientRect();
    const button = action.getBoundingClientRect(), text = copy.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const unit = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const gap = Math.max(16, unit*2);
    const videos = [...owner.querySelectorAll('video')].map(video => video.getBoundingClientRect()).filter(r => r.width && r.height);
    const videoRight = Math.max(box.left, ...videos.map(r => r.right));
    const left = Math.min(box.width, Math.max(videoRight-box.left+gap, text.left-box.left-gap));
    const upperHeight = Math.max(0, title.top-box.top-gap);
    const lowerTop = Math.min(box.height, button.bottom-box.top+gap);
    const values = {'--entropy-wave-left':left, '--entropy-wave-upper-height':upperHeight,
      '--entropy-wave-lower-top':lowerTop};
    for (const [property, value] of Object.entries(values)) {
      const cssValue = `${value.toFixed(2)}px`;
      if (owner.style.getPropertyValue(property) !== cssValue) owner.style.setProperty(property, cssValue);
    }
    prepareEntropyRibbon();
    if (entropy.points !== entropyRibbonPoints) {
      release(entropy);
      entropy.points = entropyRibbonPoints;
      entropy.layer.dataset.waveShape = entropyRibbon.name;
      entropy.field.style.setProperty('--phenom-wave-image', entropyRibbonImage);
    }
    entropy.layer.dataset.entropyPocket = 'upper';
    if (!entropyLower) {
      entropyLower = createLayer(owner, entropyRibbon, 'right');
      entropyLower.points = entropyRibbonPoints;
      entropyLower.field.style.setProperty('--phenom-wave-image', entropyRibbonImage);
      entropyLower.layer.dataset.entropyPocket = 'lower'; layers.push(entropyLower);
    }
    for (const layer of [entropy, entropyLower]) {
      const available = layer === entropy ? upperHeight : box.height-lowerTop;
      layer.layer.style.display = available < Math.max(40, unit*4) || box.width-left < 100 ? 'none' : '';
      layer.motifRem = parseFloat(getComputedStyle(layer.field).getPropertyValue('--wave-motif-rem')) || 56;
    }
    schedule();
  };
  if (entropy && 'ResizeObserver' in window) {
    const observer = new ResizeObserver(syncEntropyPockets);
    [entropy.owner, entropy.owner.querySelector('h2'), entropy.owner.querySelector('.visual-chapter__copy')]
      .filter(Boolean).forEach(element => observer.observe(element));
    document.fonts.ready.then(syncEntropyPockets);
  }
  mobile.addEventListener('change', syncLayoutCorners);
  finePointer.addEventListener('change', syncLayoutCorners);
  host.addEventListener('scroll', schedule, {passive:true});
  host.addEventListener('resize', schedule, {passive:true});
  if (canvasShell) window.addEventListener('resize', schedule, {passive:true});
  reduced.addEventListener('change', () => {
    stop();
    if (reduced.matches) reduceMotion();
    else schedule();
  });
  new MutationObserver(() => {
    layers.forEach(layer => { layer.ink = getComputedStyle(layer.owner).color; });
    schedule();
  }).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : schedule());
  window.addEventListener('pagehide', () => { stop(); layers.forEach(release); });
  window.addEventListener('pageshow', schedule);
  // Opt-in local troubleshooting only; no telemetry and no ordinary-page UI.
  if (new URLSearchParams(location.search).get('wave-debug') === '1') {
    const panel = document.createElement('output');
    panel.dataset.waveDebug = '';
    panel.setAttribute('aria-live', 'off');
    panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483646;padding:12px 16px;background:#171719;color:#f7f4f3;border:1px solid #d15150;border-radius:4px;white-space:pre;font:12px/1.5 ui-monospace,monospace;pointer-events:none';
    document.body.append(panel);
    let queued = 0;
    const report = () => {
      queued = 0;
      const active = layers.filter(layer => layer.field.hasAttribute('data-wave-live'));
      panel.textContent = [
        'Диагностика волны 32',
        `Снижение движения в системе: ${matchMedia('(prefers-reduced-motion: reduce)').matches ? 'ДА' : 'нет'}`,
        'Phenom: анимации включены независимо от системы',
        `Страница видима: ${document.hidden ? 'нет' : 'да'}`,
        `Живых поверхностей: ${active.length} / ${layers.length}`,
        `Ошибок Canvas: ${layers.filter(layer => layer.unavailable).length}`,
        `Прокрутка: ${Math.round(host.scrollY)}`,
        `Фаза: ${active.map(layer => layer.phase.toFixed(3)).join(', ') || '—'}`
      ].join('\n');
    };
    const reportNextFrame = () => {
      // Read after the controller's scroll-frame paint, not one frame behind it.
      if (!queued) queued = requestAnimationFrame(() => { queued = requestAnimationFrame(report); });
    };
    host.addEventListener('scroll', reportNextFrame, {passive:true, capture:true});
    host.addEventListener('resize', reportNextFrame, {passive:true});
    reduced.addEventListener('change', reportNextFrame);
    document.addEventListener('visibilitychange', reportNextFrame);
    window.addEventListener('pagehide', () => { cancelAnimationFrame(queued); queued = 0; });
    reportNextFrame();
  }
  syncCTAEnvelope();
  syncLayoutCorners();
})();
