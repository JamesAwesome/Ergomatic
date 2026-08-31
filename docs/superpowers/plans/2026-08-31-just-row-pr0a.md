# Just Row PR 0a — Observe-only capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the next laptop/Chrome hardware walk a dev-only Just Row observer that records the PM5's native free-row bytes without programming the monitor.

**Architecture:** A gated `/justrow/observe` screen mounts the existing `useMonitorSession`, calls only `connect()`, and never calls `program()`. That existing connection path constructs `createPm5Driver`, whose constructor already subscribes to 0x0037, 0x0038, 0x0039, and 0x003A; the existing real-web recording tap publishes its download closure at `window.__pm5Recording__`. The observer calls that closure with no program, so JSON serialization omits `header.program`. The screen and route are dynamically imported only when `import.meta.env.DEV || import.meta.env.VITE_ENABLE_FAKE_MONITOR === "1"`; a production-build string-literal grep proves the instrument is absent.

**Tech Stack:** React 19, React Router, existing `useMonitorSession` / PM5 driver / Web Bluetooth recording tap, Vitest client, Playwright, Vite build-time folding.

**Spec:** `docs/superpowers/specs/2026-08-24-just-row-design.md` — PR 0a and PR 0b in “Phase shape”; the capture answers OPEN 1–7 before PR 2 may merge.

## Global Constraints

- This is an instrument, not the product Just Row route. It is laptop Chrome/Web Bluetooth only; the actual rower-facing `/justrow` surface remains PR 2.
- The observer calls `MonitorSession.connect()` once and **never** calls `MonitorSession.program()`, `endSession()`, or any log/persistence API. It creates no `MonitorRun`, `SessionRun`, server row, program, or terminate command.
- `createPm5Driver` legitimately writes the 0x0034 sample-rate configuration during connection. The no-program proof therefore asserts **zero writes to `RECEIVE_CHARACTERISTIC_UUID`**, not zero writes overall.
- The connected driver is already the subscription authority. Do not add observer-specific UUID subscriptions or parsing; assert that its subscription set contains `SPLIT_INTERVAL_DATA_UUID`, `ADDITIONAL_SPLIT_INTERVAL_DATA_UUID`, `END_OF_WORKOUT_SUMMARY_UUID`, and `END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID`.
- `RecordingHeader.program` is optional (`recording.ts:313-325`); pass no argument to `window.__pm5Recording__?.download()` so the browser’s `JSON.stringify` omits it. Do not add an empty or fabricated program.
- The gate is exactly `import.meta.env.DEV || import.meta.env.VITE_ENABLE_FAKE_MONITOR === "1"`, matching the walk-lab/e2e build. A real production build must contain neither the observer module’s unique literal nor `pm5-recording`.
- The observer is a new screen: register it in `app/e2e/design.spec.ts`, create its screenshot capture, keep interactive controls at least 44 px, use existing CSS tokens only, and calculate/report every rendered text/background contrast ratio.
- This is not fast path: it changes a connection-bearing client surface and creates the evidence path for an unfinished hardware-backed feature. Use an isolated worktree, TDD, self-mutation, all client gates, and one coherent PR. No PR merge without James’s approval.
- The hardware session itself is PR 0b, James-scheduled, and must use `hardware-walk` after PR 0a is available. Do not invent capture answers at the desk.

---

## File map

