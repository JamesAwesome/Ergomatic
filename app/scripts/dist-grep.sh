#!/usr/bin/env bash
# THE PRODUCTION-BUNDLE GATE (Phase 7B Task 8): `pnpm build`'s `dist/client`
# output must never contain any of this repo's DEV-ONLY monitor tooling.
# There was no such gate before this task — the brief that named it assumed
# an existing "lab/bridge" check being "extended to fake"; none existed
# (verified: `.github/workflows/ci.yml`'s own history and today's tree have
# no prior grep step at all). This script is the gate, wired into CI's `app`
# job right after `pnpm build` (`ci.yml`), and it checks every name together
# — not just the one Task 8 added (a fourth, `pm5-recording`, joined later,
# record/replay stage A) — because a single gate that only ever grows is
# easier to trust than several that might drift apart.
#
# Four needles, four different reasons — and every needle is a STRING
# LITERAL from the source, deliberately never a function/variable
# identifier: `vite build` minifies the production bundle, which renames
# every identifier it can (verified empirically this task — grepping for
# the identifier `createFakeTransport` against a build that genuinely
# included `fake.ts`, via a temporary static-import mutation, came back
# clean; the function survived under a minified name, and only a STRING
# `fake.ts` itself throws/returns verbatim — "fake transport: ..." in every
# one of its thrown `Error`s — caught it). A needle that minification can
# rename is a gate that passes on a bundle it should have failed.
#
# - `fake transport` — the literal prefix every `Error` `fake.ts` throws
#   opens with (`processWrite`'s `InvalidStateError`/unexpected-target
#   throws, the fake's own device-name default `"PM5 (fake)"`'s sibling
#   strings). THE ONE THIS TASK EXISTS TO PROVE: `fake.ts` is reached only
#   by `transports/index.ts`'s `import.meta.env.DEV`-gated dynamic
#   `import()` (that file's own header comment explains the dead-code-
#   elimination mechanism), so this string appearing anywhere in a
#   PRODUCTION build means that gate failed silently — a DEV check that
#   stopped being statically-`false`-foldable, or a new caller that
#   bypassed the seam entirely and called `createFakeTransport` from
#   somewhere reachable unconditionally.
# - `PM5 lab (dev harness` — `scripts/pm5-lab.html`'s own `<title>`, verbatim
#   (HTML text content is never minified/renamed the way a JS identifier
#   is). Not reachable from `index.html`'s own module graph today (a
#   SEPARATE Vite entry, dev-server-only per `pm5-lab.ts`'s own launch
#   instructions), so this is a guard against someone later wiring it into
#   `vite.config.ts`'s `build.rollupOptions.input` without also excluding it
#   from a production build.
# - `PM5_BRIDGE_PORT` — `scripts/pm5-bridge.mjs`'s own env-var name, a plain
#   Node script nothing in `src/`/`domain/` ever imports (that file's own
#   header: "Nothing in the app imports this"); this exists for the same
#   reason as the `pm5-lab` check, one layer over.
# - `pm5-recording` — a substring of `RECORDING_FORMAT_TAG`
#   (`src/monitor/transports/recording.ts`, `"pm5-recording/v1"`), the
#   literal every recording file's header line and `parseRecording`'s own
#   format check carry verbatim. `recording.ts` is reached only through
#   `transports/index.ts`'s OWN dynamic `import("./recording")`, one gate
#   layer under the SAME `fakeMonitorEnabled` condition as `fake.ts` above —
#   this string appearing in a production build means that gate failed the
#   same way the `fake transport` check's would.
#
# Usage: `bash scripts/dist-grep.sh` from `app/`, AFTER `pnpm build` has
# populated `dist/client`. Exits non-zero (and prints every match) the
# instant any needle is found; exits 0 silently otherwise.
set -Eeuo pipefail

DIST="dist/client"

if [ ! -d "$DIST" ]; then
  echo "dist-grep: $DIST does not exist — run \`pnpm build\` first." >&2
  exit 1
fi

NEEDLES=("fake transport" "PM5 lab (dev harness" "PM5_BRIDGE_PORT" "pm5-recording")
FAILED=0

for needle in "${NEEDLES[@]}"; do
  # `-r`: every file under dist/client, not just the obvious .js ones — a
  # sourcemap or an inlined asset could carry the string too.
  # `-l`: file names only, one line per match, so a hit is unambiguous in
  # the CI log without dumping a whole minified bundle.
  if matches=$(grep -rl "$needle" "$DIST" 2>/dev/null); then
    echo "dist-grep: FOUND dev-only reference \"$needle\" in the production bundle:" >&2
    echo "$matches" | sed 's/^/  /' >&2
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "dist-grep: FAILED — the production bundle contains dev-only monitor tooling." >&2
  exit 1
fi

echo "dist-grep: OK — no dev-only monitor tooling (fake/lab/bridge/recording) found in $DIST."
