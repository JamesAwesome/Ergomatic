#!/usr/bin/env bash
# Configuration gate for compose.yml's Concept2 env passthrough (Wave E
# PR1): server/index.ts reads
# C2_BASE_URL/C2_CLIENT_ID/C2_CLIENT_SECRET/C2_LINK_ENABLED, and the
# documented env-only prod cutover is impossible if compose.yml never
# forwards them into the api service's environment. This test runs the
# REAL `docker compose config` against the REAL compose.yml (never a copy,
# never a hand-parsed grep of the YAML source) — it goes red the moment a
# passthrough line is removed, renamed, or loses its default.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
fails=0
check() { if [ "$1" = "$2" ]; then echo "ok: $3"; else echo "FAIL: $3 (want '$2' got '$1')"; fails=$((fails+1)); fi; }

cd "$REPO_ROOT"

# 1. No C2 host vars set — the state of every real stack today (dev, e2e,
#    and prod until the deliberate env-only cutover). The three gating vars
#    must stay empty (dark); C2_BASE_URL is the one exception (its default
#    mirrors server/index.ts's own JS-side fallback to the sandbox URL, so
#    it is never absent — only ever empty would be the bug, since an empty
#    base URL throws inside `new URL()` the first time a rower connects).
dark=$(POSTGRES_PASSWORD=dummy docker compose config 2>/dev/null)
check "$(grep -c '^ *C2_LINK_ENABLED: ""$' <<<"$dark")" "1" "C2_LINK_ENABLED empty when unset"
check "$(grep -c '^ *C2_CLIENT_ID: ""$' <<<"$dark")" "1" "C2_CLIENT_ID empty when unset"
check "$(grep -c '^ *C2_CLIENT_SECRET: ""$' <<<"$dark")" "1" "C2_CLIENT_SECRET empty when unset"
check "$(grep -c '^ *C2_BASE_URL: https://log-dev.concept2.com$' <<<"$dark")" "1" "C2_BASE_URL falls back to the sandbox default (never absent)"

# 2. All four dummy host vars set — every value must actually reach the api
#    service. This is the half of the gate that proves the cutover is
#    POSSIBLE, not just that dark stays dark.
lit=$(POSTGRES_PASSWORD=dummy C2_BASE_URL=https://real.concept2.example C2_CLIENT_ID=dummy-id C2_CLIENT_SECRET=dummy-secret C2_LINK_ENABLED=1 docker compose config 2>/dev/null)
check "$(grep -c '^ *C2_BASE_URL: https://real.concept2.example$' <<<"$lit")" "1" "C2_BASE_URL passes through"
check "$(grep -c '^ *C2_CLIENT_ID: dummy-id$' <<<"$lit")" "1" "C2_CLIENT_ID passes through"
check "$(grep -c '^ *C2_CLIENT_SECRET: dummy-secret$' <<<"$lit")" "1" "C2_CLIENT_SECRET passes through"
check "$(grep -c '^ *C2_LINK_ENABLED: "1"$' <<<"$lit")" "1" "C2_LINK_ENABLED passes through"

# 3. compose.e2e.yml adds no C2_* keys — the e2e stack must never light the
#    flag by way of the override layering, only by way of never setting it.
e2e=$(POSTGRES_PASSWORD=dummy TEST_AUTH_SECRET=dummy docker compose -f compose.yml -f compose.e2e.yml config 2>/dev/null)
check "$(grep -c '^ *C2_LINK_ENABLED: ""$' <<<"$e2e")" "1" "e2e stack stays dark: C2_LINK_ENABLED still empty"

if [ "$fails" = 0 ]; then echo "ALL PASS"; exit 0; else echo "$fails FAILED"; exit 1; fi
