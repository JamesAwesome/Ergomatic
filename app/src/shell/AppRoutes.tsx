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
import FromTheLog from "../log/FromTheLog";
import HistoryList from "../log/HistoryList";
import Library from "../library/Library";
import News from "../news/News";
import KnowBaseline from "../onboarding/KnowBaseline";
import Recommend from "../onboarding/Recommend";
import RowToFind from "../onboarding/RowToFind";
import Reader from "../news/Reader";
import Releases from "../news/Releases";
import Plan from "../plan/Plan";
import Countdown from "../session/Countdown";
import { loadDraft } from "../session/draft";
import { isComplete } from "../session/engine";
import { loadRun } from "../session/run";
import LogSession from "../session/LogSession";
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
  // Phase BL PR C: the three onboarding doors' flow screens (canvas
  // Question1/Question2/Recommendation/Experienced/RowPath draw no tab
  // bar — a setup flow, entered from Today's doors card and exited by
  // its own Back/lead buttons, not a tabbed destination). Prefix-checked
  // like the rest, so all three door routes opt out together.
  "/onboarding",
];

// Pure and exported for direct testing, same pattern as ClockInput.tsx's
// digitsToClock/TabBar.tsx/auth.tsx's own step helpers (and
// ConfirmTargets.tsx's, before fast-follow Task 4 deleted that screen).
// eslint-disable-next-line react-refresh/only-export-components
export function hidesTabBar(pathname: string): boolean {
  return HIDDEN_TABBAR_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// BulkImport takes its "where does a clean import send the rower" callback
// as a prop rather than owning navigation itself (same seam Builder.tsx's
// own useNavigate call uses for its save-success redirect), so this is the
// one place that wires it to the route.
function BulkImportRoute() {
  const navigate = useNavigate();
  return <BulkImport onImported={() => navigate("/library")} />;
}

/** `/session/confirm`'s replacement (fast-follow spec §3, entry 6):
 *  ConfirmTargets is deleted and the route itself carries no screen of its
 *  own any more, but the URL survives as a stale deep link or a browser
 *  back-swipe target — `monitorRun.ts`'s own doc comment documents both as
 *  real, reachable cases. This element renders no UI, only a redirect to
 *  wherever the rower's actual session state now lives: a `SessionRun`
 *  already on record means the session genuinely got past the countdown
 *  (Countdown builds and saves it on mount) → the live timer; a draft with
 *  no run yet means a session is queued but the count hasn't run →
 *  Countdown itself, so it can build one; nothing at all → `/today`, the
 *  same fallback every other dead deep link in this file's own catch-all
 *  uses. */
function ConfirmRedirect() {
  const draft = loadDraft();
  if (draft === null) return <Navigate to="/today" replace />;
  if (loadRun() !== null) return <Navigate to="/session/run" replace />;
  return <Navigate to="/session/countdown" replace />;
}

/** `/session/complete`'s replacement (post-workout-summary spec §3, Task 5
 *  — the SAME `/session/confirm` -> `ConfirmRedirect` precedent immediately
 *  above): `SessionComplete` is deleted, the finish stage now navigates
 *  Timer.tsx straight to `/session/log` (the summary), but the OLD URL
 *  survives as a stale deep link, a browser back-swipe target, and an old
 *  bookmark — this element renders no UI, only a redirect to wherever the
 *  rower's actual session state now lives: a completed `SessionRun` on
 *  record means there is a real summary to show -> `/session/log` (the
 *  session door); anything else (no run, or a run that somehow isn't
 *  complete — the same guard `LogSession.tsx`'s own session door applies) ->
 *  `/today`, the same fallback every other dead deep link in this file's
 *  own catch-all uses. */
function CompleteRedirect() {
  const run = loadRun();
  if (run !== null && isComplete(run)) {
    return <Navigate to="/session/log" replace />;
  }
  return <Navigate to="/today" replace />;
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
        {/* From-the-log spec (2026-08-18), §4 N7: under the TODAY tab's own
            URL prefix (not a bare /log — the tab convention is
            prefix-based, and a route no tab's prefix matches would be the
            app's first "no tab lit" screen) so TODAY stays lit for free.
            /today/log/:id (Task 5) is the overlay detail view — registered
            below the list route (React Router doesn't require this
            ordering since one segment is static and the other dynamic,
            same note as /library/import below, but declared list-then-
            detail to match this file's own convention). Neither route is
            in HIDDEN_TABBAR_PREFIXES above: §4 N7 keeps the tab bar
            visible (TODAY lit) on both — LOG is not a fifth tab. */}
        <Route path="/today/log" element={<HistoryList />} />
        {/* Fix round LOW (e), INFO-level: FromTheLog.tsx's own root
            element carries no `key={id}` (no in-place navigation between
            two detail views exists yet) — see that component's own
            comment for Reader.tsx's `key={article.slug}` precedent, the
            fix this route would need if a "next session" style in-place
            hop is ever added here. */}
        <Route path="/today/log/:id" element={<FromTheLog />} />
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
            HIDDEN_TABBAR_PREFIXES — corrected by the whole-branch review
            (IMP-2): this comment used to justify that by saying the session
            door "always has a Discard button as its own way out" — WRONG,
            Discard is destructive (it wipes the run/draft), not a real exit,
            so the session door actually had none before that review's own
            fix round added a `BackLink` there too (`LogSession.tsx`'s
            `LogScreen`/`backFallback`). Both doors now carry an equivalent
            `BackLink` on their main state, independent of whichever way the
            tab bar renders. The real, still-valid reason this route's tab
            bar stays visible: navigating away from it touches no storage at
            all (the manual door never reads or writes a draft/run record),
            so there's nothing an early exit could leave dangling — showing
            the tab bar costs this route nothing extra. */}
        <Route path="/library/:id/log" element={<LogSession />} />
        <Route path="/news" element={<News />} />
        {/* React Router ranks a static segment over a dynamic one regardless
            of declaration order (same note as /library/import above), so
            /news/releases doesn't strictly need to precede /news/:slug —
            declared first anyway, matching this file's own convention. */}
        <Route path="/news/releases" element={<Releases />} />
        <Route path="/news/:slug" element={<Reader />} />
        <Route path="/plan" element={<Plan />} />
        {/* Phase BL PR C — the three onboarding doors (Today's DoorsCard
            links here; the /onboarding prefix hides the tab bar above). */}
        <Route path="/onboarding/recommend" element={<Recommend />} />
        <Route path="/onboarding/know" element={<KnowBaseline />} />
        <Route path="/onboarding/row" element={<RowToFind />} />
        <Route path="/session/confirm" element={<ConfirmRedirect />} />
        <Route path="/session/countdown" element={<Countdown />} />
        <Route path="/session/run" element={<Timer />} />
        <Route path="/session/complete" element={<CompleteRedirect />} />
        <Route path="/session/log" element={<LogSession />} />
        {user && onSignedOut && (
          <>
            <Route
              path="/you"
              element={<You user={user} onSignedOut={onSignedOut} />}
            />
          </>
        )}
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
      {!hidesTabBar(location.pathname) && <TabBar />}
    </div>
  );
}
