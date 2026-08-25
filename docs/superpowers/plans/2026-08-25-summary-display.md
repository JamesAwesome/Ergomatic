# Summary Display (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the rower the machine's countersigned numbers — the MACHINE CONFIRMED · WORK ONLY block with the verification code on the log detail — and put the realtime 1m meters counter back on the connected screen.

**Architecture:** Pure display: `FromTheLog` reads the three machine fields PR #190 already stores on the server row and renders one labelled block; `PaneLive`'s `fmtMeters` drops its 5m quantisation. No new data, no server changes, no monitor changes.

**Tech Stack:** React 19 client, Vitest client project, Playwright e2e + screenshots.

**Spec:** `docs/superpowers/specs/2026-08-24-summary-record-design.md` §3, as amended by two James rulings (2026-08-25): the block is labelled **WORK ONLY** with a caption naming the quantity split (the axis-collision resolution — ROADMAP's not-deferrable item is discharged by this labelling), and the counter reverts to 1m (reversing his own 2026-08-18 calm rule, ledgered at the exit-7 walk).

## Global Constraints

- Display-only: ZERO files under `app/domain/` or `app/server/`; no stored shapes; the block reads `machineWorkSeconds`/`machineWorkMeters`/`machineSummary.verificationBytes` off the fetched `StoredLog` row and NOTHING else (never `machineSummary`'s nine stats — undisplayed this wave).
- Rows without the fields render NOTHING (no dashes, no empty state) — old rows are the common case for a long time.
- The code renders only when `verificationBytes` is present: FIRST 8 bytes as two LE u32 words, uppercase hex, `XXXX-XXXX` per word (the PM5's own rendering, PRIMARY-photographed). Absent bytes = no CODE line.
- Copy (exact, James's label ruling; NO em-dashes in user-facing strings — use middle dots/colons):
  `MACHINE CONFIRMED · WORK ONLY` / value line `2:04.0 work · 500m` (house elastic-positional time; meters labelled) / `CODE AF99-4706 C021-B054` / caption `Rest metres excluded. The totals above include rest.`
- Placement: below the interval table on the log detail, matching the screen's section rhythm. Informational, not a hero. AA contrast computed and reported for any new token use; nothing tappable (no 44px targets needed).
- `fmtMeters`: `Math.round(meters)` (1m), Intl formatting kept, ROUND kept (the antagonist's #123 falsification of floor stands). The comment rewrites honestly: quantisation was James's 2026-08-18 calm rule, reversed by James 2026-08-24 ("less responsive… put that back to a realtime count") with the measured repaint-rate trade (~3.7 repaints/s iOS) stated as the accepted cost.
- Tests against realistic fixtures: the walk's real values (124/500, bytes `06 47 99 af 54 b0 21 c0…`), a no-fields row, a totals-without-bytes row. `pnpm e2e` AND `pnpm screenshots` (layout change) before done.
- Screenshots are committed AND embedded INLINE in the PR body (James, 2026-08-25) — reference the branch's raw.githubusercontent URLs so they render in the PR itself.
- Run tests via `pnpm test --project client`; grep "Test Files" not just "Tests".

---

### Task 1: the MACHINE CONFIRMED · WORK ONLY block

**Files:**
- Modify: `app/src/log/FromTheLog.tsx` (render, below the interval table), `app/src/log/storedSummary.ts` (`StoredLog` gains the three nullable fields — type only, matching the server's GET shape from #190)
- Test: `app/src/log/FromTheLog.test.tsx`
- CSS: `app/src/index.css` (or the log detail's existing style home — follow the file's pattern; reuse existing tokens where AA-verified)

**Interfaces:**
- Consumes: `machineWorkSeconds: number | null`, `machineWorkMeters: number | null`, `machineSummary: { verificationBytes?: number[] } | null` on the GET row (#190's serializers).
- Produces: nothing consumed later.

- [ ] Step 1: failing tests — (a) a row with the walk's real values renders the block: label text, `2:04.0 work · 500m`, `CODE AF99-4706 C021-B054` (derive expected words from the bytes IN THE TEST as literals), the caption; (b) a row with all three null renders NO block (query for the label returns nothing); (c) totals present + machineSummary null (or bytes absent) renders the block WITHOUT a CODE line. Run `pnpm test --project client -- FromTheLog` — FAIL.
- [ ] Step 2: implement. LE u32 word rendering:

```ts
function verificationCode(bytes: number[]): string {
  const word = (o: number) =>
    (((bytes[o + 3] << 24) | (bytes[o + 2] << 16) | (bytes[o + 1] << 8) | bytes[o]) >>> 0)
      .toString(16).toUpperCase().padStart(8, "0");
  const dash = (w: string) => `${w.slice(0, 4)}-${w.slice(4)}`;
  return `${dash(word(0))} ${dash(word(4))}`;
}
```

  Guard: render the code only when `verificationBytes` has ≥ 8 entries. Time formatting via the house formatter already used on this screen (grep how the interval rows format elapsed — reuse it).
- [ ] Step 3: tests pass; compute and record the contrast ratio for the block's text tokens in the report.
- [ ] Step 4: commit `feat: the log detail shows what the machine confirmed, labelled work-only`.

### Task 2: the realtime meters counter

**Files:**
- Modify: `app/src/workout/connected/PaneLive.tsx` (`fmtMeters`, ~line 95-114 comment + implementation)
- Test: `app/src/workout/connected/` (wherever fmtMeters/PaneLive is covered — grep `1,045` or the quantised expectations in ConnectedSurface.screens.test.tsx and PaneLive tests)

- [ ] Step 1: failing test — `fmtMeters`-covered expectations updated to 1m values (e.g. a model with sessionDistanceMeters 1043.7 renders `1,044m`, not `1,045m`); run red.
- [ ] Step 2: implement `Math.round(meters)` + the honest comment rewrite per Global Constraints.
- [ ] Step 3: full client project green.
- [ ] Step 4: commit `feat: the meters counter counts every metre again (James's reversal of the calm rule)`.

### Task 3: captures, docs, and the wave's bookkeeping

**Files:**
- Run `pnpm e2e` and `pnpm screenshots`; commit changed `docs/screenshots/*.png`; ALSO capture the block with seeded machine fields (if the screenshot harness's seed lacks them, extend the seed data so the block appears — recurring failure 7: open the images and look; the block must be visible with real-looking values, and recompute the code from the seeded bytes by eye).
- Modify: `ROADMAP.md` — tick RC-3's display half (the wave complete pending release); mark the axis-collision input RESOLVED BY LABELLING (James's ruling); note the 1m-counter item done (reversal recorded).
- Modify: `docs/superpowers/specs/2026-08-24-summary-record-design.md` §3 — amend with the WORK ONLY label + caption ruling and the collision resolution (a short marked amendment, not a rewrite).
- Modify: `docs/design/DEVIATIONS.md` ONLY if the block deviates from a design-reference screen (it is a new element; add a row only if the design reference covers this screen's sections).

- [ ] Step 1: run the capture suites; open every changed image; verify the block shows real data and the counter shows a non-multiple-of-5 value if captured.
- [ ] Step 2: make the docs edits.
- [ ] Step 3: commit `docs+captures: the wave's display half is recorded`.

---

## Self-review record

- Spec §3 coverage: block (T1), label ruling (T1 copy), no-display-of-nine (constraint), placement (T1), a11y (T1 step 3); counter (T2); captures/e2e (T3); collision discharge recorded (T3).
- Gates: antagonist SKIP, stated: display-only, inherits the summary-record spec's vetted ground + James's label ruling; no new invariant class. PM final gate REQUIRED (the #190 waiver revocation stands). Screenshots inline in the PR body (James).
- Type consistency: `StoredLog` fields defined T1, consumed only T1.
