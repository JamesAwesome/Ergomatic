import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInViaBackdoor } from "./helpers";

/** Deletes a signed-in user's own (non-global) workout by title, so a
 *  design-sweep test that has to create real data via bulk import doesn't
 *  accumulate stale rows across reruns against the same e2e email. Copied
 *  from builder.spec.ts's own `cleanupByTitle` — duplicated rather than
 *  shared across e2e files, same precedent as this codebase's other
 *  intentionally-duplicated small helpers (e.g. EditWorkout.tsx's
 *  loading/error states mirroring WorkoutDetail.tsx's). */
async function cleanupByTitle(page: Page, title: string): Promise<void> {
  const result = await page.evaluate(async (t) => {
    const listRes = await fetch("/api/workouts");
    if (!listRes.ok) return { ok: false, status: listRes.status };
    const workouts = (await listRes.json()) as Array<{
      id: string;
      title: string;
      isGlobal: boolean;
    }>;
    const match = workouts.find((w) => !w.isGlobal && w.title === t);
    if (!match) return { ok: true, status: 200 };
    const delRes = await fetch(`/api/workouts/${match.id}`, {
      method: "DELETE",
    });
    return { ok: delRes.ok, status: delRes.status };
  }, title);
  if (!result.ok) {
    throw new Error(`cleanup failed for "${title}": ${result.status}`);
  }
}

// Structural design rules, asserted against the real rendered app rather
// than a mock — a failure here is a real finding about the shipped UI, not
// a fixture drift. See docs/superpowers/specs/2026-07-28-testing-
// validation-design.md ("no pixel-diff gating; machines judge rules").

async function assertTapTargets(page: Page): Promise<void> {
  const elements = await page
    .locator("a, button, [role=button], input, select")
    .all();
  for (const el of elements) {
    if (!(await el.isVisible())) continue;
    const className = await el.evaluate(
      (node) => (node as HTMLElement).className,
    );
    // The one narrow, already-documented exception (docs/design/
    // DEVIATIONS.md, "N/A — the handoff has no notion of a 'convenience'
    // tap area..."): StepCard.tsx's collapsed `.step-card-line1` (326x18)
    // and `.step-card-sub` (180x14) each duplicate the fully-compliant
    // 48x44 EDIT cell's own onExpand action, in the same card, at less than
    // 44x44 — WCAG 2.5.8's Equivalent Control exception covers exactly
    // this. The project's own stricter, exception-free 44px rule still
    // treats these as a genuine, accepted violation (per DEVIATIONS.md);
    // excluding them here is that one recorded carve-out, not a general
    // weakening of this sweep.
    if (
      typeof className === "string" &&
      (className.includes("step-card-line1") ||
        className.includes("step-card-sub"))
    ) {
      continue;
    }
    const box = await el.boundingBox();
    const label = await el.evaluate((node) => node.outerHTML.slice(0, 120));
    expect(box, `missing bounding box for: ${label}`).not.toBeNull();
    expect(box!.width, `width < 44 for: ${label}`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `height < 44 for: ${label}`).toBeGreaterThanOrEqual(44);
  }
}

async function assertNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("sign-in screen (signed out)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and primary button match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const buttonBg = await page
      .getByRole("link", { name: /continue with google/i })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(buttonBg).toBe("rgb(181, 52, 31)"); // --accent
  });
});

test.describe("signed-in home", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design@e2e.test",
      name: "Design Tester",
    });
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background matches the token palette", async ({ page }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page
  });
});

test.describe("library screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-library@e2e.test",
      name: "Design Library Tester",
    });
    await page.goto("/library");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and the active filter chip match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    // No filters applied on first load, so the "ALL" chip is the active
    // (aria-pressed) one — see FilterChips.tsx's isEmptyFilters.
    const allChipBg = await page
      .getByRole("button", { name: "ALL", exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(allChipBg).toBe("rgb(181, 52, 31)"); // --accent
  });
});

test.describe("workout detail screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-detail@e2e.test",
      name: "Design Detail Tester",
    });
    await page.goto("/library");
    await page.locator(".workout-row").first().click();
    await expect(page.locator(".workout-detail-title")).toBeVisible();
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and the back link match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const backLinkColor = await page
      .locator(".back-link")
      .evaluate((el) => getComputedStyle(el).color);
    expect(backLinkColor).toBe("rgb(27, 26, 23)"); // --ink
  });
});

