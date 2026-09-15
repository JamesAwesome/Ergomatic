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
  //     to="/today" replace />} />` (line 170 at this commit), the only
  //     thing that writes `/today` WHEN THE URL IS `/`. (Not the only
  //     writer of `/today` at all — `AppRoutes` alone has four, and a dozen
  //     screens navigate there. `path="/"` outranks `path="*"`, so at `/`
  //     this route is the one that matches.)
  // Both act from an EFFECT, and a `replace` from the route tree eats a
  // `push` from here — the push is not merely late, it is gone. Waiting for
  // `me.state` is what puts the two in a defined order: the tree mounts and
  // does its redirect, and only then does this effect move the URL.
  //
  // WHY THE ORDER IS NOT ALREADY SAFE, which is the premise this argument
  // needs and the one it is easiest to skip. Passive effects run
  // children-before-parents, so `<Navigate>` — inside `AppRoutes`, a child
  // — runs BEFORE this effect in any single commit, which gives the benign
  // order. The commits are what come apart: `BrowserRouter`'s location
  // update is a TRANSITION and `/api/me` resolving is an ordinary
  // `setState`, so `me` can commit at normal priority ahead of a pending
  // transition, mounting `<Routes>` against a `state.location` still at
  // `/`. `path="/"` then matches, `<Navigate replace>` mounts, and it
  // overwrites the entry this effect's push had already created.
  //
  // PRIMARY, all four read in our own installed copy rather than the docs —
  // react-router 7.18.3, this repo's lockfile:
  //   - `Navigate`, `dist/development/chunk-7SIULPXI.js:9945`, body ends
  //     `React.useEffect(() => { navigate(JSON.parse(jsonPath), { replace:
  //     replace2, state, relative }); }, [...])` — an effect, and `replace`.
  //   - `BrowserRouter`, `dist/development/chunk-YRTY65LJ.js:273`, whose
  //     `setState` is `useTransitions === false ? setStateImpl(newState) :
  //     React.startTransition(() => setStateImpl(newState))`.
  //   - `App` below renders `<BrowserRouter>` with no `useTransitions`
  //     prop, so `undefined !== false` takes the `startTransition` arm.
  //   - `useNavigate`, `chunk-7SIULPXI.js:7283`, whose callback ends
  //     `(!!options.replace ? navigator.replace : navigator.push)(path,
  //     options.state, options)` — synchronous; only the ROUTER's read of
  //     the result is deferred.
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
  //
  // IT COVERS `out` TOO SINCE WAVE A PR2, AND ITS OWN COMMENT ASKED FOR THAT.
  // This gated on `loading` alone, under a note saying to widen it "the day a
  // signed-out view routes anywhere but `/`" — true until then, because the
  // only destinations a signed-out rower could yield were `/` and `null` and
  // `SignIn` owns no routes for a redirect to eat. `attach_confirm` is that
  // day: it routes to `/you/sign-in-methods`, and on NATIVE the rower sits
  // there SIGNED OUT for the whole confirmation, because `onSignedIn` is
  // withheld until they choose. `SignIn` draws that screen itself, so the URL
  // move bought nothing and wrote a path under a tree that owns no routes.
  //
  // Nothing is lost by holding it. The destination is held, not dropped, and
  // by the time `me` resolves IN the flow has reached `attached`, whose
  // destination is `/` — the landing James ruled.
  //
  // AND `out` FORGETS, WHICH IS NOT THE SAME AS CONSUMING. Three cases have
  // to hold at once, and only this form holds all three:
  //
  //   - A destination from a PREVIOUS signed-in period must not linger.
  //     Returning bare leaves the ref carrying whatever that flow put there,
  //     and `/` is exactly what an attach terminal writes — so a rower who
  //     attaches, signs out, and attaches again in the same document reaches
  //     `attached` with destination `/`, matches the stale ref, takes the
  //     early return below, and stands still on `/you`.
  //   - A destination produced WHILE OUT and still current when `me`
  //     resolves IN must still be acted on. That is the native attach:
  //     `confirmAttach` sets the terminal and calls `onSignedIn` in one tick,
  //     so the destination is `/` a full `/api/me` round trip before `me`
  //     catches up. CONSUMING it here marks it done while the rower is still
  //     on the sign-in tree — the same missed landing through the opposite
  //     door, and the first draft of this fix did exactly that.
  //   - `loading` must still HOLD, untouched: that is the race the whole
  //     guard was written for, and consuming there reds the delete-return
  //     test that pins it.
  //
  // Forgetting satisfies all three: the ref stops describing the last
  // session, and whatever is current when `me` returns is compared against
  // nothing and therefore acted on.
  useEffect(() => {
    if (me.state === "loading") return;
    if (me.state === "out") {
      consumedAuthDestination.current = null;
      return;
    }
    if (consumedAuthDestination.current === auth.destination) return;
    consumedAuthDestination.current = auth.destination;
    if (auth.destination && auth.destination !== location.pathname) {
      // `void` is load-bearing, not habit. Under a `BrowserRouter` this
      // returns `undefined` at runtime (`chunk-7SIULPXI.js:7283` ends in a
      // bare `navigator.push(...)` call), but `NavigateFunction` DECLARES
      // `void | Promise<void>` (`react-router/dist/development/index.d.ts`
      // :121, for the data routers that do await), and
      // `@typescript-eslint/no-floating-promises` reads the declaration.
      // Dropping it fails `pnpm lint`; a suppression to make it pass is
      // exactly what the ratchet forbids.
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
