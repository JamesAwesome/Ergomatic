// Gate 0 arithmetic for Phase PS (career stats). Run: node compute.mjs
// Prints the seed (seed.mjs), every headline figure recomputed by the spec's
// own definitions (docs/superpowers/specs/2026-09-12-career-stats-design.md
// §3), every derived chart series, and the WCAG contrast table for every
// colour pairing the artboards use. Nothing here reads the app; it is the
// hand arithmetic RF7 asks for, written down so a reviewer can re-run it.
import { writeFileSync } from "node:fs";
import {
  today, rows, tests, fmtM, fmtT, fmtSplit, dow, mondayOf, inRange, seasonStart,
  totals, weekMeters, weeksEnding, TYPE_ORDER, timeByType, streaks, seasonCumulative,
} from "./seed.mjs";

function printTotals(set, label) {
  const t = totals(set);
  const m = t.machine;
  console.log(`\n== ${label} (${set.length} rows: ${set.map((r) => r.id).join(" ")})`);
  console.log(`ALL     metres ${set.map((r) => r.workMeters).join(" + ")} = ${fmtM(t.all.meters)}`);
  console.log(`ALL     time   ${set.map((r) => r.workSeconds).join(" + ")} = ${t.all.seconds.toFixed(1)} s = ${fmtT(t.all.seconds)}`);
  console.log(`ALL     sessions ${t.all.sessions}`);
  console.log(`MACHINE rows ${m.rows.map((r) => r.id).join(" ")}`);
  console.log(`MACHINE metres ${m.rows.map((r) => r.workMeters).join(" + ")} = ${fmtM(m.meters)}`);
  console.log(`MACHINE time   ${m.rows.map((r) => r.workSeconds).join(" + ")} = ${m.seconds.toFixed(1)} s = ${fmtT(m.seconds)}`);
  console.log(`MACHINE sessions ${m.sessions}; own totals ${m.own} OF ${m.sessions}`);
  console.log(`MACHINE rest   ${m.rows.map((r) => r.restMeters ?? "null").join(" + ")} = ${fmtM(m.restMeters)}`);
  console.log(`MACHINE cal    ${m.rows.map((r) => r.calories ?? "null").join(" + ")} = ${fmtM(m.calories)} (${m.calRows} OF ${m.sessions} ROWS CARRY IT)`);
  console.log(`MACHINE watts rows ${m.wattsRows.map((r) => r.id).join(" ")}: Σs ${m.wattsSumS.toFixed(1)} / Σm ${m.wattsSumM} = ${(m.wattsSumS / m.wattsSumM).toFixed(5)} s/m; 2.8 / (s/m)^3 = ${m.avgWatts} W`);
  console.log(`stored-tier rows in range: ${t.storedTier}`);
}

printTotals(rows, "ALL (lifetime)");
printTotals(inRange(rows, seasonStart, today), "SEASON 2027 (2026-05-01 .. today)");
printTotals(inRange(rows, "2026-08-14", today), "30 DAYS (today - 29 .. today; also the seeded CUSTOM range)");
printTotals(inRange(rows, "2026-09-01", today), "MONTH (2026-09-01 .. today)");
printTotals([rows[12]], "ONE ROW (R13 alone)");
printTotals(rows.filter((r) => r.source === "manual"), "NO MONITOR ROWS (the three manual rows)");

// ---- Derived series for the charts (James, 2026-09-12: design every chart now).
console.log(`\n== Calendar: today ${today} is day ${dow(today)} (0=Sun); week of today starts ${mondayOf(today)}`);
console.log("row → week (Monday):", rows.map((r) => `${r.id} ${r.date}(${"SMTWTFS"[dow(r.date)]})→${mondayOf(r.date)}`).join("  "));
const wm = weekMeters(rows);
console.log("METRES PER WEEK (ALL, 8 weeks ending the week of today):");
for (const w of weeksEnding(today)) console.log(`  week of ${w}: ${fmtM(wm[w] ?? 0)}`);
console.log("STREAK STRIP (16 weeks): " + weeksEnding(today, 16).map((w) => `${w.slice(5)}:${wm[w] ? "row" : "-"}`).join(" "));
const st = streaks(rows);
console.log(`weeks with a row: ${st.weeks.join(" ")}\nCURRENT STREAK ${st.current} · LONGEST STREAK ${st.longest}`);
const tbt = timeByType(rows);
console.log("TIME BY TYPE (ALL), stack order " + TYPE_ORDER.join(" · ") + ":");
for (const k of TYPE_ORDER) console.log(`  ${k.padEnd(8)} ${rows.filter((r) => (r.type ?? "NO TYPE") === k).map((r) => r.workSeconds).join(" + ")} = ${tbt.buckets[k].toFixed(1)} s = ${fmtT(tbt.buckets[k])} = ${(100 * tbt.buckets[k] / tbt.total).toFixed(1)}%`);
console.log(`  total ${tbt.total.toFixed(1)} s`);
const sc = seasonCumulative(rows);
console.log("SEASON CUMULATIVE (May 1 → today):");
for (const p of sc.pts) console.log(`  ${p.date} +${p.add} → ${fmtM(p.cum)}`);
console.log(`AVG M/DAY THIS SEASON = ${fmtM(sc.total)} / ${sc.days} days (May 1 .. today inclusive) = ${sc.avgPerDay.toFixed(1)} → ${Math.round(sc.avgPerDay)}`);
console.log("TEST TREND (test_history, unfiltered):");
for (const t of tests) console.log(`  ${t.id} ${t.date} ${t.kind} ${t.splitSeconds}s = ${fmtSplit(t.splitSeconds)} · sessionLogId ${t.log ?? "null"}${t.note ? ` (${t.note})` : ""}`);

