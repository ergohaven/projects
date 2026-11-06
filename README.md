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

## Additional bilingual GitHub Pages copy (Phenom only)

[`pages.yml`](.github/workflows/pages.yml) automatically validates and publishes every push to `main` at **https://ergohaven.github.io/projects/**. English is `/projects/phenom/`; Russian is `/projects/ru/phenom/`. The project root and `/projects/ru/` redirect to their respective Phenom landing. This independently maintained copy keeps its own canonical/hreflang and locale-navigation URLs. The custom-domain production route below uses the existing domain-root builds.

The native multilingual Hugo build retains shared assets at the project root. `stage_production.py --github-pages --pages-base-url <base_url>` reuses the production scoping rules to compose only the two Phenom HTML pages, two localized 404s, two root redirects, shared assets and filtered EN/RU sitemaps. K:04, Macropad and the product menu HTML are not uploaded. Shared head templates generate metadata URLs from Hugo resources and locale configuration; staging copies landing HTML byte-for-byte. Content, CSS and JavaScript are unchanged; ordinary domain-root staging keeps its original behavior.

The workflow runs the full shared product checks, staging regression tests and a Pages-specific inventory/resource/SRI/canonical/hreflang/navigation check **before** uploading `public-pages`, never the unfiltered `public-pages-build`. It preserves pinned Actions, least-privilege build/deploy permissions and non-cancelling publication concurrency. GitHub Pages must use **GitHub Actions** as its source; a green build alone is not proof of successful deployment. Use the existing manual workflow dispatch on an approved revision for explicit republication; normal content updates only need a push/merge to `main`.

Local verification (new staging destination required):

```sh
bash scripts/hugo.sh --config hugo.yaml,config/github-pages.yaml --baseURL https://ergohaven.github.io/projects/ --destination public-pages-build --environment production --gc --minify --panicOnWarning --printPathWarnings
python3 scripts/test_stage_production.py -v
python3 scripts/stage_production.py --github-pages --source public-pages-build --destination public-pages --page phenom --language en --pages-base-url https://ergohaven.github.io/projects/
python3 scripts/check_github_pages.py --public public-pages --pages-base-url https://ergohaven.github.io/projects/
```

## Production deployment: EN Cloudflare, RU GitHub Pages

[`cloudflare-pages.yml`](.github/workflows/cloudflare-pages.yml) is the automatic mixed-provider production pipeline. Every push/merge to `main` validates and stages both locales from that exact source. Independent jobs publish **EN only to the existing Cloudflare project** (`projects.eh.industries`) and the verified **RU payload to `ergohaven/projects-ru:gh-pages`** (`projects.eh.works`). The target branch contains its trusted Pages workflow and deployment provenance beside `site/`; only `site/` is uploaded to Pages. No templates, content, CSS or JavaScript change as part of this provider split. The additional bilingual GitHub Pages copy remains available. PR execution never receives publication credentials.

### One-time setup and RU-only DNS cutover

1. Keep the existing `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` secrets. The normal Cloudflare call explicitly uses `--locale en`; it does not read, create, update or publish the RU Cloudflare project. Keep the English project's existing production branch/domain and every `eh.industries` DNS record unchanged. The old RU Cloudflare project is not deleted.
2. Retain `projects.eh.works` on the existing `ergohaven/projects-ru` Pages site with **GitHub Actions** as its source (`build_type=workflow`). Allow `gh-pages` in the target `github-pages` environment, preserving any existing branch policies. Do not rely on native branch/Jekyll publishing: GitHub documents cases where a deploy-key push does not trigger that native build.
3. As the authorized GitHub actor, generate a dedicated SSH key and add its public half as a **write deploy key only on `ergohaven/projects-ru`**. Store the private half in the source repository Actions secret **`RU_PAGES_SSH_KEY`**. This grants repository write access, not a branch-only restriction; do not reuse a personal account token, the Timeweb key, or an account-wide SSH key. `ci/github_known_hosts` pins GitHub's ED25519 host identity obtained from the official GitHub API; review host-key changes against GitHub's published identity before rotation.
4. `github_pages_branch.py` verifies the full same-run bilingual manifest, transfers RU only, and makes a normal non-force commit/push to the generated `gh-pages` branch with the configured publisher identity. Its workflow comes from trusted source `ci/ru-pages.yml`, never uploaded artifact code. GitHub starts that target branch's ordinary `push` workflow, which verifies provenance, uploads only `site/`, and deploys using its own repository-local `GITHUB_TOKEN`. A branch-push receipt is not proof of a completed Pages deployment: verify the target run, actor, payload commit and HTTP content separately. A failed or uncertain push must be inspected, not blindly repeated or force-pushed.
5. Verify actual RU content through the GitHub virtual host before changing DNS. In REG.RU change **only** `projects.eh.works` to CNAME **`ergohaven.github.io.`**, without a repository path. Preserve apex, mail, NS and all English records. The domain must already be bound to the intended Pages site. If its certificate is not ready before cutover, disclose the possible initial HTTPS gap and obtain agreement before changing DNS; a working technical hostname or HTTP response does not establish custom-domain TLS readiness. Verify authoritative DNS, normal hostname-valid HTTPS, public assets and browser behavior, then enable HTTPS enforcement.

