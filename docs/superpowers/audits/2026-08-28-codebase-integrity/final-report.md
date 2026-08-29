# Codebase Integrity Audit

Baseline reproduction: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Current-main check: `fd4d06a57581e1e814ecd06f74274a30bffce6ee`

Status: READY_FOR_PHASE_CLOSE

## What and why

The audit established nine actionable defects—five P1 and four P2—and turned
them into seven bounded implementation chunks for Claude Code. Eight findings
are Confirmed and one is Probable; all nine are still present on current
`main`. No P0, security escape, destructive migration, harmful runtime import
cycle, or independently proven over-engineering defect was found.

The result matters because the top failures sit at durability seams: real
connected measurements can miss the Log door, a committed save can be retried
into duplicate durable rows, and standards-defined storage failures can block
Today or silently cancel Start. These are not style judgments or tests agreeing
with their own fixtures; each promoted item has an external condition, a
mounted/real-boundary consequence, and a fresh independent validation.

## Priority findings

| Rank | Finding | Evidence     | Rower/operator consequence                                                                      | Execution chunk                  |
| ---- | ------- | ------------ | ----------------------------------------------------------------------------------------------- | -------------------------------- |
| 1    | AUD-016 | P1 Confirmed | Completed PM5 measurements can fall into a manual Log door with no recovery record.             | Preserve measured connected work |
| 2    | AUD-020 | P1 Confirmed | A false Retry can create duplicate logs and advance a plan twice.                               | Keep a committed save committed  |
| 3    | AUD-011 | P1 Confirmed | Policy-denied storage blocks the default Today screen.                                          | Local-storage recovery           |
| 4    | AUD-015 | P1 Confirmed | Start appears to begin, then silently returns to Today with no active run.                      | Local-storage recovery           |
| 5    | AUD-013 | P1 Confirmed | One database-valid extreme summary number hides every healthy History row.                      | History boundary hardening       |
| 6    | AUD-006 | P2 Confirmed | Today and Library understate accepted rest while Timer retains it.                              | Workout scan-surface truth       |
| 7    | AUD-014 | P2 Confirmed | Offline native sign-out leaves the bearer in Keychain for later reuse.                          | Wave A native sign-out           |
| 8    | AUD-012 | P2 Confirmed | Two concurrent empty-database servers leave one unhealthy; current serial deploy is unaffected. | Deployment contract              |
| 9    | AUD-002 | P2 Probable  | A parseable non-array 200 crashes History; no real producer was found.                          | History boundary hardening       |

The complete, self-contained Claude prompts—including scope, authority,
failing-test-first proof, mutation, bundle boundaries, gates, current-main
status, and ROADMAP owner—are in [claude-fix-list.md](claude-fix-list.md).

All nine scopes were diffed from the fixed baseline to current main. Later main
changed a monitor type test, visual tests, and `BaselineEditor`; none intersects
these production paths. The false booting-replica claim is also unchanged.

## Lane coverage and disposition

| Lane                                  | Completion and disposition                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A — workout semantics/PM5 compilation | Complete. One Confirmed P2 (AUD-006); device semantics were quarantined instead of inferred.                                              |
| B — data/migrations/auth/API          | Complete. AUD-011, AUD-012, and AUD-014 promoted; normal ownership, auth gates, migrations, and single-replica deployment mechanics held. |
| C — workflow/recovery/log truth       | Complete. AUD-002, AUD-013, AUD-015, AUD-016, and AUD-020 promoted after mounted or real-store consequences.                              |
| D — connected monitor                 | Complete. No fix promoted; hardware cleared two exact PM5 cases, narrowed native recovery, and left zero-target semantics unknown.        |
| E — gates/factual claims              | Complete. Production bundle exclusion and runtime import graph were red-calibrated; eight missing regression discriminators were named.   |

Every lane question is dispositioned as promoted, cleared, or explicitly
deferred with a reason. The remaining broad native/callback, PM5 semantic, and
compatibility questions stay in the [risk register](risk-register.md); they are
not smuggled into the fix queue.

## Cleared high-risk areas

- No harmful runtime import cycle exists at the baseline: a TypeScript-AST
  graph covered 217 production runtime modules and 489 relative value-import
  edges; a disposable two-module cycle made the same probe go red.
- Production bundle exclusion is real, not inferred from source: a temporary
  static fake-monitor import made `dist:grep` fail against the built artifact;
  reversal removed it and restored green.
- Normal authenticated ownership, CSRF/cookie/bearer separation, committed
  migrations 0000–0016, serial fresh boot, and the declared single-replica
  deployment held their probes.
- PM5 `432331249` executed both later-frame intervals in the six-row hardware
  fingerprint and naturally stopped after the immediate two-row replacement.
  AUD-010 and AUD-007 are cleared for that device/firmware case.
