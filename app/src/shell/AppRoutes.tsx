import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Builder from "../builder/Builder";
import BulkImport from "../builder/BulkImport";
import EditWorkout from "../builder/EditWorkout";
import Library from "../library/Library";
import Today from "../today/Today";
import WorkoutDetail from "../workout/WorkoutDetail";
import You from "../You";
import type { Me } from "../useMe";
import TabBar from "./TabBar";

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
        <Route
          path="/plan"
          element={<Placeholder title="Plan" phase="Phase 8" />}
        />
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
      <TabBar />
    </div>
  );
}
