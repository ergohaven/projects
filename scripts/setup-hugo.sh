#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
hugo_version=$(tr -d '[:space:]' < "$project_dir/.hugo-version")
tools_dir="$project_dir/.tools"
hugo_bin="$tools_dir/hugo"

if [[ -x "$hugo_bin" ]] && [[ $($hugo_bin version) == *"v${hugo_version}"* ]]; then
  "$hugo_bin" version
  exit 0
fi

if command -v hugo >/dev/null 2>&1 && [[ $(hugo version) == *"v${hugo_version}"* ]]; then
  hugo version
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) archive_platform=linux-amd64 ;;
  Linux-aarch64|Linux-arm64) archive_platform=linux-arm64 ;;
  *)
    echo "Automatic Hugo setup supports Linux x86_64 and arm64." >&2
    echo "Install Hugo Extended v${hugo_version} on this platform and rerun the command." >&2
    exit 1
    ;;
esac

archive_name="hugo_extended_${hugo_version}_${archive_platform}.tar.gz"
release_url="https://github.com/gohugoio/hugo/releases/download/v${hugo_version}"
temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/ergohaven-projects-hugo.XXXXXX")
trap 'rm -rf -- "$temp_dir"' EXIT

curl -fsSL "$release_url/$archive_name" -o "$temp_dir/$archive_name"
curl -fsSL "$release_url/hugo_${hugo_version}_checksums.txt" -o "$temp_dir/checksums.txt"

expected_checksum=$(awk -v archive="$archive_name" '$2 == archive { print $1 }' "$temp_dir/checksums.txt")
actual_checksum=$(sha256sum "$temp_dir/$archive_name" | awk '{ print $1 }')

if [[ -z "$expected_checksum" || "$actual_checksum" != "$expected_checksum" ]]; then
  echo "Hugo checksum verification failed" >&2
  exit 1
fi

mkdir -p "$tools_dir"
tar -xzf "$temp_dir/$archive_name" -C "$tools_dir" hugo
chmod 0755 "$hugo_bin"
"$hugo_bin" version
