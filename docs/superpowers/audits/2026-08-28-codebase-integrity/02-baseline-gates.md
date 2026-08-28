# Baseline Gates and Artifact Identity

Product baseline: `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`

Status: COMPLETE

## Artifact identity

| Field                      | Value                                                      |
| -------------------------- | ---------------------------------------------------------- |
| Product commit             | `39460c6514c14ab3133cb5ce8a59ba8625aeef4a`                 |
| Audit branch               | `codex/codebase-audit-spec`                                |
| Audit HEAD at run          | `6b79e40765fde5f65f1a8455e7a1ea1c89a81951`                 |
| `main` at run              | `b88cb97eb977649c31290d3c565da8eb5a4a1db7`                 |
| Worktree                   | `/private/tmp/ergomatic-codebase-audit`                    |
| Product diff from baseline | Empty for `app`, `app/e2e`, `app/server`, and `app/domain` |
| Runtime                    | Node `v26.5.0`; pnpm `11.17.0`                             |
| Docker                     | Client/server `29.4.1`                                     |

`main` had advanced past the product baseline in five tracked product/test
files: `app/domain/monitor/types.test.ts`, `app/e2e/design.spec.ts`,
`app/e2e/screenshots.spec.ts`, `app/src/you/BaselineEditor.test.tsx`, and
`app/src/you/BaselineEditor.tsx`. Those changes are not blended into this run;
Task 13 revalidates any promoted finding whose scope intersects them.

## Gate transcript

| Gate                   | Command                                                        | Start | End   | Exit | Result                                                             | Artifact / output                                                                                               | Blind spot |
| ---------------------- | -------------------------------------------------------------- | ----- | ----- | ---- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------- |
| Identity               | `git rev-parse`; fixed-baseline product diff; runtime versions | 16:51 | 16:51 | 0    | Product diff empty; exact SHAs and runtimes above                  | Documentation branch HEAD is later than product baseline by design.                                             |
| Lint                   | `pnpm lint`                                                    | 16:52 | 16:53 | 0    | ESLint passed                                                      | Static policy only.                                                                                             |
| App formatting         | `pnpm format:check`                                            | 16:52 | 16:53 | 0    | All app files matched Prettier                                     | Does not cover root audit Markdown; direct document checks run separately.                                      |
| Typecheck              | `pnpm typecheck`                                               | 16:52 | 16:53 | 0    | Client and server TypeScript builds passed                         | Type correctness is not runtime or contract correctness.                                                        |
| Unit                   | `pnpm test --project unit`                                     | 16:52 | 16:53 | 0    | 46 files; 1,435 passed; 1 skipped                                  | Node-only; fakes and stated expectations can share product premises.                                            |
| Client                 | `pnpm test --project client`                                   | 16:52 | 16:53 | 0    | 149 files; 4,032 passed                                            | jsdom emitted seven `Window.scrollTo()` not-implemented warnings; cannot enter native paths.                    |
| Production build       | `pnpm build`                                                   | 16:53 | 16:53 | 0    | 235 modules; main JS 578.23 kB / 176.26 kB gzip                    | Warned that a minified chunk exceeds 500 kB; build success alone proves no exclusion claim.                     |
| Bundle exclusion       | `pnpm dist:grep`                                               | 16:53 | 16:53 | 0    | All five dev-only literal markers absent                           | Green is not trusted until Task 9 proves the probe can go red.                                                  |
| Full coverage boundary | `pnpm test:coverage`                                           | 16:53 | 16:54 | 0    | 213 files; 5,715 passed; 1 skipped; global 98.94/97.46/98.96/99.35 | Includes real Postgres integration but repeats seven jsdom warnings; native transports are explicitly excluded. |
| E2E                    | `pnpm e2e`                                                     | 16:54 | 16:57 | 0    | 420 passed in 1.9 minutes; no retry reported                       | Chromium against real compose and fake PM5; cannot clear native BLE/lifecycle or real hardware.                 |
| Teardown               | Explicit compose project `ergomatic-44616`, `down -v`          | 16:57 | 16:57 | 0    | Containers, network, and `ergomatic-44616_pgdata` removed          | Initial plan command was invalid; correction recorded below.                                                    |

