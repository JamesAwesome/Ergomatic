import { Navigate, Route, Routes } from "react-router-dom";
import Library from "../library/Library";
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
// a signed-in user (Task 5 adds /library/:id; Task 7 adds a baseline editor
// beneath /you). App.tsx supplies both once useMe() resolves to "in".
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
