import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Builder from "../builder/Builder";
import BulkImport from "../builder/BulkImport";
import EditWorkout from "../builder/EditWorkout";
import Library from "../library/Library";
import Plan from "../plan/Plan";
import ConfirmTargets from "../session/ConfirmTargets";
import Countdown from "../session/Countdown";
import LogSession from "../session/LogSession";
import SessionComplete from "../session/SessionComplete";
import Timer from "../session/Timer";
import Today from "../today/Today";
import WorkoutDetail from "../workout/WorkoutDetail";
import You from "../You";
import type { Me } from "../useMe";
import TabBar from "./TabBar";

// Routes whose screens own the whole viewport — the handoff's own rule
// ("Tabs are hidden during countdown and timer," carried forward to
// /session/complete by the 6B plan since it's the same full-bleed holder
// pattern) — checked by PREFIX, not exact match, so a future param/query
// string on any of these routes never needs to remember to opt back in.
const HIDDEN_TABBAR_PREFIXES = [
  "/session/countdown",
  "/session/run",
  "/session/complete",
  // Phase 6C Task 2: the Log screen is the same full-bleed holder pattern's
  // natural continuation past /session/complete, not an ordinary tabbed
  // screen a rower would navigate to directly.
  "/session/log",
];

// Pure and exported for direct testing, same pattern as ClockInput.tsx's
// digitsToClock/TabBar.tsx/auth.tsx/ConfirmTargets.tsx's own step helpers.
// eslint-disable-next-line react-refresh/only-export-components
export function hidesTabBar(pathname: string): boolean {
  return HIDDEN_TABBAR_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <main className="screen">
      <h1 className="screen-title">{title}</h1>
      <p className="placeholder-note">Arrives in {phase}.</p>
    </main>
  );
}

// BulkImport takes its "where does a clean import send the rower" callback
// as a prop rather than owning navigation itself (same seam Builder.tsx's
// own useNavigate call uses for its save-success redirect), so this is the
// one place that wires it to the route.
function BulkImportRoute() {
  const navigate = useNavigate();
  return <BulkImport onImported={() => navigate("/library")} />;
}

// `user`/`onSignedOut` are optional so tests can render <AppRoutes /> without
// a signed-in user. /you composes the account block with the staged baseline
// editor (You.tsx). App.tsx supplies both once useMe() resolves to "in".
export default function AppRoutes({
  user,
  onSignedOut,
}: {
  user?: Me;
  onSignedOut?: () => void;
} = {}) {
  const location = useLocation();
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<Today />} />
        <Route path="/library" element={<Library />} />
        <Route path="/library/new" element={<Builder />} />
        {/* React Router ranks a static segment ("new") over a dynamic one
            (":id") regardless of declaration order, so neither this nor
            /library/import below strictly needs to precede /library/:id —
            but /library/import is registered first anyway, so the static
            route wins by construction rather than by relying on the
            ranking algorithm, and WorkoutDetail's :id route still matches
            /library/w1 etc. unaffected by this change. */}
        <Route path="/library/import" element={<BulkImportRoute />} />
        <Route path="/library/:id" element={<WorkoutDetail />} />
        <Route path="/library/:id/edit" element={<EditWorkout />} />
        {/* Phase 6C Task 3: the manual door ("Log it after") — the SAME
            LogSession component as /session/log below, distinguishing the
            two by whether a route `:id` param is present (LogSession's own
            door-detection comment). Deliberately NOT added to
            HIDDEN_TABBAR_PREFIXES: unlike the session door (which always has
            a Discard button as its own way out), the manual door has no
            button to back out with (nothing to discard) — the tab bar stays
            visible here as the only escape hatch, and navigating away
            touches no storage at all (the manual door never reads or writes
            a draft/run record), so there's nothing for an early exit to
            leave dangling. */}
        <Route path="/library/:id/log" element={<LogSession />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/session/confirm" element={<ConfirmTargets />} />
        <Route path="/session/countdown" element={<Countdown />} />
        <Route path="/session/run" element={<Timer />} />
        <Route path="/session/complete" element={<SessionComplete />} />
        <Route path="/session/log" element={<LogSession />} />
        <Route
          path="/trend"
          element={<Placeholder title="Trend" phase="Phase 8" />}
        />
        {user && onSignedOut && (
          <Route
            path="/you"
            element={<You user={user} onSignedOut={onSignedOut} />}
          />
        )}
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
      {!hidesTabBar(location.pathname) && <TabBar />}
    </div>
  );
}
