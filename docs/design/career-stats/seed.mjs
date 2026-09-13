// The Gate 0 seed: thirteen log rows and six test_history rows, plus the
// derivations every artboard draws from (spec §3). ONE source: compute.mjs
// prints the arithmetic from here and build.mjs draws from here, so a
// figure on an artboard cannot drift from the printed hand-check.
export const today = "2026-09-12";

export const rows = [
  { id: "R1",  date: "2025-11-08", source: "pm5",    tier: "stored",    type: "O2", what: "6k steady, saved before RC-5 (fused metres)",       workMeters: 6240,  workSeconds: 1592.0, restMeters: null, calories: null },
  { id: "R2",  date: "2026-01-17", source: "manual", tier: "steps",     type: "TR", what: "2k by hand, step actuals",                          workMeters: 2000,  workSeconds: 470.2,  restMeters: null, calories: null },
  { id: "R3",  date: "2026-03-02", source: "pm5",    tier: "machine",   type: "AT", what: "2 x 2000m / 3:00 rest, monitor totals",             workMeters: 4000,  workSeconds: 1000.8, restMeters: 96,   calories: 258 },
  { id: "R4",  date: "2026-04-25", source: "pm5",    tier: "machine",   type: "AN", what: "6 x 250m / 1:30 rest, monitor totals",              workMeters: 1500,  workSeconds: 330.6,  restMeters: 240,  calories: 92 },
  { id: "R5",  date: "2026-05-14", source: "pm5",    tier: "machine",   type: "O2", what: "8k steady, monitor totals",                         workMeters: 8000,  workSeconds: 2064.0, restMeters: 0,    calories: 512 },
  { id: "R6",  date: "2026-06-02", source: "pm5",    tier: "machine",   type: "TR", what: "2k test, monitor totals",                           workMeters: 2000,  workSeconds: 461.3,  restMeters: 0,    calories: 118 },
  { id: "R7",  date: "2026-06-21", source: "pm5",    tier: "work-pair", type: null, what: "free row, link lost before the monitor's totals",   workMeters: 3012,  workSeconds: 800.5,  restMeters: 0,    calories: null },
  { id: "R8",  date: "2026-07-19", source: "pm5",    tier: "machine",   type: "AN", what: "4 x 500m / 2:00 rest, monitor totals",              workMeters: 2000,  workSeconds: 492.0,  restMeters: 214,  calories: 131 },
  { id: "R9",  date: "2026-08-03", source: "manual", tier: "steps",     type: "O2", what: "10k by hand, step actuals",                         workMeters: 10000, workSeconds: 2588.0, restMeters: null, calories: null },
  { id: "R10", date: "2026-08-24", source: "manual", tier: "steps",     type: "AT", what: "8k by hand, step actuals",                          workMeters: 8000,  workSeconds: 2050.0, restMeters: null, calories: null },
  { id: "R11", date: "2026-08-30", source: "pm5",    tier: "machine",   type: null, what: "free row, monitor totals",                          workMeters: 5000,  workSeconds: 1305.5, restMeters: 0,    calories: 310 },
  { id: "R12", date: "2026-09-04", source: "pm5",    tier: "machine",   type: "AT", what: "3 x 1000m / 3:00 rest, monitor totals",             workMeters: 3000,  workSeconds: 768.6,  restMeters: 168,  calories: 189 },
  { id: "R13", date: "2026-09-11", source: "pm5",    tier: "machine",   type: "TR", what: "2k test, monitor totals",                           workMeters: 2000,  workSeconds: 455.8,  restMeters: 0,    calories: 121 },
];

// test_history: split seconds per 500 m; `log` names the linked row or null
// for a deleted log (ON DELETE SET NULL, spec §3.3 / ruling 4).
export const tests = [
  { id: "T1", date: "2025-11-22", kind: "6k", splitSeconds: 124.8, log: null, note: "own row, predates the 13" },
  { id: "T2", date: "2026-01-17", kind: "2k", splitSeconds: 117.6, log: "R2" },
  { id: "T3", date: "2026-03-28", kind: "6k", splitSeconds: 122.9, log: null, note: "log deleted" },
  { id: "T4", date: "2026-06-02", kind: "2k", splitSeconds: 115.3, log: "R6" },
  { id: "T5", date: "2026-08-08", kind: "6k", splitSeconds: 121.4, log: null, note: "log deleted" },
  { id: "T6", date: "2026-09-11", kind: "2k", splitSeconds: 114.0, log: "R13" },
];

