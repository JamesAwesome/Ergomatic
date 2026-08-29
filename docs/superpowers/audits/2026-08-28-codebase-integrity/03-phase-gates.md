# Audit Phase Gates

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Status: PASS

## Phase-open product-manager gate

Verdict: `GO_WITH_CHANGES`.

The audit is justified only as a bounded, read-only overlay that neither
delays Wave F's known P1 nor creates a second backlog. Model tiers are
proportionate; uncapped dispatch quantity was not.

### PM dispositions

| Gate item                                                                   | Disposition | Controller evidence / correction                                                                                                                                               |
| --------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Put the audit in the live ROADMAP                                           | ACCEPTED    | Added the active audit overlay and its one-owner exit rule.                                                                                                                    |
| Change approved status back to pending                                      | REJECTED    | James approved the spec and then selected subagent-driven execution before Task 1. The stale “execution has not started” clause was corrected without undoing that approval.   |
| Do not displace Wave F or rediscover its known P1                           | ACCEPTED    | Added a global overlay constraint and ROADMAP boundary.                                                                                                                        |
| Move Lane C/D before Lane A/B                                               | REPLACED    | Reordering would break the accepted Lane A → C → D and Lane B → C evidence interfaces. The overlay boundary preserves Wave F priority without invalidating those dependencies. |
| Cap validation spend                                                        | ACCEPTED    | Task 10 now counts and prices the validator batch, excludes P3 spend, and stops for James before any nonzero Task 11 batch.                                                    |
| Revalidate fix items against current `main` and give each one ROADMAP owner | ACCEPTED    | Task 13 now records final-main disposition, excludes superseded items, and assigns one live owner plus gate/approval state.                                                    |
| Replace nonexistent `AGENTS.md` instruction                                 | ACCEPTED    | Task 1 now names `CLAUDE.md`; the controller read it before accepting this correction.                                                                                         |
| Resolve final whole-gate contradiction                                      | ACCEPTED    | Global constraints now match Task 15: product gates once at baseline, then only when tracked product/test/config files changed.                                                |

## Phase-open antagonist anchor pass

Verdict: `GO_WITH_CHANGES`.

### Antagonist dispositions

| Blocking defect                                                                  | Disposition | Correction                                                                                                                             |
| -------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Authority rows confused expected authority, production subject, and probe medium | ACCEPTED    | Rebuilt the spec table with separate columns and tightened Confirmed provenance.                                                       |
| Circularity checked shared symbols but not shared premise/source/quantity        | ACCEPTED    | Expanded the rejection rule and required every accepted oracle to name unread fields and a corruption that makes it fail.              |
| Required biting mutations had no authorized owner                                | ACCEPTED    | Added a controller-only, never-staged, immediately reversed mutation exception with entered-branch and clean-diff proof.               |
| Task 3's “non-Docker” gates ran integration repeatedly                           | ACCEPTED    | Unit and client now run explicitly; full coverage runs the integration project exactly once at the Docker boundary.                    |
| Lane D omitted connection establishment and notification readiness               | ACCEPTED    | Added a fifth connection/readiness trace from intent through subscription and ready/program.                                           |
| Parallel Lane D traces lacked a composition pass                                 | ACCEPTED    | Added a controller matrix joining phase, driver, silence, attribution, close reason, terminate eligibility, totals, and saved actuals. |

All six were plan/spec defects; none is promoted as a product finding.

## Vetted ground

- Fixed-baseline product evidence remains isolated from audit-document commits.
- Severity and evidence grade remain separate; hypotheses cannot enter the fix list.
- Browser/Playwright cannot clear the Capacitor BLE or native-lifecycle path.
- The fake's production-helper circularity is real at the fixed baseline.
- Luna mapping, Terra bounded investigations, and Sol adjudication/validation are proportionate model allocations; quantity is capped separately.
- Lane A → C → D and Lane B → C are real evidence dependencies.
- Native gaps may remain `UNKNOWN`; the plan does not turn browser evidence into native evidence.
- No hardware action is needed for the anchor verdict.

## Accepted ledger proposals

- PM: a whole-codebase audit is an overlay, not a product wave; promoted work is current-main-checked and receives one live owner.
- Antagonist: authority must be separate from subject and probe; independence includes shared premises/quantities; connection and cross-trace composition are first-class monitor audit surfaces.

## Hardware-ranking decision

