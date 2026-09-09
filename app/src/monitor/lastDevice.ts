/**
 * The `LAST USED · <name>` caption's storage, and the one rule about it.
 *
 * This lived in `ConnectedInterstitial.tsx` until Phase MT's close-out
 * review. It moved because the WRITER and the FORGETTER are not the same
 * door: the workout interstitial is the only screen that writes the name,
 * but `useMonitorSession`'s refusal can arrive on any of the three doors
 * that call `connect()` (`ConnectedInterstitial`, `JustRow`,
 * `JustRowObserver`), and a hook cannot import from a component it is
 * rendered by. A module both can reach is what makes the invariant below
 * hold on every door rather than on the one that happens to write.
 *
 * THE INVARIANT: a machine the app refuses is never left standing as
 * LAST USED, and NOTHING ELSE ever un-remembers one. That caption is the
 * whole one-tap route back to a monitor, so a link that drops, a scan that
 * finds nothing, a withdrawn permission or a rejected workout must all
 * leave it exactly as it was.
 */

/** localStorage key for the `LAST USED · <name>` caption (handoff §1) — a
 *  plain string, not a versioned record: there is nothing here to migrate,
 *  and a missing/garbage value reads identically to "never paired"
 *  (`loadLastDevice` returning `null`), matching every other best-effort
 *  read in this codebase (`session/run.ts`'s own Resilience #5 idiom,
 *  applied to the simplest possible shape). */
export const LAST_DEVICE_KEY = "ergomatic.lastMonitorDevice";

export function saveLastDevice(name: string): void {
  try {
    localStorage.setItem(LAST_DEVICE_KEY, name);
  } catch {
    // best-effort: a failed persist never interrupts the caller
  }
}

export function loadLastDevice(): string | null {
  try {
    return localStorage.getItem(LAST_DEVICE_KEY);
  } catch {
    return null;
  }
}

/** Un-remembers `name`, and ONLY `name` — the caption must not lose a
 *  perfectly good monitor because a different one was refused. Its one
 *  caller is `useMonitorSession.ts`'s `unsupported-machine` interception;
 *  that comment carries why the clear belongs there. */
export function forgetLastDevice(name: string): void {
  try {
    if (localStorage.getItem(LAST_DEVICE_KEY) === name) {
      localStorage.removeItem(LAST_DEVICE_KEY);
    }
  } catch {
    // best-effort, symmetric with `saveLastDevice`: a storage that cannot be
    // read or written cannot be showing a stale caption either.
  }
}
