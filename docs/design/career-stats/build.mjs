// Emits the Gate 0 artboards (*.dc.html) and canvas.json for Phase PS.
// Run: node compute.mjs && node build.mjs  (then seed with the design skill's helper).
// Every value below is lifted from app/src/theme/tokens.css and the rules
// in app/src/index.css named in the comments; every figure and series comes
// from seed.mjs, the same module compute.mjs prints the arithmetic from.
//
// CHARTS (James, 2026-09-12: "more graphs and visualizations"), drawn by the
// dataviz skill's procedure: form first, colour by job, palette VALIDATED
// with scripts/validate_palette.js, mark specs (bars ≤ 24px with a 4px
// rounded data-end, 2px lines, ≥ 8px dots with a 2px surface ring, 2px
// surface gaps in the stack, hairline solid gridlines), text in text tokens
// never the series colour, legend for ≥ 2 series, honest empty states.
//   · Type palette --type-an #5c4382 · --type-at #8a5f18 · --type-o2 #2a6275
//     · --type-tr = --ink · NO TYPE --ink-4, validated on --surface:
//     the spec's listing order AN/O2/AT/TR/NO TYPE FAILS the validator's
//     normal-vision floor on the O2↔AN adjacency (ΔE 11.3 < 15) and CVD
//     (deutan 4.9); stack order AN · AT · O2 · TR · NO TYPE PASSES both
//     (worst adjacent 13.5 protan / 16.8 normal). Drawn in that order,
//     with 2px surface gaps and a legend as secondary encoding.
//   · Previous-week bars: handoff decision 9's #c9c3b2 measures 1.73:1 on
//     --surface and --ink-5 2.75:1, both under WCAG 1.4.11's 3:1; drawn in
//     --ink-4 (5.29:1). Current week --ink (17.11:1).
//   · Hover/tooltip layers are implementation (PR 2), not drawn.
import { writeFileSync, readFileSync } from "node:fs";
import {
  today, rows, tests, fmtM, fmtT, fmtSplit, mondayOf, dayIndex, inRange, seasonStart, addDays,
  totals, weekMeters, weeksEnding, TYPE_ORDER, timeByType, streaks, seasonCumulative,
} from "./seed.mjs";

const T = {
  page: "#f4f1e8", surface: "#fffdf7", ink: "#1b1a17", ink2: "#3f3c35", ink3: "#57544c",
  ink4: "#6f6a5f", ink5: "#a09a8c", rule: "#d8d3c4", rule2: "#ded8c9", rule3: "#c9c3b2", accent: "#b5341f", on: "#fffdf7",
  an: "#5c4382", at: "#8a5f18", o2: "#2a6275", tr: "#1b1a17",
};
const TYPE_FILL = { AN: T.an, AT: T.at, O2: T.o2, TR: T.tr, "NO TYPE": T.ink4 };
const SERIF = `'Newsreader', Georgia, serif`;
const SANS = `'Archivo', system-ui, sans-serif`;
const MONO = `'IBM Plex Mono', ui-monospace, monospace`;

const head = (title) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <title>${title}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&family=Newsreader:wght@500&display=swap">
  <style>
    body { margin: 0; background: ${T.page}; color: ${T.ink}; font-family: ${SANS}; font-size: 14px; }
    * { box-sizing: border-box; }
    a { color: ${T.ink}; text-decoration: none; } a:hover { color: ${T.ink}; }
    table { border-collapse: collapse; }
    svg text { font-family: ${MONO}; }
  </style>
</helmet>
`;
const foot = `</x-dc>
</body>
</html>
`;

const mono = (size, ls, color = T.ink3) => `font-family: ${MONO}; font-size: ${size}px; letter-spacing: ${ls}; color: ${color};`;

// ---- pieces, each an exact transcription of the index.css rule it names
function tabbar(width, insetBottom, active = "YOU") {
  const tabs = ["TODAY", "NEWS", "LIBRARY", "PLAN", "YOU"].map((t) => {
    const on = t === active;
    return `<a style="flex: 1; min-height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; ${mono(10, "0.16em", on ? T.ink : T.ink3)}"><span style="width: 16px; height: 3px; background: ${on ? T.accent : "transparent"};"></span><span>${t}</span></a>`;
  }).join("");
  return `<div style="width: ${width}px; display: flex; background: ${T.surface}; border-top: 1px solid ${T.rule}; padding-bottom: ${insetBottom}px;">${tabs}</div>`;
}
// .diag-row: min-height 44, padding 13px 2px, border-top 1px --rule-2, mono 12px 0.08em --ink-3
const door = (label, right = "") => `<a style="display: flex; align-items: center; justify-content: space-between; min-height: 44px; padding: 13px 2px; border-top: 1px solid ${T.rule2}; ${mono(12, "0.08em")}"><span>${label}</span><span style="display: flex; align-items: center; gap: 12px;">${right ? `<span>${right}</span>` : ""}<span aria-hidden="true">&rsaquo;</span></span></a>`;
// The identity card, .you / .avatar / .you-name / .you-email / .button-outline
const identity = (name, email, initials) => `<section style="display: flex; align-items: center; gap: 12px; background: ${T.surface}; border: 1px solid ${T.rule}; border-radius: 2px; padding: 16px; margin-top: 22px;">
  <div style="width: 46px; height: 46px; flex: none; background: ${T.ink}; color: ${T.on}; display: grid; place-items: center; font-weight: 600;">${initials}</div>
  <div style="min-width: 0; flex: 1 1 0;">
    <p style="font-family: ${SERIF}; font-weight: 500; font-size: 24px; margin: 0;">${name}</p>
    <p style="color: ${T.ink3}; margin: 0; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${email}</p>
  </div>
  <a style="min-height: 44px; padding: 0 16px; flex: none; border: 1px solid ${T.ink}; border-radius: 2px; color: ${T.ink}; display: inline-flex; align-items: center; justify-content: center; text-align: center; font: inherit;">Sign out</a>
</section>`;

// The two headline lines (spec §5), used by every hero
const figures = (lifetime, season) => `<span style="display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
  <span style="${mono(13, "0.08em", T.ink)} font-variant-numeric: tabular-nums; white-space: nowrap;">LIFETIME · ${lifetime} M</span>
  <span style="${mono(13, "0.08em", T.ink)} font-variant-numeric: tabular-nums; white-space: nowrap;">SEASON 2027 · ${season} M</span>
</span>`;

// A phone frame. `insetTop` is the status-bar safe area (drawn empty, no fake
// chrome); `.screen` padding is 6px + inset top, 20px + inset sides, 20px
// bottom; main max-width 480 centered.
function phone({ w, h, viewportH, insetTop, insetSide, insetBottom, body, tab = "YOU" }) {
  const fold = viewportH < h
    ? `<div style="position: absolute; left: 0; right: 0; top: ${viewportH}px; border-top: 1px dashed ${T.accent};"></div><div style="position: absolute; right: 8px; top: ${viewportH + 4}px; ${mono(9, "0.08em", T.accent)} background: ${T.page}; padding: 2px 6px;">VIEWPORT BOTTOM · ${viewportH}PX · PAGE SCROLLS</div>`
    : "";
  const barTop = viewportH - 44 - insetBottom - 1;
  return `<div style="position: relative; width: ${w}px; height: ${h}px; background: ${T.page}; overflow: hidden; border: 1px solid ${T.rule3};">
  <main style="max-width: 480px; margin: 0 auto; padding: ${6 + insetTop}px ${20 + insetSide}px ${20 + 44 + insetBottom}px; min-height: ${viewportH}px; display: flex; flex-direction: column;">${body}</main>
  ${fold}
  <div style="position: absolute; left: 0; top: ${barTop}px; width: ${w}px;">${tabbar(w, insetBottom, tab)}</div>
</div>`;
}

// ---- /you/stats pieces
const backLink = `<a style="display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; ${mono(12, "0.08em", T.ink)} font-weight: 600;">← BACK</a>`;
const title = (t) => `<h1 style="font-family: ${SERIF}; font-weight: 500; font-size: 31px; margin: 0.67em 0;">${t}</h1>`;
// The filter strip: .pace-ref-bases + six .pace-ref-chip segments (44px), 11px as .chip
function filterStrip(selected) {
  const segs = ["ALL", "SEASON", "YEAR", "MONTH", "30 DAYS", "CUSTOM"].map((s, i) => {
    const on = s === selected;
    return `<span role="radio" aria-checked="${on}" style="flex: 1; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; background: ${on ? T.ink : T.surface}; color: ${on ? T.on : T.ink2}; ${i < 5 ? `border-right: 1px solid ${T.rule3};` : ""} font-family: ${MONO}; font-size: 11px; font-weight: 500; letter-spacing: 0.06em; white-space: nowrap;">${s}</span>`;
  }).join("");
  return `<div role="radiogroup" aria-label="Range" style="display: flex; border: 1px solid ${T.rule3}; border-radius: 2px; overflow: hidden; background: ${T.surface};">${segs}</div>
<p style="margin: 8px 0 0; ${mono(9, "0.06em")} line-height: 1.5;">RANGE APPLIES TO TOTALS · METRES PER WEEK · TIME BY TYPE. SEASON IS ALWAYS THIS SEASON. TEST TREND IS ALWAYS EVERY TEST.</p>`;
}
function dateInputs(from, to, error = false) {
  const field = (label, v) => `<label style="flex: 1; display: flex; flex-direction: column; gap: 6px; ${mono(10, "0.14em")}"><span>${label}</span><span style="display: flex; align-items: center; min-height: 44px; padding: 0 12px; background: ${T.surface}; border: 1px solid ${error ? T.ink : T.rule3}; border-radius: 2px; font-family: ${MONO}; font-size: 16px; letter-spacing: 0; color: ${T.ink};">${v}</span></label>`;
  return `<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
  <div style="display: flex; gap: 8px;">${field("FROM", from)}${field("TO", to)}</div>
  <p style="margin: 0; ${mono(10, "0.08em", error ? T.ink : T.ink3)}">${error ? "FROM MUST NOT FOLLOW TO · SHOWING THE PREVIOUS RANGE" : "BOTH DAYS INCLUDED · APPLIES AS YOU CHANGE IT"}</p>
