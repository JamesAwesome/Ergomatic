> **Archived 2026-08-28** from `ROADMAP.md` (lines 6818-6853 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase LG — The log screen's own words

**Status:** CLOSED 2026-08-18 (the PM's third-gate callout: the
self-closing condition fired when #117 merged and nobody closed it).
Piece 1 (labels) SHIPPED in PW spec 1 (#117, option B). Pieces 2 and 3
remain out by the original ruling. The one surviving item this section
owned — `MONITOR_SPM_MIN` — is now Phase LT spec 1's (see above). This
section is a pointer, nothing more.
**Goal:** the post-row self-report stops using two words that mean the
opposite thing one screen away.

**Why it is its own phase, not a copy tweak.** `LogSession.tsx` offers
HELD / UNDER / OVER, backed by `api/useRecentLogs.ts`'s
`HeldResult = "held" | "under" | "over"` and, underneath that, a Postgres
enum — `pgEnum("held_result", ["held","under","over"])`, `notNull` on every
logged row (`server/db/schema.ts`). Three separable pieces:

1. **Copy only** (cheap, no migration): keep the stored values, change the
   button labels and whatever sentence frames them. Available today.
2. **The values themselves** (migration): renaming the enum members touches
   real tester rows and wants a considered plan.
3. **The question** (design): "did you hold your target?" is a different
   question from the live judgement the connected panes make, and the answer
   set may not be three buttons at all.

**The collision that makes this urgent.** As of 2026-08-13 the live
judgement renamed `"over"`/`"under"` to `"faster"`/`"slower"` (blue/red,
DEVIATIONS' own row), because James had been reading "under" as FASTER while
the code meant SLOWER. The log screen still uses the old pair, for a related
but distinct question, with no stated direction at all. A rower who learns
the panes' vocabulary now meets its opposite on the screen right after.

**Also on this screen, unresolved:** which direction UNDER/OVER even mean
here is not written down anywhere — code, comment, or copy. Establish that
BEFORE renaming anything, or the rename ships a guess.
