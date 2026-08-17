// PaneLive rebuilt (CR2 spec 3, connected redesign, Task 4). CREATED this
// task (antagonist correction 1): PaneLive's PRE-redesign assertions lived
// in `ConnectedSurface.test.tsx` (1619 lines) — that file's surgery
// migrates/updates them; this file is the tables' own checklist, testing
// PaneLive directly off a real `SurfaceModel` rather than through the whole
// shell (`ConnectedSurface`'s own tests already cover the shell wiring).
//
// Every fixture is "Filling Low" from the seeded 300 (8:00 warm-up, then
// 4 x 2000 m with 3:00 rest), never a hand-built minimum — the same
// realistic fixture `ConnectedSurface.test.tsx`/`surfaceModel.test.ts` use.
//
// jsdom loads no stylesheet for this project (every prior connected test
// file's own comment on this): the landscape/portrait CSS toggle on the
// band's own `then` word, `UP NEXT` label, and (queue item 7) `NEXT · `
// prefix is proved in the browser (`e2e/screenshots.spec.ts`'s own
// `innerText` reads, real CSS applied).
// This file proves the STRING and the DOM SHAPE are built correctly — both
// forms coexist in one markup, exactly `UpNextStrip.test.tsx`'s own
// precedent for the identical mechanism.

import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  compileProgram,
  type WorkoutProgram,
} from "../../../domain/monitor/program.js";
import type { MonitorFrame } from "../../../domain/monitor/types.js";
import type { Baselines, WorkoutType } from "../../../domain/types.js";
import { LIBRARY_WORKOUTS } from "../../../server/seed/library/index";
import {
  commentStrippedSource,
  type CssRule,
  cssRules,
} from "../../test/cssView";
import { buildDraft } from "../../session/draft";
import { buildRun, type EnginePhase } from "../../session/engine";
import PaneLive from "./PaneLive";
import { buildSurfaceModel, type SurfaceStatus } from "./surfaceModel";

const baselines: Baselines = { k2Seconds: 112, k6Seconds: 122 };
const t0 = new Date("2026-08-07T09:00:00.000Z");
const DEVICE = "PM5 432331249";

function fillingLow(): { program: WorkoutProgram; phases: EnginePhase[] } {
  const w = LIBRARY_WORKOUTS.find((s) => s.title === "Filling Low");
  if (!w) throw new Error("missing library fixture: Filling Low");
  const draft = buildDraft({
    id: "filling-low",
    title: w.title,
    type: w.type as WorkoutType,
    steps: w.steps,
  });
  const phases = buildRun(draft, baselines, t0, {
    kind: "time",
    minutes: 8,
  }).phases;
  const program = compileProgram(phases);
  if ("code" in program) {
    throw new Error(`fixture failed to compile: ${program.code}`);
  }
  return { program, phases };
}

const FIXTURE = fillingLow();

/** Interval 1 is the first 2000 m work interval (interval 0 is the
 *  warm-up) — the same convention `ConnectedSurface.test.tsx`'s own
 *  `frame()` factory uses. */
function frame(overrides: Partial<MonitorFrame> = {}): MonitorFrame {
  const f: MonitorFrame = {
    elapsedSeconds: 600,
    distanceMeters: 2400,
    sessionElapsedSeconds: 600,
    sessionDistanceMeters: 2400,
    currentSplit: 117.8,
    spm: 21,
    heartRateBpm: 164,
    intervalIndex: 1,
    intervalRemaining: { kind: "distance", value: 1200 },
    intervalAccrued: null,
    state: "rowing",
    rowingActive: true,
    ...overrides,
  };
  return {
    ...f,
    sessionElapsedSeconds: overrides.sessionElapsedSeconds ?? f.elapsedSeconds,
    sessionDistanceMeters: overrides.sessionDistanceMeters ?? f.distanceMeters,
  };
}

function renderPane(
  status: SurfaceStatus,
  frameOverrides: Partial<MonitorFrame> = {},
) {
  const model = buildSurfaceModel({
    phases: FIXTURE.phases,
    program: FIXTURE.program,
    status,
    frame: frame(frameOverrides),
    deviceName: DEVICE,
    actuals: [],
  });
  return { ...render(<PaneLive model={model} />), model };
}

/** `index.css`'s path on disk, the same `import.meta.url` path-surgery
 *  idiom `ConnectedSurface.test.tsx` uses (one directory deeper here). */
