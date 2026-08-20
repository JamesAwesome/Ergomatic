import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  parseAdditionalStatus1,
  parseGeneralStatus,
  toMonitorState,
} from "../../domain/monitor/pm5/parse.js";
import {
  ADDITIONAL_STATUS_1_UUID,
  GENERAL_STATUS_UUID,
} from "../../domain/monitor/pm5/uuids.js";
import type { MonitorFrame } from "../../domain/monitor/types.js";
import {
  fromHexString,
  parseRecording,
} from "../monitor/transports/recording.js";
import { createSeriesRecorder } from "../monitor/seriesRecorder.js";
import type { Sample, SeriesData } from "../monitor/seriesRecorder.js";
import { buildTrace } from "./traceModel.js";
import TraceChart from "./TraceChart";

// ---------------------------------------------------------------------
// The same readFileSync + real-parser replay idiom `seriesRecorder.test.ts`
// established and `traceModel.test.ts` already reuses — trimmed here to
// this suite's own need: a real, rich `SeriesData` (all three measures
// clear the 3-reading gate on this capture) to exercise the rendered
// component against, not a hand-built minimum (recurring failure #3).
// ---------------------------------------------------------------------

const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(/src\/log\/TraceChart\.test\.tsx$/, "../docs/monitor/sessions/");

function replayFrames(relativePath: string): MonitorFrame[] {
  const text = readFileSync(`${SESSIONS_DIR}${relativePath}`, "utf-8");
  const { events } = parseRecording(text);
  const frames: MonitorFrame[] = [];
  let lastAs1: {
    currentSplit: number;
    spm: number;
    heartRateBpm: number | null;
  } | null = null;

  for (const event of events) {
    if (!("dir" in event) || event.dir !== "rx") continue;

    if (event.char === ADDITIONAL_STATUS_1_UUID) {
      const parsed = parseAdditionalStatus1(fromHexString(event.hex));
      if ("error" in parsed) {
        throw new Error(`0x0032 parse error: ${JSON.stringify(parsed.error)}`);
      }
      lastAs1 = parsed;
      continue;
    }

    if (event.char !== GENERAL_STATUS_UUID) continue;
    const gs = parseGeneralStatus(fromHexString(event.hex));
    if ("error" in gs) {
      throw new Error(`0x0031 parse error: ${JSON.stringify(gs.error)}`);
    }

    frames.push({
      elapsedSeconds: gs.elapsedSeconds,
      distanceMeters: gs.distanceMeters,
      sessionElapsedSeconds: gs.elapsedSeconds,
      sessionDistanceMeters: gs.distanceMeters,
      currentSplit: lastAs1?.currentSplit ?? null,
      spm: lastAs1?.spm ?? null,
      heartRateBpm: lastAs1?.heartRateBpm ?? null,
      rowingActive: gs.rowingState === 1,
      splitAvgPace: null,
      intervalIndex: null,
      intervalRemaining: null,
      intervalAccrued: null,
      state: toMonitorState(gs.workoutState),
    });
  }
  return frames;
}

function seriesFromFrames(frames: MonitorFrame[]): SeriesData {
  const rec = createSeriesRecorder();
  for (const f of frames) rec.onFrame(f);
  const series = rec.snapshot();
  if (!series) throw new Error("replay produced no series");
  return series;
}

function realSeries(): SeriesData {
  return seriesFromFrames(
    replayFrames(
      "walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
    ),
  );
}

function sample(over: Partial<Sample> = {}): Sample {
  return Object.freeze({ t: 0, d: 0, p: 0, spm: 0, ...over }) as Sample;
}

