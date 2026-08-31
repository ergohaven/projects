#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const project = path.resolve(__dirname, '..');
const diagramPath = path.join(project, 'data/key_layouts/phenom.json');
const diagram = JSON.parse(fs.readFileSync(diagramPath, 'utf8'));
const outputRoot = path.join(
  project,
  'assets',
  diagram.source.asset_root
);
const keyCanvasWidth = 8.18;
// The pinned EN Micro sheet draws A–Z 10.1% larger than the other models.
// These physical-key indices identify only QWERTY letters; modifier labels,
// module icons, and the small modifier badges must retain their source size.
const enMicroBaseLetterKeys = {
  left: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
  right: new Set([0, 1, 2, 3, 4, 7, 8, 9, 10, 16, 17]),
};

const models = [
  {
    id: 'standard',
    expectedKeysPerHalf: 29,
    xMin: 1900,
    split: 3050,
    layers: [
      ['base', 0, 746],
      ['numbers', 746, 1442],
      ['symbols', 1442, 2136],
      ['cursor', 2136, 2880],
    ],
  },
  {
    id: 'mini',
    expectedKeysPerHalf: 23,
    xMin: 2000,
    split: 3057,
    layers: [
      ['base', 0, 612],
      ['numbers', 612, 1164],
      ['symbols', 1164, 1717],
      ['function', 1717, 2270],
      ['cursor', 2270, 2880],
    ],
  },
  {
    id: 'micro',
    expectedKeysPerHalf: 20,
    xMin: 2100,
    split: 3056,
    layers: [
      ['base', 0, 603],
      ['numbers', 603, 1159],
      ['symbols', 1159, 1717],
      ['function', 1717, 2269],
      ['cursor', 2269, 2880],
    ],
  },
];

const [locale, ...inputs] = process.argv.slice(2);
const diagramModels = new Map(diagram.models.map((model) => [model.id, model]));
const supportedLocales = Object.keys(diagram.models[0]?.references || {});
if (!supportedLocales.includes(locale) || inputs.length !== models.length) {
  console.error(
    'Usage: import_phenom_layout_refs.cjs LOCALE STANDARD.svg MINI.svg MICRO.svg\n' +
      `LOCALE must be one of: ${supportedLocales.join(', ')}`
  );
  process.exit(2);
}

const outputDirectory = path.join(outputRoot, locale);

const sha256 = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const formatNumber = (value) => Number(value.toFixed(4)).toString();
const formatRatio = (value) => Number(value.toFixed(6)).toString();

const isKeyRect = ({ tag, width, height }) =>
  tag === 'rect' &&
  width > 100 &&
  width < 200 &&
  height > 100 &&
  height < 200;

const centerOf = ({ box }) => ({
  x: (box.x + box.x2) / 2,
  y: (box.y + box.y2) / 2,
});

const containsPoint = ({ box }, point) =>
  point.x >= box.x &&
  point.x <= box.x2 &&
  point.y >= box.y &&
  point.y <= box.y2;

const dominantRatio = (values) => {
  const clusters = [];

  for (const value of [...values].sort((left, right) => left - right)) {
    const cluster = clusters.at(-1);
    if (!cluster || value - cluster.at(-1) > 0.0002) {
      clusters.push([value]);
    } else {
      cluster.push(value);
    }
  }

  const dominant = clusters.sort(
    (left, right) =>
      right.length - left.length ||
      Math.abs(left[0] - 0.16) - Math.abs(right[0] - 0.16)
  )[0];
  if (!dominant?.length) {
    throw new Error('Could not detect a base legend ratio');
  }

  return dominant[Math.floor(dominant.length / 2)];
};

const baseGraphicsFor = (model, source) => {
  const [, yMin, yMax] = model.layers[0];

  return source.graphics.filter(({ box }) => {
    const { x, y } = centerOf({ box });
    const isSheetBackground = box.x2 - box.x > 3000 || box.y2 - box.y > 2000;

    return !isSheetBackground && x >= model.xMin && y >= yMin && y < yMax;
  });
};

const measureBaseLegends = (model, source) => {
  const graphics = baseGraphicsFor(model, source);
  const keyRects = graphics.filter(isKeyRect);
  const keySize = keyRects[0]?.width;
  if (!keySize) {
    throw new Error(`${model.id} base keys were not found`);
  }

  const badgeRects = graphics.filter(
    ({ tag, width, height }) =>
      tag === 'rect' && width > 0 && width < 80 && height > 0 && height < 80
  );
  const ratios = graphics
    .filter(({ tag, fill, box }) => {
      if (tag !== 'path' || fill !== 'black') return false;
      if (badgeRects.some((rect) => containsPoint(rect, centerOf({ box })))) {
        return false;
      }
      const ratio = (box.y2 - box.y) / keySize;
      return ratio >= 0.13 && ratio <= 0.2;
    })
    .map(({ box }) => (box.y2 - box.y) / keySize);

  return {
    badgeRects,
    keySize,
    ratio: dominantRatio(ratios),
  };
};

