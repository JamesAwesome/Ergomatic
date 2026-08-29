# Codebase Integrity Audit

Baseline reproduction: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Current-main check: `fd4d06a57581e1e814ecd06f74274a30bffce6ee`

Status: FINAL

## What and why

The audit established six actionable defects—three P1 and three P2—grouped
into five implementation chunks for Claude Code. Five are Confirmed and one is
Probable; all six production paths remain present on current `main`. No P0,
security escape, destructive migration, harmful runtime import cycle, or
evidence-backed over-engineering defect was found.

The top failures sit at durability seams: real connected measurements can miss
the Log door, a standards-defined storage denial can block Today, and Start can
appear to begin without a durable active run. The audit also caught itself
over-promoting three cases. Raw-SQL corruption, fabricated `removeItem` failure,
and unsupported replica concurrency produced real technical failures but lacked
the supported trigger or current topology required for P1/P2. They are retained
as P3/deferred evidence, not handed to Claude as product fixes.

## Priority findings

| Rank | Finding | Evidence     | Rower/operator consequence                                                          | ROADMAP owner      |
| ---- | ------- | ------------ | ----------------------------------------------------------------------------------- | ------------------ |
| 1    | AUD-016 | P1 Confirmed | Completed PM5 measurements can fall into a manual Log door with no recovery record. | Wave F             |
| 2    | AUD-011 | P1 Confirmed | Policy-denied storage blocks the default Today screen.                              | Wave F             |
| 3    | AUD-015 | P1 Confirmed | Start appears to begin, then silently returns to Today with no active run.          | Wave F             |
| 4    | AUD-006 | P2 Confirmed | Today and Library understate accepted rest while Timer retains it.                  | Open-item register |
| 5    | AUD-014 | P2 Confirmed | Offline native sign-out leaves the bearer in Keychain for later reuse.              | Wave A             |
| 6    | AUD-002 | P2 Probable  | A parseable non-array 200 crashes History; no supported producer was found.         | Open-item register |

The self-contained prompts—including trigger, authority, safe direction,
scope, failing-test-first proof, mutation, gates, current-main status, and live
owner—are in [claude-fix-list.md](claude-fix-list.md).

This ranking is relative to the audit findings, not the global product queue.
Current main added a newer Wave F stored-number TRIAD P1 after the fixed
baseline, alongside the hardware-reproduced pre-row P1. Wave F's phase-open gate
must sequence those existing items with AUD-016/011/015 before implementation.
The audit does not displace them.

## Phase-close downgrades

| Finding | Final disposition                  | Correction that changed the result                                                                                                                             |
| ------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUD-012 | P3 / Confirmed stale claim         | Dual empty-database startup really fails, but supported deployment is explicitly serial/single-replica; no current rollout trigger supports P2.                |
| AUD-013 | P3 / unsupported-trigger hardening | Raw SQL can produce the list 500, but PM5, route, and Drizzle writers do not preserve `1e1000`; no repair/import/legacy producer was established.              |
| AUD-020 | P3 / unsupported-trigger hardening | Duplicate durable rows occur if cleanup throws, but validators fabricated `removeItem` failure and the normative Storage algorithm defines no throwing branch. |

AUD-012's claim correction rides the next deployment-doc PR. AUD-013 and
AUD-020 stay in the risk register until a supported producer or throwable
post-201 operation is established. This correction is part of the audit's
hallucination/circularity result: a biting probe can still be the wrong probe.

## Lane coverage and disposition

| Lane                                  | Completion and disposition                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A — workout semantics/PM5 compilation | Complete. AUD-006 Confirmed P2; device semantics were quarantined instead of inferred.                                                      |
| B — data/migrations/auth/API          | Complete. AUD-011 and AUD-014 promoted; normal ownership/auth held; AUD-012/013 were downgraded at phase close after trigger review.        |
| C — workflow/recovery/log truth       | Complete. AUD-002, AUD-015, and AUD-016 promoted; AUD-020 downgraded after its fabricated cleanup trigger was rejected.                     |
| D — connected monitor                 | Complete. No new fix promoted; hardware cleared two exact PM5 runs, narrowed native recovery, and left zero-target semantics unknown.       |
| E — gates/factual claims              | Complete. Bundle exclusion and runtime import graph were red-calibrated; missing regression discriminators and unreachable surfaces mapped. |

Every lane question is promoted, cleared, or explicitly deferred. Lane reports
are evidence snapshots from their task; [findings.md](findings.md) is the
authoritative post-validation/phase-close disposition.

## Over-engineering disposition

**Partially covered.** The audit tested runtime import cycles and mapped
state/writer/authority seams plus test/platform reachability. It did not perform
a dedicated repository-wide review of unnecessary extra state,
one-consumer/unused interfaces, production dead branches, duplicated mechanisms,
or measurable change amplification. No evidence-backed over-engineering finding
was promoted; those subcategories remain deferred, not cleared. File length,
complexity, or unfamiliarity was not treated as evidence.

