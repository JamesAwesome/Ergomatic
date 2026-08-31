import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
  END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
  END_OF_WORKOUT_SUMMARY_UUID,
  RECEIVE_CHARACTERISTIC_UUID,
  SAMPLE_RATE_UUID,
  SPLIT_INTERVAL_DATA_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import { compileProgram } from "../../domain/monitor/program.js";
import type { Transport } from "../../domain/monitor/types.js";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { fromWorkout, toSteps } from "../builder/builderState";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import JustRowObserver from "./JustRowObserver";
import { createFakeTransport } from "./transports/fake";
import type { MonitorSessionDeps } from "./useMonitorSession";

const DEVICE_NAME = "PM5 432331249";
const originalStorageDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "storage",
);
const diagnosticStorageKeys = [
  "ergomatic:last-monitor-log",
  "ergomatic:last-rowed-log",
  "ergomatic:last-session-log",
] as const;

function seedDiagnosticStorage(): void {
  sessionStorage.setItem(diagnosticStorageKeys[0], "monitor-sentinel");
  sessionStorage.setItem(diagnosticStorageKeys[1], "rowed-sentinel");
  localStorage.setItem(diagnosticStorageKeys[2], "session-sentinel");
}

function expectDiagnosticStorageUnchanged(): void {
  expect(sessionStorage.getItem(diagnosticStorageKeys[0])).toBe(
    "monitor-sentinel",
  );
  expect(sessionStorage.getItem(diagnosticStorageKeys[1])).toBe(
    "rowed-sentinel",
  );
  expect(localStorage.getItem(diagnosticStorageKeys[2])).toBe(
    "session-sentinel",
  );
}

function libraryProgram() {
  const workout = LIBRARY_WORKOUTS.find(({ title }) => title === "Sea Fret");
  if (!workout) throw new Error("fixture not found: Sea Fret");

  const form = fromWorkout(workout);
  const result = toSteps(form);
  if (!result.ok) {
    throw new Error(
      `library fixture did not round-trip: ${JSON.stringify(result.errors)}`,
    );
  }

  const draft = buildDraft({
    id: "sea-fret",
    title: form.title,
    type: form.type,
    steps: result.steps,
  });
  const compiled = compileProgram(
    buildRun(
      draft,
      { k2Seconds: 100, k6Seconds: 120 },
      new Date("2026-08-31T12:00:00.000Z"),
    ).phases,
  );
  if ("code" in compiled) {
    throw new Error(`library fixture did not compile: ${compiled.code}`);
  }
  return compiled;
}

type ObserveTransport = Transport & {
  writes: { uuid: string; bytes: Uint8Array }[];
  subscribed: string[];
  disconnects: number;
  scans: number;
  connects: number;
  injectDisconnect: (reason?: string) => void;
};

/** `onConnect` exists so a test can install `window.__pm5Recording__` at the
 *  moment the real seam does. `resolveDefaultTransport()` sets that global
 *  DURING `connect()`, before the link comes up — a test that sets it before
 *  `render()` instead would be seeding past the producer (recurring failure
 *  24) and could not fail if the component read it at the wrong time. */
function observeTransport(
  connectGate?: Promise<void>,
  onConnect?: () => void,
): ObserveTransport {
  const inner = createFakeTransport({
    deviceName: DEVICE_NAME,
    program: libraryProgram(),
  });
  const transport: ObserveTransport = {
    ...inner,
    writes: [] as { uuid: string; bytes: Uint8Array }[],
    subscribed: [] as string[],
    disconnects: 0,
    scans: 0,
    connects: 0,
    async scan() {
      transport.scans += 1;
      return inner.scan();
    },
    async connect(id: string) {
      transport.connects += 1;
      onConnect?.();
      await connectGate;
      return inner.connect(id);
    },
    async write(uuid: string, bytes: Uint8Array) {
      transport.writes.push({ uuid, bytes: bytes.slice() });
      return inner.write(uuid, bytes);
    },
    subscribe(uuid: string, cb: (bytes: Uint8Array) => void) {
      transport.subscribed.push(uuid);
      return inner.subscribe(uuid, cb);
    },
    async disconnect() {
      transport.disconnects += 1;
      return inner.disconnect();
    },
  };
  return transport;
}