- Create: `app/src/monitor/JustRowObserver.tsx` — gated instrument screen; connects, reports connection state, downloads the active recording without a program, and disconnects.
- Create: `app/src/monitor/JustRowObserver.test.tsx` — real-hook client proof that the observer subscribes but never sends a CSAFE program; download/disconnect behavior.
- Modify: `app/src/index.css` — token-only layout for the observer screen and existing button classes for its controls.
- Modify: `app/src/shell/AppRoutes.tsx` — build-time-gated lazy import, `/justrow/observe` route, and hidden-tab-bar prefix.
- Modify: `app/src/shell/AppRoutes.test.tsx` — the instrument route and tab-bar policy.
- Modify: `app/e2e/design.spec.ts` — structural design/a11y/hit-target registration for the instrument build’s observer screen.
- Modify: `app/e2e/screenshots.spec.ts` and create `docs/screenshots/just-row-observer.png` — reproducible visual record.
- Modify: `app/scripts/dist-grep.sh` — production-bundle needle for the observer module’s unique string literal.
- Create: `docs/monitor/sessions/walk-phase-jr-capture/RUNSHEET.md` — PR 0b operator card, capture budget, browser route, and evidence destination.
- Modify: `ROADMAP.md` — activate Phase JR by James’s request, remove its duplicate deferred entry, and point the owed capture item to the new card.

### Task 1: Build the observer from the existing session seam

**Files:**

- Create: `app/src/monitor/JustRowObserver.tsx`
- Create: `app/src/monitor/JustRowObserver.test.tsx`
- Modify: `app/src/index.css`

**Interfaces:**

- Consumes: `useMonitorSession(deps?)`, `MonitorSessionDeps`, the existing `window.__pm5Recording__` declaration in `transports/index.ts`.
- Produces: `JustRowObserver({ deps?: MonitorSessionDeps })`, a route-ready screen that opens one observation connection and sends no workout program.

- [ ] **Step 1: Write the failing real-hook test.**

  Create a local `observeTransport()` around `createFakeTransport()` that records write UUIDs, every subscribed UUID, and caller-initiated disconnects while delegating all behavior to the fake. Render the actual component with `deps={{ createTransport: () => transport, driverOptions: { schedule: () => () => undefined } }}`; wait for the fake PM5 caption. Assert this exact behavior:

  ```ts
  expect(transport.subscribed).toEqual(
    expect.arrayContaining([
      SPLIT_INTERVAL_DATA_UUID,
      ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
      END_OF_WORKOUT_SUMMARY_UUID,
      END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
    ]),
  );
  expect(
    transport.writes.filter((write) => write.uuid === RECEIVE_CHARACTERISTIC_UUID),
  ).toStrictEqual([]);
  expect(transport.writes.map((write) => write.uuid)).toContain(SAMPLE_RATE_UUID);
  ```

  Set `window.__pm5Recording__` to a real-shaped closure with a `vi.fn().mockResolvedValue(undefined)` download function. Click **Download capture** and assert `expect(download).toHaveBeenCalledWith()`; click **Disconnect** and await `expect(transport.disconnects).toBe(1)`. These are behavior assertions at the driver/transport seam, not a mock echo of `session.connect`.

- [ ] **Step 2: Run the client project to verify the new test fails.**

  Run: `pnpm test --project client`

  Expected: FAIL because `JustRowObserver` does not exist.

- [ ] **Step 3: Implement the narrow screen.**

  Implement `JustRowObserver` with this shape:

  ```tsx
  export default function JustRowObserver({ deps }: { deps?: MonitorSessionDeps }) {
    const session = useMonitorSession(deps);

    useEffect(() => {
      void session.connect();
      // Mount once: reconnecting is a deliberate future control, not an effect retry.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const recording = window.__pm5Recording__;
    return (
  <main
    className="screen just-row-observer"
    data-observer-kind="Just Row observer (instrument)"
  >
    <p className="connected-status-label">JUST ROW OBSERVER</p>
        <h1 className="connected-serif-line">{observerStatus(session)}</h1>
        <p className="just-row-observer-note">
          Observing only — no workout is sent to the monitor.
        </p>
        {recording && (
          <button type="button" className="button-l3" onClick={() => void recording.download()}>
            Download capture
          </button>
        )}
        <button type="button" className="button-l2" onClick={() => void session.cancel()}>
          Disconnect
        </button>
      </main>
    );
  }
  ```

  `observerStatus` maps only existing session state to plain operator copy: connecting/picking → `Connecting to monitor`, pairing with a name → `<name> connected`, failed → `session.error.detail`, otherwise → `Waiting for monitor`. Do not call `session.program`, render live metrics, create a log sheet, add a new transport, or include a `program` argument in the recording download.

  Add only the CSS needed to make the content legible at laptop and phone widths; use `--page`, `--ink-*`, existing type classes, and existing `.button-l3`/`.button-l2` hit targets. Do not add raw colors, shadows, animation, or new shared tokens.

