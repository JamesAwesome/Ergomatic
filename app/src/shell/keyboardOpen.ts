import { useSyncExternalStore } from "react";
import { subscribeKeyboardOpen } from "../adapters/keyboard";

// Phase KB (docs/superpowers/specs/2026-09-06-keyboard-webview-resize-design.md).
// One module-level store fed by the adapter, so every consumer shares a
// single plugin subscription and a screen mounted while the keyboard is
// already up reads `true` on its first render. The adapter subscription is
// opened by the first consumer and closed by the last; when the last consumer
// leaves the store forgets its value, because the keyboard can move while
// nobody is listening (branch review, PR #321).
let open = false;
let stopAdapter: (() => void) | null = null;
const consumers = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  consumers.add(onChange);
  stopAdapter ??= subscribeKeyboardOpen((next) => {
    if (next === open) return;
    open = next;
    for (const c of consumers) c();
  });
  return () => {
    consumers.delete(onChange);
    if (consumers.size === 0) {
      stopAdapter?.();
      stopAdapter = null;
      // Nobody is watching, so the next consumer cannot trust the last
      // value: a stale `true` would hide the whole main navigation until
      // the next show/hide pair; a stale `false` costs one band until the
      // next willShow. Start closed.
      open = false;
    }
  };
}

const getSnapshot = () => open;
const getServerSnapshot = () => false;

/** Whether the software keyboard is up (native only; always `false` on the
 *  web). `AppRoutes` hides the tab bar on it — what Ionic's `ion-tab-bar`
 *  does for itself (`tab-bar-hidden` while `keyboardVisible`) and what
 *  iOS's own tab bars do under a keyboard. */
export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