function deps(transport: Transport | null): MonitorSessionDeps {
  return {
    createTransport: () => transport,
    driverOptions: { schedule: () => () => undefined },
  };
}

afterEach(() => {
  cleanup();
  delete window.__pm5Recording__;
  for (const key of diagnosticStorageKeys) {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  }
  Reflect.deleteProperty(navigator, "storage");
  if (originalStorageDescriptor) {
    Object.defineProperty(navigator, "storage", originalStorageDescriptor);
  }
});

describe("JustRowObserver", () => {
  // THE REGRESSION THAT MATTERS. `scan()` reaches
  // `navigator.bluetooth.requestDevice()` on the real web arm, which is
  // transient-activation gated (Web Bluetooth "request Bluetooth devices"
  // step 4). This screen has no in-app entry — it is opened by typing its
  // URL, a fresh Window with no activation — so a connect fired from a mount
  // effect throws `SecurityError` on the one build the walk uses. Every
  // other gate here runs on an injected transport that never touches the
  // radio, so this ordering assertion is the only thing standing between the
  // instrument and a walk that cannot start.
  it("opens no radio until the operator taps Connect", async () => {
    const transport = observeTransport();
    const user = userEvent.setup();
    render(<JustRowObserver deps={deps(transport)} />);

    expect(
      await screen.findByRole("heading", { name: "Not connected" }),
    ).toBeInTheDocument();
    expect(transport.scans).toBe(0);
    expect(transport.connects).toBe(0);

    await user.click(screen.getByRole("button", { name: "Connect" }));

    await screen.findByRole("heading", { name: `${DEVICE_NAME} connected` });
    expect(transport.scans).toBe(1);
    expect(transport.connects).toBe(1);
  });

  it("observes without programming and exposes capture controls", async () => {
    let releaseConnect!: () => void;
    const connectGate = new Promise<void>((resolve) => {
      releaseConnect = resolve;
    });
    const download = vi.fn().mockResolvedValue(undefined);
    const transport = observeTransport(connectGate, () => {
      window.__pm5Recording__ = {
        lines: () => [],
        eventCount: () => 412,
        download,
      };
    });
    const persistMock = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persist: persistMock },
    });
    const user = userEvent.setup();
    render(<JustRowObserver deps={deps(transport)} />);

    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(
      await screen.findByRole("heading", { name: "Connecting to monitor" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Download capture" }),
    ).not.toBeInTheDocument();

    await act(async () => releaseConnect());
    expect(
      await screen.findByRole("heading", { name: `${DEVICE_NAME} connected` }),
    ).toBeInTheDocument();

    expect(persistMock).not.toHaveBeenCalled();
    expect(transport.subscribed).toStrictEqual(
      expect.arrayContaining([
        SPLIT_INTERVAL_DATA_UUID,
        ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
        END_OF_WORKOUT_SUMMARY_UUID,
        END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
      ]),
    );
    expect(
      transport.writes.filter(
        (write) => write.uuid === RECEIVE_CHARACTERISTIC_UUID,
      ),
    ).toStrictEqual([]);
    expect(transport.writes.map((write) => write.uuid)).toContain(
      SAMPLE_RATE_UUID,
    );

    // The count is the instrument's proof of life: "connected" only proves a
    // GATT connect, so a walk with a dead subscription would look identical
    // without it.
    expect(await screen.findByText("412 events captured")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Download capture" }));
    expect(download).toHaveBeenCalledWith();
  });

  // Cancel during an in-flight connect. `useMonitorSession`'s own guard
  // comment predicted this and named the precondition that made it safe:
  // "Unreachable today only because onExit() unmounts the interstitial
  // synchronously — nothing can press Connect mid-cancel. If cancel ever
  // stops unmounting, this guard needs a cancellingRef." This screen is the
  // caller that stops unmounting: it stays mounted and offers Connect again.
  // Without attempt cancellation the abandoned connect() runs to completion
  // AFTER the UI has returned to offline, installing a driver and its
  // subscriptions behind a screen that says "Not connected" — and the
  // visible Connect then silently no-ops on the `driverRef.current !== null`
  // half of that same guard.
  it("a Cancel mid-connect installs nothing and leaves Connect working", async () => {
    let releaseConnect!: () => void;
    const connectGate = new Promise<void>((resolve) => {
      releaseConnect = resolve;
    });
    const transport = observeTransport(connectGate);
    const user = userEvent.setup();
    render(<JustRowObserver deps={deps(transport)} />);

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("heading", { name: "Connecting to monitor" });
    expect(transport.connects).toBe(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      await screen.findByRole("heading", { name: "Not connected" }),
    ).toBeInTheDocument();

    // The abandoned attempt now completes. It must claim nothing.
    await act(async () => {
      releaseConnect();
      await Promise.resolve();
    });
    expect(
      screen.getByRole("heading", { name: "Not connected" }),
    ).toBeInTheDocument();
    expect(transport.subscribed).toStrictEqual([]);
    await waitFor(() => expect(transport.disconnects).toBe(1));

    // And the screen is genuinely usable again, not silently inert.
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("heading", { name: `${DEVICE_NAME} connected` });
    expect(transport.connects).toBe(2);
  });

  it("re-reads the capture count while the link is up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let events = 7;
    const transport = observeTransport(undefined, () => {
      window.__pm5Recording__ = {
        lines: () => [],
        eventCount: () => events,
        download: vi.fn().mockResolvedValue(undefined),
      };
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<JustRowObserver deps={deps(transport)} />);

    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText("7 events captured")).toBeInTheDocument();

    events = 913;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("913 events captured")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("offers Connect again after a deliberate Disconnect", async () => {
    const transport = observeTransport();
    const user = userEvent.setup();
    render(<JustRowObserver deps={deps(transport)} />);

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("heading", { name: `${DEVICE_NAME} connected` });

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(transport.disconnects).toBe(1));
    // Not "Waiting for monitor": nothing is in flight, and the runsheet's
    // three-piece budget needs a second connect from exactly here.
    expect(
      await screen.findByRole("heading", { name: "Not connected" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/events captured/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("heading", { name: `${DEVICE_NAME} connected` });
    expect(transport.scans).toBe(2);
    expect(transport.connects).toBe(2);
  });

  it("says the link is lost, not that it is waiting, when the monitor drops", async () => {
    const transport = observeTransport();
    const user = userEvent.setup();
    render(<JustRowObserver deps={deps(transport)} />);

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("heading", { name: `${DEVICE_NAME} connected` });

    await act(async () => {
      transport.injectDisconnect("radio dropped");
    });

    expect(
      await screen.findByRole("heading", { name: "Lost the monitor" }),
    ).toBeInTheDocument();
  });

  it("keeps a failure's raw detail out of the serif line", async () => {
    const user = userEvent.setup();
    render(<JustRowObserver deps={deps(null)} />);

    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      await screen.findByRole("heading", { name: "Could not connect" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This device has no Bluetooth transport."),
    ).toHaveClass("connected-body-line");
    expect(
      screen.queryByRole("heading", {
        name: "This device has no Bluetooth transport.",
      }),
    ).not.toBeInTheDocument();
    // A failure is retryable from the same control the screen opened with.
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("leaves diagnostic storage untouched after disconnect", async () => {
    const transport = observeTransport();
    const user = userEvent.setup();
    seedDiagnosticStorage();
    render(<JustRowObserver deps={deps(transport)} />);

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("heading", { name: `${DEVICE_NAME} connected` });
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(transport.disconnects).toBe(1));

    expectDiagnosticStorageUnchanged();
  });

  it("leaves diagnostic storage untouched on unmount, and never programs", async () => {
    const transport = observeTransport();
    const user = userEvent.setup();
    seedDiagnosticStorage();
    const rendered = render(<JustRowObserver deps={deps(transport)} />);

    await user.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByRole("heading", { name: `${DEVICE_NAME} connected` });
    rendered.unmount();
    await waitFor(() => expect(transport.disconnects).toBe(1));

    expectDiagnosticStorageUnchanged();
    // Teardown terminates only from `programming`/`ready`, which this screen
    // never reaches — so the exit path sends no CSAFE either. Asserted here
    // because the connected-path check above runs before any exit.
    expect(
      transport.writes.filter(
        (write) => write.uuid === RECEIVE_CHARACTERISTIC_UUID,
      ),
    ).toStrictEqual([]);
  });
});
