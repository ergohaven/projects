# Phenom: source, build and regression checks

Phenom is implemented in this Hugo project, not in the archived experimental workspaces. Production builds read only canonical `content/`, `layouts/`, `assets/` and `data/` inputs.

## Build

From the repository root:

```sh
bash scripts/build_phenom_release.sh
```

The default bilingual preview is written to `exports/phenom-release/site/`:

```sh
python3 -m http.server 1368 --bind 0.0.0.0 --directory exports/phenom-release/site
```

Routes: `/phenom/` (EN) and `/ru/phenom/` (RU). An explicit absolute destination can be passed as the build script's first argument. The regular `bash scripts/build.sh` still produces the separate production-domain trees in `public/en/` and `public/ru/`.

Hugo is pinned by `.hugo-version`; `scripts/hugo.sh` installs the pinned local compiler if necessary. Node is not required to render the website. Browser QA uses the pinned development-only Playwright dependency:

```sh
npm ci
npx playwright install chromium firefox
npm run qa:phenom:cta
npm run qa:phenom:interactions
npm run qa:phenom:whole
npm run qa:phenom:heading
npm run qa:phenom:mobile
npm run qa:phenom:fallback
```

Set `PHENOM_QA_BASE` for another preview origin and `PHENOM_QA_OUT` for an evidence directory. Defaults are `http://127.0.0.1:1368` and `exports/phenom-qa/`. `PHENOM_CHROMIUM` / `PHENOM_FIREFOX` optionally select locally installed browser executables. `PHENOM_QA_LOCALES=ru` or `en` limits the whole-page audit. `PHENOM_PLAYWRIGHT_MODULE` is an optional toolchain override, not a website runtime dependency.

## Product isolation

- `content/{en,ru}/phenom/index.md` selects `type: phenom`.
- `layouts/phenom/` and `layouts/partials/phenom/` do not replace shared K04/Macropad templates.
- Locale-specific motion files preserve the Russian word cycle and the separately approved English `Choose your layout / format / Phenom` behavior.
- `phenom-wave-runtime.js` already contains the specs-matrix controller; do not concatenate it twice.
- Exact reviewed WebP encodings are selected through `data/phenom_photo_delivery.json`. Do not silently re-encode or reduce the source ladder. Font files and their OFL license are under `assets/fonts/phenom/`.
- Stylesheets and runtime URLs remain inert until the bootstrap selects the native page or expanded desktop canvas. Do not replace that delivery mechanism with a second eager loader.
- CTA eligibility uses the real parent reading viewport in expanded mobile Desktop Site, not the iframe's full document height. Native mobile keeps decorative callouts hidden.
- The accepted animation policy from the reviewed preview is retained. Changes to motion preferences or phone/canvas routing are separate product decisions.

## Static contracts

```sh
python3 scripts/check_phenom_release.py --site exports/phenom-release/site
```

This verifies exact approved image bytes, isolated product layout, locale heading, resource closure, and the structural Phenom HTML contracts. No old preview-server or private snapshot URLs may appear in the packaged page/runtime.

`check_html.py` counts the active Phenom branch separately from explicit no-JS copies and recognizes deferred diagram/poster attributes. The legacy shell assertions use the same active-HTML view; their structural assertions remain in place. No-JS fallbacks must also be exercised in browser QA. A pre-existing failure in an unrelated product's contract must be reported against its baseline, not hidden or fixed incidentally while modifying Phenom.

No commit, push or public deployment is performed by these commands.
