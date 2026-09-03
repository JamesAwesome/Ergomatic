#!/usr/bin/env bash
# One-command TestFlight release: build → archive → upload, fully CLI.
# First proven on v0.10.0 (build 669), 2026-08-17 — no Xcode GUI needed.
# Run from app/ AFTER the tag exists (versions come only from tags):
#
#   pnpm ios:release
#
# Auth: signing + upload use the Apple ID already logged into Xcode
# (-allowProvisioningUpdates); no App Store Connect API key required on
# this machine. GOOGLE_IOS_CLIENT_ID is derived from the reversed-client
# URL scheme already committed in Info.plist (the same value, reversed) —
# export it yourself to override.
#
# The exported archive lands in a temp dir and is removed on success;
# Apple keeps the uploaded build. Internal TestFlight only — no Beta App
# Review; testers update automatically once Apple finishes processing
# (minutes).
set -Eeuo pipefail

# Wave E PR1.5 round 5 review (P1, reviewer proved it): the on-device walk
# card (docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md) has the
# operator `export VITE_ENABLE_C2_LINK_PROBE=1` in their shell. Without
# this guard, a LATER `pnpm ios:release` run in that SAME shell ships the
# dev-only probe card (`Concept2LinkProbe.tsx`) — `pnpm ios:build` below
# runs a plain `vite build`, which reads any `VITE_`-prefixed var straight
# out of `process.env`, no config file involved. Refuse outright rather
# than silently building a release with dev tooling baked in. Placed
# before EVERYTHING else (the tag check, GOOGLE_IOS_CLIENT_ID derivation,
# the build itself).
#
# **Round 6 correction (P1, reviewer-verified): this comment used to claim
# "no tag, no Xcode, no `pnpm ios:build` ever executing" for testing this
# guard — true ONLY for the flag-SET case.** For the flag-unset/empty
# cases, this script proceeds PAST this guard into the real git-tag check
# below and beyond — on a machine where HEAD happens to sit exactly on a
# `vX.Y.Z` tag (i.e., James's own state right before cutting a release),
# that is `pnpm ios:build` → `xcodebuild archive` → a REAL TestFlight
# upload. `ios-release.test.sh`'s own cases 2/3 stay safe by forcing
# `git describe` to fail outright first (`GIT_DIR=/nonexistent`), not by
# anything this script does — this guard alone does not make those two
# cases safe to run unmodified on a just-tagged checkout.
if [ -n "${VITE_ENABLE_C2_LINK_PROBE:-}" ]; then
  echo "ios-release: refusing — VITE_ENABLE_C2_LINK_PROBE is set — unset it (probe card must never ship via ios:release)" >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Round 7 review (P1, finding 1b): the shell-var check above only sees a
# flag set as a plain shell export. Vite ALSO loads env files, PRIMARY
# (https://vite.dev/guide/env-and-mode, quoted verbatim): "Vite uses
# dotenv to load additional environment variables from the following
# files in your environment directory: .env (loaded in all cases),
# .env.local (loaded in all cases, ignored by git), .env.[mode] (only
# loaded in specified mode), .env.[mode].local (only loaded in specified
# mode, ignored by git)" — `vite build` with no `--mode` flag (exactly
# what `pnpm ios:build` runs) defaults to mode "production", so the four
# files that matter here are `.env`, `.env.local`, `.env.production`,
# `.env.production.local`. A flag set in any of those is invisible to the
# shell-var check above. This is a COURTESY early check, not the real
# gate — a cheap grep can miss a value split across lines, an escaped
# quote, a name typo'd past it, or (round 8) a file this loop doesn't
# enumerate at all. The real, structural gate is the dist:grep-after-build
# step below, which checks the ARTIFACT itself rather than trying to
# enumerate every input path that could produce it.
#
# Round 8 (MINOR, scoped re-review): the grep below was `^`-anchored and
# missed a dotenv-legal `export VITE_ENABLE_C2_LINK_PROBE=1` line. This
# vite version's own `loadEnv` (dist/node/chunks/node.js) parses these
# files with Node's built-in `node:util.parseEnv`, not the `dotenv` npm
# package (this project has no `dotenv` dependency) — verified empirically
# this session: `node -e 'require("node:util").parseEnv("export
# VITE_ENABLE_C2_LINK_PROBE=1\n")'` returns
# `{ VITE_ENABLE_C2_LINK_PROBE: "1" }`, i.e. the `export ` prefix is
# stripped and the value is live. Widened to match both forms. Still just
# the courtesy check, not the backstop: the dist:grep-after-build step is
# what actually catches anything this grep's own next miss lets through.
for envfile in .env .env.local .env.production .env.production.local; do
  if [ -f "$APP_DIR/$envfile" ] &&
    grep -qE '^(export[[:space:]]+)?VITE_ENABLE_C2_LINK_PROBE=.+' "$APP_DIR/$envfile" 2>/dev/null; then
    echo "ios-release: refusing — $envfile defines VITE_ENABLE_C2_LINK_PROBE — remove it (probe card must never ship via ios:release)" >&2
    exit 1
  fi
