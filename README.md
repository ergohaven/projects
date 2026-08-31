# Ergohaven product landings

One Hugo project for the Ergohaven product family. English and Russian share the same templates and page structure while keeping all editable copy in language-specific Markdown files.

The shared visual and content system is defined in [`design-rules.md`](design-rules.md).

## Pages

- `/` — product menu
- `/k04/` — K:04 Series
- `/phenom/` — Phenom Series
- `/macropad/` — Macropad

Every page has a matching file under `content/en/` and `content/ru/`. Phenom declares its responsive hero, series, and visual-chapter images from the localized Markdown front matter. Its interactive Standard/Mini/Micro diagrams use source-pinned QMK model metadata plus separate checksum-pinned EN/RU vector references in `data/key_layouts/phenom.json`, so each domain renders legends in its own language. The model switch sits above the keyboard; each model owns its centered layer switch below it, including the Function + Media layer available on Mini and Micro.

The remaining Phenom narrative is an ordered `story_chapters` sequence: Curves, finger geometry, additive manufacturing, keycaps and switches, wired connection, Entropy, specifications, and the closing CTA. Shared chapter partials render the current labelled media placeholders; each placeholder can later be replaced by a responsive image through the same media contract without changing the page structure. K:04 and Macropad remain outside this Phenom-only system.

## Local development

```sh
./scripts/dev.sh
./scripts/check.sh
```

The development server renders English at `/` and Russian at `/ru/`.

## Production outputs

`./scripts/build.sh` creates two independent domain roots:

- `public/en/` → `https://projects.eh.industries/`
- `public/ru/` → `https://projects.eh.works/`

Deployment is deliberately not configured until the layouts and copy are approved.
