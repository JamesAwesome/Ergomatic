import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WarmupSetting } from "../api/usePreferences";
import { parseWarmupDuration, parseWarmupRest } from "./WarmupRow";

// Same shape/mocking convention as Builder.test.tsx's own `preferencesMock`
// — a hand-typed subset of `PreferencesState`, not the real hook, since
// this component calls `usePreferences` directly (BaselineEditor.tsx's own
// "self-contained, mocks its own hook" pattern for the BASELINES card
// beside this one).
let preferencesMock:
  | {
      state: "ready";
      preferences: { warmup: WarmupSetting | null };
      save: ReturnType<typeof vi.fn>;
    }
  | { state: "loading" }
  | { state: "error"; retry: () => void };

let saveMock: ReturnType<typeof vi.fn>;

// A faithful-enough stand-in for usePreferences.ts's own optimistic merge
// (`current = { ...current, ...patch }`), not a bare spy: WarmupRow reads
// `preferencesState.preferences.warmup` again after `onDone()` closes the
// editor, so a save/remove round trip needs the mock to actually reflect
// the patch on the NEXT render, the same way the real hook does, or a test
// asserting the post-save display would only pass by coincidence.
function mockReady(warmup: WarmupSetting | null) {
  saveMock = vi.fn((patch: { warmup?: WarmupSetting | null }) => {
    if (preferencesMock.state !== "ready") return;
    preferencesMock = {
      ...preferencesMock,
      preferences: { ...preferencesMock.preferences, ...patch },
    };
  });
  preferencesMock = {
    state: "ready",
    preferences: { warmup },
    save: saveMock,
  };
}

beforeEach(() => {
  vi.resetModules();
  mockReady(null);
  vi.doMock("../api/usePreferences", () => ({
    usePreferences: () => preferencesMock,
  }));
});

async function renderWarmupRow() {
  const { default: WarmupRow } = await import("./WarmupRow");
  render(<WarmupRow />);
}

