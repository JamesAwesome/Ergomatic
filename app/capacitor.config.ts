import type { CapacitorConfig } from "@capacitor/cli";

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
  },
};

export default config;
