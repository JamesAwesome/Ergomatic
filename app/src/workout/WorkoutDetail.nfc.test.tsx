// Phase NF (design spec 2026-09-03): Scan NFC on workout detail, driven
// through the SHIPPED seams only — `window.__nfcScript__` (the scripted
// reader behind the fake gate) and `window.__pm5FakeScript__` (the fake PM5
// transport, which carries `scanTarget`). The routed proof at the bottom
// starts UPSTREAM of every producer (RF24): a click, a native-shaped event,
// the real bridge/parser/detail/handoff/interstitial/session, and the fake
// radio behind the production-composed transport, through to `armed`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { LibraryWorkout } from "../api/useWorkouts";
import { compileProgram } from "../../domain/monitor/program.js";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import { setAttemptIdMintForTests } from "../monitor/nfc/attemptIdMint";
import { resetNfcCapabilityCacheForTests } from "../monitor/nfc/nfcCapabilityCache";
import { FIXTURE_PM5_NAME, loadPm5NfcFixture } from "../monitor/nfc/fixtures";
import {
  resetForTests as resetHandoffStoreForTests,
  stagedRetireAttemptId,
} from "../monitor/handoffStore";
import { resetMountLeasesForTests } from "../monitor/mountLease";
import {
  latestConnectionAttemptTrace,
  resetConnectionAttemptTraceForTests,
} from "../monitor/nfc/connectionAttemptTrace";
import type { InjectedFakeScript } from "../monitor/transports/index";
import type { NfcScript } from "../monitor/nfc/scriptedNfcReader";

// The detail screen's foreground lease: the real web arm never calls back
// (Minor 9), so the lifecycle seam is mocked with a capturing registration
// that stays a no-op unless a test drives it — the S22 mutation ("foreground
// loss leaves the NFC attempt armed") has no other reachable red path.
const lifecycleCallbacks: ((event: "background" | "foreground") => void)[] = [];
vi.mock("../adapters/appLifecycle", () => ({
  registerAppLifecycleListener: vi.fn(
    (cb: (event: "background" | "foreground") => void) => {
      lifecycleCallbacks.push(cb);
      return () => undefined;
    },
  ),
}));

const WORKOUT: LibraryWorkout = {
  id: "w1",
  title: "NFC Test Piece",
  type: "O2",
  effort: 3,
  steps: [
    {
      k: "w",
      duration: { kind: "time", minutes: 20 },
      ref: { base: "2k", off: 10 },
    },
  ],
  isGlobal: false,
  lastDoneDaysAgo: null,
};
const BASELINES = { k2Seconds: 112, k6Seconds: 122 };
const FIXED_ATTEMPT = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const fixture = loadPm5NfcFixture().records;

/** The program the fake will verify byte-for-byte: the same compile the
 *  detail screen performs at the press, computed independently here. */
function expectedProgram() {
  const run = buildRun(buildDraft(WORKOUT), BASELINES, new Date());
  const compiled = compileProgram(run.phases);
  if ("code" in compiled) throw new Error(compiled.message);
  return compiled;
}

function mockHooks() {
  vi.doMock("../api/useWorkouts", () => ({
    useWorkouts: () => ({ state: "ready", workouts: [WORKOUT] }),
  }));
  vi.doMock("../api/useBaselines", () => ({
    useBaselines: () => ({ state: "ready", baselines: BASELINES }),
  }));
  vi.doMock("../api/usePreferences", () => ({
    usePreferences: () => ({
      state: "ready",
      preferences: {
        difficulties: [],
        timeCapMinutes: 60,
        countdownSeconds: 10,
      },
    }),
  }));
  vi.doMock("../api", () => ({
    api: vi.fn(async () => new Response(null, { status: 204 })),
  }));
}

