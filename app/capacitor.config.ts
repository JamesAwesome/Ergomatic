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
    // keyboard; after the first scroll the tab bar sits at the visual
    // viewport's bottom and nothing it paints below that line shows
    // (research doc 2026-09-06-ios-keyboard-fixed-viewport.md, §2). The
    // plugin is here for its keyboardWillShow/WillHide EVENTS, which
    // AppRoutes uses to hide the bar while the keyboard is up (Ionic's own
    // tab bar does the same). `none`, not `native`: `native` shrinks the
    // WebView (Keyboard.m:356-358) but only 0.2 s AFTER the keyboard's
    // animation ends and in one unanimated step (Keyboard.m:256), which
    // James saw as the bar vanishing and then popping up (Gate 0 build C,
    // 2026-09-06). The enum, not the string: the string form is unchecked
    // at build, the enum form fails typecheck on a typo.
    Keyboard: {
      resize: KeyboardResize.None,
    },
  },
};

export default config;
