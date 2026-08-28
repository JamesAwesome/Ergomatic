> **Archived 2026-08-28** from `ROADMAP.md` (lines 1465-1612 of the pre-rebalance file, main `39e9430`).
>
> This is the phase as it was written while it ran. It is a RECORD: nothing
> here is scheduled, and its open items were lifted into `ROADMAP.md`'s live
> slate before this file was created. Do not cite it for a live question.

## Phase BL — Baselines: three doors in, one measurement out

**Status:** COMPLETE pending release (v0.19.0). **James signed off the 16 cells 2026-08-23:** the slow anchor stands, 2:10 is the right ceiling, and the two question screens stay FOR NOW with testers as the validators (the delete-the-screens simplification stays available if they don't earn their place). — all four slate items
delivered: **PR A #164, PR B #165, PR C #172** (opened 2026-08-23; the
old PR-C-opens-only-once-LL's-spec-exists precondition was verified
satisfied — LL's spec merged to main 2026-08-22, before PR C opened).
Phase opened 2026-08-22 with same-day gates (antagonist anchor at full
triad weight; PM slate gate GO-WITH-CONDITIONS), spec at REV 2 with
every finding folded
(`docs/superpowers/specs/2026-08-22-baseline-onboarding-design.md`; the
canvas is COMMITTED at `docs/design/baseline-onboarding/`, live copy
linked in the spec). Both gate ledger entries rode the rev-2 PR. James's
rev-2 rulings: per-number provenance (`k2Source`/`k6Source`, four values
incl. `derived`); decline still records the test (wire decouple in PR B);
the derive OFFER answers door 3's single number and inconsistent tested
writes; questionnaire answers TRANSIENT, never stored; a staged-confirm
**Reset baseline setup** on You makes the doors re-enterable (the product
answer to the gate's unreachable-doors finding). **PR shape: A (the
shape, alone, triad) → B (prompt + shortcut + decouple) → C (doors +
questionnaire + table + reset).** The stop-point conditional this
paragraph used to carry dissolved with PR C: the table met its bounded
criteria, so the phase did not close on A+B.
**PR A LANDED via #164** (the provenance shape: `k2Source`/`k6Source`
pgEnum, migration 0013 regenerated after LL's 0012 merged mid-flight;
editor writes `manual` typed / `derived` accepted-offer; untouched
fields no longer resend). **PR B LANDED via #165** — the `tested` and
`derived` writers (the post-save prompt and its counterpart offer), the
recording decouple (`POST /api/test-history`, decline records, keyed
idempotent via migration 0014's `test_history.session_log_id` — an
UNPREDICTED stored shape that took the full triad treatment including
its own PM final-PR gate), the You re-test shortcut, and the ORIGIN
predicate in the editor. James's R1 ruling (2026-08-22): the phone-timer door RECORDS too — losing
a genuine unconnected test is worse than carrying a removable bogus row;
the remove/void verb gates 8B's list (binding, in 8B's own bullet).
**The stop-point was passed: the table met its
bounded criteria, and PR C is implemented** (doors + questionnaire +
16-cell table + Reset baseline setup; every enum value now has a real
writer — `estimated` was the last). James's 2026-08-23 copy ruling
(strong-and-steady 6k, not-a-sprint reminder; 2k stays ALL OUT) is
built into the doors card, RowPath, and the committed canvas sources
in the same commit. **Three durable facts
every later consumer of provenance must know (PR #164's gate):**
(1) VERSION SKEW — a pre-#164 client's Apply resends untouched fields
as plain writes, demoting a newer build's `derived`/`tested` source on
a field its rower never touched; inherent to the additive wire, and PR
B holds it when reasoning about `tested` longevity. (2) AWAY-AND-BACK —
a stepper nudge with zero net change, Applied, stamps `manual` over a
stored source with nothing visible; PR A shipped that conservatively,
and James RULED same day: provenance is ORIGIN, not act — a source
describes where the NUMBER came from, so an unchanged value keeps its
stamp. **PR B implements the value-identity predicate (stamp only when
the value actually changed) alongside `tested`**, where the ruling
first has real cost.
(3) SOURCE-BESIDE-NULL — the source columns are NOT NULL with defaults
while the numbers are nullable, so `k6Seconds: NULL, k6Source: 'manual'`
is a real row state; every consumer keys on the NUMBER being non-null
first. **Releases: A+B shipped as v0.18.0/v0.18.1** (the earlier
"BL's tag is v0.17.0" claim in LL's notes PR was corrected); PR A
itself owed no note (nothing tester-visible — that accounting line was
written here in advance per RF15); **PR C releases as v0.19.0**. James
checks all 16 table cells, printed in PR C's body. TRIAD: PM final-PR
gates ran on A (#164), B (#165, for 0014's unpredicted stored shape),
and C (#172 — PASS-WITH-CONDITIONS, conditions landed on the branch).

**Goal:** a no-baseline account reaches a working app through whichever
door suits them, and a rowed test finally gets RECORDED instead of
hand-typed.

- [x] **Baseline provenance** — per NUMBER, James's rev-2 ruling:
      `k2Source`/`k6Source`, each
      `manual | estimated | derived | tested`, stored, NEVER shown;
      existing rows migrate to `manual` (truthful — the You editor was
      the only writer that ever existed); additive API. **Triad core —
      lands per the grouping rule's triad exception.** Delivered by PR A
      (#164); ticked late — the status paragraph above recorded the land
      while this box sat unchecked. **M**
- [x] **The three doors** replace the single-offer no-baseline card
      (outcome-framed per James: recommend / I know it / row it) — PR C:
      `today/DoorsCard.tsx` + the three `/onboarding/*` flow screens;
      renders whenever the PAIR is incomplete (the superset ruling).
      Door 3 is dual-distance as NEW UI in the old card's anatomy — this
      bullet's original "reusing the shipped BaselineCard toggle" was
      overruled at the phase-open gate (the card refuses to render for a
      both-set account; spec rev 2's M7 finding), and BaselineCard is
      deleted. Door-3/6k copy carries James's 2026-08-23 ruling: strong
      and steady, with the not-a-sprint reminder; the 2k stays ALL OUT
      and the 6K Test workout itself still renders MAX (v0.18.1). **M**
- [x] **The questionnaire + estimate table**: two questions (experience,
      cardio), NO age band (standing PII-minimization ruling), answers
      TRANSIENT (never stored, never sent — pinned by an e2e wire
      capture); 16-cell static lookup in `domain/estimateBaseline.ts`
      with per-cell population comments and source tags. Re-grounded per
      rev 2 (the C2-rankings PRIMARY claim was withdrawn at the gates):
      SECONDARY recreational band 2:30..2:15/500m, conservative bias,
      one exempt cell (a-lot x training-hard, 2:10); bounded criteria
      all pinned by test (totality, 60..240, k2<k6, gap ==
      K2_K6_OFFSET_SECONDS, fast-end bound, monotonicity). CONSTANTS
      RECONCILED to one family: the editor's seeds now derive from the
      table's most-common cell (145/152 = 2:25/2:32), retiring the
      hand-typed 112/122 club-rower pair and its contradicting 10s gap.
      James checks all 16 cells at the PR. **M**
- [x] **The post-test prompt** (PR B): a completed test session offers
      its own result as the new baseline (`tested`) post-save, and never
      blocks or auto-writes; accept can then offer the derived
      counterpart (`derived`). Closes the loop 8A shipped open. The
      "sends `isTestResult`" wording this bullet opened with was
      superseded by rev 2's decouple ruling before any code existed:
      recording rides the sibling `POST /api/test-history` (fired on the
      SAVE, keyed to the log id, idempotent via `test_history.
      session_log_id` — migration 0014), so decline records too, and
      `isTestResult` still has zero client senders. New with PR B, both
      binding: the COMPLETENESS guard (monitor `endedBy === "finished"`
      only; timer `isComplete`; split inside the storable 60..240 band)
      and the ORIGIN predicate in the You editor (a touched field ships
      only when its value actually changed — an away-and-back nudge no
      longer demotes a stored source; an all-unchanged Apply makes no
      wire call). **M**
- [x] **The You-screen re-test shortcut** (James, 2026-08-22; PR B): row
      the 6k / race the 2k next to the baseline fields on You. Reshaped
      by James's tester feedback (2026-08-22, post-v0.18.0): the buttons
      are now links to each designated GLOBAL test's DETAIL screen
      (Connect / Start Timer / Log it after) with BACK returning to You,
      no caption; the start guards fire on the detail's own paths. The
      same feedback fixed the 6K Test's effort ref min -> max ("it's
      still all out") — deployed rows converge in place on boot.
      DEVIATIONS row 121 is the stated design (no handoff mock exists).
      **S**
- [x] **Reset baseline setup** (James, 2026-08-22, at the gate; PR C): a
      staged-confirm action on You clearing both numbers and both
      sources — the doors become re-enterable for ANY account, demos
      included. The deliberate clear operation is `DELETE
      /api/baselines` (its own verb — PUT still rejects null on
      purpose), deleting the row whole so SOURCE-BESIDE-NULL can leave
      nothing stale; additive, old clients unaffected, proven against
      real Postgres. **S**

- [ ] **Queued follow-up (split-entry review F1, 2026-08-23; single
      file, rides the next PR touching door 2):** door 2 can Save
      mid-entry and ship the clamped partial — type "1", tap Save, and
      60s rides the wire with only a blur-beat of display to announce
      it. The You editor's identical path is announced by its
      ConfirmLine before Apply; door 2 has no confirm, so the fix
      belongs there (`src/onboarding/KnowBaseline.tsx`). **S**

**Exit:** the spec's draft exit criteria, refined at phase open — each
door works end to end, the prompt closes the measurement loop, every
baseline carries a source and no screen shows it.
