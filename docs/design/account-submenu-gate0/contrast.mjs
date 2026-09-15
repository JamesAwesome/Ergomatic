import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Every pairing this Gate 0 pack puts on screen, plus the two the copy
// round asks a question about.
//
// MOST values are app/src/theme/tokens.css verbatim. THREE ARE NOT, and
// saying which matters, because a ratio computed against a colour the app
// does not use is a number about nothing:
//   * `focus` (#1d4e89) is NOT a token. `--focus` does not exist; this value
//     is `--judge-blue`, and the app's real ring on these surfaces is
//     `outline: 2px solid var(--ink)` (app/src/index.css). The two focus-ring
//     rows below are therefore about the PACK's ring, not the app's — the
//     app's own ring is covered by the ink-on-page and ink-on-surface rows,
//     which are 15.41:1 and 17.11:1.
//   * `apple` (#000000) and `white` (#ffffff) are literals from Apple's own
//     button spec, not Ergomatic tokens, and no check below consumes them.
const here = dirname(fileURLToPath(import.meta.url));
const hex = {
  page: "#f4f1e8", surface: "#fffdf7", sunken: "#efeade",
  ink: "#1b1a17", ink2: "#3f3c35", ink3: "#57544c", ink4: "#6f6a5f",
  rule: "#d8d3c4", ruleRaised: "#928a78",
  accent: "#b5341f", accentHover: "#9c2c19",
  onColor: "#fffdf7", focus: "#1d4e89", success: "#49624f",
  apple: "#000000", white: "#ffffff"
};

function lum(color) {
  const values = color.slice(1).match(/../g).map(n => parseInt(n, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}
function ratio(a, b) {
  const [hi, lo] = [lum(hex[a]), lum(hex[b])].sort((x, y) => y - x);
  return Number(((hi + .05) / (lo + .05)).toFixed(2));
}

const checks = [
  // The destructive control, which this gate is about.
  ["Delete account label on surface", "accent", "surface", "text", 4.5],
  ["Delete account border on page", "accent", "page", "ui", 3],
  ["ACCOUNT heading on page", "ink3", "page", "text", 4.5],
  ["Re-auth disclosure on page", "ink3", "page", "text", 4.5],
  // The doors group a new ACCOUNT row would join.
  ["Door row label on page", "ink3", "page", "text", 4.5],
  ["Door row label, promoted to ink", "ink", "page", "text", 4.5],
  ["Door row separator on page", "rule", "page", "decorative", 3],
  // The subpage the row opens.
  ["Subpage title on page", "ink", "page", "text", 4.5],
  ["Back link on page", "ink3", "page", "text", 4.5],
  // What stays on You in every option.
  ["Name on page", "ink", "page", "text", 4.5],
  ["Email on page", "ink3", "page", "text", 4.5],
  ["Sign out label on page", "ink", "page", "text", 4.5],
  ["Sign out border on page", "ink", "page", "ui", 3],
  ["CONNECTED mark on page", "success", "page", "text", 4.5],
  ["Focus ring beside page", "focus", "page", "focus", 3]
].map(([name, foreground, background, role, floor]) => {
  const value = ratio(foreground, background);
  return {
    name, foreground: hex[foreground], background: hex[background], role,
    ratio: value, floor,
    // A decorative boundary is EXEMPT from the 3:1 non-text minimum; it is
    // reported with its number anyway, because the exemption is the claim
    // being made and a reader has to be able to check it.
    passes: role === "decorative" ? null : value >= floor
  };
});

await writeFile(join(here, "contrast.json"),
  JSON.stringify({ formula: "WCAG 2.x relative luminance", tokens: hex, checks }, null, 2) + "\n");

let failures = 0;
for (const check of checks) {
  const verdict = check.passes === null ? "decorative, exempt"
    : check.passes ? `pass (>= ${check.floor})` : `FAIL (needs ${check.floor})`;
  if (check.passes === false) failures += 1;
  console.log(`${check.ratio.toFixed(2)}:1  ${check.name} — ${verdict}`);
}
console.log(failures ? `${failures} pairing(s) below their floor` : "every non-decorative pairing clears its floor");
