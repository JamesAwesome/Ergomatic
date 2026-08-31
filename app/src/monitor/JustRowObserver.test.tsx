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

function observeTransport(connectGate?: Promise<void>) {
  const inner = createFakeTransport({
    deviceName: DEVICE_NAME,
    program: libraryProgram(),
  });
  const transport: Transport & {
    writes: { uuid: string; bytes: Uint8Array }[];
    subscribed: string[];
    disconnects: number;
    scans: number;
    connects: number;
  } = {
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

afterEach(() => {
  cleanup();
  delete window.__pm5Recording__;
});

describe("JustRowObserver", () => {
  it("opens one observation connection without programming and exposes capture controls", async () => {
    let releaseConnect!: () => void;
    const connectGate = new Promise<void>((resolve) => {
      releaseConnect = resolve;
    });
    const transport = observeTransport(connectGate);
    const deps: MonitorSessionDeps = {
      createTransport: () => transport,
      driverOptions: { schedule: () => () => undefined },
    };
    const user = userEvent.setup();
    const rendered = render(<JustRowObserver deps={deps} />);

    expect(
      await screen.findByRole("heading", { name: "Connecting to monitor" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Download capture" }),
    ).not.toBeInTheDocument();

    await act(async () => releaseConnect());
    expect(
      await screen.findByRole("heading", {
        name: `${DEVICE_NAME} connected`,
      }),
    ).toBeInTheDocument();

    expect(transport.scans).toStrictEqual(1);
    expect(transport.connects).toStrictEqual(1);
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

    const download = vi.fn().mockResolvedValue(undefined);
    window.__pm5Recording__ = {
      lines: () => [],
      eventCount: () => 0,
      download,
    };
    rendered.rerender(<JustRowObserver deps={deps} />);
    expect(transport.scans).toBe(1);
    expect(transport.connects).toBe(1);

    await user.click(screen.getByRole("button", { name: "Download capture" }));
    expect(download).toHaveBeenCalledWith();

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(transport.disconnects).toBe(1));
    expect(
      await screen.findByRole("heading", { name: "Waiting for monitor" }),
    ).toBeInTheDocument();
  });

  it("shows the hook's failure detail when no transport is available", async () => {
    render(
      <JustRowObserver
        deps={{
          createTransport: () => null,
          driverOptions: { schedule: () => () => undefined },
        }}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "This device has no Bluetooth transport.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Download capture" }),
    ).not.toBeInTheDocument();
  });
});
