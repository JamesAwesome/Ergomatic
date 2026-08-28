# Codebase Integrity Audit Dashboard

Product baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Audit branch: `codex/codebase-audit-spec`

## Execution state

| Task | Exact task name                                                  | Status      | Owner / model                                  | Baseline SHA                               | Dispatch time            | Result                                                    | Accepted artifact                                  | Second pass          | Stronger-model reason                                                           |
| ---- | ---------------------------------------------------------------- | ----------- | ---------------------------------------------- | ------------------------------------------ | ------------------------ | --------------------------------------------------------- | -------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| 1    | Establish the Audit Control Record                               | COMPLETE    | Controller / `gpt-5.6-sol` high                | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | 2026-08-28T16:27:22-0400 | Exact artifact set created; format and diff checks passed | This audit directory                               | Pending fresh review | Controller owns shared state and record contracts.                              |
| 2    | Run the Phase-Open Gates                                         | NOT_STARTED | PM + antagonist / `gpt-5.6-sol` high           | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `03-phase-gates.md`                                | —                    | Phase shape and adversarial anchor are project gates.                           |
| 3    | Record the Baseline Gate and Artifact Identity                   | NOT_STARTED | Controller / `gpt-5.6-sol` high                | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `02-baseline-gates.md`                             | —                    | One controller must bind all evidence to one artifact.                          |
| 4    | Build the Oracle, Fixture, and Claim Inventory (Lane E, Pass 1)  | NOT_STARTED | Scout / `gpt-5.6-luna` medium                  | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `01-oracle-inventory.md`, `lane-e-gates.md`        | —                    | —                                                                               |
| 5    | Audit Workout Semantics and PM5 Compilation (Lane A)             | NOT_STARTED | Investigators / `gpt-5.6-terra` high           | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `lane-a-workout.md`, `candidates.md`               | —                    | Cross-representation numeric semantics require specialist reasoning.            |
| 6    | Audit Durable Data, Migrations, Auth, and API Contracts (Lane B) | NOT_STARTED | Investigators / `gpt-5.6-terra` high           | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `lane-b-data.md`, `candidates.md`                  | —                    | Stored shape and auth are triad risks.                                          |
| 7    | Audit Client Workflow, Recovery, and Log Truth (Lane C)          | NOT_STARTED | Investigators / `gpt-5.6-terra` high           | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `lane-c-client.md`, `candidates.md`                | —                    | Stateful recovery needs end-to-end trace reasoning.                             |
| 8    | Audit the Connected Monitor as Four Traces (Lane D)              | NOT_STARTED | Investigators / `gpt-5.6-terra` high           | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `lane-d-monitor.md`, `candidates.md`               | —                    | Device transitions and wire meaning require specialist reasoning.               |
| 9    | Test the Gates and Factual Claims (Lane E, Pass 2)               | NOT_STARTED | Investigator / `gpt-5.6-terra` high            | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `lane-e-gates.md`, `candidates.md`                 | —                    | Oracle independence and mutation quality need semantic review.                  |
| 10   | Adjudicate and Deduplicate All Candidates                        | NOT_STARTED | Controller / `gpt-5.6-sol` xhigh               | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `candidates.md`, `findings.md`, `risk-register.md` | —                    | Whole-repo contradictions and circular evidence require final adjudication.     |
| 11   | Independently Validate the Priority Slate                        | NOT_STARTED | Fresh validators / `gpt-5.6-sol` high or xhigh | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `findings.md`, `risk-register.md`                  | Required             | P0/P1, triad, device, and circular-proof claims require independent validation. |
| 12   | Decide Whether Hardware Evidence Can Change the Ranking          | NOT_STARTED | Controller; hardware-walk only with approval   | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `lane-d-monitor.md`, `03-phase-gates.md`           | —                    | Physical evidence is used only if it can change ranking.                        |
| 13   | Write the Final Audit and Claude Fix List                        | NOT_STARTED | Controller / `gpt-5.6-sol` xhigh               | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `final-report.md`, `claude-fix-list.md`            | —                    | Final ranking and handoff must reconcile every lane.                            |
| 14   | Run the Phase-Close Adversarial and Product Gates                | NOT_STARTED | Antagonist + PM / `gpt-5.6-sol` xhigh          | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | `03-phase-gates.md`, final outputs                 | Required             | Exit evidence and product actionability are binding project gates.              |
| 15   | Final Verification, Commit, and James Handoff                    | NOT_STARTED | Controller / `gpt-5.6-sol` high                | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | —                        | —                                                         | Committed audit branch                             | —                    | Controller must prove identity, formatting, and clean handoff.                  |

Allowed statuses: `NOT_STARTED`, `IN_PROGRESS`, `NEEDS_EVIDENCE`, `BLOCKED_ON_JAMES`, `CLEARED`, `COMPLETE`.

## Credit-spend ledger

| Dispatch                  | Task | Model / effort     | Why this tier                                               | Reused context? | Outcome                        |
| ------------------------- | ---- | ------------------ | ----------------------------------------------------------- | --------------- | ------------------------------ |
| Controller initialization | 1    | `gpt-5.6-sol` high | Establishes shared contracts and resolves cross-task rules. | N/A             | Complete; fresh review pending |

## Baseline movement

| Checked at | Product baseline                           | Current `main`         | Audit HEAD            | Disposition                                 |
| ---------- | ------------------------------------------ | ---------------------- | --------------------- | ------------------------------------------- |
| Task 1     | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` | Pending Task 3 capture | Pending Task 1 commit | Product evidence remains fixed to baseline. |

## Controller notes

- Audit agents are read-only; the controller alone accepts evidence and edits these files.
- At most one controller task may be `IN_PROGRESS`; up to three disjoint read-only investigations may run concurrently.
- Hypotheses never enter `claude-fix-list.md`.
