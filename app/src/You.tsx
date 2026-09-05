import { useState } from "react";
import { Link } from "react-router-dom";
import type { Me } from "./useMe";
import { signOut as authSignOut } from "./adapters/auth";
import BaselineEditor from "./you/BaselineEditor";
import { clearConcept2Seen } from "./you/concept2Seen";
import Concept2Row from "./you/Concept2Row";
import ResetBaselineSetup from "./you/ResetBaselineSetup";
import RetestShortcut from "./you/RetestShortcut";

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
  // Phase BL PR C: bumped by Reset baseline setup's successful clear —
  // remounts BaselineEditor (key below) so its draft re-seeds from the
  // now-empty server state instead of keeping the cleared numbers on
  // screen as if they still existed.
  const [resetGeneration, setResetGeneration] = useState(0);

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
            await authSignOut();
            onSignedOut();
          }}
        >
          Sign out
        </button>
      </section>
      <h2 className="section-heading">BASELINES</h2>
      <BaselineEditor key={resetGeneration} />
      {/* Phase BL PR B, reshaped by James's tester feedback (2026-08-22):
          row the 6k / race the 2k, one tap from the numbers to each
          designated test's DETAIL screen (Connect / Start Timer / Log it
          after) — the shortcut's own doc comment (you/RetestShortcut.tsx)
          covers identity, the from:"/you" back chain, and where the
          start guards live now. */}
      <RetestShortcut />
      {/* Phase BL PR C: the staged-confirm Reset baseline setup — the
          product answer to "the doors are unreachable once set" (spec rev
          2's Reset onboarding ruling). Sits with the BASELINES section it
          destroys, below the shortcut. */}
      <ResetBaselineSetup onReset={() => setResetGeneration((g) => g + 1)} />
      {/* No SETTINGS section: the mock's settings rows (PRE-WORKOUT
          COUNTDOWN, PACE TOLERANCE, ACCENT COLOR) are filler
          (DEVIATIONS.md/handoff README §7) and are deliberately not
          built; the two rows that WERE real are both since removed —
          WARM-UP by Phase WU (2026-08-21), and "Learning the app" by
          James's 2026-08-23 ruling (the teaching lives in News's pinned
          articles alone now). */}
      {/* THE DOORS (Wave E PR A, spec 2026-09-04-concept2-walk-fixes §5.1,
          Gate 0 amendment §8 approved 2026-09-04): the foot of You is one
          GROUP of two quiet mono rows, pinned to the bottom by ONE
          `margin-top: auto` on this wrapper (`.you-doors`, index.css) —
          invariant R7; two rows each carrying their own auto margin would
          be a flex free-space split, not a second row under the first.
          ORDER RULED (ruling 7): CONCEPT2 ABOVE DIAGNOSTICS, which keeps
          the DIAGNOSTICS row You's last child.

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
          `state={{ from: "/you" }}`: the same origin idiom RetestShortcut
          above uses, so the menu's own BackLink returns HERE. Stays the
          LAST child of You. */}
      <nav className="you-doors" aria-label="More">
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
