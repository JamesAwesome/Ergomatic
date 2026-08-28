# Codebase integrity audit

## What and why

Ergomatic needs a whole-codebase audit that finds real problems before they
become another confident-but-wrong number, a lost record, a blocked row, or a
test suite that agrees only with itself. This is a read-only investigation of
the current product, not a refactor exercise: the output is a ranked, evidenced
fix list James can hand to Claude Code without turning guesses or historical
notes into work.

**Status:** approved audit design; execution is advancing to Task 5.

## Goal and definition of done

The audit answers five questions about the code at one fixed commit:

1. **Correctness:** does externally observable behavior match its stated
   authority?
2. **Brittleness:** which legitimate inputs, lifecycle changes, recoveries, or
   deployments produce a wrong result, lost work, or unrecoverable flow?
3. **Over-engineering:** where does extra state, abstraction, or duplication
   increase the failure surface without protecting a distinct product need?
4. **Circular logic:** where does a test, fake, assertion, or recovery rule
   derive its expected result from the code it is meant to prove?
5. **Hallucinations:** where do comments, tests, design records, or code make a
   factual claim that its source does not establish?

The audit is complete only when every in-scope lane has a disposition
(`no material finding`, `finding`, `known risk needing outside evidence`, or
`deferred`) and the final report contains a deduplicated, priority-ordered list
of validated fixes. A green test suite is evidence for the behavior it can
enter; it is never a blanket disposition.

## Baseline and change control

- **Baseline:** `39460c6514c14ab3133cb5ce8a59ba8625aeef4a` on `main`, dated
  2026-08-28. Every task reports this SHA before it starts.
- **Included:** tracked product code, migrations, tests, build/deploy scripts,
  committed design/research/audit records, and committed monitor captures.
- **Excluded:** untracked files in the main checkout, generated outputs,
  `node_modules`, and proposed code changes.
- **Read-only rule:** audit agents do not modify source, tests, fixtures,
  documentation, data, or Git state. The controller may apply a bounded,
  temporary mutation in the audit worktree only when a biting probe can change
  prioritization: it records the exact mutation and entered branch, never
  stages it, reverses it with `apply_patch`, and proves the product diff is
  empty before accepting the result. Stryker's own disposable sandbox is
  preferred. No reproducer becomes a fix unless James separately asks for it.
- **Rebase rule:** if `main` changes materially during execution, record the
  first affected SHA and re-run only the affected probes. Never silently blend
  evidence from two baselines.

The specification is a control document, not evidence that the product is
correct. Earlier records are useful leads: the 2026-08-27 derivation audit
says, “The dangerous derivations are not about which interval a number belongs
to. They are about **link and lifecycle state**”
(`docs/superpowers/audits/2026-08-27-derivation-audit.md:20-28`). Every claim
is still re-read or re-executed at this baseline.

## Audit principles

### Authority before implementation

Each behavior must separate the expected authority from the production subject
and the probe medium before code is judged:

| Behavior                         | Expected authority                                                                       | Production path under audit                                      | Probe medium                                                      | Insufficient substitute                           |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| Workout shape and bounds         | Approved workout grammar and product rules; unresolved rules remain unknown              | `validateSteps()` and every authoring/import boundary            | Boundary table over seeded, stored, and hand-authored workouts    | TypeScript types or builder controls alone        |
| Resolved targets and estimates   | Independently calculated Erg Book math and real authored workouts                        | Domain target, phase, estimate, and log derivations              | Hand calculations and independently authored fixtures             | A UI rendering of the same `phases()` result      |
| SQL constraints and transactions | PostgreSQL 18 semantics plus the approved durable-data invariant                         | Committed migrations, schema, and real stores                    | Real Postgres migration, constraint, race, and rollback probes    | In-memory store fake                              |
| API behavior                     | Explicit client/server product contract plus HTTP and auth semantics                     | Validation, mounted routes, middleware, serializers, and clients | Real mounted-server requests with independently shaped responses  | A hook mock or an unchecked `as` cast             |
| PM5 bytes and program semantics  | Primary Concept2 interface definition and the quantity shown by independent PM5 evidence | Codec, compiler, driver, transport, and consumers                | Raw recordings, hand decode, structural readback, or PM5 screen   | Fake events, decoded old logs, or driver comments |
| iOS lifecycle and BLE delivery   | Apple/Capacitor/plugin primary documentation and observed native behavior                | Native adapter, plugin calls, liveness, and recovery             | Native capture correlated with lifecycle and PM5 evidence         | Web Bluetooth or Playwright behavior              |
| Rendering and interaction        | Approved design, WCAG/platform convention, and the intended rower outcome                | Browser/native component and state flow                          | Real surface with realistic stored data and computed measurements | Component existence or a shallow render           |

