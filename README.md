# Ergohaven product landings

One Hugo project for the Ergohaven product family. English and Russian share the same templates and page structure while keeping all editable copy in language-specific Markdown files.

The shared visual and content system is defined in [`design-rules.md`](design-rules.md).

## Pages

- `/` — product menu
- `/k04/` — K:04 Series
- `/phenom/` — Phenom Series
- `/macropad/` — Macropad

Every page has a matching file under `content/en/` and `content/ru/`. The three product pages share one immersive, ordered visual-story system while keeping their copy and chapter sequence in localized Markdown front matter.

- Phenom declares real responsive hero and series photography, then continues through an ordered `story_chapters` sequence. Its interactive Standard/Mini/Micro diagrams use source-pinned QMK model metadata plus checksum-pinned EN/RU vector references in `data/key_layouts/phenom.json`, so each domain renders legends in its own language.
- K:04 and Macropad use localized, accessible media placeholders until their photography is supplied. Their placeholder identifiers are stable, so assets can be replaced without changing chapter order or copy structure.
- The K:04 Standard and Macropad default layout diagrams are derived from authoritative RMK/QMK geometry and keymaps. Their source paths, checksums, geometry, and default controls are pinned in `data/key_layouts/k04.json` and `data/key_layouts/macropad.json`.

Shared chapter partials render visual chapters, three- or four-item detail sequences, source-derived layout diagrams, specification groups, and pending closing actions. A closing action remains non-interactive until its real destination is provided.

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
