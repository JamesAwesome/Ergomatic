#!/usr/bin/env bash
# Stamp tag-derived VERSION/BUILD into the Xcode project (requires Xcode; run
# on the build Mac). No-op with a warning when agvtool is unavailable.
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(bash ../scripts/version.sh)"
if ! command -v agvtool >/dev/null || ! xcode-select -p 2>/dev/null | grep -q Xcode; then
  echo "ios-version: Xcode/agvtool unavailable — skipping stamp (VERSION=$VERSION BUILD=$BUILD)" >&2
  exit 0
fi
cd ios/App
agvtool new-marketing-version "$VERSION" > /dev/null
agvtool new-version -all "$BUILD" > /dev/null
echo "ios-version: stamped $VERSION ($BUILD)"
