#!/usr/bin/env bash
# Executes the real pre-commit hook behind controlled process boundaries.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
HOOK="$ROOT/.husky/pre-commit"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
FAILS=0

cat > "$TMP/bin/node" <<'FAKE_NODE'
#!/usr/bin/env bash
if [ "${1:-}" = "-v" ]; then printf '%s\n' 'v26.0.0'; exit 0; fi
exit 64
FAKE_NODE

cat > "$TMP/bin/pnpm" <<'FAKE_PNPM'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_PNPM_LOG"
if [ "${1:-} ${2:-}" = "exec lint-staged" ]; then
  exit "${FAKE_LINT_RC:-0}"
fi
if [ "${1:-} ${2:-} ${3:-}" = "--dir app typecheck" ]; then
  exit "${FAKE_TYPECHECK_RC:-0}"
fi
exit 65
FAKE_PNPM
chmod +x "$TMP/bin/node" "$TMP/bin/pnpm"

check() {
  if [ "$1" = "$2" ]; then
    printf 'ok: %s\n' "$3"
  else
    printf 'FAIL: %s (want %q got %q)\n' "$3" "$2" "$1"
    FAILS=$((FAILS + 1))
  fi
}

run_case() {
  name="$1" lint_rc="$2" typecheck_rc="$3" expected_rc="$4" expected_log="$5"
  : > "$TMP/pnpm.log"
  PATH="$TMP/bin:$PATH" FAKE_PNPM_LOG="$TMP/pnpm.log" \
    FAKE_LINT_RC="$lint_rc" FAKE_TYPECHECK_RC="$typecheck_rc" \
    bash "$HOOK" > "$TMP/output" 2>&1
  rc=$?
  check "$rc" "$expected_rc" "$name exact exit status"
  check "$(cat "$TMP/pnpm.log")" "$expected_log" "$name invocation order"
}

run_case "lint failure" 17 0 17 "exec lint-staged"
run_case "typecheck failure" 0 23 23 $'exec lint-staged\n--dir app typecheck'
run_case "both pass" 0 0 0 $'exec lint-staged\n--dir app typecheck'

if [ "$FAILS" -eq 0 ]; then
  echo "ALL PASS"
  exit 0
fi
echo "$FAILS FAILED"
exit 1
