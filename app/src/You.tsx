import { useState } from "react";
import { Link } from "react-router-dom";
import type { Me } from "./useMe";
import { signOut as authSignOut } from "./adapters/auth";
import BaselinesRow from "./you/BaselinesRow";
import { clearConcept2Seen } from "./you/concept2Seen";
import Concept2Row from "./you/Concept2Row";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default function You({
  user,
  onSignedOut,
}: {
  user: Me;
  onSignedOut: () => void;
}) {
  // AUD-014's unmet half. The DANGEROUS state was never reachable — the
  // transition below runs AFTER the await, so a failed sign-out leaves the
  // app signed in rather than showing a signed-out screen over a live
  // token. What was missing is any sign it happened: the rower tapped, the
  // keychain wipe failed, and nothing moved. The button read as broken.
  const [signOutFailed, setSignOutFailed] = useState(false);
  return (
    // M-3 (final whole-branch review): `you-screen` pairs with the
    // `.you-screen` CSS rule (index.css, Task 3's own comment block) that
    // pins the DIAGNOSTICS row below to the bottom of this screen, matching
    // the approved gate artifact — `.screen` itself is untouched, so no
    // other route's layout changes.
    <main className="screen you-screen">
      <section className="you">
        <div className="avatar" aria-hidden="true">
          {initials(user.name)}
        </div>
        {/* NAMED so it can carry `min-width: 0`. A flex child's default
            `min-width: auto` refuses to shrink below its content, so a long
            address used to push this block a whole line taller — see
            `.you-identity` in index.css. */}
        <div className="you-identity">
          <p className="you-name">{user.name}</p>
          <p className="you-email">{user.email}</p>
        </div>
        {signOutFailed && (
          <p className="notice" role="alert">
            That sign-out didn&apos;t work. You&apos;re still signed in. Give it
            another try.
          </p>
        )}
        <button
          className="button-outline"
          onClick={async () => {
            // I-D (spec 2026-09-04-concept2-walk-fixes §5.1): the Concept2
            // row's persisted "this account has been told" fact must not
            // outlive the account on this device — enforced on THIS path
            // only. `useMe`'s 401/throw path signs the rower out without
            // calling this, leaving the same account's own fact behind:
            // bounded by I-A (no other account can read it) and self-healing
            // by I-C (the next successful read re-derives it). Cleared
            // BEFORE the adapter's sign-out so a failed sign-out on THIS
            // path cannot leave it behind either.
            clearConcept2Seen(user.id);
            try {
              setSignOutFailed(false);
              await authSignOut();
            } catch {
              // NOT rethrown and `onSignedOut` NOT called: staying signed in
              // is the correct outcome when the token is still on the
              // device, and it is what already happened — this only makes it
              // legible. No error detail is surfaced; a rower can act on
              // "try again" and on nothing else, and the detail would be a
              // place for a token to leak into a screenshot.
              setSignOutFailed(true);
              return;
            }
            onSignedOut();
          }}
        >
          Sign out
        </button>
      </section>
      {/* No SETTINGS section: the mock's settings rows (PRE-WORKOUT
          COUNTDOWN, PACE TOLERANCE, ACCENT COLOR) are filler
          (DEVIATIONS.md/handoff README §7) and are deliberately not
          built; the two rows that WERE real are both since removed —
          WARM-UP by Phase WU (2026-08-21), and "Learning the app" by
          James's 2026-08-23 ruling (the teaching lives in News's pinned
          articles alone now). */}
      {/* THE DOORS (Wave E PR A, spec 2026-09-04-concept2-walk-fixes §5.1,
          Gate 0 amendment §8 approved 2026-09-04; THIRD ROW added by the
          baselines-subpage Gate 0, 2026-09-05): the foot of You is one
          GROUP of quiet mono rows, pinned to the bottom by ONE
          `margin-top: auto` on this wrapper (`.you-doors`, index.css) —
          invariant R7; rows each carrying their own auto margin would
          be a flex free-space split, not a stack. ORDER: BASELINES,
          CONCEPT2, DIAGNOSTICS — ruling 7 fixed CONCEPT2 above
          DIAGNOSTICS and keeps DIAGNOSTICS You's last child; BASELINES
          goes on top because it is the only one of the three a rower
          reads FOR its value rather than opens for a task.

          BASELINES (Gate 0, 2026-09-05 — James: "move baselines into a
          subpage of You, I'd still like them to be visible when they are
          collapsed"): the editor, the re-test shortcut and Reset baseline
          setup all moved to `/you/baselines`
          (`you/BaselinesScreen.tsx`); this row keeps the two splits
          readable without opening it (`you/BaselinesRow.tsx` carries the
          decision table). Unlike CONCEPT2 it ALWAYS renders — baselines
          are not a capability an account may lack.

          CONCEPT2: the row replaces the card that stood here (PR2's
          Surface 1). It renders NOTHING unless a successful read has said
          `available: true` for this account — today's capability gate,
          plus ruling 6's persisted `seen` fact for the failed-read cell
          (`you/Concept2Row.tsx` carries the decision table). Everything
          the card did lives behind it at `/you/concept2`
          (`you/Concept2Screen.tsx`), including the dev-only link probe
          that used to sit between the card and this row. James's
          2026-09-04 "AS SHIPPED" position ruling was made on captures of
          the CARD beside RESET BASELINE SETUP; it does not transfer to
          this adjacency, which Gate 0 §8.2/8.4 drew and approved instead.

          DIAGNOSTICS (Task 3, Gate 0 rev 2/3, 2026-09-01): one quiet mono
          row, at the bottom of You, on purpose — the diagnostics ring is
          not a product feature a rower reaches for, it's a tool for the
          rare "something went wrong" moment. Opens the menu screen
          (`you/Diagnostics.tsx`), not Monitor logs directly — the menu is
          the extensible home for whatever diagnostic tools follow.
          `state={{ from: "/you" }}`: the same origin idiom the two rows
          above use, so the menu's own BackLink returns HERE. Stays the
          LAST child of You. */}
      <nav className="you-doors" aria-label="More">
        <BaselinesRow />
        <Concept2Row accountId={user.id} />
        <Link
          to="/you/diagnostics"
          state={{ from: "/you" }}
          className="diag-row"
        >
          <span>DIAGNOSTICS</span>
          <span aria-hidden="true">&rsaquo;</span>
        </Link>
      </nav>
    </main>
  );
}
