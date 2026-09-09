import { isNative } from "../platform";

/** The DEV-ONLY DOOR OVERRIDE's token (Phase MT close-out; ROADMAP register,
 *  "Nothing can gate the five-button failure frame").
 *
 *  A STRING LITERAL, not a boolean flag and not a bare property name, and
 *  that is the whole point of it: it is `scripts/dist-grep.sh`'s needle, and
 *  that script's own header records why a needle must be a literal — `vite
 *  build` minifies the production bundle and renames every identifier it
 *  can, so an identifier needle came back clean against a build that
 *  genuinely contained the code it was meant to catch. This literal survives
 *  minification verbatim wherever the comparison below survives, and the
 *  comparison survives exactly when the gate does. Same "(dev harness)" /
 *  "(instrument)" family as the needles already in that list. */
const DEV_DOOR_TOKEN = "app-settings door (dev override)";

declare global {
  interface Window {
    /** Set by an e2e test's `page.addInitScript` (`e2e/helpers.ts`'s
     *  `forceAppSettingsDoor`), never by product code. Read ONLY inside the
     *  build-time-foldable gate in `canOpenAppSettings()` below, so a real
     *  deploy's bundle carries neither this read nor the token — unlike
     *  `__pm5HoldOpen__`, whose unconditional read in `ConnectionLine.tsx`
     *  is why `scripts/dist-grep.sh` had to needle that seam's file content
     *  instead of its global's name. */
    __appSettingsDoor__?: string;
  }
}

/** Whether this platform has an app-settings door at all (the permission
 *  card's button gates on capability, not on error reason — spec §4).
 *
 *  WHY THE OVERRIDE EXISTS. On iOS this returns `true`, so
 *  `permission-denied` renders a FIVE-button action stack (`Open Settings`
 *  above `Try again`, `Row on the phone timer instead`, `View connection
 *  log` and `Cancel`); on the web it returns `false` and the same frame is
 *  four buttons by construction. Every browser assertion therefore stood on
 *  the four-button shape, and nothing could catch a landscape regression
 *  that reached only the iOS stack — the frame with the tightest budget of
 *  any in the app (308px of content, and the shape whose window the pairing
 *  rule takes 10px -> 138px). `e2e/design.spec.ts`'s five-button case drives
 *  this seam to reach it.
 *
 *  WHY IT GATES THIS FUNCTION AND NOTHING ELSE. A global `isNative()` stub
 *  would have been the obvious lever and is ruled out with a receipt:
 *  `adapters/monitorTransport.ts`'s `defaultTransport` takes the Capacitor
 *  BLE arm whenever `isNative()` is true, which is unreachable under
 *  Playwright and would kill the fake monitor every connected e2e walk runs
 *  on (CLAUDE.md RF13 records James hitting exactly that at an erg). This
 *  override moves ONE boolean and leaves `openAppSettings()` below
 *  untouched, so the forced-open button on the web is a real button that
 *  does nothing — the shape is what is under test, not the plugin call.
 *
 *  UNREACHABLE IN PRODUCTION, PROVEN BY BUILDING. Both operands of the gate
 *  are build-time constants Vite inlines (`transports/index.ts`'s own
 *  header), so Rollup folds the whole condition to `false` and drops the
 *  read and the token with it. `scripts/dist-grep.sh`'s `app-settings door
 *  (dev override)` needle is the proof, both directions (CLAUDE.md RF12). */
export function canOpenAppSettings(): boolean {
  if (
    (import.meta.env.DEV || import.meta.env.VITE_ENABLE_FAKE_MONITOR === "1") &&
    window.__appSettingsDoor__ === DEV_DOOR_TOKEN
  )
    return true;
  return isNative();
}

/** Native: the BLE plugin's own openAppSettings, reached through the same
 *  dynamic-import idiom keepAwake.ts uses so the plugin never lands in the
 *  web bundle. Web: a no-op (the reason is unreachable there anyway) — and
 *  deliberately still a no-op when the dev door above is forced open, so the
 *  override can never reach a plugin the web build does not have. */
export async function openAppSettings(): Promise<void> {
  if (!isNative()) return;
  const { nativeOpenAppSettings } = await import("../native/appSettings");
  await nativeOpenAppSettings();
}
