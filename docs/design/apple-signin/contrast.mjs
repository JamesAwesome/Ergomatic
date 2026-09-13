import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const hex = {
  page: "#f4f1e8", surface: "#fffdf7", sunken: "#efeade",
  ink: "#1b1a17", ink2: "#3f3c35", ink3: "#57544c", ink4: "#6f6a5f",
  rule: "#d8d3c4", accent: "#b5341f", accentHover: "#9c2c19",
  onColor: "#fffdf7", focus: "#1d4e89", success: "#49624f",
  apple: "#000000", appleHover: "#1b1b1b", white: "#ffffff"
};

function lum(color) {
  const values = color.slice(1).match(/../g).map(n => parseInt(n, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}
function ratio(a, b) {
  const [hi, lo] = [lum(hex[a]), lum(hex[b])].sort((x, y) => y - x);
  return Number(((hi + .05) / (lo + .05)).toFixed(2));
}
const checks = [
  ["Primary text on page", "ink", "page", "text"],
  ["Supporting text on page", "ink3", "page", "text"],
  ["Primary text on surface", "ink", "surface", "text"],
  ["Supporting text on surface", "ink3", "surface", "text"],
  ["Secondary text on sunken", "ink2", "sunken", "text"],
  ["Google/Create label on accent", "onColor", "accent", "text"],
  ["Google/Create hover label", "onColor", "accentHover", "text"],
  ["Apple label/logo on black", "white", "apple", "text"],
  ["Apple label/logo on hover", "white", "appleHover", "text"],
  ["Outline button label", "ink", "surface", "text"],
  ["Connected status on page", "success", "page", "text"],
  ["Error border on page", "accent", "page", "ui"],
  ["Success border on page", "success", "page", "ui"],
  ["Outline button border on page", "ink", "page", "ui"],
  ["Apple button edge on page", "apple", "page", "ui"],
  ["Google button edge on page", "accent", "page", "ui"],
  ["Focus ring beside page", "focus", "page", "focus"],
  ["Focus ring beside surface", "focus", "surface", "focus"],
  ["Decorative card rule on page", "rule", "page", "decorative"],
  ["Meaningful ink-4 rule on page", "ink4", "page", "ui"],
  ["Meaningful ink-4 rule on sunken", "ink4", "sunken", "ui"]
].map(([name, foreground, background, role]) => ({ name, foreground: hex[foreground], background: hex[background], ratio: ratio(foreground, background), role }));

await writeFile(join(here, "contrast.json"), JSON.stringify({ formula: "WCAG 2.x relative luminance", checks }, null, 2) + "\n");
for (const check of checks) console.log(`${check.name}: ${check.ratio}:1`);