When no independent authority exists, the report says so. For example, the
2026-08-27 PM5 walk records, “Interval 3 — 59.8 m rowed before the Menu
terminate — appears **nowhere** in the PM5’s memory”
(`docs/monitor/sessions/walk-2026-08-27/README.md:122-130`). The audit must not
turn a convenient proxy into proof.

### Evidence grades

Every conclusion gets both a severity and an evidence grade. Do not collapse
them into one score.

| Grade                 | Meaning                                                                                                                           | May become a proposed fix?           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Confirmed**         | A reproducible behavior contradicts an independent authority or a stated invariant whose provenance is independently established. | Yes                                  |
| **Probable**          | Code and a discriminating probe show a realistic failure, but the external authority or production occurrence is incomplete.      | Yes, marked as conditional           |
| **Hypothesis**        | A suspicious path, stale claim, or unentered branch needs a discriminating probe.                                                 | No; it remains an audit task         |
| **Cleared**           | The probe passed against an independent authority at this baseline.                                                               | No                                   |
| **Unknown by design** | The system cannot observe the fact; the product must expose or bound that uncertainty.                                            | Only as an explicit product decision |

Code comments, prior audit prose, and a test that constructs both sides from
the same helper are testimony, not independent evidence. A repository-stated
invariant cannot promote a finding until its product, protocol, platform, or
data-contract provenance is established. A source citation must point to the
line that could falsify the claim, and a document citation must quote the
relevant sentence.

### The no-circular-proof rule

A probe is rejected when product and oracle share an implementation, premise,
source, or measured quantity such that the same corruption could leave both
agreeing. Each accepted oracle names the production fields it does not read and
one corruption that must make it fail. Common failures to check for are:

- a fake emitting values by calling the same transformation the production
  parser/driver uses;
- expected bytes built with the production encoder;
- an expected UI total calculated with the same accumulator used by the UI;
- client and server tests sharing a malformed fixture or type cast;
- separately written decoders copying the same scale, optionality assumption,
  or quantity definition;
- an audit conclusion copied from a prior report without re-running its
  discriminating case.

The current codebase supplies concrete reasons for this rule. The fake creates
the on-wire interval count with production `toMachineIndex()`
(`app/src/monitor/transports/fake.ts:174-187`), and precomputes its expected
program writes with production `buildProgrammingSequence()`
(`app/src/monitor/transports/fake.ts:400-405,2161-2179`). Those tests exercise
integration but cannot independently prove either wire convention. The
rest-field audit likewise says that “no existing fixture in the repo — no e2e
spec, no screenshot script — ever sets” `restSeconds`
(`docs/monitor/fake-vs-parser-audit.md:13-32`), so those fixtures cannot
disprove the consumer's scale or sign.

## Audit lanes

Lanes are organized around product outcomes and sources of truth, not the
repository’s folders. A finding crossing lanes has one owner and linked
evidence; it is never entered twice.

### A. Workout semantics, generation, and PM5 compilation

**Outcome at risk:** a rower receives or records a different workout from the
one they authored.

**Scope:** `app/domain/**`, seed corpus, bulk import, plans, builder-to-domain
adaptation, and PM5 program compilation/encoding.

**Questions:**

- Do validation, expansion, estimation, timer creation, display, and compiler
  agree about repeats, rests, effort-only work, distance work, and absent
  baselines?
- Does every generated or seeded workout survive its actual client, server, and
  PM5 path—not merely a unit path built from the same corpus?
- Are PM5 limits and byte precision independently verified at values where
  rounding, truncation, and interval grouping disagree?