## Cleared high-risk areas

- No harmful runtime import cycle exists at the baseline: a TypeScript-AST
  graph covered 217 production runtime modules and 489 relative value-import
  edges; a disposable two-module cycle made the same probe go red.
- Production bundle exclusion is real: a temporary static fake-monitor import
  made `dist:grep` fail against the built artifact; reversal restored green.
- Normal authenticated ownership, CSRF/cookie/bearer separation, committed
  migrations 0000–0016, serial fresh boot, and the declared single-replica
  deployment held their probes.
- PM5 `432331249` executed both later-frame intervals in the six-row fingerprint
  and stopped after the immediate two-row replacement in the observed runs.
  Firmware was not recorded; no cross-device claim is made.
- Native radio-off after one complete 100 m preserved that interval through
  End/save. The saved 100 m / 0:29 / 2:23.5 row agrees with the PM5/ring's about
  28.7 s / 2:23.8 measurement; no P1 was promoted.
- The hardware walk did not clear zero-pace semantics: the PM5's `:00 /500m`
  READY field was ambiguous without an omitted-target control.

## Deferred unknowns

- AUD-001 remains a broad native callback/buffering hypothesis despite one
  successful interruption-to-save path. A 4.613 s camera excursion confirmed a
  self-recovering false LOST banner with no disconnect or data loss.
- AUD-008 lacks a primary general variable-interval limit or interval-51 result.
- AUD-009 lacks an omitted-target/real-target PM5 control.
- AUD-017 ambiguous lost responses require a separate idempotency contract.
- AUD-018 has two real, conflicting terminate-partial outcomes; more samples do
  not choose a product rule.
- AUD-019 lacks a bounded browser acknowledgement recovery control.
- Whole-corpus real-consumer replay, arbitrary persisted corruption, native
  permission/picker/subscription ordering, firmware diversity, real-host image
  availability, and the unreviewed over-engineering subcategories remain
  deferred. Their absence limits generalization; it does not weaken the exact
  promoted triggers.

## Systemic patterns

- **Durability results are ignored at ownership hand-offs.** AUD-015 and
  AUD-016 each have a lower layer that reports or experiences failure and a
  caller that proceeds as if persistence succeeded.
- **Platform boundaries are entered outside their guards.** AUD-011's parse
  handling is sound only after a Storage object exists; the getter can fail
  before that point.
- **Runtime types stand in for hostile-boundary validation.** AUD-002 accepts a
  top-level category without bounding the first real consumer's `.map`.
- **Accepted authoring shapes and scan projections disagree.** AUD-006 exists
  because validation/timer and preview surfaces lack an independently checked
  “all accepted rest is visible” invariant.
- **Claims outran supported topology.** AUD-012's seed lock was described as a
  complete replica-start lock even though migrations run before it.
- **Fault injection can manufacture authority.** AUD-013 and AUD-020 survived
  independent validation because the consequence was real; phase close caught
  that their producers were raw SQL and nonstandard monkeypatching rather than
  supported product conditions.

## Execution hand-off

The five audit chunks are:

1. AUD-016 alone: preserve measured connected work through Log.
2. AUD-011 + AUD-015: one Wave F local-storage recovery PR with separate tests.
3. AUD-006 alone after rendered Gate 0; displayed-number TRIAD.
4. AUD-014 alone in Wave A; auth TRIAD.
5. AUD-002 alone with the next History API/client boundary PR.

This is the audit-relative order. Wave F phase-open must place chunks 1–2
against the current pre-row and machine-summary P1s before any implementation
brief is issued. Unrelated TRIAD work remains separate.

## Audit limits and spend

The audit is an evidence overlay, not proof that every behavior is correct.
Source inspection cannot clear native OS/plugin delivery, and one PM5 cannot
define all firmware. The hardware photos are correlated PM5/app pairs rather
than literal same-frame shots; raw streams/rings settle ordering only for the
cases accepted.

The baseline gate passed lint, format, typecheck, unit, client, integration,
coverage, build, production-bundle grep, compose readiness, E2E, and
screenshots. Those gates establish a stable artifact, not product correctness.

Credit spend stayed bounded: Luna mapped mechanical scope, Terra investigated
five lanes, and Sol adjudicated cross-lane, P1/TRIAD, and independent-validation
work. Four blind Sol passes covered the preliminary slate; one compact hardware
walk addressed ranking-changing device questions. A narrow Luna close-out pass
identified the honest over-engineering boundary instead of spending another
whole-repository review.

## Decision for James

Accept the six-finding audit slate and transfer, then open Wave F to sequence its
existing pre-row and machine-summary P1s with AUD-016/011/015. AUD-006 still
needs a rendered leading-rest decision; AUD-014 stays in Wave A; AUD-002 rides
the next History boundary PR. No hypothesis needs more credit or rowing before
that phase decision.