The integration contribution is derived without rerunning it: the full
workspace minus the accepted unit/client runs equals 18 files and 248 tests.
This is an arithmetic count, not a separately captured project label.

## Per-file coverage at the fixed baseline

| High-risk file                     |       Statements |         Branches |      Functions |            Lines | Coverage blind spot                                                                         |
| ---------------------------------- | ---------------: | ---------------: | -------------: | ---------------: | ------------------------------------------------------------------------------------------- |
| `src/monitor/driver.ts`            | 99.46% (739/743) | 97.83% (498/509) |   100% (93/93) | 99.71% (700/702) | Lines 4093–4094 and 11 branches; semantic/wire authority still external.                    |
| `src/monitor/useMonitorSession.ts` | 99.03% (511/516) | 95.93% (283/295) | 98.57% (69/70) |   100% (477/477) | Twelve branches and one function; browser execution cannot clear native event ordering.     |
| `src/monitor/monitorRun.ts`        |   100% (129/129) | 98.26% (113/115) |   100% (28/28) |   100% (102/102) | Two branches; stored-value truth still needs an independent quantity oracle.                |
| `server/routes/data.ts`            | 98.62% (573/581) | 97.28% (573/589) |   100% (49/49) | 98.92% (552/558) | Sixteen branches and six lines; mounted behavior does not define the intended API contract. |
| `server/stores/logs.ts`            |     100% (65/65) |     100% (62/62) |   100% (14/14) |     100% (60/60) | Full execution does not independently prove transaction or quantity semantics.              |
| `domain/validate.ts`               |     100% (75/75) |     100% (89/89) |     100% (8/8) |     100% (68/68) | Full execution is compared with independently established workout rules in Lane A.          |
| `src/session/draft.ts`             |     100% (52/52) |     100% (36/36) |   100% (16/16) |     100% (42/42) | Browser storage exceptions and recovery still require biting probes.                        |
| `src/session/run.ts`               |     100% (19/19) |     100% (23/23) |     100% (5/5) |     100% (16/16) | Browser storage exceptions and recovery still require biting probes.                        |

Two aggregate-gate warnings matter for later Lane E work: `server/db/schema.ts`
reported 69.69% statements/lines and 37.5% functions, while
`server/stores/errors.ts` reported 0% across all four measures. Neither is a
defect conclusion; both show why the 90% repository aggregate is not a per-file
proof.

## Gate noise and artifact facts

- Client and coverage runs each printed seven jsdom `scrollTo()` warnings.
- Production and E2E image builds warned about a minified chunk over 500 kB.
- E2E printed five `NO_COLOR`/`FORCE_COLOR` warnings and one unset optional
  Cloudflare-token warning.
- E2E reported no failure or retry; all 420 tests passed.
- The E2E web image intentionally contained fake/recording/hold-open chunks;
  that is a test build with the fake gate enabled, not the production artifact
  checked by `dist:grep`.

## Stack teardown

Resolved compose project: `ergomatic-44616` (web `8316`, Postgres `15316`).

The plan's original command sourced `app/scripts/stack-env.sh` from `app/`
without setting its required `REPO_ROOT`, so it would derive a different
project; running compose without the e2e environment also failed interpolation
before deleting anything. The controller used the E2E-reported project name,
the same compose files and default environment, then ran `down -v`.

Post-checks returned no container, volume, or network name for the project.
The plan now sets `REPO_ROOT`, compose files, and required e2e environment
explicitly.

## Baseline verdict

All baseline gates passed at the fixed product commit. This is strong evidence
for the branches and artifacts those gates can enter, not whole-product
correctness. The accepted blind spots are native BLE/lifecycle, real PM5
behavior, oracle independence, per-file semantic coverage, gate-noise masking,
and whether the production-bundle exclusion probe bites. Tasks 4–9 own those
questions.