const selectBaseLetterLegends = (graphics, keyRects, model, layer, side) => {
  if (locale !== 'en' || model.id !== 'micro' || layer !== 'base') {
    return new Map();
  }

  const selected = new Map();
  for (const keyIndex of enMicroBaseLetterKeys[side]) {
    const key = keyRects[keyIndex];
    if (!key) {
      throw new Error(`micro/base/${side} letter key ${keyIndex} is missing`);
    }
    const candidates = graphics.filter((graphic) => {
      if (
        graphic.tag !== 'path' ||
        graphic.fill !== 'black' ||
        (graphic.stroke && graphic.stroke !== 'none')
      ) {
        return false;
      }
      const graphicCenter = centerOf(graphic);
      if (!containsPoint(key, graphicCenter)) return false;
      if (
        model.baseLegend.badgeRects.some((rect) =>
          containsPoint(rect, graphicCenter)
        )
      ) {
        return false;
      }
      const heightRatio =
        (graphic.box.y2 - graphic.box.y) / model.baseLegend.keySize;
      return heightRatio >= 0.15 && heightRatio <= 0.22;
    });
    if (candidates.length !== 1) {
      throw new Error(
        `micro/base/${side} letter key ${keyIndex} has ` +
          `${candidates.length} primary legend candidates`
      );
    }
    selected.set(candidates[0], keyIndex);
  }

  return selected;
};

const renderGraphic = (graphic, model, selectedLegends) => {
  const keyIndex = selectedLegends.get(graphic);
  if (keyIndex === undefined) return graphic.html;
  if (/\stransform=/.test(graphic.html)) {
    throw new Error(`${model.id} base legend already has a transform`);
  }

  const scale = model.baseLegend.scale;
  const { x, y } = centerOf(graphic);
  const transform =
    scale === 1
      ? ''
      : ` transform="matrix(${formatRatio(scale)} 0 0 ${formatRatio(scale)} ` +
        `${formatNumber(x * (1 - scale))} ${formatNumber(y * (1 - scale))})"`;

  return graphic.html.replace(
    '<path ',
    `<path data-key-legend="letter" data-key-index="${keyIndex}"${transform} `
  );
};

