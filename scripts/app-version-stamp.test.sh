#!/usr/bin/env bash
# Configuration gate for the client bundle's own version stamp.
#
# WHAT IT PROVES, AND WHAT IT DOES NOT. `src/appVersion.ts` reads
# `import.meta.env.VITE_APP_VERSION`, which `app/vite.config.ts` defines
# from the `APP_VERSION` environment variable AT BUILD TIME. This test
# checks that the three places which must supply that variable still do.
# It is a STRUCTURAL check on the plumbing, not a behavioural one on the
# bundle: it cannot prove a built artifact carries the right string, only
# that nothing has removed the wiring that puts it there.
#
# The behavioural proof was taken by hand when the stamp landed and is
# recorded in that PR: `APP_VERSION=v9.9.9-probe npx vite build` emitted
# the literal into `dist/client/assets/index-*.js` (one hit), and a build
# with the variable unset emitted none. A full build is too slow for this
# job; this gate exists to catch the wiring being deleted, which is the
# failure that would otherwise ship silently — every TestFlight log
# confidently reading "dev".
#
# WHY THAT FAILURE MATTERS ENOUGH TO GATE. A diagnostics export that names
# the wrong build is worse than one that names no build, because it is
# believed. See `src/appVersion.ts`.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() {
  echo "app-version-stamp: $1" >&2
  exit 1
}

# 1. vite.config.ts defines it from the environment.
grep -q 'VITE_APP_VERSION' app/vite.config.ts ||
  fail "app/vite.config.ts no longer defines VITE_APP_VERSION — the stamp would compile to its default in every build"
grep -q 'process.env.APP_VERSION' app/vite.config.ts ||
  fail "app/vite.config.ts no longer reads process.env.APP_VERSION — the define would be a constant, not a stamp"

# 2. The Dockerfile declares it in the stage that RUNS the client build.
#    An ARG in the `api` stage does not reach the container build; that is the
#    exact bug this line exists to prevent recurring.
build_stage=$(sed -n '/^FROM .* AS build$/,/^FROM /p' app/Dockerfile)
grep -q '^ARG APP_VERSION' <<<"$build_stage" ||
  fail "app/Dockerfile's BUILD stage no longer declares ARG APP_VERSION — the api stage's copy does not reach the container build"
grep -q '^ENV APP_VERSION' <<<"$build_stage" ||
  fail "app/Dockerfile's BUILD stage declares ARG APP_VERSION but never exports it as ENV — vite reads process.env"

#    The ARG/ENV pair must sit ABOVE the actual container-build RUN: below it,
#    both greps still pass and the stamp is still `dev`. Checked by line order.
arg_line=$(grep -n '^ARG APP_VERSION' <<<"$build_stage" | head -1 | cut -d: -f1)
env_line=$(grep -n '^ENV APP_VERSION' <<<"$build_stage" | head -1 | cut -d: -f1)
build_line=$(grep -n '^RUN node scripts/local-work/container-build\.mjs$' <<<"$build_stage" | head -1 | cut -d: -f1)
[ -n "$arg_line" ] && [ -n "$env_line" ] && [ -n "$build_line" ] && [ "$arg_line" -lt "$build_line" ] && [ "$env_line" -lt "$build_line" ] ||
  fail "app/Dockerfile's BUILD stage must export APP_VERSION above the container-build RUN — vite would not see it"

# 3. The iOS build supplies one. This is the build a TestFlight tester's
#    log actually comes from. Anchored to the ios:build SCRIPT, not the
#    whole file: an unanchored grep passes on any other script carrying the
#    string.
grep -E '"ios:build":[^"]*"[^"]*APP_VERSION=' app/package.json >/dev/null ||
  fail "app/package.json's ios:build no longer supplies APP_VERSION — TestFlight logs would all read dev"

# 4. THE CLIENT-SERVING IMAGE GETS IT TOO, which is the site this gate
#    originally missed. `dist/client` is emitted by the build stage and
#    COPIED into the `web` target, and compose builds `web` and `api`
#    SEPARATELY — so an arg passed only to `api` leaves the bundle stamped
#    `dev` while `/api/health` reports the real version. Caught in review of
#    PR #430, after the first version of this gate passed over it.
#    Asserted against the REAL `docker compose config` render rather than a
#    grep of the YAML source — the same rule `compose-env.test.sh` states for
#    itself, and it matters here: a hand-parsed window silently missed this
#    when the arg sat below a comment block.
web_args=$(APP_VERSION=stamp-probe POSTGRES_PASSWORD=dummy docker compose config 2>/dev/null |
  awk '/^  (web|api):/{svc=$1} /APP_VERSION/{print svc, $2}')
grep -q '^web: stamp-probe$' <<<"$web_args" ||
  fail "compose.yml's web service does not receive APP_VERSION as a build arg — the client bundle would be stamped dev in every deploy (rendered config said: ${web_args:-none})"
awk '/name: Build web image/,/^$/' .github/workflows/ci.yml | grep -q 'APP_VERSION' ||
  fail "CI's 'Build web image' step passes no APP_VERSION build-arg — the client bundle would be stamped dev in CI"

# 5. The constant still READS the define. Replacing `appVersion.ts` with a
#    literal passes every check above and every unit test.
#    Anchored to the EXPORT line, not the file: the same string appears in
#    this module's own doc comment, so an unanchored grep matched the prose
#    while the code had been replaced by a literal.
grep -qE 'import\.meta\.env\??\.VITE_APP_VERSION' <<<"$(grep -A3 '^export const APP_VERSION' app/src/appVersion.ts)" ||
  fail "app/src/appVersion.ts no longer reads import.meta.env.VITE_APP_VERSION — the stamp would be a hardcoded literal"

echo "app-version-stamp: OK — the define, the constant, the Dockerfile build stage (above container-build), ios:build, compose's web service and CI's web image all carry APP_VERSION."