// Task 8's `.button-outline` fix (color/text-decoration/inline-flex, so the
// Edit link stops falling through to the browser's default blue underline)
// has no visual home in jsdom at all — CSS never applies there — so this is
// its only real-browser proof. It needs its own describe rather than a test
// added to "workout detail screen" above: OwnerActions (WorkoutDetail.tsx)
// renders Edit/Delete only for `!workout.isGlobal`, and that describe's own
// beforeEach opens the first `.workout-row`, which is always one of the
// seeded (global, read-only) starter workouts — Edit/Delete never render
// there at all. Author a personal workout through the builder instead, the
// only way to land on a workout this signed-in user actually owns.
test.describe("workout detail screen (personal workout, owner actions)", () => {
  const title = "Design Owner Actions Sweep";

  // Per-worker email, same reasoning as the "edit mode with a stored
  // warm-up row" describe below: this test creates real data (a saved
  // workout) rather than only reading, and Playwright's fullyParallel
  // config can run this file's tests across several workers at once — a
  // fixed shared email raced two workers' concurrent sign-ins into a 500
  // from the backdoor route in that describe, so this one avoids the same
  // failure mode up front rather than waiting to hit it.
  test.beforeEach(async ({ page }, testInfo) => {
    await signInViaBackdoor(page, {
      email: `design-detail-owner-${testInfo.parallelIndex}@e2e.test`,
      name: "Design Detail Owner Tester",
    });
    await page.goto("/library/new");
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Pain 3" }).click();
    await page.getByLabel("Row 1 duration", { exact: true }).fill("2000");
    await page.getByRole("button", { name: "Save to library" }).click();
    await expect(page).toHaveURL(/\/library\/[^/]+$/);
    await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
  });

  test.afterEach(async ({ page }) => {
    await cleanupByTitle(page, title);
  });

  test("Edit and Delete are on-palette, not default browser link blue", async ({
    page,
  }) => {
    const edit = page.getByRole("link", { name: "Edit" });
    await expect(edit).toBeVisible();

    const styles = await edit.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, decoration: s.textDecorationLine };
    });
    expect(styles.color).toBe("rgb(27, 26, 23)"); // --ink
    expect(styles.decoration).toBe("none");
  });
});

