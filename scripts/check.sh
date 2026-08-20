#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_dir"

expected_pages=$(printf '%s\n' _index.md k04/index.md macropad/index.md phenom/index.md)
for language in en ru; do
  actual_pages=$(find "content/$language" -type f -name '*.md' -printf '%P\n' | LC_ALL=C sort)
  diff -u <(printf '%s\n' "$expected_pages") <(printf '%s\n' "$actual_pages")
done

for product in k04 phenom macropad; do
  en_keys=$(sed -n '/^---$/,/^---$/p' "content/en/$product/index.md" | sed '1d;$d' | rg '^[a-z_]+:' | cut -d: -f1)
  ru_keys=$(sed -n '/^---$/,/^---$/p' "content/ru/$product/index.md" | sed '1d;$d' | rg '^[a-z_]+:' | cut -d: -f1)
  diff -u <(printf '%s\n' "$en_keys") <(printf '%s\n' "$ru_keys")
done

if command -v node >/dev/null 2>&1; then
  node --check assets/js/site.js
fi
python3 -m py_compile scripts/check_html.py

"$project_dir/scripts/build.sh"
python3 scripts/check_html.py

for language in en ru; do
  for page in index.html k04/index.html phenom/index.html macropad/index.html; do
    rg -q 'data-theme-toggle' "public/$language/$page"
    rg -q 'class=language-link' "public/$language/$page"
    rg -q 'class=product-stage' "public/$language/$page" || [[ "$page" == index.html ]]
  done
done

rg -q 'href=https://projects\.eh\.works/k04/' public/en/k04/index.html
rg -q 'href=https://projects\.eh\.industries/k04/' public/ru/k04/index.html
rg -q 'href=https://projects\.eh\.works/' public/en/index.html
rg -q 'href=https://projects\.eh\.industries/' public/ru/index.html
generated_css="$(find public/en -type f -name '*.css' -print -quit)"
test -n "$generated_css"
rg -q '@media\(max-width:390px\)' "$generated_css"
rg -q 'prefers-reduced-motion:reduce' "$generated_css"

if rg -q '<img|<picture|data:image' public/en public/ru; then
  echo "Product imagery must stay absent during the layout stage" >&2
  exit 1
fi

if rg -q 'target=_blank' public/en public/ru; then
  echo "Links must open in the current tab" >&2
  exit 1
fi

echo "Landings contract OK: EN/RU × home/K:04/Phenom/Macropad/404"
