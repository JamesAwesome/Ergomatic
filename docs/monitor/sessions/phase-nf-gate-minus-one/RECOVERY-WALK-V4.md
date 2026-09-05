# NF-RECOVERY-v4 — cases 2-4 with a PM5-NFC-availability check

Status: DRAFT for PM and antagonist (delta: new wire ground, PM5 NFC
availability). Not yet invitable.

Everything in `RECOVERY-WALK-V1.md`, `-V2.md` and `-V3.md` stands (build,
controller, fixed helper, cap, cases, one attempt per case, stop rules,
transport preflight, ready-state invitation). Case 1's completed v3 evidence
stands; v4 runs cases 2, 3 and 4. Two deltas, both from
`docs/superpowers/research/2026-09-05-pm5-nfc-availability.md`:

1. **Flipper in hand is part of the ready state** (James, 2026-09-05), and
   the between-case block gains one line: after re-arming the PM5, touch the
   Flipper to the NFC spot and read it; reply **dark** if it finds nothing.
   A **dark** reply stops the block as `PM5 NFC unavailable` (not an app
   failure), and James power-cycles the PM5 off the clock. No phone action.
2. **Adjudication of a no-tag reader start:** if a case's A or B ends with
   Core NFC 201 and no tag, the case is scored INCONCLUSIVE (`PM5 NFC
   unavailable` suspected) and the block stops; the Flipper read James does
   next decides which layer. It is never scored as a failed recovery.

Neither delta adds a phone install, a new app control, a retry, or a clock
extension. The Flipper read is a James action on his own device, ~5 s,
inside the existing between-case block. Consent unchanged: one **go**.

## Open before PM

- Whether to power-cycle the PM5 between EVERY case pre-emptively (costs ~60 s
  each, may not fit four cases in eight minutes) versus only on **dark**.
  Recommendation: only on **dark**; a pre-emptive cycle would also hide the
  very behaviour the product needs to know about.
- Antagonist delta: PM5 NFC availability is new wire ground the anchor pass
  never saw; attack the claim that a Flipper read is a valid independent
  oracle for "the PM5 is emitting" (same tag, different reader, no BLE).
