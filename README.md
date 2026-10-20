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

## Production deployment: Cloudflare Pages

Use [`cloudflare-pages.yml`](.github/workflows/cloudflare-pages.yml) in `ergohaven/projects` for durable **Direct Upload via GitHub Actions + Wrangler**. No dashboard ZIP updates and no native Cloudflare Git integration are needed. One explicit promotion builds and publishes both languages from the same approved full SHA. Push/PR runs that touch the pipeline only build and validate, without Cloudflare credentials; source pushes never automatically publish production.

### One-time setup

1. In this source repository's **Settings → Secrets and variables → Actions**, add repository secrets `CLOUDFLARE_ACCOUNT_ID` (the correct account's 32-character hexadecimal ID) and `CLOUDFLARE_API_TOKEN` (Account / Cloudflare Pages / Edit, scoped to that account). Enter secrets only through GitHub's UI, never in chat or source. No policy changes to allow third-party actions are required.
2. Merge the workflow, helper and tests to `main`. In Actions, select **Publish Phenom to Cloudflare Pages**, **Run workflow**, branch `main`, and supply the approved full lowercase 40-character `source_ref`. It must be a commit in `main`'s ancestry. For example, after the authorized operator's normal identity checks: `gh workflow run cloudflare-pages.yml --repo ergohaven/projects --ref main -f source_ref=<approved-full-sha>`.
3. The publisher preflights both `ergohaven-projects-ru` and `ergohaven-projects-en` before deploying either. It creates missing Direct Upload projects with production branch `main` and GET-verifies each creation; existing compatible projects keep their actual production branch. Git-integrated or function-enabled projects are rejected, not converted or overwritten. Project names are fixed deliberately to avoid accidental retargeting.
4. After a successful publication, add `projects.eh.works` to the RU project's **Custom domains** and `projects.eh.industries` to the EN project's **Custom domains**. Use the **actual assigned `pages.dev` hostname displayed by Cloudflare**, not a guessed name. At REG.RU, replace only each `projects` record with the corresponding CNAME; remove conflicting A/AAAA at that exact name. Do not change root nameservers, root website or mail records. Check custom-domain status, HTTPS and `/phenom/` in both languages separately.

The owning `check.sh` builds both locales; the existing production stager and isolation validator publish **Phenom only**, shared assets, a 404 and the filtered sitemap. The domain root redirects to `/phenom/`; K:04/Macropad remain preview-only. No frontend, copy or design changes are involved.

A same-run `phenom-production` artifact retains both locale directories, machine-use per-locale archives and a manifest with the source SHA and every published file's SHA-256. Archives are CI evidence, **not a manual deployment procedure**. The credentialed job runs only on trusted `main` workflow dispatch, installs exact Wrangler 4.151.3 before receiving credentials, uses workflow-revision helpers rather than arbitrary source/artifact code, and checks the downloaded manifest before any API write. Publication requires Wrangler success plus GET readback of the production deployment's project, branch, SHA and successful deploy stage, then a matching public deployment-URL `/phenom/` HTML hash. The successful job summary records returned URLs and deployment IDs; build-only success is not publication or custom-domain readiness.

Re-run this same workflow with a previous approved main-ancestor SHA to roll back both locales. Publication is sequential, not an atomic cross-project transaction: if the second locale fails, the first may already be live. Inspect the failed run and re-run the intended SHA for both; do not assume automatic rollback. External API/deployment checks require real credentials and are not exercised by offline fixture tests.

Local pipeline verification (no credentials):

```sh
python3 scripts/test_cloudflare_pages.py -v
python3 scripts/test_stage_production.py -v
./scripts/check.sh
for locale in ru en; do
  python3 scripts/stage_production.py --source "public/$locale" --destination "production/$locale" --page phenom --language "$locale"
done
python3 scripts/check_phenom_isolation.py --public production --canonical public
python3 scripts/cloudflare_pages.py manifest --root production --source-sha "$(git rev-parse HEAD)"
```

The staging destination must be new. Do not manually run the credentialed `publish` command as a dry run: it makes real writes.

### Legacy GitHub Pages (retained for rollback)

The existing preview and [`production-pages.yml`](.github/workflows/production-pages.yml) workflows and deployment repositories remain unchanged. The older GitHub Pages path below is retained for rollback, **not the Cloudflare setup procedure**. Source remains in this repository. Two small deployment repositories call the shared, SHA-pinned workflow:

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
