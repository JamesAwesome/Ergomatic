// Phase NF follow-on (design spec 2026-09-06, "Design" 1): Scan NFC on Just
// Row, driven through the SHIPPED seams only — `window.__nfcScript__` (the
// scripted reader behind the fake gate) and `window.__pm5FakeScript__` (the
// fake PM5 transport, which carries `scanTarget`). The routed proof starts
// UPSTREAM of every producer (RF24): a click, a native-shaped event, the
// real bridge/parser/entry hook/session, and the fake radio behind the
// production-composed transport, through to the free row's READY.
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { setAttemptIdMintForTests } from "../monitor/nfc/attemptIdMint";
import { resetNfcCapabilityCacheForTests } from "../monitor/nfc/nfcCapabilityCache";
import { FIXTURE_PM5_NAME, loadPm5NfcFixture } from "../monitor/nfc/fixtures";
import {
  resetForTests as resetHandoffStoreForTests,
  stagedRetireAttemptId,
} from "../monitor/handoffStore";
import { resetMountLeasesForTests } from "../monitor/mountLease";
import { resetConnectionAttemptTraceForTests } from "../monitor/nfc/connectionAttemptTrace";
import type { InjectedFakeScript } from "../monitor/transports/index";
import type { NfcScript } from "../monitor/nfc/scriptedNfcReader";
import { WORKOUTSTATE_WAITTOBEGIN } from "../../domain/monitor/pm5/parse.js";

vi.mock("../adapters/appLifecycle", () => ({
  registerAppLifecycleListener: vi.fn(() => () => undefined),
}));
vi.mock("../adapters/keepAwake", () => ({
  keepAwakeOn: vi.fn(async () => undefined),
  keepAwakeOff: vi.fn(async () => undefined),
}));

const FIXED_ATTEMPT = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const NEXT_ATTEMPT = "9d1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const fixture = loadPm5NfcFixture().records;

async function renderDoor(strictMode = false) {
  const { default: JustRow } = await import("./JustRow");
  return render(
    <MemoryRouter initialEntries={["/justrow"]}>
      <JustRow />
    </MemoryRouter>,
    { wrapper: strictMode ? StrictMode : undefined },
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

beforeEach(() => {
  Object.defineProperty(navigator, "bluetooth", {
    value: {},
    configurable: true,
  });
  localStorage.clear();
  resetHandoffStoreForTests();
  resetMountLeasesForTests();
  resetNfcCapabilityCacheForTests();
  resetConnectionAttemptTraceForTests();
  setAttemptIdMintForTests(() => FIXED_ATTEMPT);
});

afterEach(() => {
  delete (navigator as { bluetooth?: unknown }).bluetooth;
  setNfcScript(null);
  setFakeScript(null);
  setAttemptIdMintForTests(null);
});

describe("Scan NFC on Just Row: presence (follow-on Gate 0 §1)", () => {
  it("is ABSENT with no NFC script: Connect alone above Start Timer", async () => {
    const { container } = await renderDoor();
    await screen.findByRole("button", { name: "Connect" });
    expect(screen.queryByRole("button", { name: "Scan NFC" })).toBeNull();
    expect(container.querySelector(".button-nfc")).toBeNull();
  });

  it("is PRESENT directly above Connect when the reader reports supported, with Start Timer below", async () => {
    setNfcScript({ capability: "supported", outcome: { kind: "cancelled" } });
    const { container } = await renderDoor();
    await screen.findByRole("button", { name: "Scan NFC" });
    const buttons = Array.from(
      container.querySelectorAll(".action-stack button"),
    ).map((b) => b.textContent);
    expect(buttons).toStrictEqual(["Scan NFC", "Connect", "Start Timer"]);
  });
});

describe("Scan NFC on Just Row: outcomes", () => {
  it("both hardware buttons are disabled and aria-busy while the read is live (antagonist F3)", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    setNfcScript({
      capability: "supported",
      outcome: { kind: "cancelled" },
      gate,
    });
    await renderDoor();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    const scan = screen.getByRole("button", { name: "Scan NFC" });
    const connect = screen.getByRole("button", { name: "Connect" });
    expect(scan).toBeDisabled();
    expect(connect).toBeDisabled();
    expect(scan).toHaveAttribute("aria-busy", "true");
    expect(connect).toHaveAttribute("aria-busy", "true");
    open();
    await waitFor(() => expect(connect).toBeEnabled());
    expect(scan).toBeEnabled();
  });

  it("a non-PM5 tag shows `Unsupported NFC tag` inline between the pair and Start Timer, stays on the door, discards the staged receipt", async () => {
    setNfcScript({
      capability: "supported",
      outcome: { kind: "records", records: [fixture[1]!, fixture[2]!] },
    });
    const { container } = await renderDoor();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    const line = await screen.findByText("Unsupported NFC tag");
    expect(line).toHaveClass("baseline-error");
    const stack = container.querySelector(".action-stack")!;
    const order = Array.from(stack.children).map((el) =>
      el.classList.contains("baseline-error") ? "error" : el.textContent,
    );
    expect(order.indexOf("error")).toBeGreaterThan(order.indexOf("Connect"));
    expect(order.indexOf("error")).toBeLessThan(order.indexOf("Start Timer"));
    expect(screen.queryByText("Connecting to monitor")).toBeNull();
    expect(stagedRetireAttemptId()).toBeNull();
  });

  it("a cancelled sheet returns quietly: no line, both buttons back", async () => {
    setNfcScript({ capability: "supported", outcome: { kind: "cancelled" } });
    await renderDoor();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Scan NFC" })).toBeEnabled(),
    );
    expect(document.querySelector(".baseline-error")).toBeNull();
    expect(stagedRetireAttemptId()).toBeNull();
  });
});

