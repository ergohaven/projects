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

## Production deployment

Source remains in this repository. Two small deployment repositories call the shared, SHA-pinned [`production-pages.yml`](.github/workflows/production-pages.yml) workflow:

- `ergohaven/projects-ru` → `https://projects.eh.works/phenom/`
- `ergohaven/projects-en` → `https://projects.eh.industries/phenom/`

Production publishes **Phenom only**, its shared assets, a 404 page, and a sitemap containing only the published landing. The domain root redirects to `/phenom/`, so the existing home link remains useful without exposing the draft product menu. K:04 and Macropad remain available in the existing GitHub preview, not in production. No page templates or copy are changed by deployment.

To publish an approved source commit, run the **Deploy production landing** workflow in both deployment repositories with the same full `source_ref` SHA:

```sh
gh workflow run deploy.yml --repo ergohaven/projects-ru -f source_ref=<approved-source-sha>
gh workflow run deploy.yml --repo ergohaven/projects-en -f source_ref=<approved-source-sha>
```

Publishing is explicit: changing source or the GitHub preview does **not** silently promote a draft to production. Build and deploy run in the target repository with its own GitHub token; no cross-repository deployment secret is stored. Each run records the resolved source SHA in its summary. Re-run with a previous approved SHA to roll back. The pinned reusable-workflow revision must be updated in both deployment repositories when changing deployment logic.

For a local production artifact after `./scripts/check.sh`:

```sh
python3 scripts/test_stage_production.py -v
python3 scripts/stage_production.py --source public/ru --destination production/ru --page phenom --language ru
python3 scripts/stage_production.py --source public/en --destination production/en --page phenom --language en
```

The destination must be new; the staging command never deletes or overwrites an existing output.

### DNS (REG.RU)

Both domains use REG.RU DNS. Add a `CNAME` record named `projects` to each domain zone (`eh.works` and `eh.industries`), pointing to `ergohaven.github.io.`. Do not include `https://` or a URL path in the record. Keep the root domains and their existing records unchanged; a `CNAME` must not coexist with `A`/`AAAA` records at the exact same `projects` name.

The corresponding custom domain must already be registered in each deployment repository's Pages settings before adding DNS. Once DNS propagates, GitHub provisions the HTTPS certificates; enable **Enforce HTTPS** after certificate issuance. Do not treat a green deployment alone as proof that custom-domain DNS or HTTPS is ready.
