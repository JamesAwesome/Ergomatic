#!/usr/bin/env bash
# Every Playwright source file must belong to the checked E2E project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXPECTED="$(mktemp)"
ACTUAL="$(mktemp)"
trap 'rm -f "$EXPECTED" "$ACTUAL"' EXIT

{
  find "$ROOT/e2e" -type f \( -name '*.ts' -o -name '*.tsx' \) -print
  printf '%s\n' "$ROOT/playwright.config.ts"
} | LC_ALL=C sort -u > "$EXPECTED"

"$ROOT/node_modules/.bin/tsc" -p "$ROOT/e2e/tsconfig.json" --listFilesOnly |
  awk -v root="$ROOT" '
    index($0, root "/e2e/") == 1 && $0 ~ /\.tsx?$/ { print; next }
    $0 == root "/playwright.config.ts" { print }
  ' | LC_ALL=C sort -u > "$ACTUAL"

if ! diff -u "$EXPECTED" "$ACTUAL"; then
  echo "E2E TypeScript project membership differs from the filesystem" >&2
  exit 1
fi

printf 'E2E TypeScript membership: %s/%s\n' \
  "$(wc -l < "$ACTUAL" | tr -d ' ')" \
  "$(wc -l < "$EXPECTED" | tr -d ' ')"
