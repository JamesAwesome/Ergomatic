import { useState } from "react";
import type { Me } from "./useMe";
import { signOut as authSignOut } from "./adapters/auth";
import BaselineEditor from "./you/BaselineEditor";
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
    <main className="screen">
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
    </main>
  );
}
