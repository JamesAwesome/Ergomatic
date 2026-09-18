#!/usr/bin/env bash
# Real hook control flow, harmless executables, and module-only host injection.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node --test --test-name-pattern '^pre-push' app/scripts/local-work/entrypoints.test.mjs
