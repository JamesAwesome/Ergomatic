import { Link } from "react-router-dom";
import type { Me } from "./useMe";
import { signOut as authSignOut } from "./adapters/auth";
import { useArticleReads } from "./api/useArticleReads";
import { startHereReadCount } from "./today/startHereSteps";
import BaselineEditor from "./you/BaselineEditor";

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
  const reads = useArticleReads();
  // `null` (not 0) whenever read state isn't known — the meta renders bare
  // "START HERE" with no count in that case, the same suppression rule
  // StartHere.tsx's own header uses (startHereSteps.ts's shared helper).
  const readCount = startHereReadCount(reads);

  return (
    <main className="screen">
      <section className="you">
        <div className="avatar" aria-hidden="true">
          {initials(user.name)}
        </div>
        <div>
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
      <BaselineEditor />
      {/* Task 7 (design spec §"Learning the app on You"): the mock's other
          settings rows (PRE-WORKOUT COUNTDOWN, PACE TOLERANCE, ACCENT
          COLOR) are filler (DEVIATIONS.md/handoff README §7) and are
          deliberately not built. WARM-UP used to be the one exception —
          a fully-specified control (README §11) built for real, not
          filler — but Phase WU (2026-08-21) removed the setting; "Learning
          the app" below is a real row of its own, unrelated to any of
          this. */}
      <h2 className="section-heading">SETTINGS</h2>
      <Link
        to="/you/learning"
        state={{ from: "/you" }}
        className="you-settings-row"
      >
        <span className="you-settings-row-title">Learning the app</span>
        <span className="you-settings-row-meta mono-status">
          START HERE{readCount !== null ? ` · ${readCount} OF 4` : ""}
        </span>
      </Link>
    </main>
  );
}
