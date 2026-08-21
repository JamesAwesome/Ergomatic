import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MonitorFrame } from "../../domain/monitor/types.js";
import type { WorkoutProgram } from "../../domain/monitor/program.js";
import { parseRecording } from "../monitor/transports/recording.js";
import { createReplayTransport } from "../monitor/transports/replay.js";
import { createPm5Driver } from "../monitor/driver.js";
import { createEventLog } from "../monitor/eventLog.js";
import { createSeriesRecorder } from "../monitor/seriesRecorder.js";
import type { Sample, SeriesData } from "../monitor/seriesRecorder.js";
import { buildTrace } from "./traceModel.js";
import TraceChart from "./TraceChart";

// ---------------------------------------------------------------------
// Trace-truth Task 1's real-driver harness (`seriesRecorder.test.ts`'s own
// `loadCaptureFrames` — re-derived here per this project's own "each test
// file owns its own copy" convention), not a hand-rolled parse: this
// recorder keys on `MonitorFrame.intervalIndex`, which only the real
// driver computes. Trimmed here to this suite's own need: a real, rich
// `SeriesData` (all three measures clear the 3-reading gate on this
// capture) to exercise the rendered component against, not a hand-built
// minimum (recurring failure #3).
// ---------------------------------------------------------------------

const REPO_ROOT = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(/app\/src\/log\/TraceChart\.test\.tsx$/, "");

async function loadCaptureFrames(
  repoRelativePath: string,
  programOverride?: WorkoutProgram,
): Promise<MonitorFrame[]> {
  const text = readFileSync(`${REPO_ROOT}${repoRelativePath}`, "utf-8");
  const parsed = parseRecording(text);
  const program = programOverride ?? parsed.header.program;
  if (!program) {
    throw new Error(
      `loadCaptureFrames: ${repoRelativePath} carries no header.program and no programOverride was given`,
    );
  }

  const replay = createReplayTransport(parsed);
  const [dev] = await replay.transport.scan();
  await replay.transport.connect(dev.id);

  const log = createEventLog();
  const driver = createPm5Driver(replay.transport, log, {
    deviceName: dev.name,
    now: () => replay.clock.now(),
    schedule: (cb, ms) => replay.clock.schedule(cb, ms),
  });

  const frames: MonitorFrame[] = [];
  driver.events((e) => {
    if (e.kind === "frame") frames.push(e.frame);
  });

  const programPending = driver.program(program);
  await replay.run();
  await programPending;

  return frames;
}

function seriesFromFrames(frames: MonitorFrame[]): SeriesData {
  const rec = createSeriesRecorder();
  for (const f of frames) rec.onFrame(f);
  const series = rec.snapshot();
  if (!series) throw new Error("replay produced no series");
  return series;
}

async function realSeries(): Promise<SeriesData> {
  return seriesFromFrames(
    await loadCaptureFrames(
      "docs/monitor/sessions/walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
    ),
  );
}

/** `seriesRecorder.test.ts`'s own `SESSION_2_PROGRAM` (walk-2026-08-16,
 *  hand-transcribed — no `header.program` on this recording). Duplicated
 *  per this file's own "each test file owns its own copy" convention. */
