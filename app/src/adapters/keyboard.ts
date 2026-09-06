import { isNative } from "../platform";

/** Puts the keyboard's ‹ › ✓ accessory tray back on native.
 *
 *  Phase KB installs `@capacitor/keyboard` for its keyboardWillShow/WillHide
 *  events (`resize: none` — `capacitor.config.ts`; the WebView is never
 *  resized). The plugin's own
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

/** Reports the software keyboard opening (`true`) and closing (`false`), from
 *  the plugin's `keyboardWillShow` / `keyboardWillHide` — fired as the
 *  keyboard starts to animate, before it covers anything. This is the signal
 *  the withdrawn #317 candidate lacked: it is the keyboard itself, not
 *  `visualViewport.height`, so a pinch-zoom cannot fake it. Web: the browser
 *  has no such event, and nothing on the web arm reacts to the keyboard
 *  (native-first; the web keeps its strip) — the listener never fires and
 *  the unsubscribe is a no-op. The native module is reached through the same
 *  dynamic import as above, so the plugin stays out of the web bundle. */
export function subscribeKeyboardOpen(
  listener: (open: boolean) => void,
): () => void {
  if (!isNative()) return () => {};
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  void import("../native/keyboard").then(({ nativeSubscribeKeyboard }) => {
    if (cancelled) return;
    unsubscribe = nativeSubscribeKeyboard(
      () => listener(true),
      () => listener(false),
    );
  });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
