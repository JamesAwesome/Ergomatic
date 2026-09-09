/**
 * Every string a rower could be READ, out of a rendered subtree — the text
 * AND the attribute values, joined into one blob for a `.not.toContain(…)`
 * copy sweep.
 *
 * WHY THIS EXISTS. RF32's rule ("in user-facing copy the erg's display is
 * 'the monitor'") governs copy wherever it lands, and a screen reader reads
 * an `aria-label` exactly as it reads a `<p>`. A sweep written the obvious
 * way — `expect(document.body.textContent).not.toContain("PM5")` — cannot
 * see an attribute at all, so it passes against a frame whose every visible
 * word is right and whose label still names the brand. That gap was found
 * by review on the RF32 rejection gate (`ConnectedInterstitial.test.tsx`),
 * not by the gate.
 *
 * DERIVED, NEVER HAND-LISTED (RF37's second check). It walks `attributes`
 * on every element, rather than checking a typed-out set of "the ones that
 * carry copy" — a list of `aria-label`/`title`/`alt`/`placeholder` looks
 * complete right up until someone adds the ninth. The cost of taking all of
 * them is that structural values (class names, hrefs, `data-*`) are in the
 * blob too, so a needle that could legitimately appear in one of those is
 * the caller's problem to exclude explicitly and say why. `PM5` is not such
 * a needle: this codebase's class names are lower-kebab throughout.
 *
 * Callers that need to exempt a node (a status label that is deliberately
 * the monitor's own advertised name, say) `.remove()` it first, which takes
 * its attributes with it — see that test's own reasoning for why removing
 * beats excusing.
 */
export function renderedCopy(root: ParentNode = document.body): string {
  const parts: string[] = [root.textContent ?? ""];
  const all: Element[] =
    root instanceof Element
      ? [root, ...root.querySelectorAll("*")]
      : [...root.querySelectorAll("*")];
  for (const el of all) {
    for (const attr of el.attributes) parts.push(attr.value);
  }
  return parts.join("\n");
}