</div>`;
}
const groupHead = (t) => `<h2 style="margin: 24px 0 6px; ${mono(10, "0.14em")} font-weight: 400;">${t}</h2>`;
const caption = (t, color = T.ink3) => `<p style="margin: 0 0 8px; ${mono(10, "0.06em", color)} line-height: 1.5;">${t}</p>`;
const card = (inner) => `<div style="background: ${T.surface}; border: 1px solid ${T.rule2}; border-radius: 2px; padding: 12px 14px;">${inner}</div>`;
const emptyLine = (t) => `<p style="margin: 0; padding: 14px 0; ${mono(11, "0.08em")} line-height: 1.6;">${t}</p>`;

// The TOTALS card (unchanged from v3): label | ALL ROWS | MACHINE
function totalsCard(set, { noMonitor = false } = {}) {
  const t = totals(set), m = t.machine;
  const cell = (v) => `<span style="text-align: right; font-family: ${MONO}; font-weight: 500; font-size: 15px; color: ${T.ink}; font-variant-numeric: tabular-nums; white-space: nowrap;">${v}</span>`;
  const lab = (x) => `<span style="${mono(10, "0.14em")} align-self: center;">${x}</span>`;
  const lineStyle = `display: grid; grid-template-columns: 112px minmax(0, 1fr) minmax(0, 1fr); gap: 0 12px; min-height: 36px; align-items: center;`;
  const rowStyle = `display: flex; flex-direction: column; border-top: 1px solid ${T.rule2};`;
  const cap = (x) => `<p style="margin: -4px 0 8px; ${mono(10, "0.06em")} line-height: 1.5;">${x}</p>`;
  const row = (label, a, b, c) => `<div style="${rowStyle}"><div style="${lineStyle}">${lab(label)}${a === null ? "<span></span>" : cell(a)}${b === null ? "<span></span>" : cell(b)}</div>${c ? cap(c) : ""}</div>`;
  const own = noMonitor ? "" : `<p style="margin: 4px 0 8px; text-align: right; ${mono(10, "0.06em")}">${m.own} OF ${m.sessions} CARRY THE MONITOR'S OWN TOTALS</p>`;
  let body;
  if (noMonitor) {
    const r = (label, a) => `<div style="${rowStyle}"><div style="${lineStyle}">${lab(label)}${cell(a)}<span></span></div></div>`;
    body = `<div style="position: relative;">${r("METRES", fmtM(t.all.meters))}${r("TIME", fmtT(t.all.seconds))}${r("SESSIONS", t.all.sessions)}
      <div style="position: absolute; right: 0; top: 0; bottom: 0; width: 45%; display: flex; align-items: center; justify-content: flex-end; text-align: right; ${mono(10, "0.06em")} line-height: 1.5;">NO MONITOR<br>ROWS YET</div></div>`;
  } else {
    body = row("METRES", fmtM(t.all.meters), fmtM(m.meters)) + row("TIME", fmtT(t.all.seconds), fmtT(m.seconds)) + row("SESSIONS", t.all.sessions, m.sessions)
      + row("REST METRES", null, fmtM(m.restMeters)) + row("CALORIES", null, fmtM(m.calories), `${m.calRows} OF ${m.sessions} ROWS CARRY IT · MONITOR'S OWN COUNT`)
      + row("AVG WATTS", null, m.avgWatts ?? "—", "AT THE RANGE'S AVERAGE PACE · WORK-ONLY ROWS");
  }
  const seam = t.storedTier === 0 ? "" : `<br>${t.storedTier === 1 ? "1 ROW PREDATES" : `${t.storedTier} ROWS PREDATE`} WORK-ONLY TOTALS · NOT IN AVG WATTS`;
  return groupHead("TOTALS") + caption("ERGOMATIC ROWS ONLY · WORK METRES · REST SHOWN SEPARATELY" + seam)
    + `<div style="background: ${T.surface}; border: 1px solid ${T.rule2}; border-radius: 2px; padding: 10px 14px 4px;">
  <div style="display: grid; grid-template-columns: 112px minmax(0, 1fr) minmax(0, 1fr); gap: 0 12px; padding-bottom: 6px;"><span></span><span style="text-align: right; ${mono(10, "0.14em")}">ALL ROWS</span><span style="text-align: right; ${mono(10, "0.14em")}">MACHINE</span></div>${own}${body}</div>`;
}

// ---- SVG charts. `w` = the card's inner width (portrait 322; landscape 318, see the A4 line).
const niceMax = (v) => { const steps = [1000, 2000, 5000, 10000, 20000]; for (const s of steps) { const m = Math.ceil(v / s) * s; if (m / s <= 4) return { max: m, step: s }; } return { max: Math.ceil(v / 20000) * 20000, step: 20000 }; };
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const dayMon = (d) => `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]}`;
const tick = (x, y, t, anchor = "middle") => `<text x="${x}" y="${y}" font-size="9" letter-spacing="0.06" fill="${T.ink3}" text-anchor="${anchor}">${t}</text>`;

/** METRES PER WEEK: eight Monday-start weeks ending at the range's last day;
 *  the current week --ink, earlier weeks --ink-4; weeks outside the range
 *  drawn as an empty slot. Bars ≤ 24px, 4px rounded cap, square baseline. */
function barsSvg(set, { w, h = 132, end = today, rangeFrom = null, hero = false }) {
  const wm = weekMeters(set), weeks = weeksEnding(end);
  const vals = weeks.map((wk) => wm[wk] ?? 0);
  const { max, step } = niceMax(Math.max(...vals, 1000));
  const padL = hero ? 0 : 36, padR = 8, padT = 14, padB = 18;
  const pw = w - padL - padR, ph = h - padT - padB;
  const slot = pw / 8, bw = Math.min(24, slot - 6);
  const y = (v) => padT + ph - (v / max) * ph;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Metres per week, eight weeks">`;
  for (let v = 0; v <= max; v += step) {
    s += `<line x1="${padL}" x2="${w - padR}" y1="${y(v)}" y2="${y(v)}" stroke="${T.rule2}" stroke-width="1"/>`;
    if (!hero) s += tick(padL - 6, y(v) + 3, v === 0 ? "0" : fmtM(v), "end");
  }
  const maxI = vals.indexOf(Math.max(...vals));
  // Weeks that begin before the range's start are OUT OF RANGE slots: a
  // dashed --rule-2 outline (decorative, 1.40:1 — it marks "no data by
  // construction", not a value) labelled once across the run so the spec
  // can name it (antagonist delta pass, 2026-09-12).
  const outIdx = weeks.map((wk, i) => (rangeFrom !== null && wk < mondayOf(rangeFrom) ? i : -1)).filter((i) => i >= 0);
  weeks.forEach((wk, i) => {
    const x = padL + slot * i + (slot - bw) / 2, v = vals[i];
    const cur = wk === mondayOf(end), out = rangeFrom !== null && wk < mondayOf(rangeFrom);
    if (out) s += `<rect x="${x}" y="${padT}" width="${bw}" height="${ph}" fill="none" stroke="${T.rule2}" stroke-width="1.5" stroke-dasharray="3 3"/>`;
    else if (v > 0) {
      const top = y(v), hh = padT + ph - top;
      s += `<path d="M${x} ${padT + ph} V${top + 4} a4 4 0 0 1 4 -4 h${bw - 8} a4 4 0 0 1 4 4 V${padT + ph} Z" fill="${cur ? T.ink : T.ink4}"/>`;
      if (cur || i === maxI) s += `<text x="${x + bw / 2}" y="${top - 4}" font-size="9" fill="${T.ink}" text-anchor="middle" font-weight="500">${fmtM(v)}</text>`;
      void hh;
    } else s += `<line x1="${x}" x2="${x + bw}" y1="${padT + ph}" y2="${padT + ph}" stroke="${cur ? T.ink : T.ink4}" stroke-width="2"/>`;
    if (i % 2 === 1 || i === 7) s += tick(padL + slot * i + slot / 2, h - 5, i === 7 ? (cur ? "THIS WK" : dayMon(wk)) : dayMon(wk));
  });
  if (outIdx.length > 0 && !hero) {
    const cx = padL + slot * (outIdx[0] + outIdx[outIdx.length - 1] + 1) / 2;
    s += `<text x="${cx}" y="${padT + ph / 2 + 3}" font-size="8" letter-spacing="0.08" fill="${T.ink3}" text-anchor="middle">OUT OF RANGE</text>`;
  }
  return s + "</svg>";
}

/** TIME BY TYPE: one 24px stacked bar, 2px surface gaps, legend below. */
function stackSvg(set, { w, legend = true, compact = false }) {
  const { buckets, total } = timeByType(set);
  const present = TYPE_ORDER.filter((k) => buckets[k] > 0);
  const gap = 2, h = 24;
  const usable = w - gap * (present.length - 1);
  let x = 0, s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Time by type">`;
  present.forEach((k) => {
    const sw = (buckets[k] / total) * usable;
    s += `<rect x="${x.toFixed(1)}" y="0" width="${sw.toFixed(1)}" height="${h}" fill="${TYPE_FILL[k]}"/>`;
    x += sw + gap;
  });
  s += "</svg>";
  if (!legend) return s;
  const items = TYPE_ORDER.map((k) => `<span style="display: flex; align-items: center; gap: 6px; ${mono(10, "0.06em", T.ink3)} white-space: nowrap;"><span style="width: 10px; height: 10px; background: ${TYPE_FILL[k]}; flex: none;"></span><span style="color: ${T.ink};">${k}</span>${compact ? "" : `<span>${fmtT(buckets[k])}</span>`}<span>${(100 * buckets[k] / total).toFixed(0)}%</span></span>`).join("");
  return s + `<div style="display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 10px;">${items}</div>`;
}

/** SEASON: cumulative work metres since May 1, drawn across the whole
 *  season (May 1 to Apr 30) so today's position IS the season's progress. */
function seasonSvg(set, { w, h = 140 }) {
  const sc = seasonCumulative(set);
  const padL = 40, padR = 12, padT = 14, padB = 18, pw = w - padL - padR, ph = h - padT - padB;
  const { max, step } = niceMax(Math.max(sc.total, 1000));
  const x = (d) => padL + (dayIndex(d, seasonStart) / 364) * pw;
  const y = (v) => padT + ph - (v / max) * ph;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Season cumulative metres">`;
  for (let v = 0; v <= max; v += step) s += `<line x1="${padL}" x2="${w - padR}" y1="${y(v)}" y2="${y(v)}" stroke="${T.rule2}"/>` + tick(padL - 6, y(v) + 3, v === 0 ? "0" : fmtM(v), "end");
  ["2026-05-01", "2026-08-01", "2026-11-01", "2027-02-01", "2027-04-01"].forEach((d) => s += tick(x(d), h - 5, MON[Number(d.slice(5, 7)) - 1]));
  const pts = [{ date: seasonStart, cum: 0 }, ...sc.pts, { date: today, cum: sc.total }];
  s += `<polyline points="${pts.map((p) => `${x(p.date).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" ")}" fill="none" stroke="${T.ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  s += `<line x1="${x(today)}" x2="${x(today)}" y1="${padT}" y2="${padT + ph}" stroke="${T.ink4}" stroke-width="1"/>`;
  s += `<circle cx="${x(today)}" cy="${y(sc.total)}" r="5" fill="${T.ink}" stroke="${T.surface}" stroke-width="2"/>`;
  s += `<text x="${x(today) + 8}" y="${y(sc.total) + 3}" font-size="9" fill="${T.ink}" font-weight="500">${fmtM(sc.total)}</text>`;
  s += `<text x="${x(today)}" y="${padT - 4}" font-size="9" fill="${T.ink3}" text-anchor="middle" letter-spacing="0.06">TODAY</text>`;
  return s + "</svg>";
}

