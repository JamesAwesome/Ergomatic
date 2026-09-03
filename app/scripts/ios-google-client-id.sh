#!/usr/bin/env bash
# Wave E PR1.75b: derive the iOS OAuth client id from the reversed-client URL
# scheme committed in Info.plist (com.googleusercontent.apps.<id> <-> <id>
# .apps.googleusercontent.com). Extracted from ios-release.sh, which used to
# read CFBundleURLTypes INDEX 0 -- an assumption this PR breaks by adding a
# second URL type for `haus.waffle.ergomatic` (design §0). A wrong id here is
# not a build error: it is exported into the bundle, and every native Google
# sign-in then fails jwtVerify's audience check
# (server/auth/nativeVerify.ts:14-18) in a shipped build. So the lookup is by
# NAME, not position, and an absent scheme is a loud failure rather than a
# silently malformed id.
#
# Greps the plist XML rather than using PlistBuddy on purpose: PlistBuddy is
# macOS-only and this script is exercised by ios-release.test.sh, which CI
# runs on ubuntu-latest (.github/workflows/ci.yml:169-173).
#
# The grep reads the WHOLE FILE rather than scoping to the CFBundleURLTypes
# array, DELIBERATELY. No other key in this plist carries a
# `com.googleusercontent.apps.` string (measured 2026-09-02:
# `grep -c com.googleusercontent.apps ios/App/App/Info.plist` -> 1), and a
# future key that did would be a Google CONFIG error -- two client ids in one
# bundle -- not the URL-type ORDERING error this script exists to survive.
# Scoping the read would need an XML-aware parse: the array spans lines, and a
# `head -1` within a narrower window would just reintroduce a positional
# assumption in a smaller place. So the file-wide read is both simpler and the
# one whose failure mode is the honest one.
set -Eeuo pipefail

PLIST="${1:?usage: ios-google-client-id.sh <path/to/Info.plist>}"

reversed="$(grep -o 'com\.googleusercontent\.apps\.[A-Za-z0-9._-]*' "$PLIST" | head -1 || true)"
if [ -z "$reversed" ]; then
  echo "ios-google-client-id: no com.googleusercontent.apps.* URL scheme in $PLIST" >&2
  exit 1
fi
echo "${reversed#com.googleusercontent.apps.}.apps.googleusercontent.com"
