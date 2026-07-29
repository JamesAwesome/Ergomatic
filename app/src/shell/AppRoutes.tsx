import { Navigate, Route, Routes } from "react-router-dom";
import Builder from "../builder/Builder";
import EditWorkout from "../builder/EditWorkout";
import Library from "../library/Library";
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
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route
          path="/today"
          element={<Placeholder title="Today" phase="Phase 6" />}
        />
        <Route path="/library" element={<Library />} />
        <Route path="/library/new" element={<Builder />} />
        {/* React Router ranks a static segment ("new") over a dynamic one
            (":id") regardless of declaration order, so this doesn't need to
            precede /library/:id below — but WorkoutDetail's :id route DOES
            need to keep matching /library/w1 etc. unaffected by this change. */}
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
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
      <TabBar />
    </div>
  );
}
