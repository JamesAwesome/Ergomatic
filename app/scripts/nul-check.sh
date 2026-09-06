#!/usr/bin/env bash
# Phase NF hardening (lens 1, F2, 2026-09-06): a raw 0x00 byte pasted into a
# test string made `domain/monitor/nfc.test.ts` AND the plan that prescribed
# it report as `data` to `file`; plain `grep` then returned nothing with
# rc=1 on every query and `git grep` degraded to "Binary file … matches",
# so every "grep finds nothing" check over either file was vacuous. The
# author's paste-test cannot catch it (the test passes either way). This
# gate can: no tracked text file in the repo may contain a NUL byte.
# Proven to go red against the pre-fix `nfc.test.ts` on 2026-09-06.
set -euo pipefail
cd "$(dirname "$0")/../.."
status=0
while IFS= read -r file; do
  [ -f "$file" ] || continue
  if ! LC_ALL=C tr -d '\000' < "$file" | cmp -s - "$file"; then
    echo "nul-check: NUL byte in $file" >&2
    status=1
  fi
done < <(git ls-files -- '*.ts' '*.tsx' '*.md' '*.json' '*.sh' '*.swift' '*.patch' '*.css' '*.html' '*.yml' '*.yaml')
if [ "$status" -eq 0 ]; then echo "nul-check: OK — no NUL bytes in tracked text files."; fi
exit $status