// ---- Contrast. WCAG 2.1 relative luminance and contrast ratio,
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance and
// https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio. Hexes are
// app/src/theme/tokens.css, verbatim.
const tok = {
  page: "#f4f1e8", surface: "#fffdf7", ink: "#1b1a17", "ink-2": "#3f3c35", "ink-3": "#57544c",
  "ink-4": "#6f6a5f", "ink-5": "#a09a8c", rule: "#d8d3c4", "rule-2": "#ded8c9", "rule-3": "#c9c3b2",
  accent: "#b5341f", "on-color": "#fffdf7", "type-an": "#5c4382", "type-o2": "#2a6275", "type-at": "#8a5f18",
};
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); };
const pairs = [
  ["ink", "page", "text", "titles, headline metres, table values"],
  ["ink", "surface", "text", "identity card name, table values on the card, chart value labels"],
  ["ink-3", "page", "text", "mono labels, captions, door rows, tab labels"],
  ["ink-3", "surface", "text", "email, column headings, axis ticks and legend text on the card"],
  ["ink-2", "surface", "text", "unselected filter segment"],
  ["on-color", "ink", "text", "selected filter segment, avatar initials"],
  ["ink-4", "page", "text", "captions that name a bucket (NO TYPE)"],
  ["accent", "surface", "non-text", "active tab mark"],
  ["rule-3", "surface", "non-text", "filter strip border, date input border (house hairline)"],
  ["rule", "page", "non-text", "card border (house hairline)"],
  ["ink", "surface", "non-text", "current-week bar, 2k line + dots, rowed streak cell, season curve + end dot, TR segment"],
  ["ink-4", "surface", "non-text", "previous-week bars (DRAWN); NO TYPE segment"],
  ["rule-3", "surface", "non-text", "previous-week bars per handoff 2026-08-07 decision 9 (#c9c3b2) — NOT drawn, fails"],
  ["ink-5", "surface", "non-text", "previous-week bars, second candidate — NOT drawn, fails"],
  ["type-an", "surface", "non-text", "AN segment + legend swatch"],
  ["type-at", "surface", "non-text", "AT segment + legend swatch"],
  ["type-o2", "surface", "non-text", "O2 segment + legend swatch, 6k line + dots"],
  ["rule-2", "surface", "non-text", "gridlines, not-rowed streak cell outline (decorative: the rowed fill carries the state)"],
];
console.log("\n== Contrast (WCAG 2.1; AA text 4.5:1, non-text 3:1)");
const table = pairs.map(([fg, bg, kind, use]) => {
  const r = ratio(tok[fg], tok[bg]);
  const floor = kind === "text" ? 4.5 : 3;
  const row = { fg: `--${fg}`, fgHex: tok[fg], bg: `--${bg}`, bgHex: tok[bg], kind, use, ratio: Number(r.toFixed(2)), floor, pass: r >= floor };
  console.log(`${row.fg} ${row.fgHex} on ${row.bg} ${row.bgHex}  ${row.ratio.toFixed(2)}:1  ${kind} floor ${floor}:1  ${row.pass ? "PASS" : "FAIL"}  (${use})`);
  return row;
});
writeFileSync(new URL("./contrast.json", import.meta.url), JSON.stringify({ formula: "WCAG 2.1 relative luminance, https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio", tokens: "app/src/theme/tokens.css", pairs: table }, null, 2) + "\n");
