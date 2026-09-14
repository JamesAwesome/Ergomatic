#!/usr/bin/env bash
# Run the native XCTest target.
#
# WHY THIS EXISTS: `AppTests` was added with the Apple work and nothing ran it
# — no CI job compiles Swift (there is no macOS runner and no `xcodebuild` in
# any workflow), and no package script invoked it either. The tests were
# fully runnable the whole time; they just had no caller. Measured 2026-09-13:
# 4 tests, 0 failures, ~17 s.
#
# It is wired into `ios:build`, which `ios:release` also goes through, so the
# native tests now run before every TestFlight build on the machine that makes
# it. That is not a CI gate and does not pretend to be one — it is the cheapest
# caller that exists without buying macOS runner minutes.
#
# The simulator is chosen at runtime rather than pinned: a hardcoded device
# name is an instruction that rots the next time Xcode ships a new default.
set -euo pipefail
cd "$(dirname "$0")/.."

device=$(xcrun simctl list devices available --json \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
      const r=JSON.parse(d).devices, all=[];
      for (const k of Object.keys(r)) for (const dev of r[k]) if (dev.isAvailable && /^iPhone/.test(dev.name)) all.push(dev.name);
      if (!all.length) { console.error("no available iPhone simulator"); process.exit(1); }
      process.stdout.write(all[all.length-1]);
    })')

echo "ios-test: running AppTests on $device"
xcodebuild test \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -destination "platform=iOS Simulator,name=$device" \
  -derivedDataPath "${IOS_TEST_DERIVED:-/tmp/ergomatic-ios-test}" \
  -quiet
echo "ios-test: PASS"
