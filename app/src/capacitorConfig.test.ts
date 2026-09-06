import { describe, it, expect } from "vitest";
import config from "../capacitor.config";

// Phase KB (docs/superpowers/specs/2026-09-06-keyboard-webview-resize-design.md
// §6). This proves the DECLARATION, not the behaviour: nothing that runs on
// Chromium or jsdom can raise an iOS software keyboard, so whether the
// WebView actually shrinks is verified on the phone at Gate 0 and recorded
// in the PR. What a web test CAN reach is that the config still asks for
// the one mode that shrinks the WebView (`native` — `body` and `ionic`
// resize a DOM element and leave the fixed viewport where the bug lives)
// and still tints the backdrop from the page. Independent string literals
// on purpose: asserting `KeyboardResize.Native` would import the constant
// this exists to gate (RF21's first smell).
// This reads `capacitor.config.ts`, one hop upstream of what the phone reads
// (`ios/App/App/capacitor.config.json`, untracked); that file cannot drift
// because `ios:build` is `vite build && npx cap sync ios`, which regenerates
// it from this source on every build.
describe("capacitor.config Keyboard plugin", () => {
  it("shrinks the native WebView under the keyboard (resize: native)", () => {
    expect(config.plugins?.Keyboard?.resize).toBe("native");
  });

  it("paints the keyboard backdrop with the tab bar's surface, not the page", () => {
    // `auto` = the config's `backgroundColor`; `--surface` is #fffdf7
    // (theme/tokens.css). Independent literals on both.
    expect(config.plugins?.Keyboard?.autoBackdropColor).toBe("auto");
    expect(config.backgroundColor).toBe("#fffdf7");
  });
});
