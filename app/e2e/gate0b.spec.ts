// GATE 0B CAPTURE HARNESS — board 1 (members M1, M1b, M2).
//
// Renders the SAME machine row twice, identical but for how it closed, so
// that M1b's conditional is something James SEES rather than something the
// spec asserts: RATE is the monitor's own average on a finished piece and
// OUR weighted mean over the splits on a terminated one
// (`logbookDerived.ts:43`, `if (input.finished) return input.avgStrokeRate`).
//
// The terminated row's 0x0039 average is 52 — DOUBLE the real 26 — because
// that is what the monitor actually reports on a terminate
// (`pm5-interface-notes.md` §27.6: "0x0039's Average Stroke Rate reads
// exactly DOUBLE on a terminate", with the PM5's own View Detail screen
// photographed at 23 against the wire's 46). The conditional exists to keep
// that number off the screen; the fixture reproduces the case it guards.
//
// Throwaway: deleted by the PR that implements board 1's ruling.
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { RUN_ID, signInViaBackdoor } from "./helpers";

const OUT = path.resolve(
  process.cwd(),
  "../docs/design/number-provenance/gate0b",
  process.env.GATE0B_OUT ?? "before",
);

/** A trace whose WORKING strokes average ~140 bpm. The table's HR column
 *  reads the monitor's own per-interval figures (152 / 148), and
 *  `deriveAverageHeartRate` reads this — the 3.5-15.2 bpm gap the pass
 *  measured, in one frame, so it can be checked by eye (RF7). */
function traceWithHr() {
  const samples = [];
  for (let i = 0; i <= 120; i++) {
    samples.push({
      t: i * 10,
      d: i * 40,
      p: 1240,
      spm: i < 60 ? 25 : 28,
      hr: 138 + (i % 5),
    });
  }
  return { samples };
}

function machineRow(opts: {
  title: string;
  endedBy?: string;
  spm: number;
  withHr?: boolean;
}) {
  const step = (
    split: number,
    secs: number,
    spm: number,
    cal: number,
    calHr: number,
    watts: number,
    restM: number,
  ) => ({
    label: "250m @ 2:07.0",
    targetSplit: 127.0,
    actualSplit: split,
    actualSeconds: secs,
    actualSource: "pm5",
    meters: 250,
    actualMeters: 250,
    actualSpm: spm,
    machineCalories: cal,
    machineCalPerHour: calHr,
    machineWatts: watts,
    machineDragFactor: 100,
    machineRestHr: null,
    machineRestSeconds: 60,
    machineRestMeters: restM,
    ...(opts.withHr === true ? { avgHr: restM === 147 ? 152 : 148 } : {}),
  });
  return {
    workoutId: null,
    workoutTitle: opts.title,
    workoutType: "AT",
    deviceName: "PM5 432331249",
    source: "pm5",
    held: "under",
    effort: 3,
    notes: null,
    avgSplitSeconds: 124.0,
    timeSeconds: 244,
    distanceMeters: 742,
    restSeconds: 120,
    restMeters: 242,
    advancesPlan: false,
    ...(opts.endedBy !== undefined ? { endedBy: opts.endedBy } : {}),
    ...(opts.withHr === true ? { series: traceWithHr() } : {}),
    steps: [
      step(135.8, 67.9, 25, 16, 848, 140, 147),
      step(112.2, 56.1, 28, 16, 1026, 248, 95),
    ],
    machineWorkSeconds: 124.0,
    machineWorkMeters: 500,
    machineSummary: {
      avgPaceSecondsPer500m: 124.0,
      avgStrokeRate: opts.spm,
      dragFactorAverage: 100,
      totalCalories: 32,
      avgWatts: 184,
      avgCalPerHour: 931,
      totalRestMeters: 242,
    },
  };
}

async function seedAndOpen(page: Page, body: unknown): Promise<void> {
  const id = await page.evaluate(async (b) => {
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text);
    return (JSON.parse(text) as { id: string }).id;
  }, body);
  await page.goto(`/today/log/${id}`);
}

