/* v8 ignore start -- thin plugin wrapper; proven on device at Phase KB's Gate 0. */
import { Keyboard } from "@capacitor/keyboard";
import type { PluginListenerHandle } from "@capacitor/core";

/** `@capacitor/keyboard`'s `load()` sets `hideFormAccessoryBar = YES`
 *  unconditionally (Keyboard.m, 8.0.5), swizzling `-inputAccessoryView` to
 *  `nil` — so merely installing the plugin removes the ‹ › ✓ tray from every
 *  field. This is the only way to put it back. */
export async function nativeSetAccessoryBarVisible(
  isVisible: boolean,
): Promise<void> {
  await Keyboard.setAccessoryBarVisible({ isVisible });
}

/** The plugin's `keyboardWillShow` / `keyboardWillHide` — UIKit's own
 *  notifications, posted as the keyboard STARTS to animate, so a listener
 *  reacts before a single frame of it is on screen. Returns the
 *  unsubscribe; the handles resolve asynchronously, so an unsubscribe that
 *  races registration removes them once they exist. */
export function nativeSubscribeKeyboard(
  onShow: () => void,
  onHide: () => void,
): () => void {
  let live = true;
  const handles: PluginListenerHandle[] = [];
  const keep = (p: Promise<PluginListenerHandle>) =>
    p.then((h) => {
      if (live) handles.push(h);
      else void h.remove();
    });
  void keep(Keyboard.addListener("keyboardWillShow", onShow));
  void keep(Keyboard.addListener("keyboardWillHide", onHide));
  return () => {
    live = false;
    for (const h of handles) void h.remove();
    handles.length = 0;
  };
}
/* v8 ignore stop */
