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
# EIGHT needles, eight different reasons — and every needle is a STRING
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
#   by `transports/index.ts`'s dynamic `import()`, gated on
#   `import.meta.env.DEV` **OR** `VITE_ENABLE_FAKE_MONITOR` — both are
#   build-time constants Vite inlines, so both fold. (This comment used to
#   say `DEV`-gated alone; that is the pre-correction mechanism, and
#   `transports/index.ts`'s own header documents why the second door had to
#   exist: `DEV` is `false` in every bundle this repo's Dockerfile has ever
#   produced, e2e's compose stack included.) So this string appearing in a
#   PRODUCTION build means that gate failed silently — a check that
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
# - `hold-open window (instrument)` — a substring of `STASH_HEADER`
#   (`src/monitor/transports/holdOpen.ts`, `"--- hold-open window
#   (instrument) ---"`), the literal every stashed hold-open ring carries
#   verbatim. `holdOpen.ts` is reached only through `transports/index.ts`'s
#   OWN dynamic `import("./holdOpen")`, one gate layer under the SAME
#   `fakeMonitorEnabled` condition as `fake.ts`/`recording.ts` above — this
#   string appearing in a production build means that gate failed the same
#   way the `fake transport`/`pm5-recording` checks' would.
# - `Just Row observer (instrument)` — the observer screen's stable
#   `data-observer-kind` value. The screen is lazy-imported only behind the
#   same build-time monitor-instrument condition; finding this literal means
#   the observer module survived in a production chunk.
#
#   **NOT `__pm5HoldOpen__` (the global's own bare property name) — a
#   correction of the brief this task was handed, recorded here rather
#   than silently worked around.** The brief's own premise was that this
#   identifier never appears in a production bundle; it does, on every
#   build, with no plant needed: `ConnectionLine.tsx`'s dev-only chip
#   reads `window.__pm5HoldOpen__?.status()` UNCONDITIONALLY (guarded only
#   by a runtime `typeof window`/optional-chain check, never by
#   `fakeMonitorEnabled`) so it can render in a dev build without also
#   shipping the fake-injection gate to the component layer — exactly the
#   same shape `ConnectionLogSheet.tsx`'s existing, unguarded
#   `window.__pm5Recording__` read already has (`grep -o
#   ".\{80\}__pm5Recording__.\{80\}" dist/client/assets/index-*.js`, this
#   task's own verification, shows `td(){let[e]=(0,_.useState)(()=>window
#   .__pm5Recording__??null)...` — a live, shipped read of that exact bare
#   name), which is presumably WHY the pre-existing needle set already
#   checks `pm5-recording` (the runtime module's own content) rather than
#   `__pm5Recording__` (the always-present property name) — this needle
#   follows that same precedent rather than inventing a new one.
# - `C2_CLIENT_SECRET` — Concept2's OAuth client secret's ENV VAR NAME
#   (`server/index.ts:119`, `process.env.C2_CLIENT_SECRET`), a
#   server-only value read exclusively there (plus the standalone
#   cross-connect script, `scripts/c2-crossconnect.ts`, a plain Node file
#   nothing in `src/`/`domain/` ever imports — same shape as
#   `PM5_BRIDGE_PORT` above). Unlike the six PM5 needles this one is not
#   about a dev seam folding at build time: nothing in `src/` is meant to
#   reference this name at all, so its appearance anywhere in
#   `dist/client` — a stray import of server code into the client graph,
#   a copy-pasted env read, a debug log — means the client bundle learned
#   the name of a secret it must never learn. Named in
#   `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`'s
#   `## Testing` section: "the client secret's env name proven absent
#   from `dist/`, both directions" (Wave E PR1).
# - `C2 link probe (dev harness)` — Wave E PR1.5 fix round 2 (P1a-device):
#   `Concept2LinkProbe.tsx`'s own `data-c2-link-probe` value, the same
#   "stable data-attribute, not a function identifier" shape as
#   `Just Row observer (instrument)` above. The card is lazy-imported on
#   `you/Concept2Screen.tsx` behind the SAME `DEV`-or-explicit-flag condition shape
#   (`VITE_ENABLE_C2_LINK_PROBE` this time) — this string appearing in a
#   PRODUCTION build (the flag unset) means that gate failed the same way
#   the `Just Row observer` check's would. Flipped on purpose in the walk
#   card's own red-proof step
#   (`docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md`) to prove
#   this needle can actually fail before trusting its green (RF12/RF21).
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

NEEDLES=("fake transport" "PM5 lab (dev harness" "PM5_BRIDGE_PORT" "pm5-recording" "hold-open window (instrument)" "Just Row observer (instrument)" "C2_CLIENT_SECRET" "C2 link probe (dev harness)")
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

# Names the needles it actually checked, derived from NEEDLES rather than
# retyped: the hand-written list said "fake/lab/bridge/recording" for weeks
# after `hold-open window (instrument)` became a fifth needle, so the gate
# under-reported its own coverage every time it passed.
echo "dist-grep: OK — none of the ${#NEEDLES[@]} dev-only markers found in $DIST."