/** TEST TREND: 2k (--ink) and 6k (--type-o2) split seconds over date, faster
 *  is UP; every test point, whether or not its log survives. */
function trendSvg(ts, { w, h = 150 }) {
  const padL = 40, padR = 52, padT = 12, padB = 18, pw = w - padL - padR, ph = h - padT - padB;
  const from = "2025-11-01", span = dayIndex("2026-09-30", from);
  const lo = 112, hi = 126;
  const x = (d) => padL + (dayIndex(d, from) / span) * pw;
  const y = (sec) => padT + ((sec - lo) / (hi - lo)) * ph;
  let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="2k and 6k test splits over time">`;
  // Ticks are what the app's own primitives emit (antagonist delta pass,
  // 2026-09-12): chooseTicks([112, 126], 4) — niceNum(14/3) = 5 — gives
  // 115 / 120 / 125, printed as whole-second splits 1:55 · 2:00 · 2:05 (a
  // "split" tick kind PR 2 adds; formatTick(·, "pace") prints tenths). This
  // REPLACES the approved draft's hand-typed 1:54 · 1:58 · 2:02 · 2:06.
  for (const sec of [115, 120, 125]) s += `<line x1="${padL}" x2="${w - padR}" y1="${y(sec)}" y2="${y(sec)}" stroke="${T.rule2}"/>` + tick(padL - 6, y(sec) + 3, fmtSplit(sec).slice(0, -2), "end");
  ["2025-11-01", "2026-01-01", "2026-03-01", "2026-05-01", "2026-07-01", "2026-09-01"].forEach((d) => s += tick(x(d), h - 5, MON[Number(d.slice(5, 7)) - 1]));
  for (const [kind, color] of [["6k", T.o2], ["2k", T.ink]]) {
    const pts = ts.filter((t) => t.kind === kind);
    if (pts.length > 1) s += `<polyline points="${pts.map((t) => `${x(t.date).toFixed(1)},${y(t.splitSeconds).toFixed(1)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const t of pts) s += `<circle cx="${x(t.date)}" cy="${y(t.splitSeconds)}" r="4" fill="${color}" stroke="${T.surface}" stroke-width="2"/>`;
    const last = pts[pts.length - 1];
    if (last) s += `<text x="${x(last.date) + 8}" y="${y(last.splitSeconds) + 3}" font-size="9" fill="${T.ink}" font-weight="500">${kind.toUpperCase()} ${fmtSplit(last.splitSeconds)}</text>`;
  }
  return s + "</svg>";
}
const trendLegend = `<div style="display: flex; gap: 14px; margin-top: 8px; ${mono(10, "0.06em")}"><span style="display: flex; align-items: center; gap: 6px;"><span style="width: 14px; height: 2px; background: ${T.ink};"></span><span style="color: ${T.ink};">2K</span></span><span style="display: flex; align-items: center; gap: 6px;"><span style="width: 14px; height: 2px; background: ${T.o2};"></span><span style="color: ${T.ink};">6K</span></span><span>FASTER IS UP</span></div>`;

/** STREAK STRIP: sixteen Monday-start week cells; rowed = --ink fill. */
function stripHtml(set, { n = 16 }) {
  const wm = weekMeters(set);
  const cells = weeksEnding(today, n).map((wk) => `<span title="week of ${wk}" style="flex: 1; height: 20px; ${wm[wk] ? `background: ${T.ink};` : `border: 1px solid ${T.rule3};`} border-radius: 2px;"></span>`).join("");
  return `<div style="display: flex; gap: 4px;">${cells}</div>`;
}
const statTile = (label, value, unit = "") => `<span style="display: flex; flex-direction: column; gap: 4px; min-width: 0;"><span style="${mono(9, "0.14em")}">${label}</span><span style="font-family: ${MONO}; font-weight: 500; font-size: 20px; color: ${T.ink}; font-variant-numeric: tabular-nums; line-height: 1;">${value}</span><span style="${mono(9, "0.08em")}">${unit}</span></span>`;

// ---- the /you/stats page, populated, for a row set and range
// `set` is the FILTERED rows (TOTALS, METRES PER WEEK, TIME BY TYPE follow it);
// `all` is the rower's whole population (SEASON and TEST TREND never filter).
function statsPage({ set, all = rows, strip, extra = "", w, rangeFrom = null, noMonitor = false, one = false }) {
  const st = streaks(all);
  const sc = seasonCumulative(all);
  const twoRows = (n, inner) => (n < 2 ? card(emptyLine("TWO ROWS MAKE A CHART")) : card(inner));
  // SEASON is NOT FILTERED (spec §5): curve AND tiles draw from `all`. The
  // Gate 0 draft passed the FILTERED set to the curve, so A5 showed
  // `18,000 TODAY` beside `AVG M/DAY 319` — fixed 2026-09-12 (antagonist
  // delta pass); README "PR 2 addendum".
  const seasonInner = twoRows(sc.pts.length, seasonSvg(all, { w }) + `<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px solid ${T.rule2};">${statTile("AVG M/DAY", fmtM(Math.round(sc.avgPerDay)), "M")}${statTile("CURRENT STREAK", st.current, "WEEKS · ERGOMATIC")}${statTile("LONGEST STREAK", st.longest, "WEEKS · ERGOMATIC")}</div>`);
  const testSet = one ? tests.slice(-1) : (noMonitor ? [] : tests);
  const trendInner = testSet.length === 0 ? card(emptyLine("NO 2K OR 6K TEST LOGGED")) : card(trendSvg(testSet, { w }) + trendLegend);
  return backLink + title("Stats") + strip + extra
    + totalsCard(set, { noMonitor })
    + groupHead("METRES PER WEEK") + caption("EIGHT WEEKS ENDING AT THE RANGE'S LAST DAY · WEEKS BEGIN MONDAY · THIS WEEK IN INK")
    + twoRows(set.length, barsSvg(set, { w, rangeFrom }))
    + groupHead("TIME BY TYPE") + caption("WORK TIME · NO TYPE IS ERGOMATIC'S OWN BUCKET FOR FREE ROWS AND UNTYPED ROWS · NOT A FIFTH TYPE")
    + twoRows(set.length, stackSvg(set, { w }))
    + groupHead("SEASON 2027") + caption("MAY 1 TO TODAY · ALWAYS THIS SEASON · NOT FILTERED")
    + seasonInner
    + groupHead("TEST TREND") + caption("ALL TESTS · KEPT WHEN A LOG IS DELETED · NOT FILTERED")
    + trendInner;
}

// ---- artboards
const files = {};
const PORTRAIT = { w: 390, viewportH: 844, insetTop: 47, insetSide: 0, insetBottom: 34 };
const LANDSCAPE = { w: 844, viewportH: 390, insetTop: 0, insetSide: 47, insetBottom: 21 };
const LIFE = totals(rows), SEAS = totals(inRange(rows, seasonStart, today));
const lifeM = fmtM(LIFE.all.meters), seasM = fmtM(SEAS.all.meters);

// A1 — You today, the committed captures at 1:1
files["A1-YouToday.dc.html"] = head("A1 You today") + `<div style="width: 390px; height: 844px; background: ${T.page}; border: 1px solid ${T.rule3};"><img src="you-today.png" style="width: 390px; height: 844px; display: block;"></div>` + foot;
files["A1b-YouTodayLandscape.dc.html"] = head("A1b You today, landscape") + `<div style="width: 844px; height: 390px; background: ${T.page}; border: 1px solid ${T.rule3};"><img src="you-today-landscape.png" style="width: 844px; height: 390px; display: block;"></div>` + foot;

// A2 heroes — the whole hero block is ONE tap target opening /you/stats
const doors = `<nav aria-label="More" style="margin-top: auto; display: flex; flex-direction: column;">${door("STATS")}${door("BASELINES", "2K 1:52.0 · 6K 2:02.0")}${door("SETTINGS")}${door("DIAGNOSTICS")}</nav>`;
const heroBlock = (inner) => `<a id="hero" style="display: flex; flex-direction: column; gap: 10px; margin-top: 12px; padding: 12px 2px; border-top: 1px solid ${T.rule2}; border-bottom: 1px solid ${T.rule2};">${inner}</a>`;
const st = streaks(rows), wmAll = weekMeters(rows);
const heroes = {
  H1: (w) => heroBlock(figures(lifeM, seasM) + barsSvg(rows, { w, h: 96, hero: true }) + `<span style="${mono(10, "0.08em")}">${fmtM(wmAll[mondayOf(today)] ?? 0)} M THIS WEEK · ${st.current} WEEK STREAK</span>`),
  H2: (w) => heroBlock(figures(lifeM, seasM) + stripHtml(rows, {}) + `<span style="display: flex; flex-direction: column; gap: 4px; ${mono(10, "0.08em")}"><span style="color: ${T.ink};">STREAK ${st.current} WEEKS · LONGEST ${st.longest} WEEKS</span><span>LAST 16 WEEKS · INK = A WEEK WITH A ROW</span></span>`),
  H3: (w) => heroBlock(figures(lifeM, seasM) + stackSvg(rows, { w, compact: true }) + `<span style="${mono(10, "0.08em")}">WORK TIME BY TYPE · ALL ROWS</span>`),
};
for (const [k, hero] of Object.entries(heroes)) {
  const bodyP = identity("Screenshot Tester", "screenshots-you-stable0000000-s...", "ST") + hero(350) + doors;
  // landscape content width = 480 max-width − 2 × (20 + 47 safe-area) = 346 (border-box), so charts are NARROWER than portrait on a notched phone
  const bodyL = identity("Screenshot Tester", "screenshots-you-stable0000000-s...", "ST") + hero(346) + doors;
  files[`A2-${k}-You.dc.html`] = head(`A2 ${k} You hero`) + phone({ ...PORTRAIT, h: 844, body: bodyP }) + foot;
  files[`A2-${k}-YouLandscape.dc.html`] = head(`A2 ${k} You hero, landscape`) + phone({ ...LANDSCAPE, h: 720, body: bodyL }) + foot;
}