**Required probes:** boundary matrix for every `Step` member, property-style
expansion/round-trip checks using separately calculated expectations, corpus
replay through import/edit/connect routes, and byte fixtures authored without
calling the encoder. Include leading rest: bulk parsing accepts rest lines,
while `compileProgram()` rejects a first rest because PM5 cannot program it
(`app/domain/monitor/program.ts:354-401`).

**Exit:** each shared transformation has one named authority and at least one
non-self-referential probe, or is an explicitly documented unknown.

### B. Data, migrations, authorization, and API contracts

**Outcome at risk:** a user loses history, sees another user’s data, is locked
out, or receives an API shape the client cannot safely read.

**Scope:** `app/server/**`, `app/drizzle/**`, route mounting, browser/native
API adapters, all durable browser storage, and store contract suites.

**Questions:**

- Can every persisted version, malformed record, deleted relationship, and
  partial migration be read safely or rejected deliberately?
- Do the real Postgres stores and fast fakes have the same observable contract
  under conflict, transaction, ownership, and invalid-ID paths?
- Are JSONB and browser-storage values validated at every read boundary, not
  only on the normal write path?
- Do auth and origin rules match the transport actually making the request?

**Required probes:** fresh and upgraded database matrices, real concurrent
Postgres cases, malformed 2xx response/body tests, storage read/write failure
tests, ownership/conflict tests, and client/server response-shape comparisons.
The audit must examine raw JSON columns—not infer safety from route validation:
the schema deliberately stores workout/log shapes as JSONB
(`app/server/db/schema.ts:108-145,171-245`), while the log route reconstructs
many fields but deliberately permits arbitrary `machineSummary` object fields
after size checks (`app/server/routes/data.ts:645-706`).

**Exit:** every durable shape has a version/validation/ownership disposition,
and every fake-versus-real divergence is either contract-tested or a confirmed
fix candidate.

### C. Client workflow, timer, recovery, and log truth

**Outcome at risk:** the rower loses an active session, logs the wrong result,
or sees a plausible result that the application cannot justify.

**Scope:** timer/session/logging flows, builder and plan state, router
boundaries, local/session storage, summary/history rendering, and their API
hooks.

**Questions:**

- For reload, background, back navigation, duplicate action, failed save,
  malformed storage, and baseline change, which state is authoritative and
  which writers can replace it?
- Are displayed duration, target, actual, and summary fields consumed from
  their owner or recomputed in more than one place?
- Does the UI distinguish unknown, estimated, stale, and measured data rather
  than laundering them into a normal-looking value?

**Required probes:** event traces from authored workout to persisted log;
reload/discard/retry/duplicate-save matrices; fault injection for
`localStorage.getItem`, `setItem`, network response bodies, and stale server
responses; and calculations independently recomputed from stored rows. The
audit includes reads as well as writes: `saveRun()` catches storage failure,
but `loadRun()` reads `localStorage.getItem()` before its parsing guard
(`app/src/session/run.ts:91-145`). That is a candidate to test, not yet a
defect claim.

**Exit:** the audit can name one writer and recovery behavior for each active
session/log state, and has either disproved or evidenced every duplicate
derivation with user-visible effect.

### D. Connected monitor, browser/iOS transports, and lifecycle recovery

**Outcome at risk:** the phone misstates the row, loses or fabricates PM5 data,
or sends an unsafe command to an active erg.

**Scope:** PM5 codec and compiler, web and Capacitor BLE transports,
driver, hook, connected surface, monitor persistence, captures, fakes, and
native lifecycle adapters.

This lane is trace-led because its two main owners are already unusually large:
the baseline sources end at `driver.ts:6082` and `useMonitorSession.ts:3322`.
Review them as interacting state machines rather than as two long files.