- [ ] **Step 4: Run the client project and read its coverage row.**

  Run: `pnpm test --project client`

  Expected: PASS. Then run `pnpm test:coverage` and inspect the `JustRowObserver.tsx` row; cover the download-present/download-absent, connecting, connected, error, and disconnect branches rather than accepting aggregate coverage.

- [ ] **Step 5: Prove the tests bite, then restore.**

  First remove the mount-time `session.connect()` call; rerun `pnpm test --project client` and confirm the subscription assertion fails. Restore it. Then temporarily pass a fabricated argument to `recording.download({ intervals: [] })`; rerun the client project and confirm the zero-argument download assertion fails. Restore it and rerun green. Record both fail-then-pass probes in the task report.

- [ ] **Step 6: Commit the focused component/test change.**

  ```bash
  git add app/src/monitor/JustRowObserver.tsx app/src/monitor/JustRowObserver.test.tsx app/src/index.css
  git commit -m "feat: add Just Row capture observer"
  ```

### Task 2: Gate the route at build time and register the screen

**Files:**

- Modify: `app/src/shell/AppRoutes.tsx`
- Modify: `app/src/shell/AppRoutes.test.tsx`
- Modify: `app/e2e/design.spec.ts`
- Modify: `app/e2e/screenshots.spec.ts`
- Modify: `app/scripts/dist-grep.sh`
- Create: `docs/screenshots/just-row-observer.png`

**Interfaces:**

- Consumes: `JustRowObserver`, the existing build-time `VITE_ENABLE_FAKE_MONITOR` convention, `signInViaBackdoor` and the e2e fake injection seam.
- Produces: a route reachable at `/justrow/observe` only in dev/walk/e2e builds, never a production deployment; its design and bundle proofs.

- [ ] **Step 1: Add red route and production-build tests.**

  In `AppRoutes.test.tsx`, mock the lazily imported observer with an `h1` and render `/justrow/observe`. Assert that the observer route renders and `navigation[name="Main"]` is absent. Pin `hidesTabBar("/justrow/observe") === true` and `hidesTabBar("/justrow") === false` so PR 0a does not pre-decide PR 2’s shell.

  In `app/e2e/design.spec.ts`, add one observer-screen case. Set an injected fake script before navigation so the hook has a real, no-program transport, sign in with `signInViaBackdoor`, open `/justrow/observe`, and assert the heading and **Disconnect** control. Run `AxeBuilder` with `wcag2a`/`wcag2aa`, assert no violations, assert both buttons’ boxes are at least 44 by 44, and assert the tab bar is absent. This e2e-only route proof is required because its build has `DEV=false` and is reachable solely through `VITE_ENABLE_FAKE_MONITOR="1"`.

  Add a screenshot case to `screenshots.spec.ts` using the same fake injection, saving `docs/screenshots/just-row-observer.png`. The screenshot is the visual record for the dev screen, not a pixel-diff assertion.

  Add the unique literal `Just Row observer (instrument)` to `NEEDLES` in `dist-grep.sh`; put that exact text in `JustRowObserver.tsx` as the `data-observer-kind` value on the observer `<main>`, not in `AppRoutes.tsx`, so it survives minification and its absence proves the lazy module folded out.

- [ ] **Step 2: Run the tests to verify they fail.**

  Run: `pnpm test --project client`

  Expected: the route test fails before the route exists. Then run `pnpm e2e` after the component’s client tests are green; expected: the new design registration fails until the route is present in the VITE-enabled build.

