#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_dir"

expected_pages=$(printf '%s\n' _index.md k04/index.md macropad/index.md phenom/index.md)
for language in en ru; do
  actual_pages=$(find "content/$language" -type f -name '*.md' -printf '%P\n' | LC_ALL=C sort)
  diff -u <(printf '%s\n' "$expected_pages") <(printf '%s\n' "$actual_pages")
done

for image in 01-hero.jpg 02-standard.jpg 02-mini.jpg 02-micro.jpg 03-modularity-trackballs.jpg; do
  test -f "assets/images/products/phenom/$image"
done
for layout_data in phenom k04 macropad; do
  test -f "data/key_layouts/$layout_data.json"
done
test "$(find assets/images/products/phenom/layouts -mindepth 2 -maxdepth 2 -type f -name '*.svg' | wc -l)" -eq 112

for product in k04 phenom macropad; do
  en_keys=$(sed -n '/^---$/,/^---$/p' "content/en/$product/index.md" | sed '1d;$d' | rg '^[a-z_]+:' | cut -d: -f1)
  ru_keys=$(sed -n '/^---$/,/^---$/p' "content/ru/$product/index.md" | sed '1d;$d' | rg '^[a-z_]+:' | cut -d: -f1)
  diff -u <(printf '%s\n' "$en_keys") <(printf '%s\n' "$ru_keys")
done

if command -v node >/dev/null 2>&1; then
  node --check assets/js/site.js
  node --check assets/js/phenom-site.js
  node --check assets/js/phenom-mobile.js
  node --check scripts/import_phenom_layout_refs.cjs
fi
python3 -m py_compile scripts/check_html.py

"$project_dir/scripts/build.sh"
python3 scripts/check_html.py

