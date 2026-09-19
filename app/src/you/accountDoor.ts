import type { AuthFlowController } from "../adapters/authFlow";

/**
 * THE DOOR AND THE SCREEN READ ONE MODULE (account-submenu spec §4,
 * invariant D1). Before the submenu, `SignInMethods` decided its own
 * visibility and You rendered whatever came back: on a host whose front door
 * is off, the whole account block — the methods list AND `Delete account` —
 * was simply absent (`SignInMethods.tsx`, the `options` guard). Splitting the
 * block onto `/you/account` splits that decision in two, and the two halves
 * must not be able to disagree: a door onto an empty screen, or a screen
 * reachable with no door, are both defects.
 *
 * THEY ARE NOT THE SAME PREDICATE, THOUGH, AND THE ASYMMETRY IS THE POINT.
 * `options` has three states, not two — loading, ready-with-front-door, and
 * ready-without — and "not yet known" is not "no":
 *
 *   - THE DOOR hides while the answer is unknown. It costs a rower nothing:
 *     the row appears the moment the read lands, which is the same frame the
 *     rest of You settles in.
 *   - THE ROUTE waits while the answer is unknown, and refuses only on a
 *     settled no. Refusing on unknown bounces EVERY direct arrival — a
 *     bookmark, a deep link, and every OAuth return, which is now routed
 *     here (`destinationFor`, spec §7) — off the screen before its own read
 *     resolves. Measured: with the route sharing the door's predicate,
 *     `appleAuth.spec.ts`'s refusal leg found no `Remove Apple` at all,
 *     because the redirect had already fired.
 *
 * Neither considers `apple`/`google` availability. A host with one proof
 * still renders the list (the other provider's row reads its state and its
 * Add is disabled) and still renders a usable `Delete account` as long as
 * the account holds the provider that IS available — the block's own logic.
 * Narrowing here would hide the delete control over a condition the block
 * already handles, which is the opposite of what Apple requires of it.
 */
export function accountDoorAvailable(auth: AuthFlowController): boolean {
  return auth.options.state === "ready" && auth.options.frontDoorEnabled;
}

/**
 * The route's half. Answers WHICH controller may serve `/you/account`, not a
 * boolean, so the route has one decision to make and no second guard of its
 * own: an `undefined` answer IS the redirect, and the value it returns is
 * the one the screen is handed. A boolean left `AppRoutes` writing
 * `authFlow && !refused(authFlow)` for the compiler's benefit, which made
 * the no-controller arm unreachable from the only call site — a green
 * assertion no user-facing path could reach (RF21).
 *
 * Refuses only where the door is PERMANENTLY hidden: no controller at all,
 * or a settled answer of "this host has no front door". A read still in
 * flight is not a refusal.
 */
export function accountScreenController(
  auth: AuthFlowController | undefined,
): AuthFlowController | undefined {
  if (!auth) return undefined;
  if (auth.options.state === "ready" && !auth.options.frontDoorEnabled) {
    return undefined;
  }
  return auth;
}