describe("WarmupRow", () => {
  it("OFF state reads WARM-UP · OFF", async () => {
    mockReady(null);
    await renderWarmupRow();
    expect(screen.getByText("WARM-UP · OFF")).toBeVisible();
  });

  it("renders nothing while preferences are loading", async () => {
    preferencesMock = { state: "loading" };
    await renderWarmupRow();
    expect(screen.queryByText(/WARM-UP/)).not.toBeInTheDocument();
  });

  it("renders nothing on a preferences error", async () => {
    preferencesMock = { state: "error", retry: vi.fn() };
    await renderWarmupRow();
    expect(screen.queryByText(/WARM-UP/)).not.toBeInTheDocument();
  });

  it("ON state (time) renders the house duration format", async () => {
    mockReady({ kind: "time", minutes: 10 });
    await renderWarmupRow();
    expect(screen.getByText("WARM-UP · 10:00")).toBeVisible();
  });

  it("ON state (distance) renders meters with a lowercase unit", async () => {
    mockReady({ kind: "distance", meters: 2000 });
    await renderWarmupRow();
    expect(screen.getByText("WARM-UP · 2000 m")).toBeVisible();
  });

  it("ON state with rest appends the REST suffix", async () => {
    mockReady({ kind: "time", minutes: 10, restSeconds: 30 });
    await renderWarmupRow();
    // fmtDuration(30/60) is "0:30" (the house elastic-positional format
    // always keeps the leading group), not the spec prose's elided ":30" —
    // matching ConfirmTargets.tsx/Builder.tsx's own existing rendering of
    // this exact quantity, see WarmupRow.tsx's own warmupValueText comment.
    expect(screen.getByText("WARM-UP · 10:00 + 0:30 REST")).toBeVisible();
  });

  it("tapping the row opens the editor", async () => {
    mockReady(null);
    await renderWarmupRow();
    await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
    expect(screen.getByLabelText("Warm-up duration")).toBeInTheDocument();
    expect(screen.getByLabelText("Warm-up rest after")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("the time/meters toggle switches the visible input", async () => {
    mockReady(null);
    await renderWarmupRow();
    await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));

    // Fresh OFF draft seeds "min" (10:00) — clock-formatted input present.
    expect(screen.getByLabelText("Warm-up duration")).toHaveValue("10:00");

    await userEvent.click(
      screen.getByRole("radio", { name: "Warm-up duration unit meters" }),
    );
    // Switching units clears the value (DurationInput's own rule: a clock
    // string is meaningless as meters and vice versa).
    expect(screen.getByLabelText("Warm-up duration")).toHaveValue("");
  });

  it("does not offer Remove warm-up when opened from OFF", async () => {
    mockReady(null);
    await renderWarmupRow();
    await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
    expect(
      screen.queryByRole("button", { name: "Remove warm-up" }),
    ).not.toBeInTheDocument();
  });

  it("Save patches a time warm-up and returns to the ON display", async () => {
    mockReady(null);
    await renderWarmupRow();
    await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));

    // Seeded draft is already a valid 10-minute warm-up — Save as-is.
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(saveMock).toHaveBeenCalledWith({
      warmup: { kind: "time", minutes: 10 },
    });
    expect(screen.getByText("WARM-UP · 10:00")).toBeVisible();
  });

  it("Save patches a distance warm-up", async () => {
    mockReady(null);
    await renderWarmupRow();
    await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
    await userEvent.click(
      screen.getByRole("radio", { name: "Warm-up duration unit meters" }),
    );
    await userEvent.type(screen.getByLabelText("Warm-up duration"), "2000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(saveMock).toHaveBeenCalledWith({
      warmup: { kind: "distance", meters: 2000 },
    });
  });

  it("Save with a rest value includes restSeconds", async () => {
    mockReady(null);
    await renderWarmupRow();
    await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
    // "30" digits into the masked clock field render as "0:30" (30 seconds)
    // — same masking convention StepEditor's own REST field uses.
    await userEvent.type(screen.getByLabelText("Warm-up rest after"), "30");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(saveMock).toHaveBeenCalledWith({
      warmup: { kind: "time", minutes: 10, restSeconds: 30 },
    });
  });

  it("Remove warm-up patches null and returns to OFF, only offered when currently ON", async () => {
    mockReady({ kind: "time", minutes: 10 });
    await renderWarmupRow();
    await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));

    const remove = screen.getByRole("button", { name: "Remove warm-up" });
    await userEvent.click(remove);

    expect(saveMock).toHaveBeenCalledWith({ warmup: null });
    expect(screen.getByText("WARM-UP · OFF")).toBeVisible();
  });

  it("Cancel closes the editor without saving", async () => {
    mockReady({ kind: "time", minutes: 10 });
    await renderWarmupRow();
    await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
    await userEvent.type(screen.getByLabelText("Warm-up duration"), "999");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByText("WARM-UP · 10:00")).toBeVisible();
  });

  describe("bounds errors, mirroring the server's own named constants (server/routes/data.ts)", () => {
    it("time below 1 minute shows an inline error and does not save", async () => {
      mockReady(null);
      await renderWarmupRow();
      await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
      const input = screen.getByLabelText("Warm-up duration");
      await userEvent.clear(input);
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByText("Enter a warm-up time.")).toBeInTheDocument();
      expect(saveMock).not.toHaveBeenCalled();
    });

    it("time above 30 minutes shows an inline error", async () => {
      mockReady(null);
      await renderWarmupRow();
      await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
      const input = screen.getByLabelText("Warm-up duration");
      await userEvent.clear(input);
      // "3100" digits mask to "31:00" (31 minutes) — one past the 30 bound.
      await userEvent.type(input, "3100");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(
        screen.getByText("Warm-up time must be 1 to 30 minutes."),
      ).toBeInTheDocument();
      expect(saveMock).not.toHaveBeenCalled();
    });

    it("an empty distance value shows an inline error", async () => {
      mockReady(null);
      await renderWarmupRow();
      await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
      await userEvent.click(
        screen.getByRole("radio", { name: "Warm-up duration unit meters" }),
      );
      // Switching units clears the value (DurationInput's own rule) —
      // Save immediately, with nothing typed.
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByText("Enter a warm-up distance.")).toBeInTheDocument();
      expect(saveMock).not.toHaveBeenCalled();
    });

    it("distance below 100 meters shows an inline error", async () => {
      mockReady(null);
      await renderWarmupRow();
      await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
      await userEvent.click(
        screen.getByRole("radio", { name: "Warm-up duration unit meters" }),
      );
      await userEvent.type(screen.getByLabelText("Warm-up duration"), "50");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(
        screen.getByText("Warm-up distance must be 100 to 10000 meters."),
      ).toBeInTheDocument();
      expect(saveMock).not.toHaveBeenCalled();
    });

    it("distance above 10000 meters shows an inline error", async () => {
      mockReady(null);
      await renderWarmupRow();
      await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
      await userEvent.click(
        screen.getByRole("radio", { name: "Warm-up duration unit meters" }),
      );
      await userEvent.type(screen.getByLabelText("Warm-up duration"), "20000");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(
        screen.getByText("Warm-up distance must be 100 to 10000 meters."),
      ).toBeInTheDocument();
    });

    it("a rest below 5 seconds shows an inline error", async () => {
      mockReady(null);
      await renderWarmupRow();
      await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
      await userEvent.type(screen.getByLabelText("Warm-up rest after"), "2");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(
        screen.getByText("Rest after must be 0:05 to 9:55."),
      ).toBeInTheDocument();
      expect(saveMock).not.toHaveBeenCalled();
    });

    it("a rest above 595 seconds (9:55) shows an inline error", async () => {
      mockReady(null);
      await renderWarmupRow();
      await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
      // "1000" digits mask to "10:00" (600 seconds) — one past the 595 bound.
      await userEvent.type(screen.getByLabelText("Warm-up rest after"), "1000");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(
        screen.getByText("Rest after must be 0:05 to 9:55."),
      ).toBeInTheDocument();
      expect(saveMock).not.toHaveBeenCalled();
    });

    it("correcting a field after an error clears that field's own error", async () => {
      mockReady(null);
      await renderWarmupRow();
      await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
      const input = screen.getByLabelText("Warm-up duration");
      await userEvent.clear(input);
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getByText("Enter a warm-up time.")).toBeInTheDocument();

      await userEvent.type(input, "500");
      expect(
        screen.queryByText("Enter a warm-up time."),
      ).not.toBeInTheDocument();
    });
  });

  describe("preloading an existing editor draft from a saved warm-up", () => {
    it("seeds the meters field and unit from an existing distance warm-up", async () => {
      mockReady({ kind: "distance", meters: 2500 });
      await renderWarmupRow();
      await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
      expect(screen.getByLabelText("Warm-up duration")).toHaveValue("2500");
      expect(
        screen.getByRole("radio", { name: "Warm-up duration unit meters" }),
      ).toHaveAttribute("aria-checked", "true");
    });

    it("seeds the rest field from an existing restSeconds", async () => {
      mockReady({ kind: "time", minutes: 15, restSeconds: 45 });
      await renderWarmupRow();
      await userEvent.click(screen.getByRole("button", { name: /WARM-UP/ }));
      expect(screen.getByLabelText("Warm-up rest after")).toHaveValue("0:45");
    });
  });
});

