// Task 3 (Gate 0 rev 3): the monitor-logs door. Seeds through the REAL
// `pushSessionLog` (Task 1's own module) rather than hand-built
// localStorage JSON — the same "don't fake the producer" discipline
// `sessionLogHistory.test.ts` itself follows for its own fixtures.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { pushSessionLog } from "../monitor/sessionLogHistory";
import { formatTimeOfDay } from "../session/summaryModel";
import MonitorLogs, { sessionWhenLabel } from "./MonitorLogs";

const NOW = new Date("2026-08-31T18:42:00.000Z");
const YESTERDAY = new Date("2026-08-30T19:03:00.000Z");
const TWO_DAYS_AGO = new Date("2026-08-29T09:00:00.000Z");

function ring(n: number): string {
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => ({
      seq: i,
      kind: "notify",
      detail: `f${i}`,
    })),
  );
}

function renderMonitorLogs() {
  return render(
    <MemoryRouter>
      <MonitorLogs />
    </MemoryRouter>,
  );
}

function stubClipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
    writable: true,
  });
  return clipboard;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MonitorLogs — chrome", () => {
  it('has the "Monitor logs" screen title, the approved caption exactly, and a BACK link falling back to /you/diagnostics', () => {
    renderMonitorLogs();
    expect(screen.getByRole("heading", { name: "Monitor logs" })).toBeVisible();
    expect(
      screen.getByText(
        "The app keeps the last three connected sessions' diagnostic logs. Copy one to send it with a bug report.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /BACK/ })).toHaveAttribute(
      "href",
      "/you/diagnostics",
    );
  });

  it("renders the approved empty state when no logs exist", () => {
    renderMonitorLogs();
    expect(
      screen.getByText(
        "No logs yet. They appear here after a connected session.",
      ),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".diag-log-card")).toHaveLength(0);
  });
});

describe("MonitorLogs — listing (newest-first)", () => {
  it("lists entries newest-first, each with an event count", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    pushSessionLog(ring(9), TWO_DAYS_AGO);
    pushSessionLog(ring(37), YESTERDAY);
    pushSessionLog(ring(214), NOW);
    renderMonitorLogs();

    const cards = document.querySelectorAll(".diag-log-card");
    expect(cards).toHaveLength(3);
    // slot 1 (most recently pushed) first — same order listSessionLogs
    // itself returns, unreordered by this screen.
    expect(cards[0]!.textContent).toContain("214 EVENTS");
    expect(cards[1]!.textContent).toContain("37 EVENTS");
    expect(cards[2]!.textContent).toContain("9 EVENTS");
  });

  it("counts one event in the singular", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    pushSessionLog(ring(1), NOW);
    renderMonitorLogs();
    expect(screen.getByText("1 EVENT")).toBeInTheDocument();
  });

  it("a corrupt export renders no row — surviving entries still list", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    pushSessionLog(ring(9), TWO_DAYS_AGO);
    pushSessionLog("not json{{{", YESTERDAY);
    pushSessionLog(ring(214), NOW);
    renderMonitorLogs();

    const cards = document.querySelectorAll(".diag-log-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toContain("214 EVENTS");
    expect(cards[1]!.textContent).toContain("9 EVENTS");
  });

  it("a valid-JSON export that isn't an array also renders no row", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    pushSessionLog(JSON.stringify({ unrelated: true }), NOW);
    renderMonitorLogs();
    expect(document.querySelectorAll(".diag-log-card")).toHaveLength(0);
    expect(
      screen.getByText(
        "No logs yet. They appear here after a connected session.",
      ),
    ).toBeInTheDocument();
  });
});

describe("MonitorLogs — the when label", () => {
  it('reads "Today, HH:MM" for a save on the same local calendar day as now', () => {
    expect(sessionWhenLabel(NOW.toISOString(), NOW)).toBe(
      `Today, ${formatTimeOfDay(NOW.toISOString())}`,
    );
  });

  it('reads "Yesterday, HH:MM" for a save exactly one local calendar day back', () => {
    expect(sessionWhenLabel(YESTERDAY.toISOString(), NOW)).toBe(
      `Yesterday, ${formatTimeOfDay(YESTERDAY.toISOString())}`,
    );
  });

  it("falls back to a short absolute date for anything older than yesterday", () => {
    const label = sessionWhenLabel(TWO_DAYS_AGO.toISOString(), NOW);
    expect(label).not.toMatch(/^(Today|Yesterday)/);
    expect(label).toContain(formatTimeOfDay(TWO_DAYS_AGO.toISOString()));
  });

  it("renders each entry's when label on screen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    pushSessionLog(ring(1), NOW);
    renderMonitorLogs();
    expect(
      screen.getByText(sessionWhenLabel(NOW.toISOString(), NOW)),
    ).toBeInTheDocument();
  });
});

describe("MonitorLogs — COPY (ConnectionLogSheet's own three-state contract)", () => {
  it("copies the entry's exported bytes byte-for-byte, never re-stringified", async () => {
    const clipboard = stubClipboard();
    // Deliberately NOT canonical `JSON.stringify` output (pretty-printed,
    // trailing newline): `JSON.parse` then compact `JSON.stringify` would
    // round-trip to a DIFFERENT string, so this fixture is the one that
    // actually distinguishes "copied verbatim" from "re-serialized" —
    // `ring()`'s own compact output happens to be a fixed point of that
    // round-trip and would pass even a re-stringifying implementation.
    const raw = `${JSON.stringify(JSON.parse(ring(3)), null, 2)}\n`;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    pushSessionLog(raw, NOW);
    vi.useRealTimers();
    renderMonitorLogs();

    await userEvent.click(screen.getByRole("button", { name: "COPY" }));
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    const copied = clipboard.writeText.mock.calls[0]![0] as string;
    // The SAME string `pushSessionLog` was handed — not
    // `JSON.stringify(JSON.parse(raw))`, which would still be
    // deep-equal but is a different artefact (whitespace, key order).
    expect(copied).toBe(raw);
  });

  it("says COPIED, and says COPY FAILED when the clipboard rejects", async () => {
    const clipboard = stubClipboard();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    pushSessionLog(ring(1), NOW);
    vi.useRealTimers();
    renderMonitorLogs();

    await userEvent.click(screen.getByRole("button", { name: "COPY" }));
    expect(screen.getByRole("button", { name: "COPIED" })).toBeInTheDocument();

    clipboard.writeText.mockRejectedValueOnce(new Error("denied"));
    await userEvent.click(screen.getByRole("button", { name: "COPIED" }));
    expect(
      screen.getByRole("button", { name: "COPY FAILED" }),
    ).toBeInTheDocument();
  });

  it("each entry's COPY state is independent — copying one never flips another's label", async () => {
    const clipboard = stubClipboard();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    pushSessionLog(ring(9), TWO_DAYS_AGO);
    pushSessionLog(ring(214), NOW);
    vi.useRealTimers();
    renderMonitorLogs();

    const copyButtons = screen.getAllByRole("button", { name: "COPY" });
    expect(copyButtons).toHaveLength(2);
    await userEvent.click(copyButtons[0]!);

    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "COPIED" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "COPY" })).toHaveLength(1);
  });
});
