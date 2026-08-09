// THE FAKE-INJECTION SEAM (Phase 7B Task 8, carried from `useMonitorSession
// .ts`'s own `defaultTransport` header note: "Task 8's
// `src/monitor/transports/index.ts`, the same `import.meta.env.DEV`-gated
// seam that keeps `fake.ts` out of the production bundle").
//
// `useMonitorSession()`'s zero-argument call — the shipped path every real
// screen uses — resolves its transport through `resolveDefaultTransport`
// below rather than reaching for `createWebBluetoothTransport` directly.
// That one extra hop is the whole point: it is the ONE place a build that
// wants the connected flow driven by `createFakeTransport` instead of a real
// radio can have it, with no screen and no `useMonitorSession` caller ever
// knowing the difference.
//
// **THE GATE IS `DEV` *OR* `VITE_ENABLE_FAKE_MONITOR`, NOT `DEV` ALONE —
// a correction of the brief this task was handed, recorded here rather than
// silently worked around.** The brief's own premise was that `pnpm e2e`/
// `pnpm screenshots`' compose stack "builds with NODE_ENV=development"; it
// does not. `docker compose` builds the `web` image from THIS repo's single
// `Dockerfile` `build` stage, which runs a plain `vite build` — the exact
// same command, same stage, same output a REAL DEPLOY'S image comes from
// (`scripts/deploy.sh` runs `docker compose up --build` off `compose.yml`
// alone, no override). `import.meta.env.DEV` is `false` in EVERY bundle
// this Dockerfile has ever produced; there is no `vite dev` path in it
// anywhere. Gating on `DEV` alone would have made this seam unreachable
// from `e2e/connected.spec.ts` against the SAME compose stack every other
// e2e spec in this repo runs against — discovered building this task, fixed
// by adding a second, explicit door: `compose.e2e.yml` now passes the `web`
// service a `VITE_ENABLE_FAKE_MONITOR=1` BUILD ARG (`Dockerfile`'s own
// comment on the `ARG`/`ENV` pair), which Vite inlines into
// `import.meta.env.VITE_ENABLE_FAKE_MONITOR` at build time exactly like the
// pre-existing `VITE_API_BASE`/`VITE_GOOGLE_IOS_CLIENT_ID` convention
// (`src/api.ts`, `src/native/signin.ts`). A real deploy's `compose.yml`
// alone never sets it, so it is `undefined` there — the SAME dead branch
// `DEV` alone would have been, just reached by a second, also-foldable
// condition. `pnpm dev`/Vitest (where `DEV` is genuinely `true`) still work
// with no build arg at all, which is what keeps this file's own unit tests
// (`index.test.ts`) simple.
//
// **THE PRODUCTION BUNDLE MUST STILL NEVER CONTAIN `fake.ts`** (this task's
// own exit criterion — `fake.ts` models hardware behaviour in enough
// byte-level detail that shipping it would be dead weight at best and a
// fingerprintable attack surface at worst), and the correction above does
// not weaken that: the mechanism is still the standard Vite/Rollup
// dead-code-elimination trick, not a bundler config option — whichever half
// of the `||` below is statically `false` (BOTH are, in a real deploy)
// folds the whole condition to `false`, which folds `if (false) {...}` down
// to nothing and removes the `import("./fake")` call — and with it,
// `fake.ts`'s entire module graph — from the emitted chunk graph before
// Rollup ever looks at what `fake.ts` imports. `pnpm build` + a grep over
// `dist/` is this file's own proof (`scripts/dist-grep.sh`, extended this
// task to check for `fake` alongside the pre-existing `lab`/`bridge`
// dev-tool names) — see that script's own comment for what each name
// guards against, and why its needles are string literals, never
// identifiers a minifier could rename away.
//
// WHAT GETS INJECTED, AND HOW: `window.__pm5FakeScript__` — a plain,
// structured-cloneable `FakeScript` (this file only ever reads it, never
// writes it) that an e2e test sets via Playwright's `page.addInitScript`
// BEFORE the page loads. Reading a page-global rather than threading a new
// `MonitorSessionDeps` field is deliberate: `ConnectedInterstitial` already
// documents that "a production `createTransport` is NOT threaded through
// here" (its own `deps` prop comment) — inventing a second injection path
// through props would contradict that decision for exactly the caller (an
// e2e test driving the REAL `WorkoutDetail` → `ConnectAction` → interstitial
// chain, not a unit test that already has `deps`) this seam exists for.
//
// The returned transport SELF-TICKS in real time (`AUTO_TICK_MS` below) —
// `fake.ts` itself is contractually wall-clock-free ("NO WALL CLOCK
// ANYWHERE", its own header), so nothing inside it may call `setInterval`.
// This wrapper is that clock, and it lives here, one layer up, so a real
// browser session (a human watching, or a screenshot script that just
// waits) can watch the interstitial and the three panes advance over real
// seconds with no test driving it at all. `window.__pm5FakeControls__`
// (below) is the OTHER half, added once this proved not to be enough on its
// own for a scripted e2e walk that needs specific milestones to land at
// specific moments, immune to a backgrounded tab's timer throttling — see
// that property's own doc comment.

