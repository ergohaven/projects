#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

exec "$project_dir/scripts/hugo.sh" server \
  --bind 127.0.0.1 \
  --port 1314 \
  --disableFastRender \
  --ignoreCache \
  --noHTTPCache \
  --renderToMemory