describe("TraceChart — absence (§1's idiom: no chart, no empty frame, no placeholder)", () => {
  it("renders nothing when there is no series at all", () => {
    const { container } = render(<TraceChart series={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the default (pace) measure has fewer than 3 real readings, even though rate/hr on the SAME series would clear the gate on their own", () => {
    const series: SeriesData = {
      samples: [
        sample({ t: 0, p: 120, spm: 20, hr: 100 }),
        sample({ t: 10, p: 0, spm: 22, hr: 105 }), // pace sentinel
        sample({ t: 20, p: 0, spm: 24, hr: 110 }), // pace sentinel
        sample({ t: 30, p: 0, spm: 26, hr: 115 }), // pace sentinel
      ],
    };
    // Ground: rate and hr independently clear the per-measure gate here,
    // pace does not (only 1 real reading) — proves the absence below is
    // driven by the DEFAULT measure specifically, not a blanket "series
    // too short" check.
    expect(buildTrace(series, "rate")).not.toBeNull();
    expect(buildTrace(series, "hr")).not.toBeNull();
    expect(buildTrace(series, "pace")).toBeNull();

    const { container } = render(<TraceChart series={series} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TraceChart — rendering from a REAL capture", () => {
  it("renders the toggle (all three measures clear the gate on step-3), one polyline per pace segment, y-axis tick labels, and the text alternative on the figure", () => {
    const series = realSeries();
    const expectedTrace = buildTrace(series, "pace")!;

    const { container } = render(<TraceChart series={series} />);

    const toggle = screen.getByRole("navigation", { name: "Trace measure" });
    expect(
      within(toggle).getByRole("button", { name: "Pace" }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      within(toggle).getByRole("button", { name: "Stroke rate" }),
    ).toBeInTheDocument();
    expect(
      within(toggle).getByRole("button", { name: "Heart rate" }),
    ).toBeInTheDocument();

    const svg = screen.getByRole("img", { name: expectedTrace.summary });
    expect(svg).toBeInTheDocument();

    expect(container.querySelectorAll("polyline")).toHaveLength(
      expectedTrace.points.length,
    );
    expect(expectedTrace.points.length).toBeGreaterThan(1); // the multi-segment path is exercised

    const tickLabels = container.querySelectorAll(".trace-tick-label");
    expect(tickLabels.length).toBeGreaterThan(0);
    expect(tickLabels).toHaveLength(expectedTrace.ticksY.length);
  });

  it("tapping the Stroke rate toggle switches the drawn trace to rate's own model (different summary, different segment count)", async () => {
    const user = userEvent.setup();
    const series = realSeries();
    const paceTrace = buildTrace(series, "pace")!;
    const rateTrace = buildTrace(series, "rate")!;
    // Ground: the two measures' own models differ on this capture, so a
    // switch is actually observable, not a vacuous no-op click.
    expect(rateTrace.summary).not.toBe(paceTrace.summary);

    const { container } = render(<TraceChart series={series} />);
    expect(
      screen.getByRole("img", { name: paceTrace.summary }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stroke rate" }));

    expect(
      screen.getByRole("img", { name: rateTrace.summary }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: paceTrace.summary }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Stroke rate" })),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stroke rate" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: "Pace" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(container.querySelectorAll("polyline")).toHaveLength(
      rateTrace.points.length,
    );
  });

  it("falls back to pace when the selected measure's own toggle option disappears out from under it (the series prop changes while 'Heart rate' is selected)", async () => {
    const user = userEvent.setup();
    const richSeries = realSeries();

    const { rerender } = render(<TraceChart series={richSeries} />);
    await user.click(screen.getByRole("button", { name: "Heart rate" }));
    expect(screen.getByRole("button", { name: "Heart rate" })).toHaveAttribute(
      "aria-current",
      "true",
    );

    // A new series prop (e.g. the host now shows a different session)
    // whose hr never clears the per-measure gate — the toggle's own
    // internal `measure` state still says "hr" until the user acts again,
    // so the component must fall back to the default rather than reading
    // a now-null trace.
    const sparseHrSeries: SeriesData = {
      samples: [
        sample({ t: 0, p: 120, spm: 20, hr: 100 }),
        sample({ t: 10, p: 118, spm: 21 }),
        sample({ t: 20, p: 116, spm: 22 }),
        sample({ t: 30, p: 114, spm: 23 }),
      ],
    };
    expect(buildTrace(sparseHrSeries, "hr")).toBeNull();
    rerender(<TraceChart series={sparseHrSeries} />);

    expect(
      screen.queryByRole("button", { name: "Heart rate" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pace" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(
      screen.getByRole("img", {
        name: buildTrace(sparseHrSeries, "pace")!.summary,
      }),
    ).toBeInTheDocument();
  });
});

describe("TraceChart — the HR toggle is ABSENT (never present-and-disabled) when hr has fewer than 3 readings", () => {
  it("a series with plenty of real pace but at most 2 hr readings offers no Heart rate button", () => {
    const series: SeriesData = {
      samples: [
        sample({ t: 0, p: 120, spm: 20, hr: 100 }),
        sample({ t: 10, p: 118, spm: 21, hr: 101 }),
        sample({ t: 20, p: 116, spm: 22 }), // no hr key at all
        sample({ t: 30, p: 114, spm: 23 }),
        sample({ t: 40, p: 112, spm: 24 }),
      ],
    };
    expect(buildTrace(series, "pace")).not.toBeNull();
    expect(buildTrace(series, "hr")).toBeNull();

    render(<TraceChart series={series} />);
    expect(
      screen.queryByRole("button", { name: "Heart rate" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pace" })).toBeInTheDocument();
  });
});

describe("TraceChart — §4's cut: no interval boundary marks render, ever (pinned absence)", () => {
  it("a real, multi-segment trace carries no element any boundary-mark feature would plausibly use", () => {
    const { container } = render(<TraceChart series={realSeries()} />);
    // Pinned negative: if a future change adds boundary marks under any
    // of these obvious names, this goes red on purpose (§4's own
    // "asserted as absence so a future re-add is a deliberate act").
    expect(
      container.querySelectorAll(
        '.trace-boundary, [data-boundary], [data-trace-boundary], [class*="boundary"]',
      ),
    ).toHaveLength(0);
    // Only the three kinds of mark this component is meant to draw exist:
    // polylines, tick lines, tick text.
    const allowedTags = new Set([
      "polyline",
      "line",
      "text",
      "g",
      "svg",
      "nav",
      "button",
      "span",
      "figure",
    ]);
    for (const el of Array.from(container.querySelectorAll("svg *"))) {
      expect(allowedTags.has(el.tagName.toLowerCase())).toBe(true);
    }
  });
});

describe("TraceChart — §7.3 the inversion is a COORDINATE fact, not a class check", () => {
  it("pace: a faster real sample renders at a SMALLER SVG y-pixel than a slower one, and a y-axis tick shares the identical (inverted) scale", () => {
    const series = realSeries();
    const trace = buildTrace(series, "pace")!;
    expect(trace.invert).toBe(true);

    const { container } = render(<TraceChart series={series} />);

    // Parse the ACTUAL rendered polylines' pixel coordinates, in document
    // (= drawn) order — not a parallel computation of what the component
    // "should" have done. `decimate()` only reduces a segment once it
    // exceeds ~2x its column budget (552 here); step-3's own 238 real
    // pace readings never cross that, so every real point survives
    // untouched — asserted below, not assumed, so this test cannot
    // silently start comparing the wrong points if that ever changes.
    const renderedPoints = Array.from(
      container.querySelectorAll("polyline"),
    ).flatMap((pl) =>
      (pl.getAttribute("points") ?? "")
        .trim()
        .split(" ")
        .filter(Boolean)
        .map((pair) => {
          const [x, y] = pair.split(",").map(Number);
          return { x: x!, y: y! };
        }),
    );
    const modelPoints = trace.points.flat();
    expect(renderedPoints).toHaveLength(modelPoints.length);

    const zipped = modelPoints.map((m, i) => ({
      modelY: m.y, // seconds/500m — LOWER is FASTER
      pixelY: renderedPoints[i]!.y,
    }));
    const fastest = zipped.reduce((a, b) => (b.modelY < a.modelY ? b : a));
    const slowest = zipped.reduce((a, b) => (b.modelY > a.modelY ? b : a));
    expect(fastest.modelY).toBeLessThan(slowest.modelY); // sanity: real, distinct values

    // THE coordinate assertion §7.3 demands: the faster (lower split)
    // sample renders HIGHER — a SMALLER SVG y-pixel (SVG y grows
    // downward) — never inferred from `trace.invert`'s own boolean.
    expect(fastest.pixelY).toBeLessThan(slowest.pixelY);

    // Fit the affine map (pixelY = a*modelY + b) from these two REAL
    // rendered points, then predict where a y-axis TICK — a DIFFERENT
    // domain value, run through the component's own axis-drawing code
    // path, not its line-drawing one — should land, and check the DOM.
    // If ticks were ever computed off a different (e.g. un-inverted)
    // scale than the line itself, this diverges; today they share one
    // `yScale`, so it must hold.
    const a =
      (slowest.pixelY - fastest.pixelY) / (slowest.modelY - fastest.modelY);
    const b = fastest.pixelY - a * fastest.modelY;

    const tickLabels = Array.from(
      container.querySelectorAll(".trace-tick-label"),
    );
    expect(tickLabels).toHaveLength(trace.ticksY.length);
    expect(trace.ticksY.length).toBeGreaterThan(0);
    const tickValue = trace.ticksY[0]!;
    const expectedTickY = a * tickValue + b;
    const actualTickY = Number(tickLabels[0]!.getAttribute("y"));
    expect(actualTickY).toBeCloseTo(expectedTickY, 0);
  });
});
