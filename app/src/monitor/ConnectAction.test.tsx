import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import type { Baselines, WorkoutType } from "../../domain/types.js";
import { compileProgram } from "../../domain/monitor/program.js";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import type { LogSeed } from "../session/logDraft";
import { saveRun, loadRun, type SessionRun } from "../session/run";
import { createMonitorRun, loadMonitorRun } from "./monitorRun";
import {
  commit as commitHandoff,
  currentUnretired as currentUnretiredHandoff,
  resetForTests as resetHandoffStoreForTests,
  setReceiptChannel,
  stageRetire as stageRetireHandoffForTest,
  stagedRetireAttemptId,
  takeStagedRetire as takeStagedRetireHandoff,
  type HandoffReceipt,
} from "./handoffStore";
import ConnectAction from "./ConnectAction";

function installSupportedWebBluetooth(): void {
  Object.defineProperty(navigator, "bluetooth", {
    configurable: true,
    value: {
      requestDevice: vi.fn().mockRejectedValue(new Error("Test scan failed")),
    },
  });
}

beforeEach(() => {
  installSupportedWebBluetooth();
});

afterEach(() => {
  delete (navigator as { bluetooth?: unknown }).bluetooth;
});

// 7C Task 1: `createMonitorRun`'s `logSeed` arg is required now. This
// file's subject is the Connect guard's destructive step, not seed
// content, so one placeholder fills the one call site below.
const TEST_SEED: LogSeed = { steps: [], paces: {} };

// Realistic fixtures, per the repo convention monitorRun.test.ts's own
// header states: BOTH sides of this test start from a real seeded library
// workout run through the real assembly (buildDraft -> buildRun ->
// compileProgram), not a hand-built minimum — the SessionRun this guard
// protects is a genuine finished session's record, and the program the
// Connect flow would push is a genuine compiled one.
const baselines: Baselines = { k2Seconds: 100, k6Seconds: 120 };
const t0 = new Date("2026-08-05T12:00:00.000Z");
const finishedAt = new Date("2026-08-05T12:41:00.000Z").toISOString();

function libraryWorkout(title: string) {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === title);
  if (!w) throw new Error(`missing library fixture: ${title}`);
  return w;
}

/** A real finished-but-unlogged phone session: Filling Low, rowed and
 *  completed, sitting in RUN_KEY waiting for 6C's log screen. This is the
 *  record 6B's F5 fix protects and the one `createMonitorRun` destroys. */
