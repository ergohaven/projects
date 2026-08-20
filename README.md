# Ergohaven product landings

One Hugo project for the Ergohaven product family. English and Russian share the same templates and page structure while keeping all editable copy in language-specific Markdown files.

## Pages

- `/` — product menu
- `/k04/` — K:04 Series
- `/phenom/` — Phenom Series
- `/macropad/` — Macropad

Every page has a matching file under `content/en/` and `content/ru/`. Product imagery is intentionally absent during the layout-and-copy stage; each product page reserves a labelled visual area that can later be replaced from its owning Markdown file without changing the page structure.

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