for language in en ru; do
  for page in index.html k04/index.html phenom/index.html macropad/index.html; do
    if [[ "$page" == phenom/index.html ]]; then
      rg -q 'data-phenom-tag=hero' "public/$language/$page"
      if rg -q 'data-theme-toggle' "public/$language/$page"; then
        echo "Phenom uses automatic theme selection, not a theme toggle" >&2
        exit 1
      fi
    else
      rg -q 'data-theme-toggle' "public/$language/$page"
    fi
    if [[ "$page" == phenom/index.html ]]; then
      if rg -q 'class=language-link' "public/$language/$page"; then
        echo "Phenom language switch must remain removed" >&2
        exit 1
      fi
    else
      rg -q 'class=language-link' "public/$language/$page"
    fi
    if [[ "$page" == phenom/index.html ]]; then
      rg -q 'class="brand brand--return"' "public/$language/$page"
    fi
    if [[ "$page" != index.html ]]; then
      if [[ "$page" == phenom/index.html ]]; then
        rg -q 'class="product-page product-page--phenom hero-layout-immersive"' "public/$language/$page"
      else
        rg -q 'class="product-page hero-layout-immersive"' "public/$language/$page"
      fi
      rg -q 'class="product-hero product-hero--immersive"' "public/$language/$page"
      rg -q 'class=site-header__actions' "public/$language/$page"
      rg -q 'class=product-hero__copy><h1' "public/$language/$page"
      if rg -q 'class=site-header__facts|class=header-back' "public/$language/$page"; then
        echo "$page header must contain only language and theme controls" >&2
        exit 1
      fi
    fi
    rg -q 'class=product-stage' "public/$language/$page" || [[ "$page" == index.html ]]
  done

  rg -q 'class="product-page product-page--phenom hero-layout-immersive"' "public/$language/phenom/index.html"
  rg -q 'class="product-hero product-hero--immersive"' "public/$language/phenom/index.html"
  rg -q 'class=product-stage__picture' "public/$language/phenom/index.html"
  rg -q 'class=product-stage__image' "public/$language/phenom/index.html"
  rg -q 'type=image/webp' "public/$language/phenom/index.html"
  rg -q 'class="series-showcase section"' "public/$language/phenom/index.html"
  rg -q 'class=series-gallery' "public/$language/phenom/index.html"
  test "$(rg -o 'class=series-card__visual' "public/$language/phenom/index.html" | wc -l)" -eq 3
  # Active delivery markup plus the three noscript photo fallbacks.
  test "$(rg -o 'class=series-card__picture' "public/$language/phenom/index.html" | wc -l)" -eq 6
  test "$(rg -o 'class=series-card__image' "public/$language/phenom/index.html" | wc -l)" -eq 6
  rg -q 'visual-chapter--modularity' "public/$language/phenom/index.html"
  rg -q 'class="chapter-media chapter-media--image visual-chapter__media"' "public/$language/phenom/index.html"
  rg -q 'class=chapter-media__image' "public/$language/phenom/index.html"
  rg -q 'class="key-layout-chapter section"' "public/$language/phenom/index.html"
  rg -q 'data-key-layout' "public/$language/phenom/index.html"
  rg -q 'data-layout-source=cb48b91787fc47767d2fda263286873d3e438ea5' "public/$language/phenom/index.html"
  test "$(rg -o 'data-key-layout-model-control' "public/$language/phenom/index.html" | wc -l)" -eq 3
  test "$(rg -o 'data-key-layout-model-view' "public/$language/phenom/index.html" | wc -l)" -eq 3
  test "$(rg -o 'data-layout-reference' "public/$language/phenom/index.html" | wc -l)" -eq 3
  test "$(rg -o 'data-key-layout-layer-target' "public/$language/phenom/index.html" | wc -l)" -eq 14
  test "$(rg -o 'data-key-layout-layer-target=function' "public/$language/phenom/index.html" | wc -l)" -eq 2
  test "$(rg -o 'data-key-layout-layer-panel' "public/$language/phenom/index.html" | wc -l)" -eq 14
  # Includes noscript wrapper classes and matching fallback SVG URLs.
  test "$(rg -o 'class="key-layout-diagram__half ' "public/$language/phenom/index.html" | wc -l)" -eq 56
  test "$(rg -o 'images/products/phenom/layouts/[^ >]*\.svg' "public/$language/phenom/index.html" | wc -l)" -eq 112
  test "$(rg -o "images/products/phenom/layouts/${language}/[^ >]*\.svg" "public/$language/phenom/index.html" | wc -l)" -eq 112
  other_language=$([[ "$language" == en ]] && printf ru || printf en)
  if rg -q "images/products/phenom/layouts/${other_language}/" "public/$language/phenom/index.html"; then
    echo "Phenom $language page must not load $other_language layout artwork" >&2
    exit 1
  fi
  test "$(rg -o 'class="key-layout-diagram__key' "public/$language/phenom/index.html" | wc -l)" -eq 0
  expected_models=$(printf '%s\n' standard mini micro)
  actual_models=$(rg -o 'data-key-layout-model-control=[^ >]+' "public/$language/phenom/index.html" | cut -d= -f2)
  diff -u <(printf '%s\n' "$expected_models") <(printf '%s\n' "$actual_models")
  model_switch_offset=$(rg --byte-offset -o 'class=key-layout-models' "public/$language/phenom/index.html" | head -n 1 | cut -d: -f1)
  panels_offset=$(rg --byte-offset -o 'class=key-layout-panels' "public/$language/phenom/index.html" | head -n 1 | cut -d: -f1)
  layer_switch_offset=$(rg --byte-offset -o 'class=key-layout-tabs' "public/$language/phenom/index.html" | head -n 1 | cut -d: -f1)
  test "$model_switch_offset" -lt "$panels_offset"
  test "$layer_switch_offset" -gt "$panels_offset"
  test "$(rg -o 'class=key-layout-layer__title--single-line' "public/$language/phenom/index.html" | wc -l)" -eq 0
  if rg -q 'key-layout-layer__number' "public/$language/phenom/index.html"; then
    echo "Phenom layout layer numbers must remain removed" >&2
    exit 1
  fi
  if rg -q 'is-compact' "public/$language/phenom/index.html"; then
    echo "Phenom key labels must use one uniform font size" >&2
    exit 1
  fi
  expected_story=$(printf '%s\n' finger-geometry curves additive-manufacturing keycaps-switches entropy wired specs cta)
  actual_story=$(rg -o 'data-product-chapter=[^ >]+' "public/$language/phenom/index.html" | cut -d= -f2)
  diff -u <(printf '%s\n' "$expected_story") <(printf '%s\n' "$actual_story")
  test "$(rg -o 'data-media-placeholder=' "public/$language/phenom/index.html" | wc -l)" -eq 0
  test "$(rg -o 'class=detail-sequence__item' "public/$language/phenom/index.html" | wc -l)" -eq 4
  test "$(rg -o 'class="visual-chapter ' "public/$language/phenom/index.html" | wc -l)" -eq 7
  test "$(rg -o 'visual-chapter--centered' "public/$language/phenom/index.html" | wc -l)" -eq 1
  test "$(rg -o 'visual-chapter--bleed-edge' "public/$language/phenom/index.html" | wc -l)" -eq 2
  test "$(rg -o 'visual-chapter--bleed-copy-left' "public/$language/phenom/index.html" | wc -l)" -eq 1
  test "$(rg -o 'visual-chapter--split-left' "public/$language/phenom/index.html" | wc -l)" -eq 1
  test "$(rg -o 'visual-chapter--closing' "public/$language/phenom/index.html" | wc -l)" -eq 1
  test "$(rg -o 'class=specs-chapter__group[ >]' "public/$language/phenom/index.html" | wc -l)" -eq 6
  test "$(rg -o 'class="visual-chapter__action ' "public/$language/phenom/index.html" | wc -l)" -eq 2
  for model in Standard Mini Micro; do
    rg -q "<h3>${model}" "public/$language/phenom/index.html"
  done
  if rg -q 'class="principles section|class="software section' "public/$language/phenom/index.html"; then
    echo "Phenom must use the approved image-led chapter sequence" >&2
    exit 1
  fi

  k04_page="public/$language/k04/index.html"
  rg -q 'class="series-showcase section"' "$k04_page"
  rg -q 'class=series-gallery' "$k04_page"
  test "$(rg -o 'class=series-card__visual' "$k04_page" | wc -l)" -eq 3
  if rg -q 'class=series-card__picture|class=series-card__image' "$k04_page"; then
    echo "K:04 series cards must remain placeholder-led until product photography is supplied" >&2
    exit 1
  fi
  expected_k04_story=$(printf '%s\n' modularity wireless layout column-stagger entropy keycaps-switches compact-powerful comfort specs cta)
  actual_k04_story=$(rg -o 'data-product-chapter=[^ >]+' "$k04_page" | cut -d= -f2)
  diff -u <(printf '%s\n' "$expected_k04_story") <(printf '%s\n' "$actual_k04_story")
  test "$(rg -o 'data-media-placeholder=' "$k04_page" | wc -l)" -eq 14
  test "$(rg -o 'class=detail-sequence__item' "$k04_page" | wc -l)" -eq 3
  test "$(rg -o 'class="visual-chapter ' "$k04_page" | wc -l)" -eq 7
  test "$(rg -o 'class=specs-chapter__group[ >]' "$k04_page" | wc -l)" -eq 3
  test "$(rg -o 'data-cta-action-pending' "$k04_page" | wc -l)" -eq 1
  test "$(rg -o 'data-layout-preview=k04' "$k04_page" | wc -l)" -eq 1
  test "$(rg -o 'data-layout-source=c84a649f6871de0b14a97ebf1400efc559f51d5d' "$k04_page" | wc -l)" -eq 1
  test "$(rg -o 'data-source-layout-diagram=k04' "$k04_page" | wc -l)" -eq 1
  test "$(rg -o 'data-source-layout-key=' "$k04_page" | wc -l)" -eq 58
  test "$(rg -o 'data-source-layout-encoder' "$k04_page" | wc -l)" -eq 0

  macropad_page="public/$language/macropad/index.html"
  if rg -q 'series-showcase|series-gallery|series-card__visual' "$macropad_page"; then
    echo "Macropad must not render a product-series gallery" >&2
    exit 1
  fi
  expected_macropad_story=$(printf '%s\n' designed-for display entropy layout design keycaps-switches compact-powerful specs cta)
  actual_macropad_story=$(rg -o 'data-product-chapter=[^ >]+' "$macropad_page" | cut -d= -f2)
  diff -u <(printf '%s\n' "$expected_macropad_story") <(printf '%s\n' "$actual_macropad_story")
  test "$(rg -o 'data-media-placeholder=' "$macropad_page" | wc -l)" -eq 10
  test "$(rg -o 'class=detail-sequence__item' "$macropad_page" | wc -l)" -eq 3
  test "$(rg -o 'class="visual-chapter ' "$macropad_page" | wc -l)" -eq 6
  test "$(rg -o 'class=specs-chapter__group[ >]' "$macropad_page" | wc -l)" -eq 3
  test "$(rg -o 'data-cta-action-pending' "$macropad_page" | wc -l)" -eq 1
  test "$(rg -o 'data-layout-preview=macropad' "$macropad_page" | wc -l)" -eq 1
  test "$(rg -o 'data-layout-source=cb48b91787fc47767d2fda263286873d3e438ea5' "$macropad_page" | wc -l)" -eq 1
  test "$(rg -o 'data-source-layout-diagram=macropad' "$macropad_page" | wc -l)" -eq 1
  test "$(rg -o 'data-source-layout-key=' "$macropad_page" | wc -l)" -eq 12
  test "$(rg -o 'data-source-layout-encoder' "$macropad_page" | wc -l)" -eq 1

  if rg -q 'class="principles section|class="software section' \
    "public/$language/k04/index.html" \
    "public/$language/phenom/index.html" \
    "public/$language/macropad/index.html"; then
    echo "Product pages must use the approved immersive chapter sequences" >&2
    exit 1
  fi

  if rg -q '<img|<picture|data:image' "$k04_page" "$macropad_page"; then
    echo "K:04 and Macropad must remain placeholder-only until product photography is supplied" >&2
    exit 1
  fi
