# Gate 0B — board 3: the saved row's own figures (M4, M5)

**The decision:** which composition carries the logbook's figures onto the
saved row. The SUBSTANCE was approved in chat on 2026-09-19 — "copy
logbook" — and this board is only the shape.

Rendered 2026-09-19 in Chromium against this worktree's compose stack at
390x844 portrait and 844x390 landscape, by the throwaway
`app/e2e/gate0b-board3.spec.ts`. The row is seeded through `POST
/api/logs` and carries the exit-7 walk's own numbers: work 500 m / 2:04,
rest 242 m / 2:00, overall 742 m / 4:04 — the same pair `log-detail`'s
committed capture uses, so these frames read beside a shipped screen.

---

## APPROVED 2026-09-19 — treatment C, and the reason is the precedent

**James: "Go with c"**, after asking the question that settled it — *"So in
c is the hero itself the work number?"*

It is. C leaves `DISTANCE 500` as a hero, unlabelled, and names `REST` and
`OVERALL` on the line beneath. **That is the logbook's own structure**, and
it is the thing B gets wrong: Concept2's headline is `Meters`, never "work
meters", and the reader learns what it means because `Overall Distance`
sits beside it. B's table labels the headline `WORK` — belt and braces,
the adjective AND the juxtaposition, on a board whose whole instruction was
to copy a surface that uses only the second.

This board was written recommending B and the recommendation was wrong.
The cost that argued for B — that C leaves the relationship between 500,
242 and 742 implicit — is real and is accepted: it is the same thing the
logbook asks of a rower today.

**What C costs, stated because the gate should carry it:** the hero keeps
the generic label `DISTANCE` while the line below says `OVERALL`, so a
reader resolves "distance versus overall distance". Milder in the logbook,
whose headline noun (`Meters`) differs from its overall noun. Accepted.

**So PR 4 implements:** the heroes unchanged, and the quiet prose line
replaced by named figures — `REST 242 m · 2:00   OVERALL 742 m · 4:04` —
with each figure rendering the dash idiom when the record declines to
claim it (M5).

`frames/c-known-{portrait,landscape}.png`, `frames/c-none-{portrait,landscape}.png`

---

## What is wrong today

The saved row shows `AVG SPLIT 2:04.0 · TIME 2:04 · DISTANCE 500` and,
beneath it, one quiet sentence: `4:04 total · plus 242 m coasting in
rest`.

- **M4.** The live pane shows **742 m** (work + rest, the driver's session
  register map). The saved row shows **500**. Neither screen says which
  quantity it is, and the saved row never shows 742 at all.
- **M5.** On an interrupted row the rest pair is refused
  (`monitorRun.ts` writes it only when EVERY interval has both
  readbacks), so the whole sentence vanishes. Live, the same session
  showed its rest clause. The silence is deliberate and invisible.

`frames/today-{portrait,landscape}.png`

## The precedent this copies

Concept2's own logbook, on a public interval workout (fetched
2026-09-19): the headline **Meters 3,898** is work only, **Rest Distance
113** and **Rest Time 7:00.0** stand separately, and **Overall Distance
4,011** / **Overall Time 23:00.0** carry the fused figures under their own
names. 3,898 + 113 = 4,011 and 16:00 + 7:00 = 23:00. Our own integration
agrees: the C2 API's fields are `distance`, `rest_distance`, `rest_time`,
and `server/concept2/mapping.ts` already posts the work figure as
`distance`.

**They disambiguate by JUXTAPOSITION, not by adjective** — the headline is
never called "work meters"; you learn what it means because "Overall"
sits beside it. Every treatment below follows that.

Rowers are split on whether rest should count at all (C2 forum: a
compromise between "folks who only want their active meters counted" and
those wanting credit for every metre), and the complaint that recurs is
the one M4 names — that what is displayed and what is counted differ.

---

## The three treatments

| | what it does | duplication | hero sizes | arithmetic visible |
| --- | --- | --- | --- | --- |
| **A** | heroes kept, logbook table beneath | **500 and 2:04 twice, 30 px apart** | unchanged | yes, down the column |
| **B** | AVG SPLIT alone, table carries distance and time | none | **DISTANCE/TIME drop 20px to 15px** | yes, down the column |
| **C** | heroes kept, one named line replaces the sentence | none | unchanged | no |

`frames/{a,b,c}-known-{portrait,landscape}.png`

**A is out on sight.** The frame prints `DISTANCE 500 · TIME 2:04` in the
heroes and `WORK 500 2:04` in the table immediately below it — the same
two numbers, twice, a line apart.

**B** reads as one block. The column arithmetic is checkable by eye
(500 + 242 = 742), which is the property RF7 asks for. Its cost is real
and measured: DISTANCE and TIME go from 20 px hero values to 15 px table
cells.

**C** is the smallest change and keeps every hero at its current size,
but the relationship between the three figures is something the reader
has to assemble, and it keeps the quiet-caption shape that failed to
carry Overall Distance in the first place.

## M5, on the same frames

Every treatment renders the interrupted row by leaving the figures out,
using this codebase's own dash idiom — `MachineTier`'s rule is "each
field is `undefined` where the machine did not say — the screen renders a
dash there, and `0` as `0`", which the six machine tiles on this same
screen already follow.

```
WORK       500   2:04
REST         —      —
OVERALL      —      —
```

`frames/{a,b,c}-none-{portrait,landscape}.png`

So M5 costs no new copy and no new concept: **it inherits the slot M4's
fix creates.** Today there is nowhere for the absence to be, which is why
it is invisible.

The alternative — summing the per-interval readbacks we do have, which
every completed interval still carries — was rejected in chat: it
under-counts whenever the abandoned interval had rest of its own, and
understating a figure while presenting it as whole is the same
misattribution the all-or-nothing rule exists to prevent.

## Contrast

Every pairing already exists on this surface; the treatments reuse
`--ink` for values and `--ink-3` for labels. Measured from the live
cascade, not computed from tokens (`frames/contrast.json`): table values
**15.41:1**, table labels **6.69:1**, against AA's 4.5:1 for text. The
background measures `rgb(244, 241, 232)` — `--page`.

---

## The question

**Which composition?**

**Recommendation as written: B. RULED: C** — see the approval at the top.
The recommendation was wrong for a reason worth keeping: B labels the
headline `WORK`, and the precedent this board exists to copy does not.

---

## Reproducing this, and what is NOT committed

**The prototype is deliberately not in product code.** Its three
treatments read their mode from `?board3=a|b|c` and `?rest=none` in the
URL — exactly the dev-only seam `pnpm dist:grep` exists to keep out of
`dist/`. So the two changed product files live in
`board3-variants.patch`, and the throwaway capture harness lives beside
it as `gate0b-board3.spec.ts.txt`. Neither is on the branch as code.

To redraw the frames:

```
git apply docs/design/number-provenance/gate0b/board3/board3-variants.patch
cp docs/design/number-provenance/gate0b/board3/gate0b-board3.spec.ts.txt \
   app/e2e/gate0b-board3.spec.ts
cd app && pnpm e2e gate0b-board3.spec.ts
```

**PR 4 does not ship the prototype.** The real change has no query
params and no `Board3` union: one composition, the figures sourced from
the record rather than from the URL. The harness is replaced by tests
that ASSERT — `app/e2e/provenance.spec.ts` is the precedent, and board
2's own PR is the worked example.

The numbers on every frame are the exit-7 walk's real ones, seeded
through `POST /api/logs`: work 500 m / 2:04, rest 242 m / 2:00, overall
742 m / 4:04.