| Trace                             | Must prove end-to-end                                                                                                                                        | Primary disproof                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Connection and readiness          | Connect intent → platform selection → initialization/permission/radio → retrieval or picker → connection → service/notification subscription → ready/program | A permission, retrieval, picker, connection, or subscription failure that prevents later traces from beginning |
| Program and readback              | Authored phase → encoded program → PM5 structural readback → user state                                                                                      | A valid-looking program that is not what the PM5 reports armed                                                 |
| Live measurement and attribution  | Raw bytes → parser → driver attribution → live surface → saved actual                                                                                        | A value assigned to the wrong interval, source, or authority                                                   |
| Silence, background, and recovery | Lifecycle/radio event → transport → liveness/axes → user-facing state → persisted reason                                                                     | A healthy background gap labelled link loss, or a real loss rendered live                                      |
| Finish, terminate, and logging    | Boundary/summary/termination → held finish → record → log/summary                                                                                            | A missing/duplicated final interval or a command sent after the product declared it unsafe                     |

**Required probes:** connection/readiness failure tables; raw replay with
separately recorded program metadata; transition tables that include impossible
paths; bounded controller-owned negative mutations; real PM5 screen comparisons
using the quantity that screen actually reports; and separately approved native
hardware walks for background, radio-off, Menu, disconnect, finish-grace, and
rest cases. Browser tests cannot clear native
behavior: `defaultTransport()` selects Capacitor BLE only when `isNative()`
(`app/src/adapters/monitorTransport.ts:38-91`), and native lifecycle selection
is equally unreachable from Playwright.

**Known prerequisite:** primary-source research and hardware validation are
required before changing a PM5 field’s meaning or an iOS/BLE lifecycle claim.
The audit must use Concept2’s interface definition, Apple Core Bluetooth
background/state-restoration documentation, Capacitor App documentation, and
the exact installed BLE plugin source. No hardware action is scheduled by this
spec; it becomes a separate James-approved walk.

**Exit:** each of the five traces has a list of supported transitions, known
unobservable states, input provenance, and authority-specific oracle; a
controller-owned composition matrix also proves the shared state passed between
traces. A web/fake pass is
never recorded as a native/hardware pass.

### E. Tests, build/deploy paths, and documentation truth

**Outcome at risk:** a green gate, release note, or operating instruction gives
false confidence while a shipped route, feature, or artifact behaves
differently.

**Scope:** Vitest projects, contract suites, Playwright, fixtures, mutation
configuration, build/bundle gates, Docker/CI/deploy scripts, design assertions,
runbooks, and comments that state facts.

**Questions:**

- Which gates run the production path, and which only exercise a fake or a
  simplified route?
- Can a test kill the changed condition it claims to protect?
- Are fixtures production-shaped and do their asserted numbers have an
  independent source?
- Does the built artifact, not code inspection, establish any claim about
  bundles, config, or deployment?
- Do instructions and prose cite a source that actually supports their
  load-bearing assertion?

**Required probes:** targeted mutation or manual source perturbation,
fixture-origin table, coverage-by-file review, fresh production builds plus
artifact checks, CI path selection tests, real compose golden flows, and
documentation claim sampling. The existing test policy already recognizes the
boundary problem: “Each layer has one job,” and only real Postgres tests SQL
behavior while E2E uses the real compose stack
(`docs/TESTING.md:24-37`). This audit tests whether the current suites actually
meet that contract.

**Exit:** every high-value gate has a stated input path, oracle, blind spot,
and a passing case that would go red for a meaningful corruption.

## Execution order and model budget

The order follows irreversible user harm and the cost of a false conclusion.

1. **Inventory and claim graph — low-cost scouts.** Map authors, writers,
   readers, external authorities, large stateful seams, casts, suppression,
   timers, and existing evidence. Output hypotheses and probes only.
2. **Lane investigations — appropriate specialist.** One agent investigates one
   trace or contract at a time. It reads the code and returns evidence; it does
   not change code or expand into unrelated cleanup.
3. **Independent disproof — stronger reviewer.** Any P0/P1 candidate, changed
   number meaning, stored shape, auth boundary, device command, or claimed
   circular proof gets a second approach with a different oracle.
4. **Controller adjudication — high-end coordination.** The controller
   re-reads every promoted citation, rejects duplicate/circular evidence,
   records uncertainty, and writes the ranked finding only after validation.
5. **Final adversarial pass.** Attack the report itself: wrong quantity,
   stale evidence, false independence, over-broad fix, and missing native or
   operational reality.

