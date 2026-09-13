import { useEffect } from "react";
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

  useEffect(() => {
    if (auth.destination && auth.destination !== location.pathname) {
      void navigate(auth.destination);
    }
  }, [auth.destination, location.pathname, navigate]);

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