for (const [orient, size] of [
  ["portrait", { width: 390, height: 844 }],
  ["landscape", { width: 844, height: 390 }],
] as const) {
  test(`gate 0B board 1: the same row finished and terminated, ${orient}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    await signInViaBackdoor(page, {
      email: `gate0b-${orient}-${RUN_ID}@e2e.test`,
      name: "Gate 0B",
    });
    fs.mkdirSync(OUT, { recursive: true });

    // FINISHED: no `endedBy`, so `sessionStrokeRate` returns the monitor's
    // own 26 verbatim.
    await seedAndOpen(page, machineRow({ title: "Finished piece", spm: 26 }));
    await expect(
      page.getByRole("heading", { name: "Finished piece" }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const tiles = page.getByTestId("summary-machine-tier");
    await expect(tiles).toBeVisible();
    await tiles.scrollIntoViewIfNeeded();
    await tiles.screenshot({
      path: path.join(OUT, `tiles-finished-${orient}.png`),
    });

    // TERMINATED: `endedBy: "rower"`, and the monitor's 0x0039 average reads
    // DOUBLE (§27.6). The guard drops it and our weighted split mean shows.
    await seedAndOpen(
      page,
      machineRow({
        title: "Terminated piece",
        endedBy: "rower",
        spm: 52,
      }),
    );
    await expect(
      page.getByRole("heading", { name: "Terminated piece" }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(tiles).toBeVisible();
    await tiles.scrollIntoViewIfNeeded();
    await tiles.screenshot({
      path: path.join(OUT, `tiles-terminated-${orient}.png`),
    });

    // M1 + M2 IN ONE FRAME: the six tiles, the `PM5 · PER INTERVAL` eyebrow,
    // and the table under it. Two of the table's six data columns are OURS
    // (`summaryModel.ts:204-210` says so in its own comment), and the AVG HR
    // tile is our trace mean sitting directly above the monitor's own
    // per-interval HR column. Both readable by eye in one capture, which is
    // the only way a contradiction of this kind gets caught (RF7).
    await seedAndOpen(
      page,
      machineRow({ title: "Heart rate gap", spm: 26, withHr: true }),
    );
    await expect(
      page.getByRole("heading", { name: "Heart rate gap" }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const block = page.locator(".machine-summary-block");
    await expect(block).toBeVisible();
    await expect(tiles).toBeVisible();
    await tiles.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, `block-hr-${orient}.png`) });
    await block.screenshot({ path: path.join(OUT, `table-${orient}.png`) });
  });
}

// Every colour pairing on board 1, measured from the LIVE cascade rather
// than from the token file — the element's own computed colour against the
// first opaque background behind it, with the WCAG 2.x ratio (RF6: the
// number goes in the report, never an eye).
test("gate 0B board 1: contrast", async ({ page }) => {
  test.setTimeout(180_000);
  await signInViaBackdoor(page, {
    email: `gate0b-contrast-${RUN_ID}@e2e.test`,
    name: "Gate 0B",
  });
  await seedAndOpen(
    page,
    machineRow({ title: "Heart rate gap", spm: 26, withHr: true }),
  );
  await expect(
    page.getByRole("heading", { name: "Heart rate gap" }),
  ).toBeVisible();
  const rows = await page.evaluate(() => {
    const parse = (c: string): [number, number, number] => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (m === null) return [0, 0, 0];
      const [r, g, b] = m[1]!.split(",").map((v) => parseFloat(v));
      return [r!, g!, b!];
    };
    const lum = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el: Element): string => {
      let n: Element | null = el;
      while (n !== null) {
        const c = getComputedStyle(n).backgroundColor;
        if (!c.startsWith("rgba(0, 0, 0, 0)") && c !== "transparent") return c;
        n = n.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const out: unknown[] = [];
    const seen = new Set<string>();
    for (const sel of [
      ".summary-hero-label",
      ".summary-machine-value",
      ".machine-summary-title",
      ".machine-summary-eyebrow",
      ".machine-summary th",
      ".machine-summary td",
      ".summary-total-line",
    ]) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const st = getComputedStyle(el);
        const fg = st.color;
        const bg = bgOf(el);
        const key = `${sel}|${fg}|${bg}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [l1, l2] = [lum(parse(fg)), lum(parse(bg))].sort((a, b) => b - a);
        out.push({
          element: sel,
          sample: (el.textContent ?? "").slice(0, 16),
          fg,
          bg,
          fontPx: st.fontSize,
          fontWeight: st.fontWeight,
          ratio: Number(((l1! + 0.05) / (l2! + 0.05)).toFixed(2)),
        });
      }
    }
    return out;
  });
  // A selector that matched NOTHING is a silent hole: the file would claim
  // the board is measured while covering half of it. The first draft of this
  // test shipped 3 of 7 and looked complete.
  const covered = new Set(
    (rows as { element: string }[]).map((r) => r.element),
  );
  expect(
    [
      ".summary-hero-label",
      ".summary-machine-value",
      ".machine-summary-title",
      ".machine-summary-eyebrow",
      ".machine-summary th",
      ".machine-summary td",
      ".summary-total-line",
    ].filter((sel) => !covered.has(sel)),
    "selectors that matched no element",
  ).toEqual([]);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(
    path.join(OUT, "contrast.json"),
    `${JSON.stringify(rows, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
});

// ROUND 2 — the measurement ruling 2 option B actually turns on, which the
// board could only assert. The table already scrolls sideways with `#`
// pinned and, per the component's own comment, "overflows a 390 px screen
// by a few px today". Grouping adds a row and REORDERS the columns, so two
// things are worth a number rather than an eye: does either group label
// fit inside the span it brackets, and does the overflow get worse?
//
// This REPORTS; it is not a gate and must not be read as one (RF26).
test("gate 0B round 2: the grouped table's geometry", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInViaBackdoor(page, {
    email: `gate0b-r2-${RUN_ID}@e2e.test`,
    name: "Gate 0B R2",
  });
  fs.mkdirSync(OUT, { recursive: true });

  await seedAndOpen(
    page,
    machineRow({ title: "Grouped columns", spm: 26, withHr: true }),
  );
  await expect(
    page.getByRole("heading", { name: "Grouped columns" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const block = page.locator(".machine-summary-block");
  await expect(block).toBeVisible();
  await block.scrollIntoViewIfNeeded();

  const geom = await page.evaluate(() => {
    const scroller = document.querySelector(
      ".machine-summary-scroller",
    ) as HTMLElement;
    const table = document.querySelector(".machine-summary") as HTMLElement;
    const groups = Array.from(
      document.querySelectorAll(".machine-summary-groups th[colspan]"),
    ) as HTMLElement[];

    // The label's own ink width, measured with a Range so it is the TEXT
    // and not the padded cell — a cell can be wide while its label clips.
    const inkWidth = (el: HTMLElement) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().width;
    };

    // clientWidth INCLUDES the scroller's own 20px side padding, and the
    // first draft of this compared the table against it and reported "fits"
    // for a table the capture shows clipped mid-CAL/HOUR. The content box is
    // the box the table actually has to live in.
    const cs = getComputedStyle(scroller);
    const contentWidth =
      scroller.clientWidth -
      parseFloat(cs.paddingLeft) -
      parseFloat(cs.paddingRight);

    return {
      tableWidth: table.getBoundingClientRect().width,
      scrollerClientWidth: scroller.clientWidth,
      scrollerContentWidth: contentWidth,
      overflowPx: table.getBoundingClientRect().width - contentWidth,
      intervals: document.querySelectorAll(".machine-summary tbody tr").length,
      groups: groups.map((g) => ({
        label: (g.textContent ?? "").trim(),
        spanWidth: g.getBoundingClientRect().width,
        inkWidth: inkWidth(g),
      })),
    };
  });

  process.stdout.write(
    `\nGATE0B-R2 GEOMETRY ${JSON.stringify(geom, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(OUT, "geometry.json"),
    JSON.stringify(geom, null, 2),
  );

  await block.screenshot({
    path: path.join(OUT, "table-grouped-portrait.png"),
  });
  await page.screenshot({
    path: path.join(OUT, "block-grouped-portrait.png"),
  });
});