function indexCssPath(): string {
  return import.meta.url
    .replace(/^file:\/\//, "")
    .replace(/workout\/connected\/[^/]+\.test\.tsx$/, "index.css");
}

const INDEX_CSS = commentStrippedSource(readFileSync(indexCssPath(), "utf-8"));

function rulesFor(selector: string): CssRule[] {
  return cssRules(INDEX_CSS).filter((rule) =>
    rule.selectors.includes(selector),
  );
}

function ruleBody(selector: string): string {
  const rules = rulesFor(selector);
  expect(rules, `expected exactly one rule for ${selector}`).toHaveLength(1);
  return rules[0]!.body;
}

/** `PaneLive.tsx`'s own source, raw — the same "never imports" pin this
 *  task's binding preamble names as a global constraint, scoped to THIS
 *  file (the whole-branch exit criterion sweeping every `connected/` file
 *  is a later task's, per the design spec's own §6 item 2). */
function paneLiveSourcePath(): string {
  return import.meta.url
    .replace(/^file:\/\//, "")
    .replace(/\.test\.tsx$/, ".tsx");
}

const PANE_LIVE_SOURCE = readFileSync(paneLiveSourcePath(), "utf-8");

// ---------------------------------------------------------------------------
// §2A/§2C: cut from LIVE
// ---------------------------------------------------------------------------

describe("cut from LIVE (design spec §2A/§2C)", () => {
  it("no NOW or TARGET label anywhere on a live piece", () => {
    renderPane("live");
    expect(screen.queryByText("NOW")).toBeNull();
    expect(screen.queryByText("TARGET")).toBeNull();
    expect(document.querySelector(".connected-hero-target-label")).toBeNull();
  });

  it("no /500m unit beside the split numeral", () => {
    renderPane("live");
    expect(screen.queryByText("/500m")).toBeNull();
    expect(document.querySelector(".connected-hero-unit")).toBeNull();
    expect(document.querySelector(".connected-hero-reading")).toBeNull();
  });

  it("no LEFT IN INTERVAL, METERS LEFT, TOTAL M or HR cell — the metric row is gone entirely", () => {
    renderPane("live", {
      intervalRemaining: { kind: "distance", value: 1200 },
    });
    expect(screen.queryByText("LEFT IN INTERVAL")).toBeNull();
    expect(screen.queryByText("METERS LEFT")).toBeNull();
    expect(screen.queryByText("TOTAL M")).toBeNull();
    expect(screen.queryByText("HR", { exact: true })).toBeNull();
    expect(document.querySelector(".connected-metric-row")).toBeNull();
    expect(document.querySelector(".connected-metric-cell")).toBeNull();
  });

  it("the progress bar is present; TimerRuler/UpNextStrip's own classes are not", () => {
    renderPane("live");
    expect(document.querySelector(".connected-progress")).not.toBeNull();
    expect(document.querySelector(".timer-total")).toBeNull();
    expect(document.querySelector(".timer-total-bar")).toBeNull();
    expect(document.querySelector(".timer-upnext")).toBeNull();
  });

  it("PaneLive.tsx's own source imports neither TimerRuler nor UpNextStrip", () => {
    expect(PANE_LIVE_SOURCE).not.toMatch(
      /from ["']\.\.\/\.\.\/session\/TimerRuler/,
    );
    expect(PANE_LIVE_SOURCE).not.toMatch(
      /from ["']\.\.\/\.\.\/components\/UpNextStrip/,
    );
  });
});

// ---------------------------------------------------------------------------
// §2A/§2C: targets keep value + tag/unit, lose the word TARGET
// ---------------------------------------------------------------------------

describe("targets: value + tag/unit, no TARGET word (design spec §2A/§2C)", () => {
  it("the split hero keeps its target VALUE and its source tag", () => {
    // Interval 1 is a real 6K-ref work piece (the fixture's own shape,
    // `surfaceModel.test.ts`'s own comment on why Filling Low was chosen).
    renderPane("live", { intervalIndex: 1 });
    const target = document.querySelector(".connected-hero-target-value")!;
    expect(target.textContent).not.toBe("");
    const ref = document.querySelector(".connected-hero-target-ref")!;
    expect(ref.textContent).not.toBe("");
  });

  it("the rate hero keeps its target VALUE and the word SPM, never TARGET", () => {
    renderPane("live", { intervalIndex: 1 });
    const rateHero = document.querySelector(".connected-hero-rate")!;
    const target = rateHero.querySelector(".connected-hero-target-value")!;
    expect(target.textContent).not.toBe("");
    const unit = rateHero.querySelector(".connected-hero-rate-unit")!;
    expect(unit.textContent).toBe("SPM");
  });

  it("index.css: both targets read var(--c-size-target); the tag/unit read var(--c-size-label)/18px", () => {
    expect(ruleBody(".connected-hero-target-value")).toContain(
      "var(--c-size-target)",
    );
    expect(ruleBody(".connected-hero-target-ref")).toContain(
      "var(--c-size-label)",
    );
    expect(ruleBody(".connected-hero-rate-unit")).toContain("18px");
  });

  it("index.css: the two heroes read DIFFERENT hero tokens, never the shared phone-timer --size-* family", () => {
    expect(ruleBody(".connected-hero-split .connected-hero-value")).toContain(
      "var(--c-size-hero)",
    );
    expect(ruleBody(".connected-hero-rate .connected-hero-value")).toContain(
      "var(--c-size-hero-2)",
    );
    const shared = ruleBody(".connected-hero-value");
    expect(shared).not.toMatch(/font-size\s*:/);
    expect(shared).not.toContain("var(--size-hero)");
  });
});

// ---------------------------------------------------------------------------
// §2A/§2C/§3: the band — up-next + TOTAL LEFT
// ---------------------------------------------------------------------------

describe("the band: up-next + TOTAL LEFT (design spec §2A/§2C/§3)", () => {
  it("mid-session: the up-next value carries BOTH the then-less prefix and the then span, one builder for both orientations", () => {
    const { model } = renderPane("live", { intervalIndex: 1 });
    expect(model.thenNext).not.toBeNull();
    const band = document.querySelector(".connected-band")!;
    expect(band.className).toBe("connected-band");
    const upnext = band.querySelector(".connected-band-upnext")!;
    const label = upnext.querySelector(".connected-band-upnext-label")!;
    expect(label.textContent).toBe("UP NEXT");
    const value = upnext.querySelector(".connected-band-upnext-value")!;
    // Landscape's full string (CSS shows the then span AND the NEXT ·
    // prefix span there) — mirrors `UpNextStrip.test.tsx`'s own node-walk
    // proof rather than a subtraction (test-integrity sweep, P13's own
    // reasoning: a subtraction cannot tell "hides the word" from "hides a
    // differently worded span"). jsdom loads no stylesheet (this file's
    // own header comment), so `textContent` reads BOTH orientations'
    // spans regardless of which CSS query would hide them in a real
    // browser — the queue item 7 prefix is proved the identical way the
    // `-then` word already is.
    expect(value.textContent).toBe(
      `NEXT · ${model.upNext} · then ${model.thenNext}`,
    );
    const next = value.querySelector(".connected-band-upnext-next")!;
    expect(next.textContent).toBe("NEXT · ");
    const then = value.querySelector(".connected-band-upnext-then")!;
    expect(then.textContent).toBe("then ");
    expect(
      [...value.childNodes].map((n) => [n.nodeName, n.textContent]),
    ).toStrictEqual([
      ["SPAN", "NEXT · "],
      ["#text", model.upNext],
      ["#text", " · "],
      ["SPAN", "then "],
      ["#text", model.thenNext],
    ]);
  });

  it("past the last phase: no then span, no separator (queue item 7: the NEXT · prefix span is still there — jsdom cannot tell it apart from landscape's shown/portrait's hidden CSS, e2e proves the visible difference)", () => {
    // Filling Low's own trailing rest (after the 4th and final 2000 m rep)
    // IS the last `EnginePhase` in the array — `phaseIndexForInterval`
    // resolves the machine's own `resting: true` there to exactly that
    // phase, so `phases[phaseIndex + 1]` is `undefined` and
    // `thenNextTextAt`'s own "null past the last phase" contract fires —
    // the same one `UpNextStrip`'s null-thenNext test pins for the phone
    // timer. (Interval 4 while ROWING still has this trailing rest AHEAD
    // of it, so `thenNext` there is `"FINISH"`, not `null` — the rest
    // phase itself is what has nothing after it.)
    //
    // Queue item 7 note: pre-item-7, this test's own title claimed the
    // portrait and landscape STRINGS were identical here — true then (the
    // `-then` word was the only orientation-differing content, and it is
    // absent whenever `thenNext` is null). It is no longer true of the
    // real, CSS-applied browser: landscape now ALSO shows "NEXT · " ahead
    // of this value, so "NEXT · FINISH" (landscape) and "FINISH"
    // (portrait) differ. This file cannot prove that difference at all
    // (jsdom loads no stylesheet, this file's own header comment) — it
    // only proves the DOM shape carries exactly one `-next` span
    // regardless of `thenNext`; `e2e/screenshots.spec.ts`'s own
    // `innerText` reads are what prove the two orientations actually
    // differ.
    const { model } = renderPane("live", {
      intervalIndex: 4,
      state: "resting",
    });
    expect(model.thenNext).toBeNull();
    const value = document.querySelector(".connected-band-upnext-value")!;
    expect(value.textContent).toBe(`NEXT · ${model.upNext}`);
    expect(value.querySelector(".connected-band-upnext-then")).toBeNull();
  });

  it("TOTAL LEFT reads totalLeftDisplay, in a labelled cell named connected-band-cell", () => {
    const { model } = renderPane("live");
    const cell = document.querySelector(".connected-band-cell")!;
    expect(
      within(cell as HTMLElement).getByText("TOTAL LEFT"),
    ).toBeInTheDocument();
    const value = cell.querySelector(".connected-band-cell-value")!;
    expect(value.textContent).toBe(model.totalLeftDisplay);
  });
});

// ---------------------------------------------------------------------------
// Stale table: LAST above each hero, the ONLY hero label left
// ---------------------------------------------------------------------------

describe("stale: LAST above each hero, values grey (design spec Stale table)", () => {
  it("both heroes carry a LAST caption and the stale judgement class", () => {
    renderPane("stale");
    const labels = document.querySelectorAll(".connected-hero-label");
    expect(labels).toHaveLength(2);
    for (const label of labels) expect(label.textContent).toBe("LAST");
    const split = document.querySelector(
      ".connected-hero-split .connected-hero-value",
    )!;
    const rate = document.querySelector(
      ".connected-hero-rate .connected-hero-value",
    )!;
    expect(split.className).toContain("timer-card-actual-stale");
    expect(rate.className).toContain("timer-card-actual-stale");
  });

  it("index.css: the LAST label reads var(--c-size-label), 0.10em, ink-3 — the only hero label role left", () => {
    const body = ruleBody(".connected-hero-label");
    expect(body).toContain("var(--c-size-label)");
    expect(body).toContain("letter-spacing: 0.1em");
    expect(body).toContain("var(--ink-3)");
  });
});

// ---------------------------------------------------------------------------
// Armed frame (§2D): ghost split, plain 0 rate, no dash-bars
// ---------------------------------------------------------------------------

describe("armed (design spec §2D): ghost split, plain 0 rate, nothing judged", () => {
  // `intervalIndex: 1` — a real 2000 m work interval with a resolved split
  // target — not the warm-up (`intervalIndex: 0`, Filling Low's own shape):
  // the warm-up carries NO split target at all, so `armedMirror`'s own
  // preview would have nothing to show and the hero would dash regardless
  // of the ghost class — the same combination `surfaceModel.test.ts`'s own
  // "READY … armed on a numbered interval" test already exercises, for the
  // identical reason (a real preview needs a real target to preview).
  function renderArmed() {
    return renderPane("armed", {
      state: "armed",
      intervalIndex: 1,
      rowingActive: false,
      distanceMeters: 0,
      elapsedSeconds: 0,
      sessionElapsedSeconds: 0,
    });
  }

  it("the split hero previews the TARGET value, ghosted ink-4 — never ink-5, never a dash", () => {
    const { model } = renderArmed();
    const split = document.querySelector(
      ".connected-hero-split .connected-hero-value",
    )!;
    expect(split.className).toContain("connected-hero-ghost");
    // Nothing judged: the armed mirror forces the judging target null, so
    // this is the same "-within" class an ordinary unjudged reading wears
    // — the ghost class is what distinguishes a PREVIEW from that.
    expect(split.className).toContain("timer-card-actual-within");
    expect(split.className).not.toContain("connected-value-absent");
    expect(split.textContent).not.toBe("—");
    // Display consistency only: the composed display equals its own
    // whole+tenths split (a render-seam identity, NOT proof the preview
    // matches the phase target — that proof lives in surfaceModel.test.ts'
    // armed-mirror cases, which assert against the fixture's target).
    expect(model.pace.display).toBe(model.paceWhole + model.paceTenths);
  });

  it("the rate hero shows plain 0, never ghosted", () => {
    renderArmed();
    const rate = document.querySelector(
      ".connected-hero-rate .connected-hero-value",
    )!;
    expect(rate.textContent).toBe("0");
    expect(rate.className).not.toContain("connected-hero-ghost");
    expect(rate.className).toContain("timer-card-actual-within");
  });

  it("no hero label at armed — READY lives on the header, not this pane", () => {
    renderArmed();
    expect(document.querySelector(".connected-hero-label")).toBeNull();
    expect(screen.queryByText("READY")).toBeNull();
  });

  it("index.css: the ghost class is ink-4, never ink-5", () => {
    const body = ruleBody(".connected-hero-ghost");
    expect(body).toContain("var(--ink-4)");
    expect(body).not.toContain("--ink-5");
  });
});

// ---------------------------------------------------------------------------
// Landscape split (§2A) — the pinned flex ratio and the divider
// ---------------------------------------------------------------------------

describe("index.css: the landscape two-column split (design spec §2A)", () => {
  it("flex 1.25/0.75, a 1px --rule divider", () => {
    const rules = cssRules(INDEX_CSS);
    const landscape = rules.filter((r) =>
      r.at.some((q) => q.includes("orientation: landscape")),
    );
    const splitFlex = landscape.find((r) =>
      r.selectors.includes(".connected-pane-live .connected-hero-split"),
    );
    const rateFlex = landscape.find((r) =>
      r.selectors.includes(".connected-pane-live .connected-hero-rate"),
    );
    expect(splitFlex?.body).toContain("flex: 1.25");
    expect(rateFlex?.body).toContain("flex: 0.75");
    const divider = ruleBody(".connected-hero-divider");
    expect(divider).toContain("display: none");
    const landscapeDivider = landscape.find((r) =>
      r.selectors.includes(".connected-pane-live .connected-hero-divider"),
    );
    expect(landscapeDivider?.body).toContain("var(--rule)");
  });
});

// ---------------------------------------------------------------------------
// Disconnected step-down (design spec §2's own table): two rules, not one
// ---------------------------------------------------------------------------

describe("index.css: the disconnected step-down splits into two rules (design spec §2)", () => {
  it("portrait: split 100->76, rate 84->64, tenths 52->40", () => {
    const splitRule = rulesFor(
      ".connected-surface:has(.connected-lost) .connected-hero-split .connected-hero-value",
    );
    const rateRule = rulesFor(
      ".connected-surface:has(.connected-lost) .connected-hero-rate .connected-hero-value",
    );
    expect(splitRule).toHaveLength(1);
    expect(rateRule).toHaveLength(1);
    expect(splitRule[0]!.body).toContain("76px");
    expect(rateRule[0]!.body).toContain("64px");
    const tenths = rulesFor(
      ".connected-surface:has(.connected-lost) .connected-hero-tenths",
    ).find((r) => r.at.length === 0);
    expect(tenths?.body).toContain("40px");
  });

  it("landscape: split 112->86, rate 92->70, tenths 58->44", () => {
    const landscape = cssRules(INDEX_CSS).filter((r) =>
      r.at.some((q) => q.includes("orientation: landscape")),
    );
    const splitRule = landscape.find((r) =>
      r.selectors.includes(
        ".connected-surface:has(.connected-lost) .connected-pane-live .connected-hero-split .connected-hero-value",
      ),
    );
    const rateRule = landscape.find((r) =>
      r.selectors.includes(
        ".connected-surface:has(.connected-lost) .connected-pane-live .connected-hero-rate .connected-hero-value",
      ),
    );
    const tenthsRule = landscape.find((r) =>
      r.selectors.includes(
        ".connected-surface:has(.connected-lost) .connected-pane-live .connected-hero-tenths",
      ),
    );
    expect(splitRule?.body).toContain("86px");
    expect(rateRule?.body).toContain("70px");
    expect(tenthsRule?.body).toContain("44px");
  });
});
