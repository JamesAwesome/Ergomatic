# close-MD worklist

Frozen 2026-09-12 at main `b2e26701` (span ROADMAP.md 539..832 as of that sha;
anchor text in `close-MD.span.txt`). Shape: FIVE bullets, all `- [x]`, zero
open checkboxes, zero plain bullets. Every ticked row owes a tree receipt.

SLUG | DISPOSITION | title | status | receipt
md-pr1 | DONE | PR 1 — one writer for the stored run (TRIAD: stored shape) | merged | #408 → main deb50b77; `saveMonitorRun` has 0 code references under app/src; `scripts/handoffStoreBoundary.test.ts` present (28 `it(`)
md-pr2 | DONE | PR 2 — a lifecycle seam on useMonitorSession, and publish axes | merged | #413 → main bed5c1e4; `vi.doMock("../adapters/appLifecycle")` under app/src/monitor: 26 statements at phase open (#403, 3e7978b9; 29 grep lines incl. comments) → 0 statements; all `vi.doMock(` lines under app/src/monitor 82 → 30 (grep -c, comments included)
md-pr3 | DONE | PR 3 — one Sample shape (TRIAD: stored shape) | merged | #412 → main 07f5f845; the `r\??: true` grep prints exactly the three named lines (monitorRunShapes.ts:86, domain/monitor/types.ts:825, server/stores/logs.ts:191)
md-expa | DONE | Exploration A — the freeze/resume observer | answered NO PR | docs/superpowers/audits/2026-09-12-architecture-walk/exploration-a-freeze-observer.md; three riders rode #413
md-expb | DONE | Exploration B — one replay harness | answered NO HARNESS | #414 → main b2e26701; census docs/superpowers/audits/2026-09-12-architecture-walk/exploration-b-census.md

## Pass 2 (named hits outside the span, all reconciled — none carries MD work)
ROADMAP 492 (free-row tile: DONE #402, closed on PR 1's branch) · 535 (S1 defect scheduled elsewhere, "left out of Phase MD") · 1024-1035 (Wave A PR 1 DONE #409; the policy PR row carries its own `dies 2026-09-26`) · 2449 (hand-off residual, STRUCK at #408's hand-back, landed #414) · 2532 (EndedBy mirror DONE #412) · 2670 (listSessionLogs flake row CLOSED by #413).

## Pass 3 (heuristic; nouns: handoffStore, saveMonitorRun, appLifecycle, SeriesData, freeze observer, replay harness, captures.ts)
One hit outside the span: ROADMAP 2426 (`adapters/appLifecycle.ts`'s web arm in the NFC tap row) — REJECTED: names the adapter's web arm for the NFC flow, not the hook seam; no MD row describes that defect.

## Pull-ins
none (`grep -c "pulled in, close-MD" ROADMAP.md` → 0)
