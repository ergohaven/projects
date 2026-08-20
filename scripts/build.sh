#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

"$project_dir/scripts/hugo.sh" \
  --config hugo.yaml,config/english.yaml \
  --destination public/en \
  --environment production \
  --gc \
  --minify \
  --panicOnWarning \
  --printPathWarnings

"$project_dir/scripts/hugo.sh" \
  --config hugo.yaml,config/russian.yaml \
  --destination public/ru \
  --environment production \
  --gc \
  --minify \
  --panicOnWarning \
  --printPathWarnings
