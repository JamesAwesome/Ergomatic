import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/** Whole-document WCAG audit. Native axe.run prunes passing-node reports
 * before serialization; runPartial materializes them before pruning.
 * Legacy mode cannot cover cross-origin frames, so only a page that stays
 * single-frame may use it. An attachment during a single-frame audit
 * fails closed, never retries.
 */
export async function analyzeAccessibility(page: Page) {
  let attached = false;
  const onFrame = () => {
    attached = true;
  };
  page.on("frameattached", onFrame);
  try {
    const singleFrame = page.frames().length === 1;
    const result = await new AxeBuilder({ page })
      .options({ resultTypes: ["violations", "incomplete"] })
      .withTags(["wcag2a", "wcag2aa"])
      .setLegacyMode(singleFrame)
      .analyze();
    if (singleFrame && (attached || page.frames().length !== 1)) {
      throw new Error("Frame attached during single-frame accessibility audit");
    }
    return result;
  } finally {
    page.off("frameattached", onFrame);
  }
}