Spend the cheapest model on static mapping and narrow grep-backed questions.
Reserve stronger reasoning for state-machine traces, persistence/auth,
hardware semantics, and disagreements between reports. Never spend a second
agent on the same code reading unless it supplies a genuinely independent
oracle or adversarial premise check.

## Task and finding record contract

Every task receives a small, stable brief with: baseline SHA; exact scope;
question; authority; pre-existing evidence; required disproof; prohibited
assumptions; and expected report path. It returns no code change.

Every candidate is recorded in this form before prioritization:

```md
### AUD-### — short user-outcome statement

- Category: correctness | brittleness | over-engineering | circular proof | hallucinated claim
- Severity / confidence: P# / Confirmed | Probable | Hypothesis
- User impact: what a rower, operator, or account holder experiences.
- Expected authority: source, exact quoted rule, and what it measures.
- Actual behavior: baseline SHA, exact code/capture/build evidence, and trigger.
- Independent disproof: probe used; why it does not share the product's
  implementation, premise, source, or quantity; production fields it does not
  read; and a corruption that makes it fail.
- Scope: writers, readers, stored shapes, and paths affected.
- Existing coverage gap: why current tests did not or could not catch it.
- Smallest safe fix: a bounded direction, not an untested rewrite.
- Verification required after a fix: test/capture/build/hardware proof.
- Status: candidate | validated | cleared | deferred.
```

Candidates without an expected authority and independent disproof remain
hypotheses. They do not enter the list returned to Claude as fixes.

## Prioritization

Rank findings by user harm first, then evidence confidence, blast radius, and
repairability. Code size, novelty, and the number of tests are not severity.

| Priority | Meaning                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | Security/authorization escape, data destruction, an unsafe device command, or a silently permanent wrong record. Stop dependent work.                |
| **P1**   | A rower is blocked, loses active work, or receives a material wrong number/prescription without a safe recovery. Fix before adjacent feature work.   |
| **P2**   | Recoverable wrong/stale display, realistic flaky transition, contract gap, or duplicated state that can grow into P1. Queue with its owning area.    |
| **P3**   | Complexity, dead path, stale claim, or maintainability debt with no demonstrated current user harm. Bundle only with the next relevant P0–P2 change. |

The final handoff has two parts:

1. **Fix list:** only Confirmed/Probable P0–P2 items, ordered by priority,
   each with user impact, proof, smallest safe direction, affected scope, and
   verification needed.
2. **Risk register:** unresolved hypotheses, external evidence needed, and
   deliberate uncertainties. These are not phrased as defects or fixes.

## Non-goals and stop rules

- No refactor is recommended merely because a file is long, a pattern is
  unfamiliar, or an abstraction has a name. Over-engineering requires a
  demonstrated duplicated authority, unreachable state, contradictory
  interface, or change cost that a smaller design removes.
- No performance, visual redesign, or dependency modernization sweep unless it
  is directly needed to establish a correctness or brittleness claim.
- No hardware premise is inferred from a browser test, and no browser premise
  is inferred from an iOS observation.
- A task stops and escalates when its evidence contradicts this spec, an
  external authority is missing, it discovers a live P0/P1, or its scope
  reaches a stored shape/auth/number meaning not named in the brief.
- A cleared probe is recorded. Negative results prevent the audit from
  rediscovering and re-paying for the same suspicion.

## First execution slate

The first round intentionally produces evidence, not fixes:

1. Build the claim graph and fixture/oracle inventory for Lane E.
2. Run the Lane A boundary matrix over real library and adversarial imported
   workouts, separating grammar, expansion, estimate, display, and compiler
   expectations.
3. Trace Lane B’s highest-risk stored shapes through migration, real Postgres,
   route, client reader, and browser storage recovery.
4. Produce Lane C event traces for start, reload, discard, failed save, and
   duplicate submission.
5. Produce Lane D transition tables and a native-evidence gap list; schedule no
   hardware work until James separately approves the relevant walk.

The controller then selects only the candidates whose next probe can change the
priority list. This keeps the audit comprehensive without paying for repeated
whole-repository reviews.