const main = async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });

  models.forEach((model, index) => {
    const diagramModel = diagramModels.get(model.id);
    if (!diagramModel || diagramModel.key_count / 2 !== model.expectedKeysPerHalf) {
      throw new Error(`${model.id} key count differs from ${diagramPath}`);
    }
    model.input = path.resolve(inputs[index]);
    model.expectedHash = diagramModel.references?.[locale]?.sha256;
    if (!model.expectedHash) {
      throw new Error(`${model.id}/${locale} reference is missing from ${diagramPath}`);
    }
    const actualHash = sha256(model.input);
    if (actualHash !== model.expectedHash) {
      throw new Error(
        `${model.id} reference hash is ${actualHash}; expected ${model.expectedHash}`
      );
    }
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 4320, height: 2880 } });

  try {
    const sources = new Map();
    for (const model of models) {
      await page.goto(`file://${model.input}`);
      const source = await page.evaluate(() => {
        const root = document.documentElement;
        const rootMatrix = root.getCTM();
        const inverseRoot = new DOMMatrix([
          rootMatrix.a,
          rootMatrix.b,
          rootMatrix.c,
          rootMatrix.d,
          rootMatrix.e,
          rootMatrix.f,
        ]).inverse();

        const transformedBox = (element) => {
          const box = element.getBBox();
          const matrix = element.getCTM();
          const localMatrix = inverseRoot.multiply(
            new DOMMatrix([
              matrix.a,
              matrix.b,
              matrix.c,
              matrix.d,
              matrix.e,
              matrix.f,
            ])
          );
          const points = [
            [box.x, box.y],
            [box.x + box.width, box.y],
            [box.x + box.width, box.y + box.height],
            [box.x, box.y + box.height],
          ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(localMatrix));

          return {
            x: Math.min(...points.map((point) => point.x)),
            y: Math.min(...points.map((point) => point.y)),
            x2: Math.max(...points.map((point) => point.x)),
            y2: Math.max(...points.map((point) => point.y)),
          };
        };

        return {
          rootFill: root.getAttribute('fill'),
          defs: Array.from(root.children)
            .filter((element) => element.tagName.toLowerCase() === 'defs')
            .map((element) => element.outerHTML),
          graphics: Array.from(root.children).flatMap((element) => {
            if (!element.getBBox || element.tagName.toLowerCase() === 'defs') {
              return [];
            }

            return [
              {
                tag: element.tagName.toLowerCase(),
                width: Number(element.getAttribute('width') || 0),
                height: Number(element.getAttribute('height') || 0),
                fill: element.getAttribute('fill'),
                stroke: element.getAttribute('stroke'),
                box: transformedBox(element),
                html: element.outerHTML,
              },
            ];
          }),
        };
      });
      sources.set(model.id, source);
    }

    const standardLegend = measureBaseLegends(
      models[0],
      sources.get(models[0].id)
    );
    for (const model of models) {
      model.baseLegend = measureBaseLegends(model, sources.get(model.id));
      const scale =
        locale === 'en' ? standardLegend.ratio / model.baseLegend.ratio : 1;
      model.baseLegend.scale = Math.abs(scale - 1) < 0.002 ? 1 : scale;
      model.baseLegend.targetRatio =
        locale === 'en' ? standardLegend.ratio : model.baseLegend.ratio;
    }

    for (const model of models) {
      const source = sources.get(model.id);
      for (const [layer, yMin, yMax] of model.layers) {
        for (const side of ['left', 'right']) {
          const graphics = source.graphics.filter(({ box }) => {
            const centerX = (box.x + box.x2) / 2;
            const centerY = (box.y + box.y2) / 2;
            const isSheetBackground =
              box.x2 - box.x > 3000 || box.y2 - box.y > 2000;
            const isSide =
              side === 'left'
                ? centerX >= model.xMin && centerX < model.split
                : centerX >= model.split;

            return !isSheetBackground && isSide && centerY >= yMin && centerY < yMax;
          });
          const keyRects = graphics.filter(isKeyRect);

          if (keyRects.length !== model.expectedKeysPerHalf) {
            throw new Error(
              `${model.id}/${layer}/${side} contains ${keyRects.length} keys; ` +
                `expected ${model.expectedKeysPerHalf}`
            );
          }

          const keySize = keyRects[0].width;
          if (keyRects.some(({ width }) => Math.abs(width - keySize) > 0.01)) {
            throw new Error(`${model.id}/${layer}/${side} mixes key sizes`);
          }
          const selectedLegends = selectBaseLetterLegends(
            graphics,
            keyRects,
            model,
            layer,
            side
          );

          const padding = 2;
          const contentX = Math.min(...keyRects.map(({ box }) => box.x)) - padding;
          const y = Math.min(...keyRects.map(({ box }) => box.y)) - padding;
          const contentX2 = Math.max(...keyRects.map(({ box }) => box.x2)) + padding;
          const y2 = Math.max(...keyRects.map(({ box }) => box.y2)) + padding;
          const contentWidth = contentX2 - contentX;
          const width = keySize * keyCanvasWidth;
          if (width < contentWidth) {
            throw new Error(
              `${model.id}/${layer}/${side} needs ${contentWidth / keySize} ` +
                `key widths; normalized canvas provides ${keyCanvasWidth}`
            );
          }
          const x = (contentX + contentX2 - width) / 2;
          const height = y2 - y;
          const viewBox = [x, y, width, height].map(formatNumber).join(' ');
          const output = [
            '<svg xmlns="http://www.w3.org/2000/svg"',
            ` width="${formatNumber(width)}"`,
            ` height="${formatNumber(height)}"`,
            ` viewBox="${viewBox}"`,
            source.rootFill ? ` fill="${source.rootFill}"` : '',
            ` data-reference-sha256="${model.expectedHash}"`,
            ` data-model="${model.id}"`,
            ` data-layer="${layer}"`,
            ` data-side="${side}"`,
            ` data-locale="${locale}"`,
            locale === 'en' && layer === 'base' && model.baseLegend.scale !== 1
              ? ` data-base-legend-source-ratio="${formatRatio(model.baseLegend.ratio)}"`
              : '',
            locale === 'en' && layer === 'base' && model.baseLegend.scale !== 1
              ? ` data-base-legend-target-ratio="${formatRatio(model.baseLegend.targetRatio)}"`
              : '',
            locale === 'en' && layer === 'base' && model.baseLegend.scale !== 1
              ? ` data-base-legend-scale="${formatRatio(model.baseLegend.scale)}"`
              : '',
            ` data-key-canvas-width="${keyCanvasWidth}">`,
            ...source.defs,
            ...graphics.map((graphic) =>
              renderGraphic(graphic, model, selectedLegends)
            ),
            '</svg>\n',
          ].join('');
          const outputPath = path.join(
            outputDirectory,
            `${model.id}-${layer}-${side}.svg`
          );

          fs.writeFileSync(outputPath, output);
          console.log(
            `${path.relative(project, outputPath)}: ` +
              `${keyRects.length} keys, ${graphics.length} vector elements`
          );
        }
      }
    }
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