// A3/A4 — /you/stats, ALL
const A3 = statsPage({ set: rows, strip: filterStrip("ALL"), w: 322 });
files["A3-StatsPortrait.dc.html"] = head("A3 Stats, portrait") + phone({ ...PORTRAIT, h: 2400, body: A3 }) + foot;
files["A4-StatsLandscape.dc.html"] = head("A4 Stats, landscape") + phone({ ...LANDSCAPE, h: 2300, body: statsPage({ set: rows, strip: filterStrip("ALL"), w: 318 }) }) + foot;

// A5 — CUSTOM open (today − 29 .. today) and the error state
const customSet = inRange(rows, "2026-08-14", today);
files["A5-CustomOpen.dc.html"] = head("A5 Custom range open") + phone({ ...PORTRAIT, h: 2460, body: statsPage({ set: customSet, strip: filterStrip("CUSTOM"), extra: dateInputs("2026-08-14", today), w: 322, rangeFrom: "2026-08-14" }) }) + foot;
files["A5b-CustomError.dc.html"] = head("A5b Custom range, from after to") + phone({ ...PORTRAIT, h: 2460, body: statsPage({ set: customSet, strip: filterStrip("CUSTOM"), extra: dateInputs("2026-09-20", today, true), w: 322, rangeFrom: "2026-08-14" }) }) + foot;

// A6 — empty states
files["A6a-Empty0Rows.dc.html"] = head("A6a No rows yet") + phone({ ...PORTRAIT, h: 844, body: backLink + title("Stats") + `<p style="margin: 24px 0 0; ${mono(11, "0.08em")} line-height: 1.6;">NO ROWS YET · YOUR FIRST SAVED ROW STARTS THE COUNT</p>` }) + foot;
files["A6b-Empty1Row.dc.html"] = head("A6b One row") + phone({ ...PORTRAIT, h: 1900, body: statsPage({ set: [rows[12]], all: [rows[12]], strip: filterStrip("ALL"), w: 322, one: true }) }) + foot;
files["A6c-NoMonitorRows.dc.html"] = head("A6c No monitor rows") + phone({ ...PORTRAIT, h: 2300, body: statsPage({ set: rows.filter((r) => r.source === "manual"), all: rows.filter((r) => r.source === "manual"), strip: filterStrip("ALL"), w: 322, noMonitor: true }) }) + foot;

// Seed — rows, tests, derived series (from seed.mjs; compute.mjs prints the same)
const th = (t) => `<th style="text-align: left; padding: 6px 10px; border-bottom: 1px solid ${T.ink}; ${mono(10, "0.14em")} font-weight: 400;">${t}</th>`;
const td = (t) => `<td style="padding: 5px 10px; border-bottom: 1px solid ${T.rule2}; font-family: ${MONO}; font-size: 12px; white-space: nowrap;">${t}</td>`;
const seedTable = rows.map((r) => [r.id, r.date, r.source, r.tier, r.type ?? "free", r.what, fmtM(r.workMeters), r.workSeconds.toFixed(1), r.restMeters ?? "null", r.calories ?? "null"]);
const testTable = tests.map((t) => [t.id, t.date, t.kind, t.splitSeconds.toFixed(1), fmtSplit(t.splitSeconds), t.log ?? "null", t.note ?? ""]);
const m = LIFE.machine, sc = seasonCumulative(rows), tbt = timeByType(rows), wk8 = weeksEnding(today);
const arithmetic = `LIFETIME (ALL preset, 13 rows)
  ALL      metres   ${rows.map((r) => r.workMeters).join(" + ")} = ${fmtM(LIFE.all.meters)}
  ALL      time     ${rows.map((r) => r.workSeconds).join(" + ")} = ${LIFE.all.seconds.toFixed(1)} s = ${fmtT(LIFE.all.seconds)}
  ALL      sessions 13
  MACHINE  rows     ${m.rows.map((r) => r.id).join(" ")} (source = pm5, by door; R1 is stored-tier and still counts)
  MACHINE  metres   ${m.rows.map((r) => r.workMeters).join(" + ")} = ${fmtM(m.meters)}
  MACHINE  time     ${m.rows.map((r) => r.workSeconds).join(" + ")} = ${m.seconds.toFixed(1)} s = ${fmtT(m.seconds)}
  MACHINE  sessions ${m.sessions};  own totals: tier machine = ${m.rows.filter((r) => r.tier === "machine").map((r) => r.id).join(" ")} = ${m.own} OF ${m.sessions}
  MACHINE  rest     ${m.rows.map((r) => r.restMeters ?? "null").join(" + ")} = ${fmtM(m.restMeters)}
  MACHINE  cal      ${m.rows.map((r) => r.calories ?? "null").join(" + ")} = ${fmtM(m.calories)} (${m.calRows} OF ${m.sessions} ROWS CARRY IT)
  MACHINE  watts    rows ${m.wattsRows.map((r) => r.id).join(" ")} (R1 excluded, ruling 6)
                    Σs ${m.wattsSumS.toFixed(1)} / Σm ${m.wattsSumM} = ${(m.wattsSumS / m.wattsSumM).toFixed(5)} s/m; 2.8 / ${(m.wattsSumS / m.wattsSumM).toFixed(5)}^3 = ${m.avgWatts} W
  seam              1 stored-tier row in range (R1)  →  1 ROW PREDATES WORK-ONLY TOTALS

SEASON 2027 (May 1 .. Sep 12 2026: R5 .. R13, 9 rows)
  ALL      metres   ${inRange(rows, seasonStart, today).map((r) => r.workMeters).join(" + ")} = ${seasM}   ← You headline line 2
  ALL      time     ${SEAS.all.seconds.toFixed(1)} s = ${fmtT(SEAS.all.seconds)} · sessions 9
  MACHINE  ${SEAS.machine.rows.map((r) => r.id).join(" ")}: ${fmtM(SEAS.machine.meters)} m · ${fmtT(SEAS.machine.seconds)} · 7 · ${SEAS.machine.own} OF 7 · rest ${SEAS.machine.restMeters} · cal ${fmtM(SEAS.machine.calories)} (${SEAS.machine.calRows} OF 7) · ${SEAS.machine.avgWatts} W

30 DAYS (Aug 14 .. Sep 12: ${customSet.map((r) => r.id).join(" ")}) — also A5's seeded CUSTOM range
  ALL ${fmtM(totals(customSet).all.meters)} m · ${fmtT(totals(customSet).all.seconds)} · 4 · MACHINE ${fmtM(totals(customSet).machine.meters)} m · ${fmtT(totals(customSet).machine.seconds)} · 3 · 3 OF 3 · rest 168 · cal 620 · ${totals(customSet).machine.avgWatts} W
MONTH (Sep 1 .. Sep 12: R12 R13)   ALL = MACHINE 5,000 m · 20:24 · 2 · 2 OF 2 · rest 168 · cal 310 · 191 W
ONE ROW (R13, A6b)                 2,000 m · 7:36 · 1 · 1 OF 1 · rest 0 · cal 121 · 237 W
NO MONITOR ROWS (A6c: R2 R9 R10)   20,000 m · 1:25:08 · 3

METRES PER WEEK (weeks begin Monday; today ${today} is a Saturday, this week began ${mondayOf(today)})
${wk8.map((w) => `  week of ${w}: ${fmtM(wmAll[w] ?? 0)}${w === mondayOf(today) ? "   ← this week (ink)" : ""}`).join("\n")}
  (R8 Jul 19 falls in the week of Jul 13, outside the eight; R11 Aug 30 is a Sunday and joins R10 in the week of Aug 24)

TIME BY TYPE (work seconds; stack order AN · AT · O2 · TR · NO TYPE, see build.mjs header)
${TYPE_ORDER.map((k) => `  ${k.padEnd(8)} ${rows.filter((r) => (r.type ?? "NO TYPE") === k).map((r) => r.workSeconds).join(" + ")} = ${tbt.buckets[k].toFixed(1)} s = ${fmtT(tbt.buckets[k])} = ${(100 * tbt.buckets[k] / tbt.total).toFixed(1)}%`).join("\n")}
  total ${tbt.total.toFixed(1)} s

SEASON CUMULATIVE   ${sc.pts.map((p) => `${p.date.slice(5)} → ${fmtM(p.cum)}`).join(" · ")}
AVG M/DAY           ${fmtM(sc.total)} / ${sc.days} days (May 1 .. today inclusive, ruling 3) = ${sc.avgPerDay.toFixed(1)} → ${Math.round(sc.avgPerDay)}
STREAKS             weeks with a row: ${st.weeks.map((w) => w.slice(5)).join(" ")}
                    CURRENT ${st.current} (Aug 24, Aug 31, Sep 7) · LONGEST ${st.longest} (the same run)
STREAK STRIP (16)   ${weeksEnding(today, 16).map((w) => (wmAll[w] ? "■" : "□")).join(" ")}  (May 25 .. Sep 7)

TEST TREND          2k: ${tests.filter((t) => t.kind === "2k").map((t) => `${t.date.slice(2)} ${fmtSplit(t.splitSeconds)}`).join(" → ")}
                    6k: ${tests.filter((t) => t.kind === "6k").map((t) => `${t.date.slice(2)} ${fmtSplit(t.splitSeconds)}`).join(" → ")}
                    T3 and T5 have no log (deleted) and are drawn like any other point (ruling 4)

Formats: metres with a comma per thousand (LogRow.tsx fmtMeters); time = fmtDuration on rounded seconds
(domain/duration.ts); split = fmtSplit (domain/format.ts); watts = logbookWatts = round(2.8 / (s/m)^3).`;
files["Seed.dc.html"] = head("Seed rows and arithmetic") + `<div style="width: 1180px; padding: 24px; background: ${T.surface};">
  <h1 style="font-family: ${SERIF}; font-weight: 500; font-size: 24px; margin: 0 0 4px;">Seed rows (thirteen), test history (six) and every figure recomputed by hand</h1>
  <p style="margin: 0 0 16px; font-size: 13px; color: ${T.ink3};">Definitions: spec §3.1 (tier), §3.2 (totals), §3.3 (calendar, streaks, trend). One source, <code>seed.mjs</code>; re-run <code>node compute.mjs</code> in docs/design/career-stats/. Today is ${today}.</p>
  <table style="width: 100%;"><thead><tr>${["ROW", "DATE", "SOURCE", "TIER", "TYPE", "WHAT", "WORK M", "WORK S", "REST M", "CAL"].map(th).join("")}</tr></thead><tbody>${seedTable.map((r) => `<tr>${r.map(td).join("")}</tr>`).join("")}</tbody></table>
  <h2 style="font-family: ${SERIF}; font-weight: 500; font-size: 18px; margin: 20px 0 6px;">test_history</h2>
  <table style="width: 60%;"><thead><tr>${["TEST", "DATE", "KIND", "SPLIT S", "SPLIT", "SESSION LOG", ""].map(th).join("")}</tr></thead><tbody>${testTable.map((r) => `<tr>${r.map(td).join("")}</tr>`).join("")}</tbody></table>
  <pre style="margin: 16px 0 0; font-family: ${MONO}; font-size: 11.5px; line-height: 1.55; color: ${T.ink}; white-space: pre;">${arithmetic}</pre>
</div>` + foot;