The existing `check.sh`, production stager and isolation validator still publish **Phenom only**, shared assets, a 404 and filtered sitemap. Domain roots redirect to `/phenom/`; K:04/Macropad stay out of production. Normal content updates require only a push/merge to source `main`, not a manual upload or dispatch.

A same-run `phenom-production` artifact carries both staged locale directories, archives and their source-SHA/per-file SHA-256 manifest. Both publishers execute workflow-revision trusted helpers and independently verify the bundle before writes. Credentials are isolated by job: CF credentials never enter RU Git publication; the target-only SSH key never enters CF publication and is removed from its runner file after use. The existing non-cancelling production concurrency serializes push/manual publication.

For an explicit approved rollback/republication, run **Publish Phenom (EN Cloudflare, RU GitHub Pages)** on source `main` with full lowercase `source_ref`, which must be a main ancestor: `gh workflow run cloudflare-pages.yml --repo ergohaven/projects --ref main -f source_ref=<approved-full-sha>`. Do not dispatch a duplicate normal run after a push. The two providers and target Pages run are not an atomic transaction: one may succeed while another fails. Inspect all source and target receipts before reporting completion. For SSH-key rotation, install a new target-only deploy key, replace the encrypted source secret, verify an actual automatic publication, then revoke the old key explicitly; never put private keys in logs, Git or artifacts.

Local pipeline verification (no credentials):

The workflow routing tests require PyYAML; CI installs `python3-yaml` for its system Python.

```sh
python3 scripts/test_cloudflare_workflow.py -v
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

The separate [`production-pages.yml`](.github/workflows/production-pages.yml) and old manually dispatched wrappers are retained as historical rollback paths, not the normal mixed-provider update route. Do not dispatch the English legacy target as part of this regional split: English stays on Cloudflare. Shared source remains in this repository.

- `ergohaven/projects-ru` → `https://projects.eh.works/phenom/`
- `ergohaven/projects-en` → `https://projects.eh.industries/phenom/`

Production publishes **Phenom only**, its shared assets, a 404 page, and a sitemap containing only the published landing. The domain root redirects to `/phenom/`, so the existing home link remains useful without exposing the draft product menu. K:04 and Macropad remain available in local full-site previews, not in the primary Pages publication. No page templates or copy are changed by deployment.

To publish an approved source commit, run the **Deploy production landing** workflow in both deployment repositories with the same full `source_ref` SHA:

```sh
gh workflow run deploy.yml --repo ergohaven/projects-ru -f source_ref=<approved-source-sha>
gh workflow run deploy.yml --repo ergohaven/projects-en -f source_ref=<approved-source-sha>
```

These historical manual workflows use the target repository's own Pages token/OIDC context. They are not the normal automatic RU route above, which uses a target-scoped SSH deploy key to trigger the target branch workflow and does not persist a personal account token. Each manual run records the resolved source SHA in its summary. Dispatch legacy rollback only when explicitly intended; do not duplicate a normal source push publication.

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
