import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import type { Me } from "./useMe";
import { signOut as authSignOut } from "./adapters/auth";
import BaselineEditor from "./you/BaselineEditor";
import Concept2Card from "./you/Concept2Card";
import ResetBaselineSetup from "./you/ResetBaselineSetup";
import RetestShortcut from "./you/RetestShortcut";

// Wave E PR1.5 fix round 2 (P1a-device): same shape as `AppRoutes.tsx`'s
// `monitorInstrumentEnabled`/`JustRowObserver` seam — a dynamic `import()`
// behind a build-time-folded condition, so this card and its distinctive
// `data-c2-link-probe` literal are absent from a production build with the
// flag unset (dist-grep proof: `docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md`).
// Mounted on You rather than as its own route (unlike JustRowObserver):
// JustRowObserver's own header notes it "has no in-app entry — it is
// reached by typing its URL", which works for a laptop/web walk but not
// for an on-device iOS check (no address bar) — this probe needs a
// TAPPABLE entry point, and the You tab is already one.
const c2LinkProbeEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_C2_LINK_PROBE === "1";
const Concept2LinkProbe = c2LinkProbeEnabled
  ? lazy(() => import("./monitor/Concept2LinkProbe"))
  : null;

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
      {/* Wave E PR2, Surface 1 (board + Gate 0 amendment 2026-09-03). The
          rower's only door to the Concept2 link. Renders NOTHING unless
          the server reports `available: true` — a capability gate, not a
          cosmetic hide (spec §Architecture 8), so You looks exactly as it
          does today on any deployment with `C2_LINK_ENABLED` unset, which
          is every deployment until the flag flip.
          ABOVE the dev-only probe and the DIAGNOSTICS row, both of which
          keep their own positions (the probe is a walk instrument, not a
          product surface; the row's own comment requires it stay last).
          BELOW Reset baseline setup, which is a decision this task made
          rather than one the amendment drew: every in-situ frame that
          shows the card (1a, 1c, 1f, 1f-b, 1f-c, 1i, 1j) omits the RESET
          BASELINE SETUP ghost entirely, and the only frames that draw
          that ghost (1h, the no-card comparison) omit the card — so the
          page never puts the two in one frame and cannot settle their
          order. Keeping Reset directly under the BASELINES group it
          destroys is what decides it. */}
      <Concept2Card email={user.email} />
      {/* No SETTINGS section: the mock's settings rows (PRE-WORKOUT
          COUNTDOWN, PACE TOLERANCE, ACCENT COLOR) are filler
          (DEVIATIONS.md/handoff README §7) and are deliberately not
          built; the two rows that WERE real are both since removed —
          WARM-UP by Phase WU (2026-08-21), and "Learning the app" by
          James's 2026-08-23 ruling (the teaching lives in News's pinned
          articles alone now). */}
      {Concept2LinkProbe && (
        <Suspense fallback={null}>
          <Concept2LinkProbe />
        </Suspense>
      )}
      {/* Task 3 (Gate 0 rev 2/3, 2026-09-01): one quiet mono row, at the
          bottom of You, on purpose — the diagnostics ring is not a
          product feature a rower reaches for, it's a tool for the rare
          "something went wrong" moment. Opens the menu screen
          (`you/Diagnostics.tsx`), not Monitor logs directly — the menu is
          the extensible home for whatever diagnostic tools follow.
          `state={{ from: "/you" }}`: the same origin idiom RetestShortcut
          above uses, so the menu's own BackLink returns HERE. Stays the
          LAST child (dev-only C2LinkProbe, present or absent, sits above
          it) per this comment's own "at the bottom of You, on purpose". */}
      <Link to="/you/diagnostics" state={{ from: "/you" }} className="diag-row">
        <span>DIAGNOSTICS</span>
        <span aria-hidden="true">&rsaquo;</span>
      </Link>
    </main>
  );
}