// ═══════════════════════════════════════════════════════════════════════════
// PR 2 ADDENDUM (James, 2026-09-12, after seeing v0.46.0 on the phone):
//   (1) "on the You tab I'd like to experiment with how to indicate that the
//       row is clickable" — the shipped hero (140 px, no caption after
//       rulings 18-19) signals nothing tappable. B1 chevron · B2 card edge +
//       chevron · B3 `STATS ›` on the figures' line.
//   (2) "I'd like the date range for a season to be visible when you click
//       on it — for consistency maybe all date ranges become visible?" —
//       C1: one range line under the filter bar for EVERY preset.
// Every piece below transcribes the SHIPPED rule it names (index.css at
// v0.46.0 = 60ee51b9), NOT the Gate 0 draft above: A2-H3 over-draws the
// caption ruling 18 struck and measured 181 px where the phone shows 140.
// B0 is that transcription rendered unchanged, as the control the three
// options are measured against (hero-heights.json, Chromium at 390 px).
// ═══════════════════════════════════════════════════════════════════════════
T.sunken = "#efeade"; // --surface-sunken (tokens.css:7): the drawn PRESSED fill
const heights = JSON.parse(readFileSync(new URL("./hero-heights.json", import.meta.url), "utf8").toString() || "{}");
const px = (k) => (heights[k] === undefined ? "?" : `${heights[k]}`);

// .you-stats-figures: wrap, space-between, gap 4px 12px, mono 13/500/0.08em tabular.
// At 346 px the two spans do NOT fit on one line (LIFETIME ~168 px + 12 +
// SEASON ~194 px), so they wrap exactly as you.png shows.
const heroFigures = (extra = "") => `<p style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; margin: 0; ${mono(13, "0.08em", T.ink)} font-weight: 500; font-variant-numeric: tabular-nums; ${extra}"><span style="white-space: nowrap;">LIFETIME · ${lifeM} M</span><span style="white-space: nowrap;">SEASON 2027 · ${seasM} M</span></p>`;
// .stacked-bar: the shipped StackedBar.tsx (WIDTH 320 viewBox, width 100%,
// height 24, preserveAspectRatio none) — the 2 px gaps stretch with it.
const heroBar = () => stackSvg(rows, { w: 320, legend: false }).replace(`width="320" height="24"`, `width="100%" height="24" preserveAspectRatio="none" style="display: block;"`);
// .stats-legend-line + .stats-legend-chip: wrap, gap 6px 14px, mono 10/0.06em
// --ink-3, keys --ink, 10 px swatches. Five chips need ~362 px, so the last
// (NO TYPE 15%) wraps to a second row at every width drawn here.
function heroLegend() {
  const { buckets, total } = timeByType(rows);
  const items = TYPE_ORDER.filter((k) => buckets[k] > 0).map((k) => `<span style="display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;"><span style="width: 10px; height: 10px; background: ${TYPE_FILL[k]}; flex: none;"></span><span style="color: ${T.ink};">${k}</span><span>${Math.round(100 * buckets[k] / total)}%</span></span>`).join("");
  return `<p style="display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; ${mono(10, "0.06em")}">${items}</p>`;
}
// The doors' own chevron: `.diag-row` mono 12/0.08em --ink-3, `&rsaquo;`.
const chevron = `<span aria-hidden="true" style="${mono(12, "0.08em")} flex: none;">&rsaquo;</span>`;
const column = (inner) => `<div style="display: flex; flex-direction: column; gap: 10px; flex: 1 1 0; min-width: 0;">${inner}</div>`;
const hairlines = `border-top: 1px solid ${T.rule2}; border-bottom: 1px solid ${T.rule2};`;
/** The hero, one variant, resting or PRESSED. `pressed` paints
 *  --surface-sunken over the whole control — PROPOSED: index.css has no
 *  `:active` rule anywhere (grep ':active' app/src/index.css → 0 hits,
 *  2026-09-12), so the house has no pressed idiom to transcribe. */
function heroVariant(variant, { pressed = false } = {}) {
  const open = `display: flex; margin-top: 12px; padding: 12px 2px; min-height: 44px; ${hairlines} color: ${T.ink}; ${pressed ? `background: ${T.sunken};` : ""}`;
  const body = heroFigures() + heroBar() + heroLegend();
  switch (variant) {
    case "B0": // .you-stats-hero as shipped (v0.46.0)
      return `<a id="hero" aria-label="Stats" style="${open} flex-direction: column; gap: 10px;">${body}</a>`;
    case "B1": // + a trailing chevron, vertically centred, right edge at the doors' chevron column (padding 2px, as .diag-row)
      return `<a id="hero" aria-label="Stats" style="${open} align-items: center; gap: 12px;">${column(body)}${chevron}</a>`;
    case "B2": // the identity card's edge (.you: --surface, 1px --rule, 2px radius, 16px padding, gap 12px) + the chevron; the hairlines go
      return `<a id="hero" aria-label="Stats" style="display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 16px; min-height: 44px; background: ${pressed ? T.sunken : T.surface}; border: 1px solid ${T.rule}; border-radius: 2px; color: ${T.ink};">${column(body)}${chevron}</a>`;
    case "B3": { // `STATS ›` in the door-row style on the figures' FIRST line; the figures wrap beside it
      const label = `<span style="${mono(12, "0.08em")} white-space: nowrap; flex: none; line-height: 20px;">STATS <span aria-hidden="true">&rsaquo;</span></span>`;
      const head = `<div style="display: flex; align-items: flex-start; gap: 12px;">${heroFigures("flex: 1 1 0; min-width: 0;")}${label}</div>`;
      return `<a id="hero" aria-label="Stats" style="${open} flex-direction: column; gap: 10px;">${head}${heroBar()}${heroLegend()}</a>`;
    }
  }
  throw new Error(variant);
}
// The doors as SHIPPED on the capture's account (ruling 10: no STATS row;
// CONCEPT2 is conditional and absent on the screenshot account).
const doorsShipped = `<nav aria-label="More" style="margin-top: auto; display: flex; flex-direction: column;">${door("BASELINES", "2K 1:52.0 · 6K 2:02.0")}${door("SETTINGS")}${door("DIAGNOSTICS")}</nav>`;
const youBody = (variant) => identity("Screenshot Tester", "screenshots-you-stable0000000-s...", "ST") + heroVariant(variant) + doorsShipped;
const B_TITLE = { B0: "hero as shipped (control)", B1: "chevron", B2: "card edge + chevron", B3: "STATS › label" };
for (const v of ["B0", "B1", "B2", "B3"]) {
  files[`${v}-You.dc.html`] = head(`${v} You, ${B_TITLE[v]}`) + phone({ ...PORTRAIT, h: 844, body: youBody(v) }) + foot;
  files[`${v}-YouLandscape.dc.html`] = head(`${v} You landscape, ${B_TITLE[v]}`) + phone({ ...LANDSCAPE, h: 720, body: youBody(v) }) + foot;
  if (v === "B0") continue;
  // Pressed: resting over pressed, same width, so the fill is the only difference.
  const cap = (t) => `<p style="margin: 0 0 6px; ${mono(9, "0.14em", T.accent)}">${t}</p>`;
  files[`${v}-Pressed.dc.html`] = head(`${v} pressed state`) + `<div style="width: 390px; height: 420px; background: ${T.page}; border: 1px solid ${T.rule3}; padding: 20px 20px 0; box-sizing: border-box;">
  ${cap("RESTING")}${heroVariant(v)}
  <div style="height: 24px;"></div>
  ${cap("PRESSED · :ACTIVE · --SURFACE-SUNKEN FILL (PROPOSED — NO HOUSE :ACTIVE RULE EXISTS)")}${heroVariant(v, { pressed: true })}
</div>` + foot;
}