done

PLIST="$APP_DIR/ios/App/App/Info.plist"

# HEAD must be the tagged release commit: the build stamp derives from the
# tag, and releasing an untagged HEAD ships a version Apple can't map back
# to a tag (versions come ONLY from annotated vX.Y.Z tags).
describe="$(git -C "$APP_DIR" describe 2>/dev/null || true)"
case "$describe" in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "ios-release: HEAD is '$describe', not exactly a vX.Y.Z tag — tag first (docs/RELEASING.md)" >&2; exit 2 ;;
esac
if [ "$describe" != "$(git -C "$APP_DIR" describe --abbrev=0 2>/dev/null)" ]; then
  echo "ios-release: HEAD is past the latest tag ($describe) — check out the tag or cut a new one" >&2
  exit 2
fi

# Recover the iOS OAuth client id from the committed reversed URL scheme.
# BY NAME, not by CFBundleURLTypes index -- PR1.75b adds a second URL type
# (haus.waffle.ergomatic) and an index-based read would silently export a
# malformed id if the entries were ever reordered. See
# scripts/ios-google-client-id.sh's own header, and the cases in
# ios-release.test.sh that prove both orderings derive the same id.
if [ -z "${GOOGLE_IOS_CLIENT_ID:-}" ]; then
  GOOGLE_IOS_CLIENT_ID="$(bash "$APP_DIR/scripts/ios-google-client-id.sh" "$PLIST")"
  export GOOGLE_IOS_CLIENT_ID
  echo "ios-release: GOOGLE_IOS_CLIENT_ID derived from Info.plist"
fi

echo "ios-release: building web bundle + cap sync ($describe)"
(cd "$APP_DIR" && pnpm ios:build)

# Round 7 review (P1, finding 1b): THE ARTIFACT IS THE GATE. Whatever path
# a dev-only flag took to reach this build — a shell export, one of the
# four env files the guard above greps, or something neither this script
# nor its reviewer thought of — the built bundle either carries the
# probe card's literal or it doesn't. `pnpm dist:grep`'s eighth needle
# ("C2 link probe (dev harness)") already exists for exactly this;
# running it here, BEFORE archiving, closes the whole class of bypass by
# construction rather than by enumeration. Placed after `pnpm ios:build`
# (the artifact has to exist to be checked) and before `mktemp`/archiving
# (nothing about a real release should happen once this fails).
echo "ios-release: verifying the built bundle carries no dev-only tooling (dist:grep)"
if ! (cd "$APP_DIR" && pnpm dist:grep); then
  echo "ios-release: refusing to archive — dist:grep found dev-only tooling in the built bundle (see above)" >&2
  exit 1
fi

WORK="$(mktemp -d /tmp/ios-release.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
ARCHIVE="$WORK/Ergomatic-$describe.xcarchive"

cat > "$WORK/ExportOptions.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>testFlightInternalTestingOnly</key><true/>
</dict>
</plist>
EOF

echo "ios-release: archiving (SPM layout — -project, there is no workspace)"
xcodebuild -project "$APP_DIR/ios/App/App.xcodeproj" -scheme App \
  -configuration Release -destination generic/platform=iOS \
  -archivePath "$ARCHIVE" archive -allowProvisioningUpdates -quiet

stamped="$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleShortVersionString' "$ARCHIVE/Info.plist")"
build="$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleVersion' "$ARCHIVE/Info.plist")"
echo "ios-release: archived $stamped ($build) — uploading to TestFlight"

xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$WORK/ExportOptions.plist" -allowProvisioningUpdates

echo "ios-release: uploaded $stamped ($build). Apple processes for a few"
echo "minutes; internal testers update automatically."