- [ ] **Step 3: Implement the build-time-only route.**

  In `AppRoutes.tsx`, use a conditional lazy import — not a static import and not a runtime `window` check:

  ```tsx
  const monitorInstrumentEnabled =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_FAKE_MONITOR === "1";
  const JustRowObserver = monitorInstrumentEnabled
    ? lazy(() => import("../monitor/JustRowObserver"))
    : null;
  ```

  Register the route only when that component is non-null, wrapped in `Suspense` with a null fallback. Add `"/justrow/observe"` — and no broader `/justrow` prefix — to `HIDDEN_TABBAR_PREFIXES`. Keep the dynamic import inside the exact build-time condition so Vite can eliminate its chunk from production.

- [ ] **Step 4: Verify the production boundary and visual record.**

  Run, in order:

  ```bash
  pnpm test --project client
  pnpm lint
  pnpm typecheck
  pnpm build
  pnpm dist:grep
  pnpm e2e
  pnpm screenshots
  ```

  Open `docs/screenshots/just-row-observer.png`; confirm the heading, observer warning, capture control, and Disconnect button are all visible and not obscured. Compute each screen text/background contrast ratio and record the actual values in the report.

- [ ] **Step 5: Mutate both boundaries, then restore.**

  Temporarily make `monitorInstrumentEnabled` unconditionally `true`, run `pnpm build && pnpm dist:grep`, and confirm the new literal makes the production-bundle gate fail. Restore and confirm green. Then temporarily make it unconditionally `false`, run `pnpm e2e`, and confirm the observer design case falls through to Today and fails; restore and rerun green. These mutations prove both the production exclusion and walk-build admission predicates.

- [ ] **Step 6: Commit the route, browser gate, and capture.**

  ```bash
  git add app/src/shell/AppRoutes.tsx app/src/shell/AppRoutes.test.tsx app/e2e/design.spec.ts app/e2e/screenshots.spec.ts app/scripts/dist-grep.sh docs/screenshots/just-row-observer.png
  git commit -m "feat: expose the Just Row observer in walk builds"
  ```

### Task 3: House the capture session and activate the phase

**Files:**

- Create: `docs/monitor/sessions/walk-phase-jr-capture/RUNSHEET.md`
- Modify: `ROADMAP.md`

**Interfaces:**

- Consumes: the approved Just Row spec’s OPEN 1–7 and `hardware-walk` operator contract.
- Produces: the single source of truth for the PR 0b session and a live-roadmap owner for its outcome.

- [ ] **Step 1: Write the PR 0b runsheet before hardware is scheduled.**

  Create the card with the exact, evidence-bearing operator contract:

  - Medium: laptop Chrome/Web Bluetooth only; no phone and no heart-rate requirement.
  - Entry: run `bash scripts/walk-lab.sh up`, use the printed backdoor login, then open `/justrow/observe`; confirm **JUST ROW OBSERVER** and `<PM5 name> connected` before pulling. State that this screen subscribes but never programs, so pulling from the PM5 main menu is the native Just Row entry.
  - Budget: three pieces — one Just Row past 5:00 with a 30-second stop/resume then Menu end; one short Just Row left to the machine’s idle timeout; one already-rowing-at-connect capture only if time remains. The first piece is the only deliberate long row because the 5-minute auto-split is the evidence, not a fitness target.
  - One instruction at a time; no mid-piece asks. After each piece, use **Download capture** on the observer before disconnecting. The first download is the exact artefact that closes OPEN 1/2/4/5/6/7; the timeout run resolves OPEN 3.
  - File destination: move the exact downloaded `pm5-recording-<timestamp>.jsonl.gz` (or plain `.jsonl` fallback) into `docs/monitor/sessions/walk-YYYY-MM-DD-justrow/` before analysis. Record the actual filename, PM5 serial/firmware if visible, and the result of every OPEN question in that directory’s `README.md`; amend the Just Row design rather than leaving evidence only in the README.