// ---- C1: the range line, one per preset, from the seed's own dates.
const seasonEnd = addDays(seasonStart, 364); // 2027-04-30
const lastOfMonth = (d) => { const [y, m] = d.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const dmy = (d) => `${dayMon(d)} ${d.slice(0, 4)}`;
/** `1 TO 30 SEP 2026` inside one month, `14 AUG TO 12 SEP 2026` inside one
 *  year, `1 MAY 2026 TO 30 APR 2027` across years. House: caps, mono. */
function rangeText(from, to) {
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))} TO ${Number(to.slice(8))} ${MON[Number(to.slice(5, 7)) - 1]} ${to.slice(0, 4)}`;
  if (from.slice(0, 4) === to.slice(0, 4)) return `${dayMon(from)} TO ${dmy(to)}`;
  return `${dmy(from)} TO ${dmy(to)}`;
}
const CUSTOM_FROM = "2026-08-14", CUSTOM_TO = today; // the seeded pair (A5)
// TWO variants for the three presets whose applied range ends TODAY
// (presetRange in domain/stats/calendar.ts: from … today) — antagonist
// delta pass, 2026-09-12: naming `30 APR 2027` alone would claim seven
// future months while the totals stop at today. A = the range the totals
// actually cover; B = the preset's own span with a TO DATE marker. ALL, 30
// DAYS and CUSTOM are identical in both. James picks.
const Y = today.slice(0, 4);
const RANGE_A = {
  ALL: `ALL TIME · SINCE ${dmy(rows[0].date)}`,
  SEASON: rangeText(seasonStart, today),
  YEAR: rangeText(`${Y}-01-01`, today),
  MONTH: rangeText(`${today.slice(0, 7)}-01`, today),
  "30 DAYS": rangeText(addDays(today, -29), today),
  CUSTOM: rangeText(CUSTOM_FROM, CUSTOM_TO),
};
const RANGE_B = {
  ...RANGE_A,
  SEASON: `SEASON 2027 · ${rangeText(seasonStart, seasonEnd)} · TO DATE`,
  YEAR: `${rangeText(`${Y}-01-01`, `${Y}-12-31`)} · TO DATE`,
  MONTH: `${rangeText(`${today.slice(0, 7)}-01`, lastOfMonth(today))} · TO DATE`,
};
const RANGE = { A: RANGE_A, B: RANGE_B };
// .stats-caption: mono 11/0.06em --ink-3, margin 8px 0 0 — the ONE prose
// line allowed back after rulings 18 and 19 (§14).
const rangeLineHtml = (sel, variant) => `<p id="range-line" style="margin: 8px 0 0; ${mono(11, "0.06em")}">${RANGE[variant][sel]}</p>`;
// .stats-chips / .stats-chip as shipped: 12px above, 1px --rule-3 frame, 2px
// radius, six flex:1 chips (44 min, padding 0 2px), mono 11/500/0.04em,
// --ink-2 on --surface, selected --on-color on --ink. NO caption (ruling 18).
function shippedFilterBar(selected, variant = "A") {
  const segs = ["ALL", "SEASON", "YEAR", "MONTH", "30 DAYS", "CUSTOM"].map((s, i) => {
    const on = s === selected;
    return `<span role="radio" aria-checked="${on}" style="flex: 1; min-width: 44px; min-height: 44px; padding: 0 2px; display: flex; align-items: center; justify-content: center; background: ${on ? T.ink : T.surface}; color: ${on ? T.on : T.ink2}; ${i < 5 ? `border-right: 1px solid ${T.rule3};` : ""} font-family: ${MONO}; font-size: 11px; font-weight: 500; letter-spacing: 0.04em; white-space: nowrap;">${s}</span>`;
  }).join("");
  const bar = `<div role="radiogroup" aria-label="Range" style="display: flex; margin-top: 12px; border: 1px solid ${T.rule3}; border-radius: 2px; overflow: hidden;">${segs}</div>`;
  // .stats-custom / .stats-date / .stats-date input as shipped; a date input's
  // width is INTRINSIC (Chromium ≈ 150 px), drawn at 150.
  const field = (label, v) => `<label style="display: flex; flex-direction: column; gap: 4px; ${mono(11, "0.06em")}"><span>${label}</span><span style="display: flex; align-items: center; width: 150px; min-height: 44px; padding: 0 8px; box-sizing: border-box; background: ${T.surface}; border: 1px solid ${T.rule3}; border-radius: 2px; font-family: ${MONO}; font-size: 16px; letter-spacing: 0; color: ${T.ink};">${v}</span></label>`;
  const custom = selected === "CUSTOM" ? `<div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px;">${field("FROM", CUSTOM_FROM)}${field("TO", CUSTOM_TO)}</div>` : "";
  return bar + custom + rangeLineHtml(selected, variant);
}
// TOTALS as shipped (TotalsGroup.tsx + .stats-card/.stats-table): no prose.
function shippedTotals(set) {
  const t = totals(set), m = t.machine;
  const thc = (x) => `<th style="text-align: right; white-space: nowrap; padding: 0 0 6px 12px; ${mono(10, "0.14em")} font-weight: 400;">${x}</th>`;
  const thr = (x) => `<th scope="row" style="text-align: left; width: 112px; height: 36px; vertical-align: middle; border-top: 1px solid ${T.rule2}; ${mono(10, "0.14em")} font-weight: 400;">${x}</th>`;
  const tdv = (x) => `<td style="text-align: right; height: 36px; vertical-align: middle; border-top: 1px solid ${T.rule2}; padding-left: 12px; font-size: 15px; font-weight: 500; color: ${T.ink}; white-space: nowrap;">${x}</td>`;
  const row = (l, a, b) => `<tr>${thr(l)}${tdv(a)}${tdv(b)}</tr>`;
  return `<section style="margin-top: 24px;"><h2 style="margin: 0; ${mono(12, "0.1em", T.ink)} font-weight: 600;">TOTALS</h2>
  <div style="margin-top: 12px; padding: 10px 14px 4px; background: ${T.surface}; border: 1px solid ${T.rule2}; border-radius: 2px;"><table style="width: 100%; table-layout: fixed; border-collapse: collapse; font-family: ${MONO}; font-variant-numeric: tabular-nums;">
  <thead><tr><th style="width: 112px;"></th>${thc("ALL ROWS")}${thc("MACHINE")}</tr></thead>
  <tbody>${row("METRES", fmtM(t.all.meters), fmtM(m.meters))}${row("TIME", fmtT(t.all.seconds), fmtT(m.seconds))}${row("SESSIONS", t.all.sessions, m.sessions)}${row("REST METRES", "", fmtM(m.restMeters))}${row("CALORIES", "", fmtM(m.calories))}${row("AVG WATTS", "", m.avgWatts ?? "—")}</tbody></table></div></section>`;
}
// TIME BY TYPE as shipped (TimeByTypeGroup.tsx + .stats-legend-row): the bar,
// then one grid row per non-empty bucket — swatch · key · time · percent.
function shippedTimeByType(set) {
  const { buckets, total } = timeByType(set);
  const rowsHtml = TYPE_ORDER.filter((k) => buckets[k] > 0).map((k) => `<li style="display: grid; grid-template-columns: 12px 1fr auto auto; gap: 8px; align-items: center; padding: 6px 0; font-family: ${MONO}; font-size: 12px; font-variant-numeric: tabular-nums; color: ${T.ink};"><span style="width: 12px; height: 12px; background: ${TYPE_FILL[k]};"></span><span>${k}</span><span>${fmtT(buckets[k])}</span><span style="color: ${T.ink3};">${Math.round(100 * buckets[k] / total)}%</span></li>`).join("");
  return `<section style="margin-top: 24px;"><h2 style="margin: 0; ${mono(12, "0.1em", T.ink)} font-weight: 600;">TIME BY TYPE</h2>${stackSvg(set, { w: 320, legend: false }).replace(`width="320" height="24"`, `width="100%" height="24" preserveAspectRatio="none" style="display: block;"`)}<ul style="list-style: none; margin: 8px 0 0; padding: 0;">${rowsHtml}</ul></section>`;
}
// C1 — the six states, cropped to the filter bar, on one board: row A (all
// six) and row B (the three that differ).
const c1Frame = (sel, variant) => `<div style="width: 350px;"><p style="margin: 0 0 4px; ${mono(9, "0.14em", T.accent)}">${variant} · ${sel} SELECTED</p><div style="background: ${T.page}; border: 1px solid ${T.rule3}; padding: 0 20px 16px; box-sizing: border-box; width: 390px; margin-left: -20px;">${shippedFilterBar(sel, variant)}</div></div>`;
const PRESET_NAMES = ["ALL", "SEASON", "YEAR", "MONTH", "30 DAYS", "CUSTOM"];
const rowHead = (t) => `<h2 style="font-family: ${SERIF}; font-weight: 500; font-size: 18px; margin: 24px 0 10px;">${t}</h2>`;
files["C1-RangeLines.dc.html"] = head("C1 Range line, six states, two variants") + `<div style="width: 1240px; padding: 24px 24px 24px 44px; background: ${T.surface}; box-sizing: border-box;">
  <h1 style="font-family: ${SERIF}; font-weight: 500; font-size: 24px; margin: 0 0 4px;">C1 · the range line under the filter bar, every preset — two variants</h1>
  <p style="margin: 0 0 4px; font-size: 13px; color: ${T.ink3}; max-width: 110ch; line-height: 1.5;">James, 2026-09-12: "I'd like the date range for a season to be visible when you click on it — for consistency maybe all date ranges become visible?" Drawn for all six. <b>This is the ONE prose line allowed back after rulings 18 and 19</b> (§14; the Stats page otherwise renders no caption). Style is <code>.stats-caption</code> as shipped: IBM Plex Mono 11 px, 0.06em, caps, middle dots, no em-dash, <code>--ink-3</code> on <code>--page</code> = <b>6.69:1</b> (text floor 4.5:1), 8 px under the chips — and under the CUSTOM inputs, where it repeats the inputs' own values. Not a control: no hit target. Dates are the seed's: ALL starts at R1 (${rows[0].date}); today is ${today}; CUSTOM is the seeded pair ${CUSTOM_FROM} to ${CUSTOM_TO}.</p>
  <p style="margin: 0; font-size: 13px; color: ${T.ink}; max-width: 110ch; line-height: 1.5;"><b>Pick A or B.</b> SEASON, YEAR and MONTH apply a range that ends TODAY (<code>presetRange</code>, domain/stats/calendar.ts), so a line reading <code>1 MAY 2026 TO 30 APR 2027</code> alone would claim seven future months. <b>A</b> names the range the totals actually cover. <b>B</b> names the preset's own span and marks it <code>· TO DATE</code>. ALL, 30 DAYS and CUSTOM are the same in both.</p>
  ${rowHead("A · the range the totals cover")}
  <div style="display: grid; grid-template-columns: repeat(3, 350px); gap: 28px 60px;">${PRESET_NAMES.map((s) => c1Frame(s, "A")).join("")}</div>
  ${rowHead("B · the preset's own span · TO DATE (ALL, 30 DAYS and CUSTOM as in A)")}
  <div style="display: grid; grid-template-columns: repeat(3, 350px); gap: 28px 60px;">${["SEASON", "YEAR", "MONTH"].map((s) => c1Frame(s, "B")).join("")}</div>
  <pre style="margin: 20px 0 0; font-family: ${MONO}; font-size: 11.5px; line-height: 1.6; color: ${T.ink};">A\n${PRESET_NAMES.map((k) => `  ${k.padEnd(8)} ${RANGE_A[k]}`).join("\n")}\nB\n${["SEASON", "YEAR", "MONTH"].map((k) => `  ${k.padEnd(8)} ${RANGE_B[k]}`).join("\n")}</pre>
</div>` + foot;
// C1b / C1c — the whole Stats page as shipped, SEASON selected, with its
// range line in variant A and in variant B.
const seasonSet = inRange(rows, seasonStart, today);
for (const v of ["A", "B"]) {
  files[`C1${v === "A" ? "b" : "c"}-StatsSeason${v}.dc.html`] = head(`C1${v === "A" ? "b" : "c"} Stats, SEASON selected, variant ${v}`) + phone({ ...PORTRAIT, h: 844, body: backLink + title("Stats") + shippedFilterBar("SEASON", v) + shippedTotals(seasonSet) + shippedTimeByType(seasonSet) }) + foot;
}
// A6d — SEASON at zero rows THIS season with ≥ 2 lifetime rows (every early
// May): the group's own empty line, cropped to the group. Drawn with a
// hypothetical today of 3 MAY 2027 (season 2028), so the seed's thirteen
// rows are all lifetime and none is this season's.
files["A6d-EmptySeason.dc.html"] = head("A6d Season, no rows yet") + `<div style="width: 390px; height: 240px; background: ${T.page}; border: 1px solid ${T.rule3}; padding: 20px; box-sizing: border-box;">
  <p style="margin: 0 0 8px; ${mono(9, "0.14em", T.accent)}">TODAY = 3 MAY 2027 · 13 LIFETIME ROWS · 0 THIS SEASON</p>
  ${groupHead("SEASON 2028")}${caption("MAY 1 TO TODAY · ALWAYS THIS SEASON · NOT FILTERED")}${card(emptyLine("NO ROWS THIS SEASON YET"))}
</div>` + foot;

