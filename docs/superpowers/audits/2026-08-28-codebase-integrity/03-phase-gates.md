# Audit Phase Gates

Baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Status: IN_PROGRESS

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

Pending Task 12.

## Phase-close antagonist exit gate

Pending Task 14.

## Phase-close product-manager gate

Pending Task 14.

## Corrections and reruns

- 2026-08-28T16:47:32-0400: both `GO_WITH_CHANGES` verdicts were adjudicated;
  all accepted corrections passed Prettier and `git diff --check` before the
  gate record commit.
