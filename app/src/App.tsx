import { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import SignIn from "./SignIn";
import AppRoutes from "./shell/AppRoutes";
import { useMe } from "./useMe";

export default function App() {
  const [me, signedOut, refetch] = useMe();

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
  if (me.state === "out") return <SignIn onSignedIn={refetch} />;

  return (
    <BrowserRouter>
      <AppRoutes user={me.user} onSignedOut={signedOut} />
    </BrowserRouter>
  );
}
