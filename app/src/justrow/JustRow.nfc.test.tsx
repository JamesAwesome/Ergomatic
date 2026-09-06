// Phase NF follow-on (design spec 2026-09-06, "Design" 1): Scan NFC on Just
// Row, driven through the SHIPPED seams only — `window.__nfcScript__` (the
// scripted reader behind the fake gate) and `window.__pm5FakeScript__` (the
// fake PM5 transport, which carries `scanTarget`). The routed proof starts
// UPSTREAM of every producer (RF24): a click, a native-shaped event, the
// real bridge/parser/entry hook/session, and the fake radio behind the
// production-composed transport, through to the free row's READY.
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

vi.mock("../adapters/appLifecycle", () => ({
  registerAppLifecycleListener: vi.fn(() => () => undefined),
}));
vi.mock("../adapters/keepAwake", () => ({
  keepAwakeOn: vi.fn(async () => undefined),
  keepAwakeOff: vi.fn(async () => undefined),
}));

const FIXED_ATTEMPT = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const fixture = loadPm5NfcFixture().records;

async function renderDoor() {
  const { default: JustRow } = await import("./JustRow");
  return render(
    <MemoryRouter initialEntries={["/justrow"]}>
      <JustRow />
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

describe("THE ROUTED PROOF on Just Row: Scan NFC click → native-shaped event → real parser/entry hook/session → fake radio via the production transport → READY", () => {
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
