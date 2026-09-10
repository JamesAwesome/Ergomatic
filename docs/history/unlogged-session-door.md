# The unlogged-session door — archived 2026-09-10

Every one of its six criteria was ticked and the section was still sitting in
the live slate. Archived whole rather than row by row.

Its own status line, preserved below, reads "OPEN at James's request" above six
completed criteria — which is why a row count alone was never going to decide
this.

---

## The unlogged-session door

**Status:** OPEN at James's request, 2026-09-03. Normal Today/warning design
approved 2026-09-03; additional recovery-case designs approved 2026-09-04.
Gate 0 and both task reviews are complete; browser recovery proof and generated
captures include the initial landscape safe exit. Automated gates pass.
James's approved September 4 follow-up resolved the final verification-byte
admission gap; scoped review found no new findings. The antagonist cleared
the proposed one-minute protocol's structural coverage. On build 875, James
confirmed native recovery, successful Save and removal from Today; three
phone screenshots are recorded. PM phase-close review passed that bounded
native-door criterion, not every proposed protocol observation. James then
authorized "Merge when green". Main `2f258006` is integrated; combined-tree
verification and scoped integration review passed. PR CI remains the merge gate.
This is separate from Wave F, whose dependency cleared on 2026-09-04; that
closeout does not substitute for this feature's own approvals or acceptance.
[Opening design](docs/superpowers/specs/2026-09-03-unlogged-session-design.md)
and [comparison](docs/superpowers/specs/2026-09-03-unlogged-session-gate.html).
**S–M.** Full cycle; non-TRIAD only while retirement, stored shapes and
recorded-number semantics remain unchanged.

**What and why:** Connect showed "You have an unlogged session. Connecting
discards it." and the dialog offered Cancel and Connect anyway — nothing to
VIEW what the session holds, and no way to log it. A rower who does not want
to lose the row has no move except to walk away.

- [x] **Approve the normal rendered recovery path.** James: "approved",
      2026-09-03. Today exposes retained work
      above suggestions; Start/Connect/Just Row warnings offer View unsaved
      without discarding. Both orientations, long titles and both phone and
      monitor records. No new queue or automatic save.
- [x] **Close the completed-programmed PM5 hole.** At c5015c2e,
      `Today.tsx:1529` hides these records while guards protect them;
      `Today.test.tsx:2701` explicitly pins the omission. Re-enter the PM5
      summary, never the manual form. James's precise retained record remains
      uncaptured; the source/test-confirmed gap is sufficient to open repair,
      not proof of that incident's exact record shape.
- [x] **Resolve every other guarded shape honestly.** Deleted library
      workouts, null-id non-Just-Row records and legacy/invalid frozen seeds
      cannot use the existing save route. Approved: explicit type choice for
      valid retained measurements without library metadata; read-only full
      recording/copy/keep for data that cannot safely rebuild a summary.
      James approved these extra screens on 2026-09-04 ("Approve").
- [x] **Keep the recovery destination usable.** Local records must remain
      visible when Today's unrelated requests stall/fail (`Today.tsx:437`).
      Two retained Just Row sources must each open the selected recording,
      not the current newer-timestamp choice (`JustRowLog.tsx:108`). The
      second is a defensive coexistence case, not an observed normal flow.
      The error/loading treatment and selection lifetime were approved with
      the additional recovery cases on 2026-09-04.
- [x] **Prove preservation across the browser path.** Production writer to warning
      to Today to PM5 summary to saved history; failed-save retry, cold-start
      hydration, both records, and View canceling Connect's staged replacement.
      The 844×390 mounted warning puts the focused View safe exit and its
      keyboard follow-on above Main nav. Preserve existing save/discard/
      replacement retirement. Native walk and phase-close review remain required
      before exit. Evidence:
      `docs/testing/2026-09-04-unlogged-session-evidence.md`.
- [x] **Close final review's verification-byte admission gap.** The selected
      programmed route must refuse arrays outside the existing server contract
      (1–32 integers, each 0–255) before mounting Save. Empty/out-of-range
      integer arrays previously passed and produced a rejected Save. Keep the
      recording in the approved read-only treatment; no repair or byte dropping.
      James approved one focused follow-up after the final-wave limit on
      September 4; its scoped review cleared the tested fix with no new findings.

---
