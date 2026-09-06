import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

// TRIPWIRE (storage-denial spec, 2026-09-03, §1; research doc
// `docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md`):
// every argument that `localStorage`'s GETTER cannot throw on the phone
// rests on this file declaring NO `server` block. Setting `server.iosScheme`
// to `"file"` (or any move to `loadHTMLString`) makes the WebView's origin
// LOCAL — one of WebKit's three routes to a getter `SecurityError`
// (`ScriptExecutionContext::canAccessResource`) — which would make the
// throw the three storage guards in `session/run.ts`, `session/draft.ts`
// and `today/todayPick.ts` exist to catch IMMEDIATELY reachable from
// ordinary use, not just web-arm hardening.
const config: CapacitorConfig = {
  appId: "haus.waffle.ergomatic",
  appName: "Ergomatic",
  webDir: "dist/client",
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    // Phase KB (docs/superpowers/specs/2026-09-06-keyboard-webview-resize-design.md).
    // iOS WebKit never shrinks the fixed-position viewport under the software
    // keyboard; it re-anchors fixed elements to the visual viewport on the
    // first scroll and clips them to it, so the tab bar's own paint can never
    // reach the band above the keyboard tray (research doc
    // 2026-09-06-ios-keyboard-fixed-viewport.md, §2). `native` shrinks the
    // WebView itself to the keyboard's top (@capacitor/keyboard 8.0.5,
    // Keyboard.m:356-358); `dom` paints the window behind the shrunk WebView
    // with body's own background (Keyboard.m:131-155), which is what the
    // translucent tray then sits over. The enum, not the string: the string
    // form is unchecked at build, the enum form fails typecheck on a typo.
    Keyboard: {
      resize: KeyboardResize.Native,
      autoBackdropColor: "dom",
    },
  },
};

export default config;
