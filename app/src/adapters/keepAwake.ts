import { isNative } from "../platform";

/** The Screen Wake Lock API's sentinel releases ITSELF the instant the
 *  document goes hidden (tab backgrounded, screen locked) — spec behaviour,
 *  not a bug to route around. A rower who glances away mid-workout and
 *  back needs the lock re-acquired the moment the page is visible again,
 *  so `visibilitychange` drives re-acquisition. This module-level variable
 *  is the web arm's only mutable state; the native arm has none (the
 *  Capacitor plugin owns its own state device-side). */
let webWakeLock: WakeLockSentinel | null = null;

async function requestWebWakeLock(): Promise<void> {
  try {
    // Optional chaining is the "absent API" no-op itself (spec: web ->
    // `navigator.wakeLock?.request("screen")`) — an unsupported browser
    // (older Safari, most non-Chromium engines as of 2026) short-circuits
    // to `undefined` here with no throw. The `catch` below covers the
    // OTHER best-effort failure mode: a supported API that still rejects
    // (hidden document at request time, OS/user policy denial) — neither
    // failure should ever surface to the caller, a rower's session runs
    // either way, the phone just might dim.
    webWakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    webWakeLock = null;
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    void requestWebWakeLock();
  }
}

/** Turns keep-awake ON for the current screen (countdown/timer/complete —
 *  callers decide when, this module has no opinion). Native: the Capacitor
 *  plugin, reached through a dynamic import inside THIS branch only — the
 *  exact idiom `adapters/auth.tsx` uses for `../native/signin` — so the
 *  plugin never lands in the web bundle. Web: the Wake Lock API,
 *  best-effort. */
export async function keepAwakeOn(): Promise<void> {
  if (isNative()) {
    const { nativeKeepAwakeOn } = await import("../native/keepAwake");
    await nativeKeepAwakeOn();
    return;
  }
  document.addEventListener("visibilitychange", onVisibilityChange);
  await requestWebWakeLock();
}

/** Turns keep-awake OFF. The listener is removed BEFORE the lock is
 *  released so a `visibilitychange` firing mid-release (or immediately
 *  after) can't re-acquire a lock this call is in the middle of dropping. */
export async function keepAwakeOff(): Promise<void> {
  if (isNative()) {
    const { nativeKeepAwakeOff } = await import("../native/keepAwake");
    await nativeKeepAwakeOff();
    return;
  }
  document.removeEventListener("visibilitychange", onVisibilityChange);
  const lock = webWakeLock;
  webWakeLock = null;
  if (lock) {
    try {
      await lock.release();
    } catch {
      // Best-effort: already released (or unreleasable) is not this
      // caller's problem — the goal (screen may dim again) is met either
      // way.
    }
  }
}