done

python3 scripts/check_phenom_isolation.py

rg -q '<h1 id=product-title>Mechanical\. Split\. Wireless\.</h1>' public/en/k04/index.html
rg -q '<h1 id=product-title>Механическая\. Сплит\. Без проводов\.</h1>' public/ru/k04/index.html
rg -q '<h2 id=k04-layout-title>Only 58 keys\. Infinite possibilities\.</h2>' public/en/k04/index.html
rg -q '<h2 id=k04-layout-title>Всего 58 клавиш\. Возможности без границ\.</h2>' public/ru/k04/index.html
rg -q '<h2 id=k04-cta-title>Build your K:04</h2>' public/en/k04/index.html
rg -q '<h2 id=k04-cta-title>Соберите свою K:04</h2>' public/ru/k04/index.html
rg -q '<dt>Keys</dt><dd>58</dd>' public/en/k04/index.html
rg -q '<dt>Клавиши</dt><dd>58</dd>' public/ru/k04/index.html

rg -q '<h1 id=product-title>Control that adapts</h1>' public/en/macropad/index.html
rg -q '<h1 id=product-title>Управление, которое подстраивается</h1>' public/ru/macropad/index.html
rg -q '<h2 id=macropad-display-title>Your keys, live on screen</h2>' public/en/macropad/index.html
rg -q '<h2 id=macropad-display-title>Назначения клавиш — прямо на экране</h2>' public/ru/macropad/index.html
rg -q '<h2 id=macropad-layout-title>See what comes by default</h2>' public/en/macropad/index.html
rg -q '<h2 id=macropad-layout-title>Начните с базовой раскладки</h2>' public/ru/macropad/index.html
for fact in '<dt>Keys</dt><dd>12</dd>' '<dt>Main grid</dt><dd>0–9</dd>' '<dt>Layers</dt><dd>Previous · Next</dd>' '<dt>Encoder</dt><dd>Mute · Volume</dd>'; do
  rg -Fq "$fact" public/en/macropad/index.html