// Pure-function coverage for the two parse helpers' otherwise-unreachable
// "not a valid clock/number" branches — DurationInput/ClockInput's own
// typing UI can never hand these functions a string shaped like this (see
// WarmupRow.tsx's own export comment).
describe("parseWarmupDuration / parseWarmupRest (direct, unreachable-via-UI branches)", () => {
  it("rejects an unparseable time string", () => {
    expect(parseWarmupDuration("min", "not a clock")).toStrictEqual({
      ok: false,
      error: "Enter a valid time.",
    });
  });

  it("rejects a fractional-minute time as not whole", () => {
    // "10:30" is a real clock string ClockInput COULD in principle produce
    // (10 minutes 30 seconds) — but 10.5 minutes fails the whole-minutes
    // bound, a real path a rower can hit by typing "1030".
    expect(parseWarmupDuration("min", "10:30")).toStrictEqual({
      ok: false,
      error: "Warm-up time must be a whole number of minutes.",
    });
  });

  it("rejects a non-integer distance string", () => {
    expect(parseWarmupDuration("m", "12.5")).toStrictEqual({
      ok: false,
      error: "Enter a valid distance.",
    });
  });

  it("treats a blank rest value as no rest at all", () => {
    expect(parseWarmupRest("")).toStrictEqual({ ok: true, value: undefined });
  });

  it("rejects an unparseable rest string", () => {
    expect(parseWarmupRest("garbage")).toStrictEqual({
      ok: false,
      error: "Enter a valid rest time.",
    });
  });
});
