/* v8 ignore start -- thin plugin wrapper; proven on device at Phase KB's Gate 0. */
import { Keyboard } from "@capacitor/keyboard";

/** `@capacitor/keyboard`'s `load()` sets `hideFormAccessoryBar = YES`
 *  unconditionally (Keyboard.m, 8.0.5), swizzling `-inputAccessoryView` to
 *  `nil` — so merely installing the plugin removes the ‹ › ✓ tray from every
 *  field. This is the only way to put it back. */
export async function nativeSetAccessoryBarVisible(
  isVisible: boolean,
): Promise<void> {
  await Keyboard.setAccessoryBarVisible({ isVisible });
}
/* v8 ignore stop */
