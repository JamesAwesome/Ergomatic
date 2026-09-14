import { useEffect, useRef } from "react";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import SignIn from "./SignIn";
import { useAuthFlow } from "./adapters/authFlow";
import AppRoutes from "./shell/AppRoutes";
import { useMe } from "./useMe";

function AppContent() {
  const [me, signedOut, refetch] = useMe();
  const auth = useAuthFlow(refetch);
  const location = useLocation();
  const navigate = useNavigate();
  const consumedAuthDestination = useRef(auth.destination);

  // DO NOT PUSH AN AUTH DESTINATION WHILE THE ROUTE TREE THAT OWNS THE URL
  // IS UNMOUNTED, because that tree's own root redirect will replace it on
  // mount.
  //
  // TWO WRITERS OF THE SAME URL, and nothing orders them:
  //   - this file's own `if (me.state === "loading") return null` below,
  //     which means no `<Routes>` is mounted while the session read is in
  //     flight;
  //   - `AppRoutes.tsx`'s root route, `<Route path="/" element={<Navigate
  //     to="/today" replace />} />` (line 167 at this commit), the ONLY
  //     thing in the tree that writes `/today`.
  // `<Navigate>` acts from an effect and so does this one. Whichever lands
  // first wins, and a `replace` from the route tree silently eats a `push`
  // from here — the push is not merely late, it is gone. Waiting for
  // `me.state` is what puts the two in a defined order: the tree mounts and
  // does its redirect, and only then does this effect move the URL.
  //
  // WHAT MOTIVATED IT (2026-09-14, Wave A PR 1 Task 4).
  // `/api/auth/web/attempts/<id>` and `/api/me` resolve independently on
  // every web OAuth return. A `framenavigated` trace of the delete return
  // caught both orders: `/ -> /today -> /you/sign-in-methods` and
  // `/ -> /you/sign-in-methods -> /today`. The second is the one above —
  // the rower who had just re-proved their provider landed on Today with no
  // confirm screen. Seen three times, and it has not reproduced since (144
  // runs, with this guard and without), so the trace is the motivation and
  // the two writers above are the reason.
  //
  // The destination is held, not dropped: this effect re-runs when
  // `me.state` changes, and the ref is only consumed on a run that
  // actually navigates.
  useEffect(() => {
    if (me.state === "loading") return;
    if (consumedAuthDestination.current === auth.destination) return;
    consumedAuthDestination.current = auth.destination;
    if (auth.destination && auth.destination !== location.pathname) {
      void navigate(auth.destination);
    }
  }, [auth.destination, location.pathname, me.state, navigate]);

  // Every screen that cares about scroll manages it itself (the reader and
  // releases screens jump to the top, the Library restores its own saved
  // position), so the browser's automatic restoration is never wanted —
  // and on iOS Safari it actively competes: a 2026-08-07 device recording
  // showed the reader landing ~150px down AFTER our scroll-to-top ran,
  // Safari's own late restoration pass having the last word. Playwright's
  // WebKit build never reproduced it (instrumented scrollTo logs showed our
  // call firing and landing at 0) because restoration is browser-chrome
  // behaviour, not engine behaviour — which is exactly why this opt-out
  // targets the browser layer instead of re-ordering app code.
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  if (me.state === "loading") return null;
  if (me.state === "out") return <SignIn onSignedIn={refetch} auth={auth} />;

  return <AppRoutes user={me.user} onSignedOut={signedOut} authFlow={auth} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