// A7 — contrast and hit targets
const contrast = JSON.parse(readFileSync(new URL("./contrast.json", import.meta.url), "utf8"));
/** A ratio from contrast.json by token names, so no note hand-types one. */
const cr = (fg, bg) => { const p = contrast.pairs.find((q) => q.fg === fg && q.bg === bg); if (!p) throw new Error(`no pair ${fg} on ${bg}`); return p.ratio.toFixed(2); };
// The WHERE column wraps (the addendum's rows carry a sentence each); the
// other six stay nowrap.
const tdw = (t) => td(t).replace("white-space: nowrap;", "white-space: normal; line-height: 1.4;");
const cRows = contrast.pairs.map((p) => `<tr>${[p.fg + " " + p.fgHex, p.bg + " " + p.bgHex, p.kind, p.ratio.toFixed(2) + ":1", p.floor + ":1", `<span style="color: ${p.pass ? T.ink : T.accent}; font-weight: 600;">${p.pass ? "PASS" : "FAIL"}</span>`].map(td).join("")}${tdw(p.use)}</tr>`).join("");
const hits = [
  ["You hero block (opens /you/stats)", "H1 / H2 / H3 portrait heights are measured in the browser and stated on the canvas note beside A2; each ≥ 44px, full width"],
  ["STATS door row (.diag-row)", "44px min-height, full width"],
  ["← BACK (.back-link)", "44px min-height, 44px min-width"],
  ["Filter segment (.pace-ref-chip idiom) × 6", "44px tall, 58px wide each at 350px content width"],
  ["FROM / TO date inputs", "44px tall, ~171px wide each"],
  ["Tab bar item (.tab)", "44px min-height + safe-area padding, 78px wide"],
  ["Sign out (.button-outline)", "44px min-height"],
  ["Chart marks (bars, dots, cells)", "not tap targets in PR 1; PR 2's hover/tooltip layer owns them (dataviz: hit target larger than the mark)"],
  ["PR 2 addendum · B0 hero as shipped (control)", `${px("B0")}px tall at 390px (Chromium; you.png measures 140 hairline to hairline), full width, one tap target`],
  ["PR 2 addendum · B1 hero + chevron", `${px("B1")}px tall, full width; the chevron is inside the same single target — nothing new to tap`],
  ["PR 2 addendum · B2 hero as a card + chevron", `${px("B2")}px tall (16px card padding replaces the 12px open padding), full width, one target`],
  ["PR 2 addendum · B3 hero + STATS › label", `${px("B3")}px tall, full width; the label is text inside the one target, not a second control`],
  ["PR 2 addendum · C1 range line", "not a control (a caption under the chips); the six chips stay 44 × 58px"],
];
files["A7-Contrast.dc.html"] = head("A7 Contrast and hit targets") + `<div style="width: 1180px; padding: 24px; background: ${T.surface};">
  <h1 style="font-family: ${SERIF}; font-weight: 500; font-size: 24px; margin: 0 0 4px;">Every colour pairing on A2 to A6 and the PR 2 addendum (B0-B3, C1), computed</h1>
  <p style="margin: 0 0 16px; font-size: 13px; color: ${T.ink3};">${contrast.formula}. Hexes are ${contrast.tokens}, verbatim. Text floor 4.5:1 (no large text is used); non-text floor 3:1 (WCAG 1.4.11).</p>
  <table style="width: 100%;"><thead><tr>${["FOREGROUND", "BACKGROUND", "KIND", "RATIO", "FLOOR", "", "WHERE"].map(th).join("")}</tr></thead><tbody>${cRows}</tbody></table>
  <p style="margin: 12px 0 0; font-size: 13px; color: ${T.ink3}; max-width: 100ch; line-height: 1.5;">FAILs, each stated: the house hairlines (<code>.pace-ref-bases</code>, <code>.you</code>) predate this design and sit beside text carrying the same state. The handoff's muted bar tone (decision 9, #c9c3b2) fails 3:1 and so does --ink-5, so previous-week bars are DRAWN in --ink-4 (5.29:1); this deviates from the handoff and is flagged for the ruling. Gridlines and the not-rowed streak cell's outline are decorative: the data marks (bars, dots, rowed cells) carry the state at ≥ 5.29:1.
  Palette validator (dataviz skill, light mode on --surface): AN · AT · O2 · TR · NO TYPE passes adjacent-pair CVD (worst 13.5) and normal-vision (16.8) checks; the spec's listing order AN · O2 · AT · TR · NO TYPE fails both on O2↔AN. The validator's lightness-band and chroma-floor checks fail for every house token because the palette is deliberately muted (its reference bands assume saturated chart hues); reported, not acted on.</p>
  <h2 style="font-family: ${SERIF}; font-weight: 500; font-size: 20px; margin: 28px 0 8px;">Hit targets</h2>
  <table style="width: 100%;"><thead><tr>${["CONTROL", "MEASURE"].map(th).join("")}</tr></thead><tbody>${hits.map((h) => `<tr>${h.map(td).join("")}</tr>`).join("")}</tbody></table>
</div>` + foot;

// Main — the canvas legend
files["Main.dc.html"] = head("Career stats on You") + `<div style="width: 1180px; padding: 24px; background: ${T.surface};">
  <h1 style="font-family: ${SERIF}; font-weight: 500; font-size: 28px; margin: 0 0 8px;">Phase PS Gate 0 · career stats on the You tab</h1>
  <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.5; max-width: 100ch;">What you are approving: a hero on You under the identity card (three candidates, H1 metres per week · H2 streak strip · H3 time by type; each carries LIFETIME and SEASON work metres and is one tap target) with a STATS door above BASELINES, and the <code>/you/stats</code> subpage behind it: a six-way range filter, TOTALS in two columns (ALL ROWS beside MACHINE), then METRES PER WEEK, TIME BY TYPE, SEASON (cumulative curve, avg m/day, streaks) and TEST TREND (2k and 6k). Every chart is drawn from the same thirteen seeded rows and six test rows; the arithmetic is on the Seed artboard.</p>
  <p style="margin: 0; font-size: 13px; color: ${T.ink3}; line-height: 1.6;">Row 1: A1 You today (the committed captures). Row 2: the three hero candidates, portrait. Row 3: the same three in landscape. Row 4: A3 the subpage in portrait and A4 in landscape; the dashed red line is the viewport bottom. Row 5: A5 CUSTOM open and A5b its FROM-after-TO state. Row 6: A6 the empty states. Row 7: the seed and the contrast and hit-target tables.<br>Matched: app/src/theme/tokens.css (page #f4f1e8, surface #fffdf7, ink scale, type colours, 2px radius, 44px tap), index.css .you / .diag-row / .back-link / .screen-title / .pace-ref-chip / .tab / .trace-line, Newsreader · Archivo · IBM Plex Mono.</p>
  <p style="margin: 12px 0 0; font-size: 13px; color: ${T.ink}; line-height: 1.6; max-width: 100ch;"><b>PR 2 addendum (2026-09-12, after v0.46.0 shipped; A-boards untouched).</b> Row 8: B0 the hero exactly as shipped (the control), then B1 chevron · B2 card edge + chevron · B3 STATS › label — each portrait board with its PRESSED state beside it. Row 9: B1-B3 in landscape. Row 10: C1 the range line under the filter bar in all six states, and C1b the shipped Stats page with SEASON selected. A7 carries the new pairings and heights.</p>
</div>` + foot;

for (const [name, src] of Object.entries(files)) writeFileSync(new URL(`./${name}`, import.meta.url), src);

