import { isNative } from "../platform";

/** Puts the keyboard's ‹ › ✓ accessory tray back on native.
 *
 *  Phase KB installs `@capacitor/keyboard` for `resize: native` (the WebView
 *  shrinks to the keyboard's top — `capacitor.config.ts`). The plugin's own
 *  `load()` ALSO hides the input-accessory tray, unconditionally and with no
 *  config key to say otherwise (Keyboard.m 8.0.5, `self.hideFormAccessoryBar
 *  = YES;`; antagonist anchor pass, 2026-09-06). On the numeric keypad —
 *  `SplitInput`, `Stepper`, `DurationInput`, `ClockInput`, all
 *  `inputMode="numeric"` — that tray's ✓ is the ONLY way to dismiss the
 *  keyboard, so it comes back at boot. Native only: the plugin is reached
 *  through the same dynamic-import idiom as `keepAwake.ts`, so it never lands
 *  in the web bundle, and the web arm has no tray to restore. */
export async function restoreKeyboardAccessoryBar(): Promise<void> {
  if (!isNative()) return;
  const { nativeSetAccessoryBarVisible } = await import("../native/keyboard");
  await nativeSetAccessoryBarVisible(true);
}