test.describe("builder screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-builder@e2e.test",
      name: "Design Builder Tester",
    });
    await page.goto("/library/new");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and the active TYPE chip match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    // A brand-new form defaults to O2 (Builder.tsx's newForm) — the O2 chip
    // is the active (aria-pressed) one.
    const o2ChipBg = await page
      .getByRole("button", { name: "O2", exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(o2ChipBg).toBe("rgb(42, 98, 117)"); // --type-o2
  });

  // Phase 5F Task 7: the warm-up line moved above the step list, reading as
  // an implicit step 0 rather than a footnote down by the totals — a
  // real-browser structural pin, since jsdom has no layout and can't tell
  // "above" from "below".
  test("the warm-up line precedes the step list", async ({ page }) => {
    const warmup = page.locator(".builder-warmup-line");
    const steps = page.locator(".builder-steps");
    await expect(warmup).toBeVisible();

    const warmupBox = await warmup.boundingBox();
    const stepsBox = await steps.boundingBox();
    expect(warmupBox!.y).toBeLessThan(stepsBox!.y);
  });

  // Phase 5F Tasks 3/4: the DUR field used to open a decimal number pad
  // (`inputMode="decimal"`) that had no way to type a colon — a rower
  // guessing "0:30" could not enter it. `ClockInput` now masks a digit-only
  // numeric-pad field instead; `inputmode="numeric"` is the one attribute
  // that actually changes which keyboard iOS/Android show, so it's the
  // real-browser-relevant thing to assert (jsdom renders no keyboard at
  // all). The task brief that seeded this test named the field "Step 1
  // duration" — DurationInput/ClockInput actually carry `Row N duration`
  // (StepEditor.tsx builds `rowLabel` as `Row ${index + 1}`; "Step N" is
  // only the expanded editor's own header/DUPLICATE/DELETE labels), and
  // `{ exact: true }` is required or the substring also matches the
  // duration-unit radio buttons ("Row 1 duration unit minutes"/"meters").
  test("the masked duration field opens a digit-only keypad", async ({
    page,
  }) => {
    await expect(
      page.getByLabel("Row 1 duration", { exact: true }),
    ).toHaveAttribute("inputmode", "numeric");
  });

  // The pain level's word ("WORKING") only renders once a level is picked,
  // and it sets in 11px against the label's 10px — so the label row grew
  // taller on first selection and pushed the chips, and everything below
  // them, down under the user's thumb. The label row now reserves its line
  // box, so picking a level moves nothing.
  test("picking a pain level does not shift the chips below it", async ({
    page,
  }) => {
    const chip = page.getByRole("button", { name: "Pain 3" });
    const before = await chip.boundingBox();
    await chip.click();
    await expect(page.getByText("WORKING")).toBeVisible();
    const after = await chip.boundingBox();

    expect(after?.y).toBe(before?.y);
  });

  // Same nudge-bug class, mid-phase addition (Task 7): TYPE's own summary
  // word (TYPE_WORDS) sits opposite its label the same way PAIN's does.
  // Unlike PAIN, a type is always selected — the word is present on first
  // paint, so there's no "word appears" transition to reproduce here — but
  // switching between chips swaps in a differently-*wide* word ("LOW & SLOW"
  // vs "COMFORTABLY HARD"), and a width change alone must not shift
  // anything below it either. Asserts both the TYPE chip row itself and the
  // DIFFICULTY row beneath it hold their y position across the switch.
  test("picking a different TYPE does not shift the TYPE chips or the DIFFICULTY row below them", async ({
    page,
  }) => {
    // A fresh builder defaults to O2 ("LOW & SLOW") — switch to AT
    // ("COMFORTABLY HARD"), the widest of the four words.
    const typeChipRow = page.locator(".classification-chip-row").first();
    const difficultyRow = page.locator(".classification-chip-row").nth(1);
    const beforeType = await typeChipRow.boundingBox();
    const beforeDifficulty = await difficultyRow.boundingBox();

    await page.getByRole("button", { name: "AT", exact: true }).click();
    await expect(page.getByText("COMFORTABLY HARD")).toBeVisible();

    const afterType = await typeChipRow.boundingBox();
    const afterDifficulty = await difficultyRow.boundingBox();

    expect(afterType?.y).toBe(beforeType?.y);
    expect(afterDifficulty?.y).toBe(beforeDifficulty?.y);
  });

  // A prior review (5B) only ever swept the builder blank — never after a
  // failed Save exposes its error-state markup (role=alert banners,
  // aria-invalid/aria-describedby on the first bad field, inline field-error
  // text). Press Save on the untouched form and re-run the sweep against
  // that state instead.
  test.describe("error state (Save pressed on a blank form)", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("button", { name: "Save to library" }).click();
      // Builder.tsx's own invalid-field-count banner (`role="alert"`) —
      // there's no dedicated status class any more, this IS the error
      // state's marker.
      await expect(page.getByText(/needs? attention/i)).toBeVisible();
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations", async ({ page }) => {
      await assertNoA11yViolations(page);
    });
  });

  // Task 6 (this phase): the plain /library/new sweep above only ever
  // exercises the accordion's EXPANDED state — a brand-new form's one row
  // opens by default, so no StepCard ever renders. Add a second step to
  // force a real collapsed/expanded split (StepCard.tsx + StepEditor.tsx)
  // and re-run the same sweep, plus pin the two tokens the redesign
  // introduced for these cards: the collapsed surface/marker colours and
  // the step-index numeral's ink-4 substitution for the handoff's
  // AA-failing `#8a8478` (docs/design/builder-redesign/README.md's own
  // accessibility note: "if the axe scan flags it, move it to `#6f6a5f`" —
  // already done in tokens.css; this pins it structurally).
  test.describe("accordion states (one card collapsed, one expanded)", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("button", { name: "+ ADD STEP" }).click();
      await expect(page.locator(".step-card")).toHaveCount(1);
      await expect(page.locator(".step-editor")).toHaveCount(1);
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations", async ({ page }) => {
      await assertNoA11yViolations(page);
    });

    test("the collapsed card, its step index, and the expanded card's left marker match the token palette", async ({
      page,
    }) => {
      const collapsedBg = await page
        .locator(".step-card")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(collapsedBg).toBe("rgb(251, 249, 241)"); // --surface-collapsed

      const collapsedMarker = await page
        .locator(".step-card")
        .evaluate((el) => getComputedStyle(el).borderLeftColor);
      expect(collapsedMarker).toBe("rgb(222, 216, 201)"); // --rule-2

      // The step-index numeral: the handoff's own `#8a8478` measures
      // ~3.4:1 and fails AA at this size — index.css already substitutes
      // --ink-4 (#6f6a5f) here, same convention as every other mono label
      // in docs/design/DEVIATIONS.md. Pinning the resolved colour, not just
      // the absence of an axe violation, is what keeps this from silently
      // regressing back to the literal hex.
      const indexColor = await page
        .locator(".step-card-index")
        .first()
        .evaluate((el) => getComputedStyle(el).color);
      expect(indexColor).toBe("rgb(111, 106, 95)"); // --ink-4

      // The expanded card's left marker is the current TYPE colour
      // (StepEditor.tsx's inline borderLeftColor) — O2 is the builder's
      // default type (Builder.tsx's newForm).
      const expandedMarker = await page
        .locator(".step-editor")
        .evaluate((el) => getComputedStyle(el).borderLeftColor);
      expect(expandedMarker).toBe("rgb(42, 98, 117)"); // --type-o2
    });
  });

  // This review's IMPORTANT 2: every prior accordion sweep only ever built
  // its collapsed card via "+ ADD STEP", which can only ever produce a
  // `kind: "w"` row (docs/design/DEVIATIONS.md: there's no "+ WARM-UP"
  // control any more) — so no sweep's axe scan ever actually rendered a
  // collapsed `wu`/`r` StepCard, the one shape whose sub-summary is empty
  // and used to render a nameless, focusable button (axe button-name /
  // WCAG 4.1.2). A `wu` row can only land in the builder via bulk import or
  // an already-saved (edit-mode) workout — see builder.spec.ts's own
  // "editing a workout with a stored warm-up" test, which this mirrors to
  // get an edit-mode screen open, but for the axe/tap-target sweep instead
  // of a save-round-trip assertion. Every one of the 35 starter workouts
  // opens with a `wu`, so this is the realistic, common case the earlier
  // sweep never touched.
  test.describe("edit mode with a stored warm-up row (wu StepCard)", () => {
    const title = "Design WU Sweep";

    // Unlike this file's other describe blocks (which only ever read/
    // navigate), every test here creates real data via bulk import under
    // the same title — Playwright runs different tests in this file across
    // several parallel workers, so a fixed shared email here raced two
    // workers' concurrent sign-ins/imports into each other (a 500 from the
    // backdoor route on a duplicate concurrent signup, and two "Design WU
    // Sweep" workouts existing at once, breaking the row-filter locator).
    // `parallelIndex` gives each worker its own account, matching
    // builder.spec.ts's own "every test signs in as its own unique email"
    // convention one level up (per-worker instead of per-test, since the
    // three tests below share this describe's beforeEach/afterEach and run
    // one at a time within a given worker).
    test.beforeEach(async ({ page }, testInfo) => {
      await signInViaBackdoor(page, {
        email: `design-builder-wu-${testInfo.parallelIndex}@e2e.test`,
        name: "Design Builder WU Tester",
      });
      // Bulk import is the only way to get a `wu` row into a personal
      // (editable) workout — starter workouts are global and can't be
      // edited (EditWorkout.tsx refuses isGlobal workouts), and the
      // create-mode builder has no control that can author one.
      await page.goto("/library/import");
      const text = [`${title} | O2 | easy | 2`, "wu 5", "w 10' 6k @20"].join(
        "\n",
      );
      await page.getByLabel("Bulk import text").fill(text);
      await page.getByRole("button", { name: "Import", exact: true }).click();
      await expect(page).toHaveURL(/\/library$/);

      await page.locator(".workout-row").filter({ hasText: title }).click();
      await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
      await page.getByRole("link", { name: "Edit" }).click();
      await expect(page).toHaveURL(/\/library\/[^/]+\/edit$/);

      // Edit mode opens with every row collapsed (Builder.tsx) — exactly
      // the state this sweep needs: two collapsed StepCards, one of them
      // the stored `wu` row, neither ever expanded.
      await expect(page.locator(".step-card")).toHaveCount(2);
      await expect(page.locator(".step-editor")).toHaveCount(0);
    });

    test.afterEach(async ({ page }) => {
      await cleanupByTitle(page, title);
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations, including the collapsed wu card's sub-summary button", async ({
      page,
    }) => {
      await assertNoA11yViolations(page);
    });

    // Structural pin, beyond the axe scan: the first card (the stored `wu`
    // row) renders no `.step-card-sub` element at all — not an empty one —
    // proving the fix is "don't render it" and not "render it with empty
    // text" (which would still be a nameless focusable control). The second
    // card (the `w` row) still renders its own populated sub-summary, so
    // this also proves the fix is conditional per-row, not a blanket
    // removal of the control.
    test("the wu card renders no sub-summary button; the w card still does", async ({
      page,
    }) => {
      const cards = page.locator(".step-card");
      await expect(cards.nth(0).locator(".step-card-sub")).toHaveCount(0);
      await expect(cards.nth(1).locator(".step-card-sub")).toHaveCount(1);
      await expect(cards.nth(1).locator(".step-card-sub")).toContainText("spm");
    });
  });

  // Every sweep above only ever scans a blank builder (a fresh row 1's
  // fields are all empty) — Phase 5F's typable DUR/SPM/REST fields, and
  // their new "FREE"/"NONE" placeholders, only actually render once
  // something is typed into them. Fill all three via the same masked
  // fields a rower would use, then re-run the sweep against that state.
  test.describe("expanded editor with typed values", () => {
    test.beforeEach(async ({ page }) => {
      await page
        .getByLabel("Row 1 duration", { exact: true })
        .pressSequentially("45");
      await page
        .getByLabel("Row 1 stroke rate value", { exact: true })
        .pressSequentially("27");
      await page
        .getByLabel("Row 1 rest value", { exact: true })
        .pressSequentially("300");
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations", async ({ page }) => {
      await assertNoA11yViolations(page);
    });
  });

  // Phase 5G (Task 4): tapping MAX/MIN hides the offset stepper entirely
  // (PaceRefInput.tsx renders it only when `effort === null`) and swaps in
  // the TARGET strip's word instead of a resolved range — a real structural
  // change to what's on screen, not just a different value in an existing
  // field. Every sweep above only ever exercises the default split-mode
  // layout; this is the one sweep that runs with an effort chip checked, so
  // the hidden-stepper state gets its own tap-target/axe coverage instead of
  // inheriting a pass that never actually rendered it.
  test.describe("effort chip selected (MAX) — hidden offset stepper", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("radio", { name: "Row 1 pace MAX" }).click();
      await expect(
        page.getByRole("radio", { name: "Row 1 pace MAX" }),
      ).toHaveAttribute("aria-checked", "true");
      await expect(page.locator(".pace-ref-offset")).toHaveCount(0);
    });

    test("every visible interactive element has a >=44x44 tap target", async ({
      page,
    }) => {
      await assertTapTargets(page);
    });

    test("zero WCAG 2A/2AA violations", async ({ page }) => {
      await assertNoA11yViolations(page);
    });
  });
});

