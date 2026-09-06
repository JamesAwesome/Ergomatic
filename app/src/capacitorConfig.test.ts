import { describe, it, expect } from "vitest";
import config from "../capacitor.config";

// Phase KB (docs/superpowers/specs/2026-09-06-keyboard-webview-resize-design.md
// §6). This proves the DECLARATION, not the behaviour: nothing that runs on
// Chromium or jsdom can raise an iOS software keyboard, so whether the
// WebView actually shrinks is verified on the phone at Gate 0 and recorded
// in the PR. What a web test CAN reach is that the config still asks for
// the mode the design chose (`none`: the WebView is never resized, the bar
// hides on the plugin's events instead). Independent string literals
// on purpose: asserting `KeyboardResize.Native` would import the constant
// this exists to gate (RF21's first smell).
// This reads `capacitor.config.ts`, one hop upstream of what the phone reads
// (`ios/App/App/capacitor.config.json`, untracked); that file cannot drift
// because `ios:build` is `vite build && npx cap sync ios`, which regenerates
// it from this source on every build.
describe("capacitor.config Keyboard plugin", () => {
  it("leaves the WebView unshrunk under the keyboard (resize: none) — the bar hides instead", () => {
    // `native` would resize the WebView 0.2 s after the keyboard settles, in
    // one step: the bar vanishes, then pops (Gate 0 build C). The events the
    // plugin is installed for fire regardless of mode.
    expect(config.plugins?.Keyboard?.resize).toBe("none");
  });

  it("declares no keyboard backdrop key: with the WebView never resized, the window behind it never shows", () => {
    // Builds A–C set `autoBackdropColor` for the band a shrunk WebView
    // exposes; `none` exposes nothing, so the key is gone rather than left
    // as config that does nothing (RF29's spirit). `backgroundColor` (a
    // general WebView key) is not pinned — a future use is legitimate.
    expect(config.plugins?.Keyboard?.autoBackdropColor).toBeUndefined();
  });
});
