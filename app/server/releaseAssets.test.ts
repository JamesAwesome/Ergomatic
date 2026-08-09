import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Release-asset pins (Phase CL). Lives under server/ only because that is
 *  the unit project's one non-src include glob (vite.config.ts:11) — these
 *  are build-integrity checks on files no other harness ever reads.
 *
 *  Why this exists: TestFlight warning 90683 (2026-08-09, the first build
 *  carrying 7B/7C's Bluetooth code) — Apple's static scan requires
 *  `NSBluetoothAlwaysUsageDescription` the moment Bluetooth API references
 *  appear in the binary, even while the connected flow is unreachable on
 *  iOS. The key is also easy to LOSE silently: plist tooling (PlistBuddy)
 *  canonicalizes the whole file on any edit, so an unrelated future change
 *  can drop or mangle entries without anyone noticing until the next
 *  archive upload warns. This pin makes that loss a red test instead. */
const INFO_PLIST = new URL("../ios/App/App/Info.plist", import.meta.url);

describe("iOS Info.plist release pins", () => {
  const plist = readFileSync(INFO_PLIST, "utf8");

  it("carries the Bluetooth purpose string Apple's scan requires (warning 90683)", () => {
    expect(plist).toContain("<key>NSBluetoothAlwaysUsageDescription</key>");
    const match = plist.match(
      /<key>NSBluetoothAlwaysUsageDescription<\/key>\s*<string>([^<]+)<\/string>/,
    );
    expect(match).not.toBeNull();
    // A user-facing sentence, not a placeholder: names the device and the
    // reason, per App Review's own guidance for purpose strings.
    expect(match![1]).toMatch(/PM5/);
    expect(match![1]).toMatch(/Bluetooth/);
    expect(match![1]!.length).toBeGreaterThan(40);
  });

  it("still carries the Google sign-in URL scheme (reversed iOS client id)", () => {
    // The other plist entry a canonicalizing rewrite could silently drop,
    // and the one that bricks native sign-in if it goes (ios-activation
    // runbook: the reversed-client-id scheme is load-bearing).
    expect(plist).toContain(
      "<string>com.googleusercontent.apps.896004543555-9m5cf46vdgf57dv1r68u7stad6ngi304</string>",
    );
  });
});
