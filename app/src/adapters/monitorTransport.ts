import type { Transport } from "../../domain/monitor/types.js";
import { isNative } from "../platform";
import { resolveDefaultTransport } from "../monitor/transports/index";

/**
 * THE PLATFORM-CONDITIONAL DEFAULT TRANSPORT (ROADMAP CL item 2).
 *
 * `src/monitor/transports/index.ts`'s own header names the gap this file
 * closes: `resolveDefaultTransport` (that file) picks between the
 * DEV/e2e fake and `createWebBluetoothTransport`, but "choosing between
 * [Capacitor BLE] and Web Bluetooth is a PLATFORM conditional, and platform
 * conditionals are lint-enforced to the adapter layer
 * (`src/platform.ts`/`src/adapters/`), not this hook's transport-resolution
 * seam" — so it never called `createCapacitorBleTransport` at all. Before
 * this file, NOTHING did (verified: the only other reference to that name
 * repo-wide was `transports/index.ts`'s own doc comment and its test file).
 * A native build therefore had no PM5 transport whatsoever.
 *
 * This is the ONE place that platform choice is made, per the native-first
 * policy (CLAUDE.md) `keepAwake.ts`/`auth.tsx` already establish: `isNative()`
 * picks the arm, and the native arm's Capacitor-backed module reaches this
 * file only through a dynamic `import()` inside that branch — the same
 * idiom `keepAwake.ts`'s `nativeKeepAwakeOn`/`nativeKeepAwakeOff` use — so
 * `@capacitor-community/bluetooth-le` (a real dependency of
 * `capacitorBle.ts`, unlike `keepAwake.ts`'s own native module) never lands
 * in the web bundle: `isNative()` is a RUNTIME check, not a build-time
 * constant, so a static import here would ship the plugin to every web
 * build regardless of whether the branch ever executes.
 *
 * The web arm delegates to `resolveDefaultTransport` UNCHANGED — this file
 * adds a platform branch in FRONT of that seam, it does not reimplement it.
 * That keeps the DEV/`VITE_ENABLE_FAKE_MONITOR` fake-injection gate
 * (`transports/index.ts`'s own header) exactly where it already lived and
 * exactly as tested: `Capacitor.isNativePlatform()` is always `false` in
 * every browser context this repo's e2e/screenshots/dev/test suites run in
 * (there is no Capacitor native runtime under Playwright or Vitest), so
 * `isNative()` is `false` on every path `resolveDefaultTransport`'s own
 * `index.test.ts` and `e2e/connected.spec.ts` already cover — this file
 * adds a branch neither of those suites can newly break.
 *
 * Wired as `useMonitorSession.ts`'s new default for
 * `MonitorSessionDeps.createTransport` (that file's own `??` fallback,
 * previously `resolveDefaultTransport` directly) — the injection point the
 * interface already had, per this task's own brief. `ConnectedInterstitial`
 * still never threads a production `createTransport` of its own (that
 * file's header comment, unchanged): the default now living here rather
 * than in `transports/index.ts` is the only thing that moved.
 */
export function defaultTransport():
  Transport | null | Promise<Transport | null> {
  if (isNative()) {
    return import("../monitor/transports/capacitorBle").then(
      ({ createCapacitorBleTransport }) => createCapacitorBleTransport(),
    );
  }
  return resolveDefaultTransport();
}