// ---- formatters (the app's own: LogRow.tsx fmtMeters, domain/duration.ts
// fmtDuration on rounded seconds, domain/format.ts fmtSplit)
export const fmtM = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export const fmtT = (s) => {
  const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), ss = String(t % 60).padStart(2, "0");
  return h === 0 ? `${m}:${ss}` : `${h}:${String(m).padStart(2, "0")}:${ss}`;
};
export const fmtSplit = (t) => { const th = Math.round(t * 10); return `${Math.floor(th / 600)}:${String(Math.floor((th % 600) / 10)).padStart(2, "0")}.${th % 10}`; };
export const watts = (sec, m) => (sec > 0 && m > 0 ? Math.round(2.8 / (sec / m) ** 3) : undefined);
const sum = (xs, f) => xs.reduce((a, r) => a + (f(r) ?? 0), 0);

// ---- calendar ({y,m,d} semantics via UTC so no zone can shift a date)
export const dow = (d) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); };
export const addDays = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
export const mondayOf = (d) => addDays(d, -((dow(d) + 6) % 7));
export const dayIndex = (d, from) => Math.round((Date.parse(d + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
export const seasonStart = "2026-05-01";
export const inRange = (xs, a, b) => xs.filter((r) => r.date >= a && r.date <= b);

// ---- totals (spec §3.2) for a row set
export function totals(set) {
  const mach = set.filter((r) => r.source === "pm5");
  const wattsRows = mach.filter((r) => r.tier !== "stored" && r.workMeters !== null && r.workSeconds !== null);
  return {
    all: { meters: sum(set, (r) => r.workMeters), seconds: sum(set, (r) => r.workSeconds), sessions: set.length },
    machine: {
      rows: mach, meters: sum(mach, (r) => r.workMeters), seconds: sum(mach, (r) => r.workSeconds), sessions: mach.length,
      own: mach.filter((r) => r.tier === "machine").length,
      restMeters: sum(mach, (r) => r.restMeters), calories: sum(mach, (r) => r.calories),
      calRows: mach.filter((r) => r.calories !== null).length,
      wattsRows, wattsSumM: sum(wattsRows, (r) => r.workMeters), wattsSumS: sum(wattsRows, (r) => r.workSeconds),
      avgWatts: watts(sum(wattsRows, (r) => r.workSeconds), sum(wattsRows, (r) => r.workMeters)),
    },
    storedTier: set.filter((r) => r.tier === "stored").length,
  };
}

// ---- chart series
export function weekMeters(set) {
  const out = {};
  for (const r of set) out[mondayOf(r.date)] = (out[mondayOf(r.date)] ?? 0) + r.workMeters;
  return out;
}
/** Eight Monday-start weeks ending at the week containing `end`. */
export const weeksEnding = (end, n = 8) => Array.from({ length: n }, (_, i) => addDays(mondayOf(end), -7 * (n - 1 - i)));

export const TYPE_ORDER = ["AN", "AT", "O2", "TR", "NO TYPE"]; // stack order, validated 2026-09-12 (build.mjs header)
export function timeByType(set) {
  const b = { AN: 0, O2: 0, AT: 0, TR: 0, "NO TYPE": 0 };
  for (const r of set) b[r.type ?? "NO TYPE"] += r.workSeconds;
  const total = Object.values(b).reduce((a, v) => a + v, 0);
  return { buckets: b, total };
}

// LONGEST is the longest run WITHIN THIS SEASON (spec §14 ruling 22,
// 2026-09-12): the week set is the season's rows, May 1 .. today — the same
// set the curve and AVG M/DAY read (invariant 19). Identical on this seed
// (no pre-May-1 run touches a May week); the PR 2 domain pins the case that
// differs. Still keyed on metres here (a week with a null-metres row would
// read "-"): NOT the streak's reference — the spec's rule is.
export function streaks(set) {
  const wm = weekMeters(inRange(set, seasonStart, today));
  const weeks = Object.keys(wm).sort();
  let longest = 0, run = 0, prev = null;
  for (const w of weeks) { run = prev !== null && addDays(prev, 7) === w ? run + 1 : 1; longest = Math.max(longest, run); prev = w; }
  let current = 0, w = mondayOf(today);
  if (!wm[w]) w = addDays(w, -7); // this week has no row yet: not broken
  while (wm[w]) { current += 1; w = addDays(w, -7); }
  return { weeks, current, longest };
}

export function seasonCumulative(set) {
  const pts = [];
  let cum = 0;
  for (const r of inRange(set, seasonStart, today)) { cum += r.workMeters; pts.push({ date: r.date, add: r.workMeters, cum }); }
  const days = dayIndex(today, seasonStart) + 1;
  return { pts, total: cum, days, avgPerDay: cum / days };
}