async function renderDetail() {
  const { default: WorkoutDetail } = await import("./WorkoutDetail");
  return render(
    <MemoryRouter initialEntries={["/library/w1"]}>
      <Routes>
        <Route path="/library/:id" element={<WorkoutDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

function setNfcScript(script: NfcScript | null): void {
  if (script === null) delete window.__nfcScript__;
  else window.__nfcScript__ = script;
}

function setFakeScript(script: InjectedFakeScript | null): void {
  if (script === null) delete window.__pm5FakeScript__;
  else window.__pm5FakeScript__ = script;
}

/** Two animation frames, the paint barrier's whole contract. jsdom's rAF
 *  runs on a ~16 ms timer; awaiting two real frames keeps the barrier real
 *  rather than stubbed. */
async function twoFrames(): Promise<void> {
  await act(async () => {
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
  });
}

// The api hooks are mocked ONCE, before the first dynamic import of
// `WorkoutDetail`, and the module registry is NOT reset between tests: the
// seams this file drives (the attempt-ID mint, the capability cache, the
// trace snapshot, the hand-off store) are module singletons, and a reset
// would hand the screen fresh copies the test's own imports cannot see.
mockHooks();

beforeEach(() => {
  localStorage.clear();
  resetHandoffStoreForTests();
  resetMountLeasesForTests();
  resetNfcCapabilityCacheForTests();
  resetConnectionAttemptTraceForTests();
  setAttemptIdMintForTests(() => FIXED_ATTEMPT);
});

afterEach(() => {
  setNfcScript(null);
  setFakeScript(null);
  setAttemptIdMintForTests(null);
});

describe("Scan NFC presence (spec ruling 3)", () => {
  it("is ABSENT with no NFC script (web/unsupported): Connect alone, no placeholder", async () => {
    const { container } = await renderDetail();
    await screen.findByRole("button", { name: "Connect" });
    expect(screen.queryByRole("button", { name: "Scan NFC" })).toBeNull();
    expect(container.querySelector(".button-nfc")).toBeNull();
  });

  it("is ABSENT when the reader reports unsupported", async () => {
    setNfcScript({ capability: "unsupported", outcome: { kind: "cancelled" } });
    await renderDetail();
    await screen.findByRole("button", { name: "Connect" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: "Scan NFC" })).toBeNull();
  });

  it("is PRESENT, directly above Connect, when the reader reports supported", async () => {
    setNfcScript({ capability: "supported", outcome: { kind: "cancelled" } });
    const { container } = await renderDetail();
    await screen.findByRole("button", { name: "Scan NFC" });
    const stack = container.querySelector(".connect-block")!;
    const buttons = Array.from(stack.querySelectorAll("button")).map(
      (b) => b.textContent,
    );
    expect(buttons).toStrictEqual(["Scan NFC", "Connect"]);
  });
});

describe("Scan NFC outcomes on detail (states table)", () => {
  it("a non-PM5 tag shows `Unsupported NFC tag` inline, stays on detail, discards the staged receipt", async () => {
    setNfcScript({
      capability: "supported",
      outcome: { kind: "records", records: [fixture[1]!, fixture[2]!] },
    });
    await renderDetail();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    expect(await screen.findByText("Unsupported NFC tag")).toBeInTheDocument();
    expect(screen.queryByText(/Connecting|Ready when you pull/)).toBeNull();
    expect(stagedRetireAttemptId()).toBeNull();
    expect(screen.getByRole("button", { name: "Scan NFC" })).toBeEnabled();
  });

  it("a cancelled sheet returns quietly: no error, both buttons back", async () => {
    setNfcScript({ capability: "supported", outcome: { kind: "cancelled" } });
    await renderDetail();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Scan NFC" })).toBeEnabled(),
    );
    expect(document.querySelector(".baseline-error")).toBeNull();
    expect(stagedRetireAttemptId()).toBeNull();
  });

  it.each([
    [{ kind: "timeout" }, "No NFC tag detected. Try again."],
    [{ kind: "invalidated", cause: "multipleTags" }, "Unsupported NFC tag"],
    [
      { kind: "invalidated", cause: "tagFailure" },
      "NFC scan stopped. Try again.",
    ],
    [{ kind: "start-failed" }, "NFC scan stopped. Try again."],
  ] as const)("%o shows %s inline", async (outcome, copy) => {
    setNfcScript({
      capability: "supported",
      outcome: outcome as NfcScript["outcome"],
    });
    await renderDetail();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    expect(await screen.findByText(copy)).toBeInTheDocument();
  });

  it("both hardware buttons are disabled while the read is live, and a second press changes nothing", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    setNfcScript({
      capability: "supported",
      outcome: { kind: "cancelled" },
      gate,
    });
    await renderDetail();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    expect(screen.getByRole("button", { name: "Scan NFC" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    open();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled(),
    );
    expect(
      latestConnectionAttemptTrace()?.filter(
        (e) => e.kind === "session-requested",
      ),
    ).toHaveLength(1);
  });

  it("foreground loss (the pause event) mid-read aborts the attempt: quiet return, reader stopped, no interstitial", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    setNfcScript({
      capability: "supported",
      outcome: { kind: "records", records: fixture },
      gate,
    });
    lifecycleCallbacks.length = 0;
    await renderDetail();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    await waitFor(() => expect(lifecycleCallbacks.length).toBeGreaterThan(0));
    await act(async () => {
      for (const cb of lifecycleCallbacks) cb("background");
      await Promise.resolve();
    });
    open();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Scan NFC" })).toBeEnabled(),
    );
    expect(screen.queryByText(/Connecting|Ready when you pull/)).toBeNull();
    expect(document.querySelector(".baseline-error")).toBeNull();
    expect(stagedRetireAttemptId()).toBeNull();
    const trace = latestConnectionAttemptTrace()?.map((e) => e.kind) ?? [];
    expect(trace).toContain("foreground-abort");
    expect(trace).not.toContain("handoff-accepted");
  });

  it("unmount mid-read aborts the attempt and discards the staged receipt", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    setNfcScript({
      capability: "supported",
      outcome: { kind: "records", records: fixture },
      gate,
    });
    const view = await renderDetail();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    view.unmount();
    open();
    await act(async () => {
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(stagedRetireAttemptId()).toBeNull();
    const trace = latestConnectionAttemptTrace()?.map((e) => e.kind) ?? [];
    expect(trace).toContain("abort-requested");
    expect(trace).not.toContain("handoff-accepted");
  });
});

describe("THE ROUTED PROOF: Scan NFC click → native-shaped event → real parser/detail/handoff/interstitial/session → fake radio via the production transport → armed", () => {
  it("reaches READY with no picker, the exact decoded name at the scanTarget seam and the fixed attempt ID at the consumer", async () => {
    setNfcScript({
      capability: "supported",
      outcome: { kind: "records", records: fixture },
    });
    setFakeScript({
      program: expectedProgram(),
      deviceName: FIXTURE_PM5_NAME,
    });
    await renderDetail();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );

    // The accepted state is committed and painted BEFORE the interstitial.
    expect(await screen.findByRole("status")).toHaveTextContent("✓ PM5 found");
    expect(screen.queryByText(/Connecting/)).toBeNull();
    await twoFrames();

    // The interstitial took over and the session reached READY through the
    // fake's targeted scan — never its picker scan.
    await waitFor(
      () => expect(screen.getByText("Ready when you pull")).toBeInTheDocument(),
      { timeout: 5_000 },
    );
    const controls = window.__pm5FakeControls__!;
    expect(controls.targetedRequests()).toStrictEqual([
      {
        kind: "advertised-name",
        attemptId: "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f",
        exactName: "PM5 432331249 Row",
      },
    ]);
    expect(screen.queryByText("Choose your monitor")).toBeNull();
    // `armed` consumed the staged receipt for THIS attempt.
    expect(stagedRetireAttemptId()).toBeNull();
    const trace = latestConnectionAttemptTrace()?.map((e) => e.kind) ?? [];
    expect(trace).toContain("handoff-accepted");
    expect(trace).toContain("parser-accepted");
  });
});
