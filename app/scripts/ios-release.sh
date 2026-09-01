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
# the build itself) so this test can run the real script with no tag, no
# Xcode, and no `pnpm ios:build` ever executing.
if [ -n "${VITE_ENABLE_C2_LINK_PROBE:-}" ]; then
  echo "ios-release: refusing — VITE_ENABLE_C2_LINK_PROBE is set — unset it (probe card must never ship via ios:release)" >&2
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

# Recover the iOS OAuth client id from the committed reversed URL scheme
# (com.googleusercontent.apps.<id> ⇄ <id>.apps.googleusercontent.com).
if [ -z "${GOOGLE_IOS_CLIENT_ID:-}" ]; then
  reversed="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes:0:CFBundleURLSchemes:0' "$PLIST")"
  GOOGLE_IOS_CLIENT_ID="${reversed#com.googleusercontent.apps.}.apps.googleusercontent.com"
  export GOOGLE_IOS_CLIENT_ID
  echo "ios-release: GOOGLE_IOS_CLIENT_ID derived from Info.plist"
fi

echo "ios-release: building web bundle + cap sync ($describe)"
(cd "$APP_DIR" && pnpm ios:build)

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
