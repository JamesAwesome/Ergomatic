#!/usr/bin/env bash
# Door spec (2026-09-02) §5.2 I-B5, as a SCRIPT rather than a table.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== every non-test reader of actualMeters/actualSeconds under src/ server/ domain/"
grep -rn --include='*.ts' --include='*.tsx' -E 'step\.(actualMeters|actualSeconds)' \
  src server domain | grep -v '\.test\.' || true
echo
echo "== every generic iteration over a step object (spread / Object.keys / entries)"
grep -rn --include='*.ts' --include='*.tsx' -E '(\.\.\.step|Object\.(keys|entries|values)\([a-zA-Z]*[Ss]tep)' \
  src server domain | grep -v '\.test\.' || true
