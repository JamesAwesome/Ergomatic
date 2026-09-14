#!/usr/bin/env bash
# Configuration gate for compose.yml's Concept2 env passthrough (Wave E
# PR1): server/index.ts reads
# C2_BASE_URL/C2_CLIENT_ID/C2_CLIENT_SECRET/C2_LINK_ENABLED/
# C2_ALLOWED_EMAILS, and
# AVAILABILITY (the flag reaching the api service at all) is env-gated —
# that passthrough is impossible if compose.yml never forwards them into
# the api service's environment. ACTIVATION on a real cohort is a
# separate, larger question this test does not cover: it additionally
# requires option (g) fully implemented, per the design gate ruling —
# see docs/superpowers/plans/2026-09-01-concept2-pr15-gate.md §6 and
# ROADMAP.md's C2 account-injection row. This test runs the REAL
# `docker compose config` against the REAL compose.yml (never a copy,
# never a hand-parsed grep of the YAML source) — it goes red the moment a
# passthrough line is removed, renamed, or loses its default.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
fails=0
check() { if [ "$1" = "$2" ]; then echo "ok: $3"; else echo "FAIL: $3 (want '$2' got '$1')"; fails=$((fails+1)); fi; }

cd "$REPO_ROOT"

# 1. No C2 host vars set — the state of every real stack today (dev, e2e,
#    and prod until availability is deliberately turned on, which is only
#    part of activation — see the file header). The three gating vars
#    must stay empty (dark); C2_BASE_URL is the one exception (its default
#    mirrors server/index.ts's own JS-side fallback to the sandbox URL, so
#    it is never absent — only ever empty would be the bug, since an empty
#    base URL throws inside `new URL()` the first time a rower connects).
dark=$(POSTGRES_PASSWORD=dummy docker compose config 2>/dev/null)
check "$(grep -c '^ *C2_LINK_ENABLED: ""$' <<<"$dark")" "1" "C2_LINK_ENABLED empty when unset"
check "$(grep -c '^ *C2_CLIENT_ID: ""$' <<<"$dark")" "1" "C2_CLIENT_ID empty when unset"
check "$(grep -c '^ *C2_CLIENT_SECRET: ""$' <<<"$dark")" "1" "C2_CLIENT_SECRET empty when unset"
check "$(grep -c '^ *C2_BASE_URL: https://log-dev.concept2.com$' <<<"$dark")" "1" "C2_BASE_URL falls back to the sandbox default (never absent)"
# Wave E per-user gate: C2_ALLOWED_EMAILS decides WHO the surface is live
# for, and empty means NOBODY (server/index.ts parses it with the same
# `parseAllowlist` as ALLOWED_EMAILS). Empty-when-unset is therefore the
# fail-closed row, not a cosmetic one: a passthrough that dropped the var
# would leave the server reading `undefined`, which parses to the same empty
# list — but a compose file that substituted something else here would open
# the surface to whoever that something named.
check "$(grep -c '^ *C2_ALLOWED_EMAILS: ""$' <<<"$dark")" "1" "C2_ALLOWED_EMAILS empty when unset (empty = nobody)"