function unloggedSessionRun(): SessionRun {
  const w = libraryWorkout("Filling Low");
  const draft = buildDraft({
    id: "fl-1",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const built = buildRun(draft, baselines, t0);
  const run: SessionRun = {
    ...built,
    index: built.phases.length,
    completedAt: finishedAt,
  };
  // The JSON round trip storage itself performs (WorkoutDetail.test.tsx's
  // own `completedRunFor` explains why the raw object would not compare
  // equal: buildRun stamps `set: undefined` on non-repeated phases).
  return JSON.parse(JSON.stringify(run)) as SessionRun;
}

function liveSessionRun(): SessionRun {
  const w = libraryWorkout("Filling Low");
  const draft = buildDraft({
    id: "fl-2",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  return JSON.parse(
    JSON.stringify(buildRun(draft, baselines, t0)),
  ) as SessionRun;
}

/**
 * NOT what Task 5 actually wires behind Connect (task-5 review, MEDIUM-1 —
 * this comment used to claim it was, and it was already wrong by the time
 * that claim was written: Task 5's real `onProceed`,
 * `WorkoutDetail.handleConnectProceed`, compiles a program and sets React
 * state — it hands off to `ConnectedInterstitial`, which only reaches
 * `createMonitorRun` indirectly, at the FIRST REAL ROWING FRAME
 * (`useMonitorSession.ts`), not synchronously on this press). What this
 * DOES model, faithfully, is the one thing this file's own tests are
 * about: the destructive step `createMonitorRun`'s `clearRun()` performs,
 * reduced to (as of hand-off store design spec §1, plan Task 3 — see that
 * function's own doc comment in `monitorRun.ts`: it is now a PURE BUILDER,
 * and its one production caller, `useMonitorSession.ts`'s hook, is what
 * commits the result through the store) two calls instead of one, so the
 * guard can still be proven against a REAL localStorage round trip rather
 * than a "was the callback called" assertion — `saveMonitorRun` is the
 * SAME general-purpose writer `Today.tsx`/`LogSession.tsx`/
 * `useStartWorkout.ts` still call directly today, not a re-introduction of
 * anything this task removed. Task 5's own proof that its real wiring
 * defers this destruction lives in `WorkoutDetail.test.tsx` and
 * `e2e/session.spec.ts`, not here.
 */
function connectAsTaskFiveWill(): void {
  const w = libraryWorkout("Filling Low");
  const draft = buildDraft({
    id: "fl-connect",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const compiled = compileProgram(buildRun(draft, baselines, t0).phases);
  if ("code" in compiled) {
    throw new Error(`fixture failed to compile: ${compiled.code}`);
  }
  const run = createMonitorRun(
    {
      workoutId: "fl-connect",
      title: w.title,
      program: compiled,
      deviceName: "PM5 430123456",
      logSeed: TEST_SEED,
    },
    t0,
  );
  // Mirrors the hook's own create-commit (`useMonitorSession.ts`, the
  // "ready" branch): a same-key entry left by an EARLIER proceed in the same
  // test is adopted as an update, never overwritten. The real writer refuses
  // a second create against a current key ("stale"); the raw seeder this
  // replaced (Phase MD PR 1) silently overwrote, which is why the double
  // proceed some tests perform went unnoticed until fixtures went through
  // `commit`.
  const stale = currentUnretiredHandoff();
  const result = commitHandoff(
    run.startedAt,
    stale !== null && stale.sessionKey === run.startedAt
      ? stale.revision
      : null,
    run,
  );
  if (!result.accepted) {
    throw new Error(`connectAsTaskFiveWill refused: ${result.reason}`);
  }
}

function renderConnect() {
  render(
    <MemoryRouter>
      <ConnectAction
        onProceed={connectAsTaskFiveWill}
        nfcCapability="unsupported"
        busy={false}
        accepted={false}
      />
    </MemoryRouter>,
  );
}

describe("ConnectAction: the destruction it stands in front of", () => {
  beforeEach(() => {
    localStorage.clear();
    resetHandoffStoreForTests();
  });

  // The proof, first and on its own: with no lock, the walk from Connect to
  // an erased finished session is one function call long. Every guard test
  // below is only meaningful because this one passes.
  it("the unguarded flow really does destroy a finished-but-unlogged session", () => {
    saveRun(unloggedSessionRun());
    expect(loadRun()).not.toBeNull();

    connectAsTaskFiveWill();

    expect(loadRun()).toBeNull();
    expect(loadMonitorRun()).not.toBeNull();
  });
});

describe("ConnectAction: the guard", () => {
  beforeEach(() => {
    localStorage.clear();
    resetHandoffStoreForTests();
  });

  it("nothing on record: Connect proceeds immediately, no confirm", async () => {
    renderConnect();

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(loadMonitorRun()).not.toBeNull();
    expect(
      screen.queryByText(
        /Review and save (?:it|them) from Today\.Connecting discards (?:it|them)\./,
      ),
    ).not.toBeInTheDocument();
  });

  describe("over a finished-but-unlogged session (the F5 shape)", () => {
    it("stages the confirm and touches nothing — the record survives the first press", async () => {
      const runA = unloggedSessionRun();
      saveRun(runA);
      renderConnect();

      await userEvent.click(screen.getByRole("button", { name: "Connect" }));

      expect(
        screen.getByText(
          /Review and save (?:it|them) from Today\.Connecting discards (?:it|them)\./,
        ),
      ).toBeInTheDocument();
      // Not merely "still present" — byte-identical, and no monitor run
      // was created either.
      expect(loadRun()).toStrictEqual(runA);
      expect(loadMonitorRun()).toBeNull();
      // The trigger is replaced by the panel, the house idiom.
      expect(
        screen.queryByRole("button", { name: "Connect" }),
      ).not.toBeInTheDocument();
    });

    it("Cancel preserves the record byte-identical and restores Connect", async () => {
      const runA = unloggedSessionRun();
      saveRun(runA);
      renderConnect();

      await userEvent.click(screen.getByRole("button", { name: "Connect" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.getByRole("button", { name: "Connect" })).toBeVisible();
      expect(
        screen.queryByText(
          /Review and save (?:it|them) from Today\.Connecting discards (?:it|them)\./,
        ),
      ).not.toBeInTheDocument();
      expect(loadRun()).toStrictEqual(runA);
      expect(loadMonitorRun()).toBeNull();
    });

    it("Connect anyway proceeds — the destruction happens, now deliberately", async () => {
      saveRun(unloggedSessionRun());
      renderConnect();

      await userEvent.click(screen.getByRole("button", { name: "Connect" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Connect anyway" }),
      );

      expect(loadRun()).toBeNull();
      const monitorRun = loadMonitorRun();
      expect(monitorRun).not.toBeNull();
      expect(monitorRun!.title).toBe("Filling Low");
    });
  });

  describe("over a live phone session", () => {
    it("stages the 'in progress' sentence, not the unlogged one", async () => {
      const live = liveSessionRun();
      saveRun(live);
      renderConnect();

      await userEvent.click(screen.getByRole("button", { name: "Connect" }));

      expect(
        screen.getByText("A session is in progress. Replace it?"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          /Review and save (?:it|them) from Today\.Connecting discards (?:it|them)\./,
        ),
      ).not.toBeInTheDocument();
      expect(loadRun()).toStrictEqual(live);
    });

    it("Cancel preserves it; Connect anyway replaces it", async () => {
      const live = liveSessionRun();
      saveRun(live);
      renderConnect();

      await userEvent.click(screen.getByRole("button", { name: "Connect" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(loadRun()).toStrictEqual(live);

      await userEvent.click(screen.getByRole("button", { name: "Connect" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Connect anyway" }),
      );
      expect(loadRun()).toBeNull();
      expect(loadMonitorRun()).not.toBeNull();
    });
  });

  // F6 spec 2b, Task 2, exit criterion 5: "Connect never again asks
  // 'Replace it?' about a dead run." A MonitorRun visible at this door is
  // always dead — the connected session lives on WorkoutDetail's own
  // surface, and reload/navigation tears it down without touching the
  // record — so `completedAt === null` here means interrupted, not
  // running, unlike the SessionRun case above (a phone timer genuinely
  // keeps running in the background).
  describe("over a live-looking MonitorRun (completedAt: null)", () => {
    it("stages the unlogged sentence, not the 'in progress' one", async () => {
      connectAsTaskFiveWill();
      expect(loadMonitorRun()!.completedAt).toBeNull();
      renderConnect();

      await userEvent.click(screen.getByRole("button", { name: "Connect" }));

      expect(
        screen.getByText(
          /Review and save (?:it|them) from Today\.Connecting discards (?:it|them)\./,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("A session is in progress. Replace it?"),
      ).not.toBeInTheDocument();
    });
  });

  it("uses the house panel classes, not a new confirm idiom", async () => {
    saveRun(unloggedSessionRun());
    const { container } = render(
      <MemoryRouter>
        <ConnectAction
          onProceed={connectAsTaskFiveWill}
          nfcCapability="unsupported"
          busy={false}
          accepted={false}
        />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(container.querySelector(".baseline-confirm")).not.toBeNull();
    expect(container.querySelector(".unsaved-warning-copy")).not.toBeNull();
    expect(container.querySelector(".unsaved-secondary")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass(
      "button-outline",
    );
    expect(screen.getByRole("button", { name: "Connect anyway" })).toHaveClass(
      "button-outline",
    );
  });

  // Fast-follow spec §4 supersedes the old handoff §1 ruling named in this
  // test's title history ("Connect must not compete with Start") — Connect
  // is now the screen's single primary, its own `.button-connect` class.
  it("the trigger is Connect's own L1-geometry primary (fast-follow spec §4: the screen's single primary)", () => {
    renderConnect();
    expect(screen.getByRole("button", { name: "Connect" })).toHaveClass(
      "button-connect",
    );
  });

  // L-1 (Task 2's review, carried forward as Task 5's own obligation): a
  // `useMemo(() => connectGuardStage(), [])` hoist at MOUNT would pass
  // every test above, since every one of them seeds storage BEFORE
  // `render()` — mount-time and press-time are indistinguishable there.
  // This is the one test that tells them apart: nothing is on record when
  // this component mounts, a SECOND TAB finishes a session while it sits
  // open, and only THEN is Connect pressed. `handleConnect` in the shipped
  // component calls `connectGuardStage()` fresh, inside the click handler
  // — reading it at mount instead would see the empty storage that was
  // true when this component rendered and let the press straight through.
  it("reads the record at press time, not at mount", async () => {
    renderConnect();
    expect(loadRun()).toBeNull();

    saveRun(unloggedSessionRun());

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      screen.getByText(
        /Review and save (?:it|them) from Today\.Connecting discards (?:it|them)\./,
      ),
    ).toBeInTheDocument();
    expect(loadRun()).not.toBeNull();
    expect(loadMonitorRun()).toBeNull();
  });

  // Hand-off store design spec §5, plan Task 5 (the P1-1 hole, closed —
  // §10 row 1's own "guard reads one tier -> fails" mutation target). A
  // record whose DURABLE write was denied (memory-only) is exactly what
  // Today's own store-backed row already renders for (Task 4) — this
  // proves Connect's guard now agrees, where `loadMonitorRun()` (durable
  // tier only) would have seen nothing at all.
  it("a memory-only record (durable write denied) is visible to the guard, same as Today's own row", async () => {
    const w = libraryWorkout("Filling Low");
    const draft = buildDraft({
      id: "fl-memory-only",
      title: w.title,
      type: w.type as WorkoutType,
      steps: w.steps,
    });
    const compiled = compileProgram(buildRun(draft, baselines, t0).phases);
    if ("code" in compiled) {
      throw new Error(`fixture failed to compile: ${compiled.code}`);
    }
    const run = createMonitorRun(
      {
        workoutId: "fl-memory-only",
        title: w.title,
        program: compiled,
        deviceName: "PM5 430123456",
        logSeed: TEST_SEED,
      },
      t0,
    );
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    const created = commitHandoff(run.startedAt, null, run);
    setItemSpy.mockRestore();
    expect(created).toMatchObject({ accepted: true, verdict: "failed" });
    // Confirms the fixture is genuinely memory-only: nothing durable.
    expect(loadMonitorRun()).toBeNull();

    renderConnect();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      screen.getByText(
        /Review and save (?:it|them) from Today\.Connecting discards (?:it|them)\./,
      ),
    ).toBeInTheDocument();
  });
});

// Hand-off store design spec §5, plan Task 5 review fix round
// (2026-08-30): the "armed acceptance" row's AUTHORIZATION half only —
// this component STAGES the guard's own read; it never retires anything
// itself any more (a first draft did, at "Connect anyway" press time,
// and the reviewer proved that destroyed a stale record even when the
// connect attempt then failed or was cancelled — a real F5-class
// regression, since every interstitial state's own Cancel promises
// "nothing lost"). The EXECUTION half (the actual retire, at the wire
// "armed" event) is `useMonitorSession.test.ts`'s own "hand-off store"
// describe block to prove — this file has no real hook/transport to
// reach "armed" with.
describe("ConnectAction: staging the authorization (hand-off store §5 row 1)", () => {
  it.each([false, true])(
    "View unsaved cancels Connect authorization and preserves both records (timer also retained: %s)",
    async (both) => {
      localStorage.clear();
      resetHandoffStoreForTests();
      connectAsTaskFiveWill();
      if (both) saveRun(unloggedSessionRun());
      const before = currentUnretiredHandoff();
      const timer = loadRun();
      render(
        <MemoryRouter initialEntries={["/connect"]}>
          <Routes>
            <Route
              path="/connect"
              element={
                <ConnectAction
                  onProceed={connectAsTaskFiveWill}
                  nfcCapability="unsupported"
                  busy={false}
                  accepted={false}
                />
              }
            />
            <Route path="/today" element={<h1>Today</h1>} />
          </Routes>
        </MemoryRouter>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Connect" }));
      expect(
        screen.getByRole("heading", {
          name: both
            ? "You have unsaved workouts."
            : "You have an unsaved workout.",
        }),
      ).toBeVisible();
      const view = screen.getByRole("button", { name: "View unsaved" });
      expect(view).toHaveFocus();
      await userEvent.click(view);
      expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
      expect(takeStagedRetireHandoff(stagedRetireAttemptId() ?? "")).toBeNull();
      expect(currentUnretiredHandoff()).toStrictEqual(before);
      expect(loadRun()).toStrictEqual(timer);
    },
  );
  beforeEach(() => {
    localStorage.clear();
    resetHandoffStoreForTests();
  });

  it("Connect stages the current MonitorRun entry in the store — key-bound, not yet retired", async () => {
    connectAsTaskFiveWill();
    const before = currentUnretiredHandoff();
    expect(before).not.toBeNull();
    renderConnect();

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    // Staged, not retired: the record is untouched, on both tiers.
    expect(currentUnretiredHandoff()).toStrictEqual(before);
    expect(loadMonitorRun()).not.toBeNull();
    const staged = takeStagedRetireHandoff(stagedRetireAttemptId() ?? "");
    expect(staged).toStrictEqual(before);
  });

  // Task 5 re-review (F-3, 2026-08-30): a refused confirm must not leave
  // a live authorization sitting in the store for a LATER, unrelated
  // Connect press to inherit.
  it("Cancel (the confirm panel's own) discards the staged set", async () => {
    connectAsTaskFiveWill();
    renderConnect();

    // Stages, unconsumed — the panel shows and takes over the trigger.
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(takeStagedRetireHandoff(stagedRetireAttemptId() ?? "")).toBeNull();
  });

  it("neither Connect anyway nor a direct proceed ever retires anything from this component — no retire receipt fires either way", async () => {
    connectAsTaskFiveWill();
    const receipts: HandoffReceipt[] = [];
    setReceiptChannel((r) => receipts.push(r));
    renderConnect();

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Connect anyway" }),
    );

    // `connectAsTaskFiveWill` (this test's `onProceed`) writes a fresh
    // MonitorRun of its own via `saveMonitorRun`/`createMonitorRun`
    // directly — never through the store — so no COMMIT receipt is
    // expected here either; the point is specifically the absence of any
    // RETIRE receipt, which only the hook's own "armed" handler may emit.
    expect(receipts.filter((r) => r.kind === "retire")).toStrictEqual([]);
    // The staged set from the press above is still sitting in the store,
    // exactly where `useMonitorSession.ts`'s own "armed" handler expects
    // to find and consume it — nothing here already took it.
    const staged = takeStagedRetireHandoff(stagedRetireAttemptId() ?? "");
    expect(staged).not.toBeNull();
    setReceiptChannel(null);
  });

  it("a revision that changes while the confirm panel sits on screen is captured at STAGE time, not re-read at press time", async () => {
    connectAsTaskFiveWill();
    const before = currentUnretiredHandoff();
    renderConnect();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    // THE RACE: the dead hook's own linger-window burst lands WHILE the
    // confirm panel sits on screen — after `handleConnect` staged
    // revision 0, before "Connect anyway" is ever pressed.
    const bumped = commitHandoff(before!.sessionKey, 0, before!.run);
    expect(bumped).toMatchObject({ accepted: true, revision: 1 });

    await userEvent.click(
      screen.getByRole("button", { name: "Connect anyway" }),
    );

    // The STAGED entry still names revision 0 — the value `handleConnect`
    // captured at stage time — never the superseded revision 1 the race
    // above produced. This is what lets the hook's own retire report
    // `superseded: true` truthfully later, instead of trivially matching
    // whatever is current (see `handoffStore.stagedRetire`'s own doc
    // comment on why a fresh re-read at press time would defeat this).
    expect(
      takeStagedRetireHandoff(stagedRetireAttemptId() ?? ""),
    ).toStrictEqual(before);
  });

  it("nothing to protect: Connect stages null, clearing any stale entry from an earlier, abandoned press", async () => {
    // A stale entry from an earlier press (a different workout's Connect,
    // since cancelled/abandoned) must not survive to authorize THIS
    // press's own eventual "armed" event (rev-3 antagonist: "a set
    // staged for attempt 1 must not authorize attempt 2's retire").
    stageRetireHandoffForTest(
      { sessionKey: "2020-01-01T00:00:00.000Z", revision: 7 },
      "9d1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f",
    );
    renderConnect();

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(takeStagedRetireHandoff(stagedRetireAttemptId() ?? "")).toBeNull();
  });

  it("nothing staged (a SessionRun-only stage): the guard shows the confirm, but stages null — no MonitorRun to protect", async () => {
    saveRun(unloggedSessionRun());
    expect(currentUnretiredHandoff()).toBeNull();
    renderConnect();

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      screen.getByText(
        /Review and save (?:it|them) from Today\.Connecting discards (?:it|them)\./,
      ),
    ).toBeInTheDocument();
    expect(takeStagedRetireHandoff(stagedRetireAttemptId() ?? "")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase NF (design spec 2026-09-03 §3, Gate 0): the component is now the
// SHARED connection-entry owner — Scan NFC directly above Connect when native
// reports support, one guard, one pending intent, one attempt ID.
describe("ConnectAction as the shared connection-entry owner (Phase NF)", () => {
  beforeEach(() => {
    localStorage.clear();
    resetHandoffStoreForTests();
  });

  function renderEntry(
    props: Partial<
      Omit<ComponentProps<typeof ConnectAction>, "onProceed">
    > = {},
  ) {
    const onProceed = vi.fn();
    render(
      <MemoryRouter>
        <ConnectAction
          onProceed={onProceed}
          nfcCapability={props.nfcCapability ?? "unsupported"}
          busy={props.busy ?? false}
          accepted={props.accepted ?? false}
        />
      </MemoryRouter>,
    );
    return { onProceed };
  }

  it.each(["unknown", "unsupported"] as const)(
    "renders Connect ALONE when capability is %s — no Scan NFC button, no placeholder element",
    (nfcCapability) => {
      const { container } = render(
        <MemoryRouter>
          <ConnectAction
            onProceed={vi.fn()}
            nfcCapability={nfcCapability}
            busy={false}
            accepted={false}
          />
        </MemoryRouter>,
      );
      expect(screen.queryByRole("button", { name: "Scan NFC" })).toBeNull();
      expect(container.querySelector(".button-nfc")).toBeNull();
      expect(container.querySelectorAll("button")).toHaveLength(1);
    },
  );

  it("renders Scan NFC DIRECTLY ABOVE Connect when supported, both enabled", () => {
    const { container } = render(
      <MemoryRouter>
        <ConnectAction
          onProceed={vi.fn()}
          nfcCapability="supported"
          busy={false}
          accepted={false}
        />
      </MemoryRouter>,
    );
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toStrictEqual([
      "Scan NFC",
      "Connect",
    ]);
    expect(buttons[0]).toHaveClass("button-nfc");
    expect(buttons[1]).toHaveClass("button-connect");
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeEnabled();
  });

  it("a Scan NFC press mints a v4 UUID, stages under it, and proceeds with an nfc intent", async () => {
    const { onProceed } = renderEntry({ nfcCapability: "supported" });
    await userEvent.click(screen.getByRole("button", { name: "Scan NFC" }));
    expect(onProceed).toHaveBeenCalledTimes(1);
    const intent = onProceed.mock.calls[0]![0] as {
      kind: string;
      attemptId: string;
    };
    expect(intent.kind).toBe("nfc");
    expect(intent.attemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    // Staged under THAT id — the authorization the hook's armed handler
    // will look for by key (review SF11: the title claimed it, the body
    // never checked).
    expect(stagedRetireAttemptId()).toBe(intent.attemptId);
  });

  it("a Connect press proceeds with a manual intent carrying its own fresh ID", async () => {
    const { onProceed } = renderEntry({ nfcCapability: "supported" });
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onProceed).toHaveBeenCalledTimes(2);
    const [a, b] = onProceed.mock.calls.map(
      (c) => c[0] as { kind: string; attemptId: string },
    );
    expect(a!.kind).toBe("manual");
    expect(b!.kind).toBe("manual");
    expect(a!.attemptId).not.toBe(b!.attemptId);
  });

  it("busy disables BOTH buttons and a press proceeds nothing", async () => {
    const { onProceed } = renderEntry({
      nfcCapability: "supported",
      busy: true,
    });
    const nfc = screen.getByRole("button", { name: "Scan NFC" });
    const connect = screen.getByRole("button", { name: "Connect" });
    expect(nfc).toBeDisabled();
    expect(connect).toBeDisabled();
    await userEvent.click(nfc);
    await userEvent.click(connect);
    expect(onProceed).not.toHaveBeenCalled();
  });

  it("accepted swaps the Scan NFC slot for the `✓ Monitor found` status (aria-live), same fill class", () => {
    render(
      <MemoryRouter>
        <ConnectAction
          onProceed={vi.fn()}
          nfcCapability="supported"
          accepted
          busy
        />
      </MemoryRouter>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("✓ Monitor found");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("button-nfc");
    expect(screen.queryByRole("button", { name: "Scan NFC" })).toBeNull();
  });

  it("with an unlogged session on record, EITHER press stages the panel in place of BOTH buttons; Cancel restores both; Connect anyway resumes the SAME intent", async () => {
    saveRun(unloggedSessionRun());
    const { onProceed } = renderEntry({ nfcCapability: "supported" });
    await userEvent.click(screen.getByRole("button", { name: "Scan NFC" }));
    expect(screen.queryByRole("button", { name: "Scan NFC" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(screen.getByText(/unsaved workout/)).toBeInTheDocument();
    const stagedId = stagedRetireAttemptId();
    expect(stagedId).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("button", { name: "Scan NFC" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(stagedRetireAttemptId()).toBeNull();
    expect(onProceed).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Scan NFC" }));
    const resumedId = stagedRetireAttemptId();
    await userEvent.click(
      screen.getByRole("button", { name: "Connect anyway" }),
    );
    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(onProceed.mock.calls[0]![0]).toStrictEqual({
      kind: "nfc",
      attemptId: resumedId,
    });
  });
});