- Native radio-off after one complete 100 m preserved that exact interval
  through End/save. The saved 100 m / 0:29 / 2:23.5 row matched the PM5/ring's
  about 28.7 s / 2:23.8 measurement; no P1 was promoted.
- The hardware walk did not clear zero-pace semantics: the PM5's `:00 /500m`
  READY field was ambiguous without an omitted-target control. Keeping it
  unknown is stronger than inventing a sentinel meaning.

## Deferred unknowns

- AUD-001 remains a broad native callback/buffering hypothesis despite one
  successful interruption-to-save path. A 4.613 s camera excursion did confirm
  a self-recovering false LOST banner with no disconnect or data loss.
- AUD-008 still lacks a primary general variable-interval limit or a physical
  interval-51 result.
- AUD-009 still lacks an omitted-target/real-target PM5 control.
- AUD-017 ambiguous lost responses are not AUD-020's known-201 cleanup bug;
  idempotency requires a separate product contract.
- AUD-018 has two real, conflicting terminate-partial outcomes; a third sample
  cannot choose a product rule.
- AUD-019 lacks a bounded browser acknowledgement recovery control; ordinary
  successful hardware cannot disprove an unbounded wait.
- Whole-corpus real-consumer replay, arbitrary raw persisted corruption, native
  permission/picker/subscription ordering, firmware diversity, and real-host
  image availability remain deferred. Their absence limits generalization; it
  does not weaken the exact promoted triggers.

## Systemic patterns

- **Durability results are ignored at ownership hand-offs.** AUD-015 and
  AUD-016 each have a lower layer that reports or experiences failure and a
  caller that proceeds as if persistence succeeded.
- **Committed work and cleanup share one error boundary.** AUD-020 turns
  downstream local bookkeeping into a false statement about an already-created
  server resource.
- **Runtime types stand in for hostile-boundary validation.** AUD-002 and
  AUD-013 accept a shape/type category without bounding the first real
  consumer's operation.
- **Accepted authoring shapes and scan projections disagree.** AUD-006 exists
  because validation/timer and preview surfaces do not share an independently
  checked “all accepted rest is visible” invariant.
- **Claims outran supported topology.** AUD-012's seed lock was described as a
  complete replica-start lock even though migrations run before it.
- **Test abundance hid seam absence.** The ordinary suites were green because
  fixtures started downstream of each missing producer or assumed the platform
  boundary succeeded. Calibrated literal failures—not aggregate counts—found
  the defects.

## Recommended execution order

Execute seven chunks, not nine PRs:

1. AUD-016 alone: preserve measured connected work through Log.
2. AUD-020 alone: separate committed POST success from cleanup.
3. AUD-011 + AUD-015: one local-storage recovery PR with separate regressions.
4. AUD-013 + AUD-002: one History API/client boundary PR, server first.
5. AUD-006 alone after rendered Gate 0; displayed-number triad.
6. AUD-014 alone in Wave A; auth triad.
7. AUD-012: correct docs with the next deployment-doc PR; defer code until
   overlapping replicas become supported.

This order prioritizes irrecoverable rowed data, durable duplication, blocked
core routes, wrong prescriptions, then currently unsupported deployment risk.
It also respects review cost: unrelated triad work never shares a PR.

## Audit limits and spend

The audit is an evidence overlay, not proof that every behavior is correct.
Source inspection cannot clear native OS/plugin delivery, and one PM5 cannot
define all firmware. The hardware photos are correlated PM5/app pairs rather
than literal same-frame shots; raw streams/rings settle ordering for the cases
we accepted, while that limitation keeps AUD-009 open.

The baseline gate passed lint, format, typecheck, unit, client, integration,
coverage, build, production-bundle grep, compose readiness, E2E, and screenshots.
Those gates establish a stable artifact, not product correctness. Per-file
coverage gaps and known environmental screenshot drift were recorded rather
than averaged away.

Credit spend stayed bounded: Luna mapped mechanical scope, Terra investigated
five lanes, and Sol adjudicated only cross-lane, P1/triad, and independent
validation work. Four blind Sol validation passes covered all nine promoted
candidates; the hardware walk was one compact, approved discriminator rather
than open-ended rowing. The dispatch ledger is in
[00-dashboard.md](00-dashboard.md).

## Decision for James

Approve or reorder the seven execution chunks in
[claude-fix-list.md](claude-fix-list.md). AUD-006 needs a rendered leading-rest
decision before implementation; AUD-014 waits in Wave A; AUD-012 needs only a
claim correction until multi-replica deployment becomes real. No hypothesis
needs more credit or rowing before this fix queue can start.
