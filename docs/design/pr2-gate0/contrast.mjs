import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Every pairing this Gate 0 pack puts on screen, plus the two the copy
// round asks a question about. Values are app/src/theme/tokens.css verbatim.
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
  // The new attach screen.
  ["Attach title on page", "ink", "page", "text", 4.5],
  ["Attach intro on page", "ink3", "page", "text", 4.5],
  ["Carried/destination name on surface", "ink", "surface", "text", 4.5],
  ["Relay address on surface", "ink3", "surface", "text", 4.5],
  ["ATTACHING / THIS ACCOUNT label on page", "ink3", "page", "text", 4.5],
  ["Avatar initials on ink", "onColor", "ink", "text", 4.5],
  ["Attach Apple label on accent", "onColor", "accent", "text", 4.5],
  ["Attach Apple hover label", "onColor", "accentHover", "text", 4.5],
  ["No-button label on surface", "ink", "surface", "text", 4.5],
  ["Explain card body on sunken", "ink2", "sunken", "text", 4.5],
  // Boundaries that carry meaning on that screen.
  ["Identity card edge (ink-4) on page", "ink4", "page", "ui", 3],
  ["Primary button edge on page", "accent", "page", "ui", 3],
  ["No-button edge on page", "ink", "page", "ui", 3],
  ["Focus ring beside page", "focus", "page", "focus", 3],
  ["Focus ring beside surface", "focus", "surface", "focus", 3],
  // The methods list the outcome lands on.
  ["CONNECTED mark on surface", "success", "surface", "text", 4.5],
  ["Success notice edge on page", "success", "page", "ui", 3],
  // Copy round item 4, both sides of the question.
  ["Hairline TODAY: --rule on surface", "rule", "surface", "decorative", 3],
  ["Hairline TODAY: --rule on page", "rule", "page", "decorative", 3],
  ["Hairline RAISED: #928a78 on surface", "ruleRaised", "surface", "ui", 3],
  ["Hairline RAISED: #928a78 on page", "ruleRaised", "page", "ui", 3]
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