import type { Transport } from "../../../domain/monitor/types.js";
import { createWebBluetoothTransport } from "./webBluetooth";

// `FakeScript`/`FakeControls` are TYPE-ONLY imports: they cost nothing at
// runtime (erased by `verbatimModuleSyntax`) and do not, by themselves, pull
// `fake.ts`'s runtime code into any bundle — only the dynamic
// `import("./fake")` below does that, and only when it actually executes.
import type { FakeControls, FakeScript } from "./fake";

/** `FakeScript` plus one field that belongs to the INJECTION SEAM, not to
 *  `fake.ts`'s own hardware-modeling contract — which is why it is declared
 *  here rather than added to `FakeScript` itself. */
export interface InjectedFakeScript extends FakeScript {
  /** Applied via `FakeControls.delayWrites` the instant the fake is built.
   *  Real hardware's `connect()`/programming writes are not instant, and a
   *  same-microtask fake makes pairing/programming resolve within a
   *  fraction of a single animation frame — too fast for a screenshot
   *  script or an e2e assertion to reliably observe the interstitial's own
   *  states 4/5 (`ConnectedInterstitial.tsx`'s "Connecting"/"Sending the
   *  workout") at all, discovered building `e2e/connected.spec.ts`. Omitted
   *  (the default) keeps every OTHER caller's same-microtask timing exactly
   *  as `fake.ts` ships it. */
  delayWritesMs?: number;
}

declare global {
  interface Window {
    /** Set by an e2e test's `page.addInitScript`, never by product code.
     *  `undefined` (the overwhelming common case — every real rower, and
     *  every unit test, which injects through `MonitorSessionDeps
     *  .createTransport` instead) means "build the real transport". */
    __pm5FakeScript__?: InjectedFakeScript;
    /** Set by THIS file, the instant it builds a fake from
     *  `__pm5FakeScript__` above — never by product code, and never read by
     *  it either. `e2e/connected.spec.ts`'s own discovery: Chromium
     *  throttles a BACKGROUND/unfocused tab's `setInterval` to roughly
     *  once per second (a well-documented power-saving behaviour, and
     *  Playwright's own multi-worker model backgrounds every tab but the
     *  one currently driving), which starves `autoTicking`'s own
     *  real-time clock far below the ~1:1 real:virtual ratio a script's
     *  `atMs` values assume — a scripted session that should complete in
     *  ~13 real seconds could take well over a hundred, backgrounded.
     *  Exposing the raw `FakeControls` here lets a test PUMP `tick()`
     *  directly (`page.evaluate(() => window.__pm5FakeControls__
     *  ?.tick(ms))`), deterministically and immune to any throttling,
     *  exactly like every fake-driven unit test in this repo already does
     *  — `autoTicking`'s own background clock keeps running too (for a
     *  screenshot script or a human just watching, where a several-times
     *  slower real clock costs nothing), the two are not exclusive. */
    __pm5FakeControls__?: FakeControls;
  }
}

