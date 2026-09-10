# Phase PROTO — the wire-semantics audit

**Archived 2026-09-10** — REMOVED 2026-09-10 without running · never opened.

James's 2026-08-27 order to classify every claim about a PM5 field as VENDOR-CITED / OBSERVED / INFERRED. Held on his own 2026-08-31 ruling until after the front door, then removed on 2026-09-10 at his instruction.

**Removed rather than completed (James, 2026-09-10).** The VENDOR-CITED /
OBSERVED / INFERRED sweep never ran and has no artifact. The adjacent work
that DID run is the derivation audit of 2026-08-27
(`docs/superpowers/audits/2026-08-27-derivation-audit.md`, three readers over
~7,000 lines), which classified consumer-side derivations rather than wire-field
claims. Its two live residuals — RC-38 and the PR1.75b leftovers — were lifted
into the live slate before this body was archived; they are not buried here.

---

## Phase PROTO — the wire-semantics audit (HELD, L)

**Phase OD, 2026-09-09 — CORRECTLY PARKED, and recorded so the sweep does not
re-flag it.** James's 2026-08-27 order (_"a deep dive to ensure we arent
hallucinating anything in the protocol"_) is 13 days old and undone, but it is
held by HIS OWN later ruling (2026-08-31): the sweep waits until after the
front door, RC-38 is pulled forward alone, **re-ask at Wave A's close, not
before**. **OPEN QUESTION: none.** The trigger's subject — Wave A's close —
does not exist on any calendar yet, since Wave A is not open. That is a real
dependency, not a passive trigger, and the distinction is the one this phase
exists to draw. **NEXT (≤0.25): none owed until Wave A opens.**

James, 2026-08-27: _"im also interested into a deep dive to ensure we arent
hallucinating anything in the protocol... we've misused fields before or
conflated them to meanings they dont have."_ Enumerate every claim we make about
a PM5 field and classify it VENDOR-CITED / OBSERVED / INFERRED.

**Scheduling ruling, James 2026-08-31: the sweep is HELD until after the front
door (Wave A), and RC-38 is pulled forward on its own.** The audit ships a
tester nothing and the north star is a stranger using this; RC-38 is the one
row where we key a live check on an enum we have not read. **Re-ask at Wave A's
close, not before.**

- **PR1.75b leftovers (2026-09-02, #277's PM gate — RF14):** (1) a unit test for
  the empty `?state=` callback (`params.get` answers `""`, which the adapter
  treats as a MISMATCH and refuses — fails safe, untested); (2)
  `app/ios/App/App.xcodeproj/project.pbxproj`'s four `E2A1B0…` entries sit out
  of ascending-id order and Xcode will re-sort them on its next save (cosmetic;
  expect that churn in the next iOS PR, not a CLI rewrite).
- **RC-38 — BLOCKED ON JAMES (re-stated Phase OD, 2026-09-09).**
  **OPEN QUESTION: none for us — the residual needs a document only he can
  supply.** Concept2's PDFs sit behind Cloudflare and could not be fetched, so
  the honest half already shipped (the disposition is recorded where the value
  is used, `domain/monitor/pm5/commands.ts:32-46`, which says in terms that
  `0x01` is a doc LABEL and not a transcription). What is still owed is the
  verbatim `OBJ_WORKOUTTYPE_T` row. **NEXT (≤0.25): ask James to drop the
  CSAFE PDF into `docs/monitor/`; the transcription is then a comment change.**
  This is a decision/action owed by him, not work waiting on a PR, and it
  should stop being written as though a PR will carry it.
  _Original framing:_ SCHEDULED (2026-08-31), rides the next connected-surface PR.
  Transcribe `OBJ_WORKOUTTYPE_T`. We have read one row of an enum we key a check
  on: `8` is sourced, `1` and `0` are sourced nowhere. James, 2026-08-27:
  _"have we been making assumptions that are unfounded here? is there
  documentation about workoutType from concept2?"_ The transcription either
  confirms our reading or finds a real defect; both outcomes are cheap.
  **Per recurring failure 16's second corollary, the row for each value is
  quoted verbatim beside the claim it supports.** **S**
  **DISPOSITION (Just Row connect spec 2026-09-02, PR #278): NOT
  transcribed, and said so where the value is used.** Concept2's PDFs sit
  behind Cloudflare and could not be fetched, so `0x01` ships as
  `WORKOUTTYPE_JUSTROW` in `domain/monitor/pm5/commands.ts` with a doc
  comment naming it a LABEL rather than an `OBJ_WORKOUTTYPE_T` row. What
  the value rests on instead is machine corroboration, counted not
  transcribed: the 08-31 capture's 0x0031 census
  (`docs/monitor/sessions/walk-2026-08-31-justrow/decode-0031.py`) reads
  type `0` at a virgin menu, `1` from the first pull, and `1` again after
  a Menu end with nothing sent by anyone — so `1` is what the PM5 picks
  for its own Just Row, and ALSO its idle default, which is why the spec
  keys no gate on it. The verbatim row is still owed: James can drop the
  CSAFE PDF into `docs/monitor/` and the transcription is a comment
  change. Still **S**, no longer scheduled against a PR.
- **The axis-quantity question — REHOMED 2026-08-31** into the "say which number
  this is" design pass below. It was never only about `traceModel.ts`'s `t` and
  `d`; it is one of three places the same screen mixes two quantities.
