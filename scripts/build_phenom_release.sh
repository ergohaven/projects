#!/usr/bin/env bash
# Standalone bilingual preview from canonical sources; no snapshot servers.
set -euo pipefail
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
destination=${1:-"$project_dir/exports/phenom-release/site"}
"$project_dir/scripts/hugo.sh" \
  --destination "$destination" \
  --cacheDir "$project_dir/resources/phenom-cache" \
  --environment production --minify --panicOnWarning --printPathWarnings
python3 "$project_dir/scripts/check_phenom_release.py" --site "$destination"