- [ ] **Step 2: Update the live roadmap exactly once.**

  Add a concise active Phase JR entry directly after the live-slate wave table: **Status: Active — PR 0a observe-only instrument; PR 0b capture is James-scheduled; PR 1/2 remain blocked on the capture answers.** State that it is a deliberate household exception to the stranger-first ordering, requested by James on 2026-08-31. Remove the old Phase JR bullet from **After the strangers** and replace the open-register wording “see the deferred section” with the new active card path. Do not duplicate the phase in two homes.

- [ ] **Step 3: Check the record and commit it.**

  Run:

  ```bash
  rg -n "Phase JR|Just Row|walk-phase-jr-capture" ROADMAP.md docs/monitor/sessions/walk-phase-jr-capture/RUNSHEET.md
  ```

  Confirm the phase has one active-roadmap home, the captures card has one named destination, and the old deferred wording is gone. Commit:

  ```bash
  git add ROADMAP.md docs/monitor/sessions/walk-phase-jr-capture/RUNSHEET.md
  git commit -m "docs: activate the Just Row capture phase"
  ```

### Task 4: Whole-branch verification and handoff

**Files:**

- Verify every file above; reconcile any stale observer/recording comments found by `rg`.

**Interfaces:**

- Consumes: the completed PR 0a diff.
- Produces: an evidence-backed, review-ready PR with the PR 0b capture ready for James to schedule.

- [ ] **Step 1: Inspect scope and stale rationale.**

  Run `git diff --check`, `git diff --stat`, and `rg -n "programmed|Download recording|Just Row observer|pm5-recording" app/src app/e2e app/scripts docs`. Reconcile every changed comment against the final behavior; retain no claim that the observer programs, persists a run, or is reachable in a production build.

- [ ] **Step 2: Run the full required gates foregrounded.**

  From `app/`, run:

  ```bash
  pnpm lint
  pnpm typecheck
  pnpm format:check
  pnpm test --project unit --project client
  pnpm test:coverage
  pnpm build
  pnpm dist:grep
  pnpm e2e
  pnpm screenshots
  ```

  Read the per-file coverage table, open the changed observer capture, and include the exact e2e/design result and contrast arithmetic in the report. Do not report green based only on aggregate coverage.

- [ ] **Step 3: Make the review record.**

  Before requesting review, run `git rev-parse --show-toplevel` and confirm it is the named worktree. The PR’s plain-language top must say the outcome first: the next erg walk can record native Just Row without the app programming the PM5; it names no tester-visible release. Its Record section includes the `RECEIVE_CHARACTERISTIC_UUID` no-program proof, driver subscription proof, each self-mutation, production build/grep result, screenshot observation, and the exact PR 0b capture budget. Do not merge; present the review verdict and wait for James’s approval.

---

## Self-review record

- Spec coverage: PR 0a’s build-only observer is Task 1/2; the Chrome/Web recording leg and 0x0037/38/39/3A subscription proof are Task 1; the required file-writing path and hardware procedure are Task 3; production exclusion, e2e/design registration, screenshots, and contrast are Task 2/4. PR 0b performs the capture and then amends OPEN 1–7; PR 1 and PR 2 are deliberately not implemented here.
- Type consistency: `JustRowObserver` consumes `MonitorSessionDeps`, which already exposes the required transport seam; `window.__pm5Recording__.download(program?: WorkoutProgram)` is invoked with no argument, matching its existing optional signature.
- No placeholders: the future capture directory’s date is intentionally a `YYYY-MM-DD` convention because PR 0b has no James-scheduled date yet; the destination shape and required README contents are explicit. The production sentinel is an explicit DOM data attribute, so it survives minification and is unambiguously owned by the lazy module.
