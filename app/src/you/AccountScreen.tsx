import BackLink from "../shell/BackLink";
import type { AuthFlowController } from "../adapters/authFlow";
import SignInMethods from "./SignInMethods";

/**
 * `/you/account` — the screen behind You's ACCOUNT row (Gate 0 2026-09-15,
 * OPTION A; pack at `docs/design/account-submenu-gate0/`, spec
 * `docs/superpowers/specs/2026-09-18-account-submenu-design.md`).
 *
 * WHY IT EXISTS. `Delete account` used to sit 433 px from the top of You,
 * visible without scrolling on a 390x844 phone, as a red button in a
 * red-bordered box — the loudest element on the first screen a rower opens
 * (`account-submenu-gate0/renders/layout-audit.json`, `01-today-you`). The
 * box is itself the 2026-09-14 quarantine ruling, so this is that concern
 * escalating: a quarantine box is a visually loud object, and quarantining
 * it on the page did not make it quieter. James, 2026-09-15: *"I want to
 * also move the account settings into a submenu because 'delete your
 * account' is FAR too prominent."*
 *
 * IT HOLDS THE WHOLE BLOCK, NOT HALF OF IT (Option A over B). The sign-in
 * methods list came too, which is what keeps `prepareLink`'s success notice
 * beside the row that now reads CONNECTED — the pairing the notice was
 * trimmed to rely on (`SignInMethods.tsx`, `methodsNotice`). Splitting them
 * would have left the notice on a screen the rower had left.
 *
 * THIS FILE ADDS NO BEHAVIOUR. It is the house subpage frame — back link,
 * title — around a component that moved here unchanged. Its route is
 * guarded by `accountDoorAvailable`, the same predicate that decides whether
 * You draws the door at all (`accountDoor.ts`, invariant D1).
 *
 * `← BACK`, not the pack's `← YOU`: every sibling subpage (baselines,
 * concept2, settings, diagnostics, stats) uses the house default, and
 * `BackLink` reserves a custom label for a different KIND of exit (`← DONE`
 * on the summary). A one-word deviation from the approved render, called out
 * in the PR rather than made silently.
 */
export default function AccountScreen({ auth }: { auth: AuthFlowController }) {
  return (
    <main className="screen">
      <BackLink fallback="/you" />
      <h1 className="screen-title">Account</h1>
      <SignInMethods auth={auth} />
    </main>
  );
}