done
for fact in '<dt>Клавиши</dt><dd>12</dd>' '<dt>Основная сетка</dt><dd>0–9</dd>' '<dt>Слои</dt><dd>Назад · вперёд</dd>' '<dt>Энкодер</dt><dd>Выключение звука · громкость</dd>'; do
  rg -Fq "$fact" public/ru/macropad/index.html
done

rg -q 'href=https://projects\.eh\.works/k04/' public/en/k04/index.html
rg -q 'href=https://projects\.eh\.industries/k04/' public/ru/k04/index.html
rg -q 'href=https://projects\.eh\.works/' public/en/index.html
rg -q 'href=https://projects\.eh\.industries/' public/ru/index.html
for language in en ru; do
  rg -Fq 'fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New' "public/$language/index.html"
  generated_css_href="$(rg -o 'href=/css/site\.min\.[a-f0-9]+\.css' "public/$language/index.html" | head -n 1 | cut -d= -f2)"
  generated_css="public/$language$generated_css_href"
  test -f "$generated_css"
  rg -Fq -- '--font-sans:"Zen Kaku Gothic New"' "$generated_css"
  rg --pcre2 -q '\.product-hero--immersive h1\{[^}]*letter-spacing:normal' "$generated_css"
  rg -q '@media\(max-width:390px\)' "$generated_css"
  rg -q 'prefers-reduced-motion:reduce' "$generated_css"
done

if rg -q '<img|<picture|data:image' public/en/index.html public/en/404.html public/ru/index.html public/ru/404.html; then
  echo "Home and 404 pages must remain free of product imagery" >&2
  exit 1
fi

if rg -q 'target=_blank' public/en public/ru; then
  echo "Links must open in the current tab" >&2
  exit 1
fi

echo "Landings contract OK: EN/RU × home/K:04/Phenom/Macropad/404"
