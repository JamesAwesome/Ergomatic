import type { AuthFlowController } from "../adapters/authFlow";

/**
 * ONE PREDICATE FOR THE DOOR AND THE SCREEN BEHIND IT (account-submenu spec
 * §4, invariant D1). Before the submenu, `SignInMethods` decided its own
 * visibility and You rendered whatever came back: on a host whose front door
 * is off, the whole account block — the methods list AND `Delete account` —
 * was simply absent (`SignInMethods.tsx`, the `options` guard). Splitting the
 * block onto `/you/account` splits that decision in two, and the two halves
 * must not be able to disagree: a door onto an empty screen, or a screen
 * reachable with no door, are both defects. So both read THIS.
 *
 * It deliberately does NOT consider `apple`/`google` availability. A host
 * with one proof still renders the list (the other provider's row reads its
 * state and its Add is disabled) and still renders a usable `Delete account`
 * as long as the account holds the provider that IS available — the block's
 * own logic. Narrowing here would hide the delete control over a condition
 * the block already handles, which is the opposite of what Apple requires of
 * it.
 */
export function accountDoorAvailable(auth: AuthFlowController): boolean {
  return auth.options.state === "ready" && auth.options.frontDoorEnabled;
}