// ---- canvas layout: >= 80px between frames in a row, >= 120px between rows
const boards = [
  { file: "Main.dc.html", x: 0, y: 0, w: 1180, h: 300 },
  { file: "A1-YouToday.dc.html", x: 0, y: 440, w: 390, h: 844, title: "A1 · You today (capture)" },
  { file: "A1b-YouTodayLandscape.dc.html", x: 480, y: 440, w: 844, h: 390, title: "A1b · You today, landscape (capture)" },
  { file: "A2-H1-You.dc.html", x: 0, y: 1420, w: 390, h: 844, title: "A2-H1 · hero = METRES PER WEEK" },
  { file: "A2-H2-You.dc.html", x: 480, y: 1420, w: 390, h: 844, title: "A2-H2 · hero = STREAK WEEK STRIP" },
  { file: "A2-H3-You.dc.html", x: 960, y: 1420, w: 390, h: 844, title: "A2-H3 · hero = TIME BY TYPE" },
  { file: "A2-H1-YouLandscape.dc.html", x: 0, y: 2540, w: 844, h: 720, title: "A2-H1 landscape" },
  { file: "A2-H2-YouLandscape.dc.html", x: 940, y: 2540, w: 844, h: 720, title: "A2-H2 landscape" },
  { file: "A2-H3-YouLandscape.dc.html", x: 1880, y: 2540, w: 844, h: 720, title: "A2-H3 landscape" },
  { file: "A3-StatsPortrait.dc.html", x: 0, y: 3400, w: 390, h: 2400, title: "A3 · /you/stats portrait, ALL" },
  { file: "A4-StatsLandscape.dc.html", x: 480, y: 3400, w: 844, h: 2300, title: "A4 · /you/stats landscape, ALL" },
  { file: "A5-CustomOpen.dc.html", x: 0, y: 5940, w: 390, h: 2460, title: "A5 · CUSTOM open (Aug 14 to Sep 12)" },
  { file: "A5b-CustomError.dc.html", x: 480, y: 5940, w: 390, h: 2460, title: "A5b · CUSTOM, FROM after TO" },
  { file: "A6a-Empty0Rows.dc.html", x: 0, y: 8540, w: 390, h: 844, title: "A6a · no rows" },
  { file: "A6b-Empty1Row.dc.html", x: 480, y: 8540, w: 390, h: 1900, title: "A6b · one row" },
  { file: "A6c-NoMonitorRows.dc.html", x: 960, y: 8540, w: 390, h: 2300, title: "A6c · three rows, none from a monitor" },
  { file: "Seed.dc.html", x: 0, y: 10980, w: 1180, h: 1500, title: "Seed rows + arithmetic" },
  { file: "A7-Contrast.dc.html", x: 1260, y: 10980, w: 1180, h: 1600, title: "A7 · contrast + hit targets" },
  // ---- PR 2 addendum rows (8-10)
  { file: "B0-You.dc.html", x: 0, y: 12700, w: 390, h: 844, title: "B0 · hero AS SHIPPED (control)" },
  { file: "B1-You.dc.html", x: 480, y: 12700, w: 390, h: 844, title: "B1 · chevron" },
  { file: "B1-Pressed.dc.html", x: 960, y: 12700, w: 390, h: 420, title: "B1 · pressed" },
  { file: "B2-You.dc.html", x: 1440, y: 12700, w: 390, h: 844, title: "B2 · card edge + chevron" },
  { file: "B2-Pressed.dc.html", x: 1920, y: 12700, w: 390, h: 420, title: "B2 · pressed" },
  { file: "B3-You.dc.html", x: 2400, y: 12700, w: 390, h: 844, title: "B3 · STATS › label" },
  { file: "B3-Pressed.dc.html", x: 2880, y: 12700, w: 390, h: 420, title: "B3 · pressed" },
  { file: "B0-YouLandscape.dc.html", x: 0, y: 13700, w: 844, h: 720, title: "B0 landscape (control)" },
  { file: "B1-YouLandscape.dc.html", x: 940, y: 13700, w: 844, h: 720, title: "B1 landscape" },
  { file: "B2-YouLandscape.dc.html", x: 1880, y: 13700, w: 844, h: 720, title: "B2 landscape" },
  { file: "B3-YouLandscape.dc.html", x: 2820, y: 13700, w: 844, h: 720, title: "B3 landscape" },
  { file: "C1-RangeLines.dc.html", x: 0, y: 14560, w: 1240, h: 1160, title: "C1 · range line, six states, variants A and B" },
  { file: "C1b-StatsSeasonA.dc.html", x: 1320, y: 14560, w: 390, h: 844, title: "C1b · Stats, SEASON selected, variant A" },
  { file: "C1c-StatsSeasonB.dc.html", x: 1800, y: 14560, w: 390, h: 844, title: "C1c · Stats, SEASON selected, variant B" },
  { file: "A6d-EmptySeason.dc.html", x: 1900, y: 8540, w: 390, h: 240, title: "A6d · SEASON, no rows this season yet (added 2026-09-12)" },
];
const annotations = [
  { id: "hero-heights", x: 1440, y: 1420, w: 420, text: `Hero heights in portrait, measured in Chromium at 390px (hero-heights.json):\nH1 METRES PER WEEK · ${heights.H1 ?? "?"}px\nH2 STREAK WEEK STRIP · ${heights.H2 ?? "?"}px\nH3 TIME BY TYPE · ${heights.H3 ?? "?"}px\nEach is one 44px+ tap target opening /you/stats; the doors group keeps DIAGNOSTICS last. In portrait all four doors stay above the 844px fold for every candidate; in landscape every candidate scrolls (accepted 2026-09-12).` },
  { id: "a2-check", x: 1440, y: 1640, w: 420, text: `Headline figures, recomputed from the seed rows (Seed artboard):\nLIFETIME = all thirteen rows = ${lifeM} M\nSEASON 2027 = rows dated May 1 2026 or later (R5..R13) = ${seasM} M\nH1 bars: ${wk8.map((w) => fmtM(wmAll[w] ?? 0)).join(" · ")} (weeks of Jul 20 .. Sep 7)\nH2 strip: ${weeksEnding(today, 16).map((w) => (wmAll[w] ? "■" : "□")).join("")}, streak 3 / longest 3\nH3 stack: AN 5.7% · AT 26.6% · O2 43.4% · TR 9.6% · NO TYPE 14.6%` },
  { id: "a3-check", x: 0, y: 5830, w: 480, text: "A3/A4 TOTALS: ALL 56,752 m / 3:59:39 / 13. MACHINE 36,752 m / 2:34:31 / 10; 8 OF 10 own totals; rest 718; calories 1,731 (8 OF 10); avg watts 176 over the nine non-stored pm5 rows. Seam line counts R1 (ruled: singular form, full-width n OF m line). Filter scope is stated under the strip: TOTALS, METRES PER WEEK and TIME BY TYPE follow the range; SEASON and TEST TREND never do." },
  { id: "palette-note", x: 560, y: 5830, w: 480, text: "TIME BY TYPE stack order is AN · AT · O2 · TR · NO TYPE, not the spec's listing AN · O2 · AT · TR · NO TYPE: the dataviz palette validator fails the O2↔AN adjacency (normal-vision ΔE 11.3 < 15, deutan 4.9) and passes the drawn order (16.8 / 13.5). Previous-week bars are --ink-4, not the handoff's #c9c3b2 (1.73:1 < 3:1). Both are deviations for the ruling (A7)." },
  { id: "a5-note", x: 960, y: 5940, w: 420, text: "A5: the CUSTOM range Aug 14 .. Sep 12 has four rows; METRES PER WEEK draws the eight weeks ending Sep 12 and marks the weeks that begin before the range (Jul 20 .. Aug 10) as OUT OF RANGE slots — a dashed --rule-2 outline (decorative, 1.40:1) labelled once across the run. SEASON and TEST TREND are unchanged by the filter.\nCORRECTED 2026-09-12 (antagonist delta pass): the draft's SEASON curve was drawn from the FILTERED rows (18,000 TODAY beside AVG M/DAY 319); the curve now draws from the unfiltered season rows, 43,012 TODAY, as its caption says." },
  { id: "a3-trend", x: 1400, y: 3400, w: 420, text: "TEST TREND y axis, CORRECTED 2026-09-12 (antagonist delta pass): ticks are what the app's primitives emit — chooseTicks([112, 126], 4) = 115 / 120 / 125 (nice steps are 1·2·5·10 × 10^k; the draft's 4 s step cannot occur), printed as whole-second splits 1:55 · 2:00 · 2:05 by a \"split\" tick kind PR 2 adds (formatTick(·, \"pace\") prints tenths). This replaces the hand-typed 1:54 · 1:58 · 2:02 · 2:06 on the approved draft; the points and lines are unchanged." },
  { id: "a6-note", x: 1440, y: 8540, w: 420, text: "A6b (one row): TOTALS render; METRES PER WEEK, TIME BY TYPE and SEASON each read TWO ROWS MAKE A CHART; TEST TREND draws the single T6 point (a record of one is still a record). A6c (three manual rows): MACHINE column reads NO MONITOR ROWS YET with its rows hidden; the charts render from the three rows; no test history, so TEST TREND reads NO 2K OR 6K TEST LOGGED." },
  // ---- PR 2 addendum notes
  { id: "b-heights", x: 3360, y: 12700, w: 460, text: `PR 2 ADDENDUM · You hero affordance (James: "experiment with how to indicate that the row is clickable").\nHeights at 390px, Chromium, hairline/edge to hairline/edge (hero-heights.json):\nB0 as shipped · ${px("B0")}px (you.png: 140)\nB1 chevron · ${px("B1")}px · touch target unchanged (the chevron is inside the one Link) · the bar loses ~19px of width to the chevron column · chevron right edge = the doors' chevron column\nB2 card + chevron · ${px("B2")}px · +8px (16px card padding, as the identity card) · the chevron sits 16px in, NOT on the doors' column · the hairlines go\nB3 STATS › · ${px("B3")}px · touch target unchanged · the figures already wrap at this width (LIFETIME / SEASON on two lines, as shipped), so the label rides LIFETIME's line and SEASON wraps under it\nPortrait fold: unchanged for all three — the doors are pinned to the bottom (margin-top: auto) and the hero has ~380px of slack above them (B0). Landscape: all scroll (ruling 14); row 9 shows the +8px on B2 moves nothing above the fold.\nPRESSED: --surface-sunken (#efeade) over the whole control. PROPOSED, not house — index.css has no :active rule (grep, 0 hits). Contrast on the fill (contrast.json): --ink ${cr("--ink", "--surface-sunken")}:1, --ink-3 ${cr("--ink-3", "--surface-sunken")}:1, AN ${cr("--type-an", "--surface-sunken")}, AT ${cr("--type-at", "--surface-sunken")}, O2 ${cr("--type-o2", "--surface-sunken")}, NO TYPE ${cr("--ink-4", "--surface-sunken")} — text ≥ 4.5:1 and marks ≥ 3:1 throughout; the fill itself against --page is ${cr("--surface-sunken", "--page")}:1 (a state cue, not a data mark) — A7.` },
  { id: "c1-note", x: 2280, y: 14560, w: 460, text: `PR 2 ADDENDUM · Stats range line (James: "the date range for a season to be visible when you click on it — maybe all date ranges become visible?").\nDrawn for all six presets, in .stats-caption's shipped style (--ink-3 on --page 6.69:1). It is the ONE prose line back after rulings 18-19.\nPICK A OR B (C1 rows; C1b and C1c show each on the full page): SEASON, YEAR and MONTH apply a range that ends TODAY (presetRange, domain/stats/calendar.ts), so A names the range the totals cover (1 MAY TO 12 SEP 2026) and B names the preset's own span with a TO DATE marker (SEASON 2027 · 1 MAY 2026 TO 30 APR 2027 · TO DATE). ALL, 30 DAYS and CUSTOM are identical in both.\nMEASURED COSTS (Chromium, 390px): B's SEASON line (44 characters) WRAPS to two lines at the 350px content width; A's longest is 22 characters, one line. Any range line adds ~25px, and on the SEASON page that pushes the last TIME BY TYPE legend row (NO TYPE) under the tab bar before the first scroll (C1b/C1c) — the shipped ALL page (you-stats.png) fit without scrolling.\nCUSTOM: the line repeats the two inputs' values (as briefed) — say if that is one line too many.` },
];
writeFileSync(new URL("./canvas.json", import.meta.url), JSON.stringify({ artboards: boards, annotations, launch: { view: "canvas" } }, null, 2) + "\n");
console.log(`wrote ${Object.keys(files).length} artboards + canvas.json`);