James approved and completed the compact three-row walk for AUD-001, AUD-007,
AUD-009, and AUD-010. No P1/P2 finding was promoted. AUD-007 and AUD-010 are
cleared for PM5 `432331249` in the observed runs (firmware was not recorded);
AUD-001 is narrowed
after the completed 100 m survived radio-off through save; AUD-009 remains
unknown because `:00 /500m` was not an independent untargeted control. The
incidental camera excursion confirmed a self-recovering false LOST banner, but
no data loss. Evidence lives in
`docs/monitor/sessions/walk-2026-08-28-codebase-audit/`. AUD-008, AUD-018, and
AUD-019 remain excluded for the original decision-value reasons.

## Phase-close antagonist exit gate

Initial verdict: `FAIL`.

The antagonist re-opened producers and authorities rather than accepting four
blind validators as sufficient. Three preliminary findings were over-promoted,
and the fix list displaced the live Wave F slate.

| Blocking finding                                       | Controller disposition                                                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUD-013 lacked product authority/supported producer    | ACCEPTED. Raw SQL proves hardening debt; supported PM5/route/Drizzle writers do not preserve `1e1000`. Downgraded P1 → P3 and removed from the fix list.             |
| AUD-020's cleanup trigger was fabricated               | ACCEPTED. The normative Storage algorithm has no throwing `removeItem` branch; no real post-201 throwable operation was established. Downgraded P1 → P3 and removed. |
| AUD-012 violated the audit's P3 definition             | ACCEPTED. Dual startup fails, but supported deployment is serial/single-replica. Downgraded P2 → P3; docs correction rides the next deployment-doc PR.               |
| Seven audit chunks displaced current Wave F            | ACCEPTED. The list is now audit-relative only; actual owners live in Wave F, Wave A, and the open register. Wave F phase-open sequences existing and audit P1s.      |
| Stale lane dispositions contradicted final validation  | ACCEPTED. Lane C/D/E now identify themselves as evidence snapshots and point to `findings.md` as authoritative.                                                      |
| Hardware wording implied firmware-specific clearance   | ACCEPTED. Exact clearances now say this PM5 in the observed runs and state firmware was not recorded.                                                                |
| History bundle remained over-broad after AUD-013 moved | ACCEPTED. AUD-002 is now an independent History response-boundary chunk.                                                                                             |

Correction re-gate: `PASS`. The antagonist confirmed every blocker was
resolved and stated that the six-finding/five-chunk handoff is sound. No new
product-scope contradiction was found.

## Phase-close product-manager gate

Initial verdict: `PASS_WITH_CORRECTIONS`.

| Blocking finding                                 | Controller disposition                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current-main product order was not revalidated   | ACCEPTED. The newer machine-summary TRIAD P1 is preserved; the audit no longer issues a global execution order.                                                             |
| ROADMAP ownership lived inside the audit overlay | ACCEPTED. Actionable work moved into Wave F, Wave A, and the open-item register; P3 items ride relevant work or remain risk-register evidence.                              |
| Over-engineering had no evidenced disposition    | ACCEPTED. A narrow Luna pass found partial coverage only; the report names checked areas and explicitly defers extra state/abstractions/dead branches/change amplification. |
| Spec/dashboard control records were stale        | ACCEPTED. Spec status, Task 13 counts, baseline-review result, and Task 14 state were reconciled.                                                                           |

Tester impact remains none for this documentation-only audit. TestFlight release
is not needed and no version bump is warranted. Correction re-gate:
`PASS_WITH_CORRECTIONS`; the only remaining item was four stale prospective
status labels in `risk-register.md`, corrected before Task 15. The PM recommends
accepting the six-finding transfer and opening Wave F's phase-open sequencing
gate.

## Corrections and reruns

- 2026-08-28T16:47:32-0400: both `GO_WITH_CHANGES` verdicts were adjudicated;
  all accepted corrections passed Prettier and `git diff --check` before the
  gate record commit.
- 2026-08-28T22:20:09-0400: initial phase-close PM and antagonist verdicts were
  adjudicated. All blocking findings were accepted; re-gate remains required
  before Task 14 can become complete.
- 2026-08-28T22:36:00-0400: reused-context re-gates accepted the corrected
  six-finding/five-chunk handoff. Four stale risk-register task labels were
  rewritten to their final deferred dispositions; Task 14 is complete.