describe("the connecting card on the NFC route (Gate 0, James 2026-09-06)", () => {
  it("names the PM5 it is looking for and keeps Cancel while the targeted scan runs; the manual route keeps its own card", async () => {
    setNfcScript({
      capability: "supported",
      outcome: { kind: "records", records: fixture },
    });
    setFakeScript({
      program: { intervals: [] },
      deviceName: FIXTURE_PM5_NAME,
      targetedScan: "pending",
    });
    await renderDoor();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Looking for PM5 432331249 Row",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Tag read. Move your phone away from the NFC spot and keep Ergomatic open.",
      ),
    ).toHaveClass("connected-body-line");
    expect(screen.queryByText("Connecting to monitor")).toBeNull();
    expect(screen.queryByText(/Wake the monitor/)).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("manual Connect keeps the generic card (no target to name)", async () => {
    setNfcScript({ capability: "supported", outcome: { kind: "cancelled" } });
    setFakeScript({
      program: { intervals: [] },
      deviceName: FIXTURE_PM5_NAME,
      delayWritesMs: 10_000,
    });
    await renderDoor();
    await userEvent.click(
      await screen.findByRole("button", { name: "Connect" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Connecting to monitor" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Looking for/)).toBeNull();
  });
});

describe("THE ROUTED PROOF on Just Row: Scan NFC click → native-shaped event → real parser/entry hook/session → fake radio via the production transport → READY", () => {
  it("retains the claimed authorization on the StrictMode route and discards it on true route detach", async () => {
    setNfcScript({
      capability: "supported",
      outcome: { kind: "records", records: fixture },
    });
    setFakeScript({
      program: { intervals: [] },
      deviceName: FIXTURE_PM5_NAME,
      targetedScan: "pending",
    });
    const view = await renderDoor(true);
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Looking for PM5 432331249 Row",
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(window.__pm5FakeControls__!.targetedRequests()).toHaveLength(1),
    );
    // The real owner/session survive the pinned runtime's initial StrictMode
    // rehearsal. Just Row claims later on this mounted screen: its lifetime
    // Effect updates rather than mounting a new child as Workout Detail does.
    // Hold discovery before `armed` so only abandonment can clear the receipt.
    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    });
    expect(stagedRetireAttemptId()).toBe(FIXED_ATTEMPT);
    expect(screen.queryByText("Ready when you pull")).toBeNull();

    view.unmount();
    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    });
    expect(stagedRetireAttemptId()).toBeNull();
  });

  it("keeps hardware entry closed through Cancel settlement; a fresh connection survives a deliberately deferred old lease callback", async () => {
    const minted = [FIXED_ATTEMPT, NEXT_ATTEMPT];
    let mintCount = 0;
    setAttemptIdMintForTests(() => {
      const attemptId = minted[mintCount];
      mintCount += 1;
      if (attemptId === undefined) throw new Error("unexpected third attempt");
      return attemptId;
    });
    setNfcScript({ capability: "supported", outcome: { kind: "cancelled" } });
    setFakeScript({
      program: { intervals: [] },
      deviceName: FIXTURE_PM5_NAME,
      // Cancel registers its post-terminate settle after the paused local
      // write resolves. These are later machine-status notifications, kept
      // separate from that local transport settlement on purpose.
      events: [5_000, 5_001, 5_002].map((atMs) => ({
        atMs,
        kind: "status" as const,
        workoutState: WORKOUTSTATE_WAITTOBEGIN,
        elapsedSeconds: 0,
        distanceMeters: 0,
        spm: 0,
        currentSplit: 0,
        heartRateBpm: null,
        programIntervalIndex: 0,
      })),
    });
    await renderDoor();
    await screen.findByRole("button", { name: "Scan NFC" });

    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(
      await screen.findByRole(
        "heading",
        { name: "Ready when you pull" },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();

    const oldFake = window.__pm5FakeControls__!;
    // Deliberately defer A's real mount-lease release callback until B exists.
    // This intercepted schedule proves conditional successor safety only;
    // it does not establish that native microtask ordering can delay A so far.
    const lateA: VoidFunction[] = [];
    const queueMicrotaskSpy = vi
      .spyOn(globalThis, "queueMicrotask")
      .mockImplementation((callback) => lateA.push(callback));
    oldFake.pause("write");
    try {
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(lateA).toHaveLength(1);
      queueMicrotaskSpy.mockRestore();

      const scan = screen.getByRole("button", { name: "Scan NFC" });
      const connect = screen.getByRole("button", { name: "Connect" });
      expect(scan).toBeDisabled();
      expect(connect).toBeDisabled();
      expect(scan).toHaveAttribute("aria-busy", "true");
      expect(connect).toHaveAttribute("aria-busy", "true");
      expect(stagedRetireAttemptId()).toBeNull();

      await userEvent.click(scan);
      await userEvent.click(connect);
      expect(window.__pm5FakeControls__).toBe(oldFake);
      expect(oldFake.targetedRequests()).toStrictEqual([]);
      expect(mintCount).toBe(1);
      expect(stagedRetireAttemptId()).toBeNull();

      await act(async () => {
        oldFake.resume("write");
        for (let i = 0; i < 20; i += 1) await Promise.resolve();
        oldFake.tick(5_002);
        for (let i = 0; i < 20; i += 1) await Promise.resolve();
      });

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled(),
      );
      expect(screen.getByRole("button", { name: "Scan NFC" })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Connect" }));
      await waitFor(() => expect(window.__pm5FakeControls__).not.toBe(oldFake));
      const nextFake = window.__pm5FakeControls__!;

      await act(async () => {
        lateA[0]!();
        for (let i = 0; i < 20; i += 1) await Promise.resolve();
      });
      expect(window.__pm5FakeControls__).toBe(nextFake);
      expect(
        await screen.findByRole(
          "heading",
          { name: "Ready when you pull" },
          { timeout: 5_000 },
        ),
      ).toBeInTheDocument();
      expect(mintCount).toBe(2);
      expect(stagedRetireAttemptId()).toBeNull();
    } finally {
      queueMicrotaskSpy.mockRestore();
      oldFake.resume("write");
    }
  });

  it("reaches Ready when you pull with the exact decoded name at the scanTarget seam and the fixed attempt ID; no picker scan", async () => {
    setNfcScript({
      capability: "supported",
      outcome: { kind: "records", records: fixture },
    });
    setFakeScript({
      program: { intervals: [] },
      deviceName: FIXTURE_PM5_NAME,
    });
    await renderDoor();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    expect(
      await screen.findByRole(
        "heading",
        { name: "Ready when you pull" },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    const controls = window.__pm5FakeControls__!;
    expect(controls.targetedRequests()).toStrictEqual([
      {
        kind: "advertised-name",
        attemptId: "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f",
        exactName: "PM5 432331249 Row",
      },
    ]);
    // The staged receipt was consumed at the free row's armed event.
    expect(stagedRetireAttemptId()).toBeNull();
  });

  it("a targeted failure renders the two-line card and Try again REPLAYS the same targeted request, never the picker (antagonist F2, spec 'Design' 1)", async () => {
    setNfcScript({
      capability: "supported",
      outcome: { kind: "records", records: fixture },
    });
    setFakeScript({
      program: { intervals: [] },
      deviceName: FIXTURE_PM5_NAME,
      targetedScan: "not-advertising",
    });
    await renderDoor();
    await userEvent.click(
      await screen.findByRole("button", { name: "Scan NFC" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Could not connect" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Couldn't reach PM5 432331249 Row.")).toHaveClass(
      "connected-body-line",
    );
    expect(
      screen.getByText(
        "Check nothing else is connected to it, then try again.",
      ),
    ).toHaveClass("connected-body-line");
    const first = window.__pm5FakeControls__!;
    expect(first.targetedRequests()).toHaveLength(1);
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    // Every connect() builds a fresh transport (a fresh fake), so the replay
    // shows up on the NEW fake's sink — as the SAME request object.
    await waitFor(() => {
      const next = window.__pm5FakeControls__!;
      expect(next).not.toBe(first);
      expect(next.targetedRequests()).toHaveLength(1);
      expect(next.targetedRequests()[0]).toBe(first.targetedRequests()[0]);
    });
  });
});
