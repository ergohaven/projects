#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
hugo_bin="$project_dir/.tools/hugo"
hugo_version=$(tr -d '[:space:]' < "$project_dir/.hugo-version")

if [[ -x "$hugo_bin" ]] && [[ $($hugo_bin version) == *"v${hugo_version}"* ]]; then
  exec "$hugo_bin" --source "$project_dir" "$@"
fi

if command -v hugo >/dev/null 2>&1 && [[ $(hugo version) == *"v${hugo_version}"* ]]; then
  exec hugo --source "$project_dir" "$@"
fi

"$project_dir/scripts/setup-hugo.sh"
exec "$hugo_bin" --source "$project_dir" "$@"