/** How often the injected fake's virtual clock is advanced, in real
 *  milliseconds. Small enough that a scripted session's status ticks (a
 *  program's own `atMs` values, typically spaced 250-1000 ms apart) land
 *  inside a couple of real animation frames of when they're due — an e2e
 *  assertion polling `expect(...).toBeVisible()` never waits on this being
 *  coarser than its own retry interval. */
const AUTO_TICK_MS = 100;

/** Wraps a fake transport with a real `setInterval` that drives its virtual
 *  clock — see this file's header for why that clock cannot live inside
 *  `fake.ts` itself. The interval is cleared the moment EITHER side hangs
 *  up (`disconnect()`, or the fake's own `onDisconnect` callback firing),
 *  so a finished e2e test leaves nothing ticking in a page Playwright is
 *  about to close anyway, and a scripted `injectDisconnect()` stops
 *  advancing time it no longer needs to.
 *
 *  Exported for `index.test.ts` to drive directly against a hand-built
 *  stub — `resolveDefaultTransport`'s own return type is narrowed to plain
 *  `Transport`, which has no way to fire a wrapped fake's OWN
 *  `onDisconnect` callback from outside (there is no second handle onto the
 *  same instance `resolveDefaultTransport` built), so the stop-on-hangup
 *  half of this function's contract can only be pinned here, against the
 *  function itself. */
export function autoTicking(
  fake: Transport & { tick(ms: number): void },
): Transport {
  const timer = setInterval(() => fake.tick(AUTO_TICK_MS), AUTO_TICK_MS);
  let stopped = false;
  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  }
  return {
    scan: () => fake.scan(),
    connect: (id) => fake.connect(id),
    write: (characteristicId, bytes) => fake.write(characteristicId, bytes),
    subscribe: (characteristicId, cb) => fake.subscribe(characteristicId, cb),
    disconnect: () => {
      stop();
      return fake.disconnect();
    },
    onDisconnect: (cb) => {
      const unsub = fake.onDisconnect((reason) => {
        stop();
        cb(reason);
      });
      return unsub;
    },
  };
}

/**
 * The one place production code decides which `Transport` to build. Returns
 * synchronously (`Transport | null`) on every path except the DEV-injected
 * fake, which is behind a dynamic `import()` and therefore a `Promise` —
 * `useMonitorSession.ts`'s `connect()` awaits whatever this returns either
 * way, so the two shapes are indistinguishable to every caller.
 *
 * **Web-only, on purpose.** This function never chooses Capacitor BLE —
 * that choice is a PLATFORM conditional, and platform conditionals are
 * lint-enforced to the adapter layer (`src/platform.ts`/`src/adapters/`,
 * CLAUDE.md's native-first policy), not this transport-resolution seam.
 * (History: this file's header once recorded that gap as still open —
 * `createCapacitorBleTransport` had no call site anywhere — ROADMAP CL item
 * 2, closed by `src/adapters/monitorTransport.ts`'s `defaultTransport`,
 * which now sits IN FRONT of this function: native picks Capacitor BLE
 * directly, and only the web arm reaches this seam at all.
 * `useMonitorSession.ts`'s own `??` fallback points at that adapter now,
 * not at this function — see its own doc comment.)
 */
export function resolveDefaultTransport():
  Transport | null | Promise<Transport | null> {
  // Both operands are statically `false` in a real deploy's build (this
  // file's own header) — Rollup folds the whole `||` to `false` and the
  // block below, `fake.ts` included, is removed before it is emitted.
  const fakeMonitorEnabled =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_FAKE_MONITOR === "1";
  if (fakeMonitorEnabled) {
    const script = window.__pm5FakeScript__;
    if (script) {
      return import("./fake").then(({ createFakeTransport }) => {
        const fake = createFakeTransport(script);
        if (script.delayWritesMs !== undefined) {
          fake.delayWrites(script.delayWritesMs);
        }
        window.__pm5FakeControls__ = fake;
        return autoTicking(fake);
      });
    }
  }
  return navigator.bluetooth ? createWebBluetoothTransport() : null;
}