const SESSION_2_PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "warmup",
      kind: "distance",
      value: 100,
      targetSplit: null,
      displaySpm: null,
      restSeconds: 0,
    },
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 30,
    },
    {
      type: "work",
      kind: "time",
      value: 120,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 30,
    },
    {
      type: "work",
      kind: "distance",
      value: 500,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 30,
    },
    {
      type: "work",
      kind: "time",
      value: 60,
      targetSplit: 129,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

/** trace-truth Task 2's own real-rest fixture (brief's own instruction:
 *  step-3's OWN MID-WORKOUT rest is FROZEN — the wire's `elapsedSeconds`
 *  never advances there, so THAT rest alone produces ZERO samples and
 *  can't exercise rest MARKING on its own — session-2's rests still
 *  advance throughout). NOT "step-3 never marks a rest at all": its
 *  capture happens to END mid-rest, a TRAILING state with no following
 *  interval to freeze it, so step-3 independently carries 3 rest
 *  samples of its own (see the "Not step-3" comment on the rest-free
 *  negative case below, in this same file) — `d`/`t` keep advancing
 *  across all 3 (8027 -> 8051 -> 8072 decimetres), proof this trailing
 *  window is genuinely non-frozen, not just a repeated final reading;
 *  only `p`/`spm`/`hr` happen to hold flat. Still not enough (3, one
 *  short contiguous run) to be this fixture's own primary positive
 *  case — session-2 gives multiple separate runs and 21 total. */
async function realSeriesWithRest(): Promise<SeriesData> {
  return seriesFromFrames(
    await loadCaptureFrames(
      "docs/monitor/sessions/walk-2026-08-16/session-2-wu-4unequal.jsonl",
      SESSION_2_PROGRAM,
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
  it("renders the toggle (all three measures clear the gate on step-3), one polyline per pace segment, y-axis tick labels, and the text alternative on the figure", async () => {
    const series = await realSeries();
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

    // `.trace-tick-label-y` (trace-truth Task 3): the y-axis's own
    // modifier class, needed now that `.trace-tick-label` alone matches
    // BOTH axes' labels.
    const tickLabels = container.querySelectorAll(".trace-tick-label-y");
    expect(tickLabels.length).toBeGreaterThan(0);
    expect(tickLabels).toHaveLength(expectedTrace.ticksY.length);
  });

  // trace-truth Task 3 (spec §4), task brief Step 4: the chart's own
  // x-axis, spanning the trace's own duration.
  it("renders x-axis tick labels spanning the trace's own duration", async () => {
    const series = await realSeries();
    render(<TraceChart series={series} />);
    const labels = screen.getAllByTestId("trace-x-tick");
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(labels.at(0)).toHaveTextContent("0:00");
    expect(labels.at(-1)!.textContent).toMatch(/^\d+:\d\d$/);
  });

  it("tapping the Stroke rate toggle switches the drawn trace to rate's own model (different summary, different segment count)", async () => {
    const user = userEvent.setup();
    const series = await realSeries();
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
    const richSeries = await realSeries();

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
  it("a real, multi-segment trace carries no element any boundary-mark feature would plausibly use", async () => {
    const { container } = render(<TraceChart series={await realSeries()} />);
    // Pinned negative: if a future change adds boundary marks under any
    // of these obvious names, this goes red on purpose (§4's own
    // "asserted as absence so a future re-add is a deliberate act").
    expect(
      container.querySelectorAll(
        '.trace-boundary, [data-boundary], [data-trace-boundary], [class*="boundary"]',
      ),
    ).toHaveLength(0);
    // Only the kinds of mark this component is meant to draw exist:
    // polylines, tick lines, tick text, and (trace-truth Task 2, §3) a
    // rest-span `rect` — a REST mark, not the interval-BOUNDARY mark §4
    // cuts; the negative selector above already pins that no element
    // carries `.trace-boundary`/`[data-boundary]`/a `"boundary"`
    // class-name substring, which a rest `rect` (`.trace-rest-band`)
    // never does. `defs`/`clippath` (2026-08-20) are the plot's own clip
    // mechanism, not a boundary mark either.
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
      "rect",
      "defs",
      "clippath",
    ]);
    for (const el of Array.from(container.querySelectorAll("svg *"))) {
      expect(allowedTags.has(el.tagName.toLowerCase())).toBe(true);
    }
  });
});

describe("TraceChart — §7.3 the inversion is a COORDINATE fact, not a class check", () => {
  it("pace: a faster real sample renders at a SMALLER SVG y-pixel than a slower one, and a y-axis tick shares the identical (inverted) scale", async () => {
    const series = await realSeries();
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

    // `.trace-tick-label-y` (trace-truth Task 3): y-axis labels only —
    // `.trace-tick-label` alone now also matches the x-axis's own labels.
    const tickLabels = Array.from(
      container.querySelectorAll(".trace-tick-label-y"),
    );
    expect(tickLabels).toHaveLength(trace.ticksY.length);
    expect(trace.ticksY.length).toBeGreaterThan(0);
    const tickValue = trace.ticksY[0]!;
    const expectedTickY = a * tickValue + b;
    const actualTickY = Number(tickLabels[0]!.getAttribute("y"));
    expect(actualTickY).toBeCloseTo(expectedTickY, 0);
  });
});

describe("TraceChart — trace-truth Task 2: rests are drawn, but marked (§3), real non-frozen rest capture", () => {
  it("renders a rest band for every contiguous rest run, and the polyline stays ONE segment per the model's own segment count (unbroken across the rest)", async () => {
    const series = await realSeriesWithRest();
    const trace = buildTrace(series, "pace")!;
    const restedCount = trace.points.flat().filter((p) => p.rest).length;
    expect(restedCount).toBeGreaterThan(0); // the fixture really does carry rest points

    const { container } = render(<TraceChart series={series} />);

    const bands = container.querySelectorAll(".trace-rest-band");
    expect(bands.length).toBeGreaterThan(0);

    // The polyline count is decided ENTIRELY by the model's own segment
    // count (`GAP_BREAK_SECONDS`, never rest) — proven directly against
    // `traceModel.ts`'s own output, not assumed to be 1: this real
    // capture's pace trace happens to carry a real (non-rest) gap
    // elsewhere, and rest marking must not add to that count.
    expect(container.querySelectorAll("polyline")).toHaveLength(
      trace.points.length,
    );
  });

  it("every rest band's rect sits fully within the plot area (never off-canvas from the ±0.5s padding at a series edge)", async () => {
    const series = await realSeriesWithRest();
    const { container } = render(<TraceChart series={series} />);
    const bands = Array.from(container.querySelectorAll(".trace-rest-band"));
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) {
      const x = Number(band.getAttribute("x"));
      const width = Number(band.getAttribute("width"));
      expect(width).toBeGreaterThanOrEqual(0);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(320); // CHART_WIDTH
    }
  });

  // F-1 (James's ruling, review round 2; SUPERSEDED trace-truth Task 3):
  // round 1 shipped a full-height in-plot fill that read as "something is
  // blocking the data"; round 2's fix was a SHORT bar at the plot's own
  // foot, but still INSIDE the plot's own y-range — the crossing round 2
  // fixed VISUALLY stayed geometrically possible, "in practice" prevented
  // only by `domainY`'s own padding. Task 3 moves the band into the new
  // axis gutter entirely, below the plot floor, so this test now pins the
  // STRUCTURAL guarantee brief item 4 asks for: not merely that the band
  // clears THIS capture's own lowest excursion, but that it is
  // GEOMETRICALLY IMPOSSIBLE for it to ever share a y-coordinate with
  // anything the plot draws, on any data. `PLOT_BOTTOM`/`TOP_PAD` are not
  // exported from `TraceChart.tsx`, so this duplicates their values (same
  // "each test file owns its own copy" convention this file's own program
  // constants already use) rather than importing internals.
  it("F-1: the rest band moved into the axis gutter — never overlaps the plot's own data space", async () => {
    const TOP_PAD = 10;
    const PLOT_BOTTOM = 130; // PLOT_AREA_HEIGHT(140) - BOTTOM_PAD(10)

    const series = await realSeriesWithRest();
    const { container } = render(<TraceChart series={series} />);
    const bands = Array.from(container.querySelectorAll(".trace-rest-band"));
    expect(bands.length).toBeGreaterThan(0);
    for (const band of bands) {
      const y = Number(band.getAttribute("y"));
      const height = Number(band.getAttribute("height"));
      // Flush against the plot floor, hanging DOWN — never above it. The
      // plot's own y-range is `[TOP_PAD, PLOT_BOTTOM)`; every rendered
      // polyline/tick pixel lands inside that range (`yScale`'s own
      // range tops out at `PLOT_BOTTOM`), so a band whose OWN top edge is
      // `>= PLOT_BOTTOM` can never collide with one, on ANY data — not
      // just this capture's.
      expect(y).toBeCloseTo(PLOT_BOTTOM, 5);
      expect(y).toBeGreaterThanOrEqual(PLOT_BOTTOM);
      // SHORT, and well clear of the plot's own height (120) — round 1's
      // regression would have read close to that.
      expect(height).toBeLessThan(PLOT_BOTTOM - TOP_PAD);
      expect(height).toBeGreaterThan(0);
    }
  });

  // Not step-3: that capture's OWN mid-workout rest is frozen (zero
  // samples there, task-2-brief's own reasoning) but the recorder marks
  // `r: true` on ANY sample whose winning frame reads `state ===
  // "resting"` regardless of WHICH rest produced it — step-3's capture
  // happens to END while the machine is still resting after its final
  // interval (a trailing, non-frozen state with no next interval to
  // reset into), so it actually carries 3 real rest samples of its own.
  // A genuinely rest-free case needs a hand-built series instead, the
  // same convention this file's own "absence" describe block above
  // already uses for its negative cases.
  it("a series with no r-marked sample anywhere renders no rest band at all", () => {
    const series: SeriesData = {
      samples: [
        sample({ t: 0, p: 120, spm: 20 }),
        sample({ t: 10, p: 118, spm: 20 }),
        sample({ t: 20, p: 116, spm: 20 }),
      ],
    };
    expect(
      buildTrace(series, "pace")!
        .points.flat()
        .some((p) => p.rest),
    ).toBe(false);

    const { container } = render(<TraceChart series={series} />);
    expect(container.querySelectorAll(".trace-rest-band")).toHaveLength(0);
    // F-2 (review round 2): the legend is additive, never a permanent
    // fixture — nothing to explain on a rest-free trace.
    expect(container.querySelector(".trace-legend")).toBeNull();
  });

  // F-2 (James's ruling, review round 2): a quiet key explaining the
  // band — spec §3 forbids copy claiming the rest PACE is meaningful;
  // it says nothing about naming what the mark itself is, same idiom
  // as `PostWorkoutSummary.tsx`'s own `.summary-legend`. "BAND = REST"
  // (review round 4, C1): "SHADED = REST" named the round-1 treatment
  // (a full-height tint) that round 2 replaced with a short bar — the
  // word never moved with the geometry. No colour word either (`#97692a`
  // reads differently to different eyes/PR bodies; "band" stays true
  // regardless).
  it("F-2: a rest-bearing trace renders a legend naming the band, absent on a rest-free one", async () => {
    const restSeries = await realSeriesWithRest();
    const { container: withRest } = render(<TraceChart series={restSeries} />);
    const legend = withRest.querySelector(".trace-legend");
    expect(legend).not.toBeNull();
    expect(legend!.textContent).toBe("BAND = REST");
    // Never claims anything about the rest's own pace value (§3), and
    // never names a colour (round 4, C1).
    expect(legend!.textContent!.toLowerCase()).not.toMatch(
      /pace|split|amber|bronze|gold|orange|brown/,
    );
  });
});

describe("TraceChart — 2026-08-20: domainY no longer includes rest, so the plot clips excursions", () => {
  const TOP_PAD = 10;
  const PLOT_BOTTOM = 130; // PLOT_AREA_HEIGHT(140) - BOTTOM_PAD(10)

  it("a rest excursion's own pixel renders OUTSIDE the plot rect's own y-range (proof domainY did not stretch to absorb it), and the polylines are wrapped in a real SVG clip-path scoped to the plot rect", async () => {
    const series: SeriesData = {
      samples: [
        sample({ t: 0, p: 1180, spm: 20 }),
        sample({ t: 1, p: 1190, spm: 20 }),
        sample({ t: 2, p: 1185, spm: 20 }),
        sample({ t: 3, p: 3600, spm: 16, r: true }), // ~6:00/500m rest excursion
        sample({ t: 4, p: 1180, spm: 20 }),
      ],
    };

    const { container } = render(<TraceChart series={series} />);

    const points = Array.from(container.querySelectorAll("polyline")).flatMap(
      (pl) =>
        (pl.getAttribute("points") ?? "")
          .trim()
          .split(" ")
          .filter(Boolean)
          .map((pair) => {
            const [x, y] = pair.split(",").map(Number);
            return { x: x!, y: y! };
          }),
    );
    // If the rest excursion had counted toward domainY (the bug), every
    // point would land inside [TOP_PAD, PLOT_BOTTOM) by construction of
    // a linear scale over its own domain. It doesn't: at least one
    // rendered pixel — the rest sample's — falls outside that range.
    expect(points.some((p) => p.y < TOP_PAD || p.y > PLOT_BOTTOM)).toBe(true);

    // The clip mechanism containing that overflow visually: a real
    // clipPath/rect scoped to the plot rect, referenced by the group
    // wrapping the polylines — never "the SVG viewBox clips" (that would
    // also cut off the axis labels/rest band, which must stay visible).
    const clipRect = container.querySelector("clipPath rect");
    expect(clipRect).not.toBeNull();
    expect(Number(clipRect!.getAttribute("y"))).toBeCloseTo(TOP_PAD, 5);
    expect(Number(clipRect!.getAttribute("height"))).toBeCloseTo(
      PLOT_BOTTOM - TOP_PAD,
      5,
    );

    const clippedGroup = container.querySelector("[clip-path]");
    expect(clippedGroup).not.toBeNull();
    expect(clippedGroup!.tagName.toLowerCase()).toBe("g");
    expect(clippedGroup!.querySelector("polyline")).not.toBeNull();
    // The clip-path attribute references the SAME clipPath element by
    // id, not merely two unrelated elements that happen to both exist.
    const clipPathEl = container.querySelector("clipPath")!;
    expect(clippedGroup!.getAttribute("clip-path")).toBe(
      `url(#${clipPathEl.id})`,
    );
  });

  it("a rest-free trace's clip rect never clips anything real: every rendered polyline pixel already sits inside it", async () => {
    const series = await realSeries();
    const { container } = render(<TraceChart series={series} />);
    const clipRect = container.querySelector("clipPath rect")!;
    const clipTop = Number(clipRect.getAttribute("y"));
    const clipBottom = clipTop + Number(clipRect.getAttribute("height"));

    const points = Array.from(container.querySelectorAll("polyline")).flatMap(
      (pl) =>
        (pl.getAttribute("points") ?? "")
          .trim()
          .split(" ")
          .filter(Boolean)
          .map((pair) => Number(pair.split(",")[1])),
    );
    expect(points.length).toBeGreaterThan(0);
    for (const y of points) {
      expect(y).toBeGreaterThanOrEqual(clipTop);
      expect(y).toBeLessThanOrEqual(clipBottom);
    }
  });
});
