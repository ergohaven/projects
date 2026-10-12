# Phenom-only landing isolation

Phenom uses the `phenom` content type in both locale bundles. Hugo selects
`layouts/phenom/{baseof,single}.html`; all of its partials live below
`layouts/partials/phenom/`. These templates load `phenom-site.css`,
`phenom-mobile.css`, `phenom-art-direction.css`, `phenom-site.js`, and
`phenom-mobile.js` only on Phenom.

The original shared templates, `site.css`, `site.js`, K:04/Macropad bundles,
layout data and assets are intentionally unchanged. Do not move Phenom's
private template or stylesheet changes into the shared entry points without
checking the other pages against a clean baseline.

## Verification

```sh
scripts/check.sh
python3 scripts/check_phenom_isolation.py
```

The standard check retains the existing K:04/Macropad contracts and updates
only Phenom expectations (authored copy, chapter order, photography, theme
videos, six specification groups and light/dark vector layouts).

For scope regression testing, build a clean `origin/main` checkout in both
locales using the pinned Hugo version, then compare its output:

```sh
python3 scripts/check_phenom_isolation.py --baseline /path/to/baseline/public
```

Every non-Phenom HTML page and its directly referenced CSS/JS/media must be
byte-identical. `--canonical /path/to/current/public` additionally compares
Phenom's HTML with the canonical working-tree build, ignoring only the private
entry point names, fingerprint hashes and integrity values (integrity is
checked separately against the actual files).

Browser verification for this extraction covered EN/RU × 390/1440px ×
light/dark, computed style and geometry equality with the current landing,
theme switching, all model/layer controls, keyboard navigation, mobile zoom,
mobile specification accordion, desktop restoration and reduced-motion video
loading. No generated build output or browser captures belong in this PR.
