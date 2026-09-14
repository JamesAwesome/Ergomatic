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
#    An ARG in the `api` stage does not reach `pnpm build`; that is the
#    exact bug this line exists to prevent recurring.
build_stage=$(sed -n '/^FROM .* AS build$/,/^FROM /p' app/Dockerfile)
grep -q '^ARG APP_VERSION' <<<"$build_stage" ||
  fail "app/Dockerfile's BUILD stage no longer declares ARG APP_VERSION — the api stage's copy does not reach pnpm build"
grep -q '^ENV APP_VERSION' <<<"$build_stage" ||
  fail "app/Dockerfile's BUILD stage declares ARG APP_VERSION but never exports it as ENV — vite reads process.env"

# 3. The iOS build supplies one. This is the build a TestFlight tester's
#    log actually comes from, so an unstamped ios:build is the worst case.
grep -q 'APP_VERSION=' app/package.json ||
  fail "app/package.json's ios:build no longer supplies APP_VERSION — TestFlight logs would all read dev"

echo "app-version-stamp: OK — vite define, Dockerfile build stage, and ios:build all supply APP_VERSION."
