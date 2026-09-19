import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Every colour pairing this change PUTS ON SCREEN, computed rather than
// judged (RF6: a token once shipped at 3.29:1 against a 4.5:1 requirement
// and only an automated scan caught it).
//
// All values are app/src/theme/tokens.css verbatim. This change introduces
// NO new colour and no new field treatment: the proposed input is
// `.baseline-field`'s own shape — --surface inside a 1px --ink border, with
// the focus state swapping that border to --accent. Every row below is a
// pairing the app already ships, which is the point and is why it is short.
//
// THE FIRST DRAFT OF THIS TABLE FAILED THREE ROWS, and it was the pack that
// was wrong rather than the app: the mock had invented a --rule-2 border
// (1.26:1) where the house field uses --ink (15.41:1). Recorded because a
// contrast table that never failed anything is not evidence that it ran.
const here = dirname(fileURLToPath(import.meta.url));
const hex = {
  page: "#f4f1e8",
  surface: "#fffdf7",
  surfaceSunken: "#efeade",
  ink: "#1b1a17",
  ink2: "#3f3c35",
  ink3: "#57544c",
  ink4: "#6f6a5f",
  rule: "#d8d3c4",
  rule2: "#ded8c9",
  accent: "#b5341f",
  success: "#49624f",
};

const srgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
};
const lum = (h) => {
  const [r, g, b] = srgb(h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(hex[a]), lum(hex[b])].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [what it is, foreground, background, the bar it must clear and why]
const pairs = [
  ["Typed name, in the field", "ink", "surface", 4.5, "body text"],
  ["Field border against the page", "ink", "page", 3, "non-text UI (1.4.11)"],
  ["Focused field border", "accent", "page", 3, "non-text UI, focus state"],
  ["NAME heading", "ink3", "page", 4.5, "small text, 11px mono"],
  ["Save label, enabled", "ink", "page", 4.5, "button text"],
  ["Save border, enabled", "ink", "page", 3, "non-text UI"],
  ["Save label, disabled", "ink4", "page", 4.5, "still must be readable"],
  ["Save border, disabled", "ink4", "page", 3, "non-text UI"],
  ["Helper note", "ink3", "page", 4.5, "small text"],
  ["Refusal note", "accent", "page", 4.5, "small text, carries meaning"],
  ["SAVED confirmation", "success", "page", 4.5, "small text, 10px mono"],
  ["Focus ring on the field", "ink", "page", 3, "non-text UI (1.4.11)"],
];

const rows = pairs.map(([what, fg, bg, bar, why]) => {
  const r = ratio(fg, bg);
  return {
    what,
    pairing: `${fg} on ${bg}`,
    hex: `${hex[fg]} on ${hex[bg]}`,
    ratio: Math.round(r * 100) / 100,
    bar,
    why,
    passes: r >= bar,
  };
});

const failing = rows.filter((r) => !r.passes);
await writeFile(
  join(here, "contrast.json"),
  JSON.stringify({ rows, failing: failing.length }, null, 2) + "\n",
);
for (const r of rows)
  console.log(
    `${r.passes ? "PASS" : "FAIL"}  ${String(r.ratio).padStart(6)}:1  (needs ${r.bar})  ${r.what}`,
  );
console.log(failing.length ? `\n${failing.length} FAILING` : "\nall pairings pass");