# 2. All four dummy host vars set — every value must actually reach the api
#    service. This is the half of the gate that proves availability is
#    POSSIBLE to turn on via env, not just that dark stays dark.
#    Activation still requires option (g) — see the file header.
lit=$(POSTGRES_PASSWORD=dummy C2_BASE_URL=https://real.concept2.example C2_CLIENT_ID=dummy-id C2_CLIENT_SECRET=dummy-secret C2_LINK_ENABLED=1 C2_ALLOWED_EMAILS=one@dummy.test,two@dummy.test docker compose config 2>/dev/null)
check "$(grep -c '^ *C2_BASE_URL: https://real.concept2.example$' <<<"$lit")" "1" "C2_BASE_URL passes through"
check "$(grep -c '^ *C2_CLIENT_ID: dummy-id$' <<<"$lit")" "1" "C2_CLIENT_ID passes through"
check "$(grep -c '^ *C2_CLIENT_SECRET: dummy-secret$' <<<"$lit")" "1" "C2_CLIENT_SECRET passes through"
check "$(grep -c '^ *C2_LINK_ENABLED: "1"$' <<<"$lit")" "1" "C2_LINK_ENABLED passes through"
check "$(grep -c '^ *C2_ALLOWED_EMAILS: one@dummy.test,two@dummy.test$' <<<"$lit")" "1" "C2_ALLOWED_EMAILS passes through (a comma list survives intact)"

# 2b. Wave A: the six auth vars compose.yml gained, dark and lit. ACCESS_MODE
#     is the one that fails QUIETLY and so is the reason this block exists:
#     drop or rename that passthrough and a host .env carrying
#     ACCESS_MODE=public silently falls back to `restricted`, which now blocks
#     EXISTING sessions as well as new accounts — everyone locked out, health
#     still 200. The five APPLE_* fail loudly instead (a partial set throws in
#     frontDoorConfig and the container never becomes healthy), so they are the
#     cheaper half; they are here because the seam is the same one.
check "$(grep -c '^ *ACCESS_MODE: restricted$' <<<"$dark")" "1" "ACCESS_MODE defaults to restricted when unset (fail closed)"
for v in APPLE_NATIVE_CLIENT_ID APPLE_WEB_CLIENT_ID APPLE_TEAM_ID APPLE_KEY_ID APPLE_PRIVATE_KEY; do
  check "$(grep -c "^ *$v: \"\"$" <<<"$dark")" "1" "$v empty when unset (Apple stays dark)"
done

applelit=$(POSTGRES_PASSWORD=dummy ACCESS_MODE=public APPLE_NATIVE_CLIENT_ID=dummy.native APPLE_WEB_CLIENT_ID=dummy.web APPLE_TEAM_ID=DUMMYTEAM APPLE_KEY_ID=DUMMYKEY APPLE_PRIVATE_KEY=dummy-pem docker compose config 2>/dev/null)
check "$(grep -c '^ *ACCESS_MODE: public$' <<<"$applelit")" "1" "ACCESS_MODE passes through"
check "$(grep -c '^ *APPLE_NATIVE_CLIENT_ID: dummy.native$' <<<"$applelit")" "1" "APPLE_NATIVE_CLIENT_ID passes through"
check "$(grep -c '^ *APPLE_WEB_CLIENT_ID: dummy.web$' <<<"$applelit")" "1" "APPLE_WEB_CLIENT_ID passes through"
check "$(grep -c '^ *APPLE_TEAM_ID: DUMMYTEAM$' <<<"$applelit")" "1" "APPLE_TEAM_ID passes through"
check "$(grep -c '^ *APPLE_KEY_ID: DUMMYKEY$' <<<"$applelit")" "1" "APPLE_KEY_ID passes through"
check "$(grep -c '^ *APPLE_PRIVATE_KEY: dummy-pem$' <<<"$applelit")" "1" "APPLE_PRIVATE_KEY passes through"

# 3. compose.e2e.yml adds no C2_* keys — the e2e stack must never light the
#    flag by way of the override layering, only by way of never setting it.
e2e=$(POSTGRES_PASSWORD=dummy TEST_AUTH_SECRET=dummy docker compose -f compose.yml -f compose.e2e.yml config 2>/dev/null)
check "$(grep -c '^ *C2_LINK_ENABLED: ""$' <<<"$e2e")" "1" "e2e stack stays dark: C2_LINK_ENABLED still empty"
check "$(grep -c '^ *C2_ALLOWED_EMAILS: ""$' <<<"$e2e")" "1" "e2e stack stays dark: C2_ALLOWED_EMAILS still empty"

if [ "$fails" = 0 ]; then echo "ALL PASS"; exit 0; else echo "$fails FAILED"; exit 1; fi
