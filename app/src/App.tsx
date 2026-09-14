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

  // NOT WHILE THE ROUTE TREE IS UNMOUNTED. Below, a `loading` session
  // renders `null` — there is no `<Routes>` at all — so an auth
  // destination that resolves before `/api/me` moves the URL with nothing
  // mounted to receive it.
  //
  // WHAT IS MEASURED, and what is not (2026-09-14, Wave A PR 1 Task 4).
  // `/api/auth/web/attempts/<id>` and `/api/me` race on every web OAuth
  // return, and a `framenavigated` trace of the delete return shows two
  // orders: `/ -> /today -> /you/sign-in-methods` (the session read wins)
  // and `/ -> /you/sign-in-methods -> /today` (the attempt read wins).
  // The second leaves the rower on Today with no confirm screen; it was
  // seen three times. Holding the navigation until `me` is known makes
  // the first order the ONLY one — that much is measured, over 10
  // consecutive traced runs. What is NOT established is causation: the
  // failure has not reproduced since, in 144 runs with this guard and
  // without it, so this removes the ordering every observed failure had
  // rather than a defect anything here can still demonstrate.
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