test.describe("import screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-import@e2e.test",
      name: "Design Import Tester",
    });
    await page.goto("/library/import");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and the back link match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const backLinkColor = await page
      .locator(".back-link")
      .evaluate((el) => getComputedStyle(el).color);
    expect(backLinkColor).toBe("rgb(27, 26, 23)"); // --ink
  });
});

test.describe("you screen", () => {
  test.beforeEach(async ({ page }) => {
    await signInViaBackdoor(page, {
      email: "design-you@e2e.test",
      name: "Design You Tester",
    });
    await page.goto("/you");
  });

  test("every visible interactive element has a >=44x44 tap target", async ({
    page,
  }) => {
    await assertTapTargets(page);
  });

  test("zero WCAG 2A/2AA violations", async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  test("body background and a baseline value match the token palette", async ({
    page,
  }) => {
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe("rgb(244, 241, 232)"); // --page

    const baselineValueColor = await page
      .locator(".baseline-value")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(baselineValueColor).toBe("rgb(181, 52, 31)"); // --accent
  });
});

test.describe("iOS safe-area insets", () => {
  // A desktop-Chrome e2e run always resolves env(safe-area-inset-*) to 0,
  // so pixel/computed-style assertions here would pass whether or not the
  // env() rules exist at all (0px is also the default for an undeclared
  // padding). Instead these assert the *mechanism*: the viewport meta that
  // makes env() resolve on iOS, and the literal env() expressions in the
  // stylesheet source — both of which genuinely fail if someone deletes the
  // safe-area handling, unlike a computed-value check would.

  test("viewport meta opts into safe-area insets (viewport-fit=cover)", async ({
    page,
  }) => {
    const response = await page.goto("/");
    const html = await response!.text();
    const match = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/);
    expect(match, "no <meta name=viewport> found in served HTML").not.toBe(
      null,
    );
    expect(match![1]).toContain("viewport-fit=cover");
  });

  test("tab bar, app shell, and screen padding declare safe-area env() expressions", async ({
    page,
  }) => {
    await signInViaBackdoor(page, {
      email: "design-safe-area@e2e.test",
      name: "Design Safe Area Tester",
    });
    await page.goto("/library");

    const declarations = await page.evaluate(() => {
      // Walk every same-origin stylesheet's rules (skip any that throw,
      // e.g. cross-origin font sheets) and return the raw declaration
      // block text for each selector we care about, so the assertion
      // inspects the *authored* CSS value rather than a resolved/computed
      // one that can't distinguish "env() present, evaluates to 0" from
      // "no such padding rule at all".
      function cssTextFor(selector: string): string {
        for (const sheet of Array.from(document.styleSheets)) {
          let rules: CSSRuleList;
          try {
            rules = sheet.cssRules;
          } catch {
            continue;
          }
          for (const rule of Array.from(rules)) {
            if (
              rule instanceof CSSStyleRule &&
              rule.selectorText === selector
            ) {
              return rule.cssText;
            }
          }
        }
        return "";
      }
      return {
        tabbar: cssTextFor(".tabbar"),
        appShell: cssTextFor(".app-shell"),
        screen: cssTextFor(".screen"),
        builderScreen: cssTextFor(".screen.builder-screen"),
      };
    });

    expect(
      declarations.tabbar,
      "no .tabbar rule found in any stylesheet",
    ).not.toBe("");
    expect(declarations.tabbar).toContain("env(safe-area-inset-bottom");

    expect(
      declarations.appShell,
      "no .app-shell rule found in any stylesheet",
    ).not.toBe("");
    expect(declarations.appShell).toContain("env(safe-area-inset-bottom");

    expect(
      declarations.screen,
      "no .screen rule found in any stylesheet",
    ).not.toBe("");
    expect(declarations.screen).toContain("env(safe-area-inset-top");
    expect(declarations.screen).toContain("env(safe-area-inset-left");
    expect(declarations.screen).toContain("env(safe-area-inset-right");

    // The builder screen's own compound-selector override (index.css:
    // "The compound selector (rather than a bare .builder-screen rule)
    // guarantees this wins over .screen's own padding/margin regardless of
    // stylesheet order") silently dropped the insets earlier this phase —
    // the header rendered under the Dynamic Island on a notched iPhone
    // until it was caught and fixed. Assert it structurally so a future
    // edit to this override can't drop the insets again unnoticed. Bottom
    // is deliberately a plain 24px here (index.css: the bottom inset is
    // already reserved once, screen-wide, by .app-shell), so only top/
    // right/left are asserted, matching the base `.screen` rule above.
    expect(
      declarations.builderScreen,
      "no .screen.builder-screen rule found in any stylesheet",
    ).not.toBe("");
    expect(declarations.builderScreen).toContain("env(safe-area-inset-top");
    expect(declarations.builderScreen).toContain("env(safe-area-inset-left");
    expect(declarations.builderScreen).toContain("env(safe-area-inset-right");
  });
});
