<!-- Copied verbatim from `.superpowers/sdd/2026-08-21-warmup-removal/flake-investigation.md`
     on 2026-08-22, per RF14/I-4: that path is git-excluded (`.superpowers/`), so a
     citation into it dangles for any reader who is not this session. This is the
     durable home for the same investigation; see ROADMAP.md's Phase WU section for
     the phase-close pointer to it. -->

# Flake investigation — design.spec.ts "post-workout summary (manual door)" tap-target sweep

**Verdict: a pre-existing test-layer race in the describe's readiness gate, amplified by
`assertTapTargets`' re-querying sweep. NOT a product defect. NOT created by Phase WU —
though the branch does make it hit more often, and the fix should ride this branch.**

Investigated at `f3db330` in worktree `.claude/worktrees/wu-flakehunt` (disposable,
detached, nothing committed). Compose stack `ergomatic-50864` (web :8164).

---

## 1. Reproduction and rate

### 1a. The scoped repeat run the brief asked for

```
cd app
export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"
export REPO_ROOT="/Users/james/projects/github/jamesawesome/Ergomatic/.claude/worktrees/wu-flakehunt"
source scripts/stack-env.sh
pnpm exec playwright test --project=chromium \
  --grep "post-workout summary \(manual door\)" --repeat-each=10 --reporter=list
```

**100 passed (34.1s). 0 failures.** Run count checked: 100 = 10 tests × 10 repeats, so
the filter took.

> The pnpm trap fired first, exactly as CLAUDE.md warns: `pnpm e2e -- -g "…"
> --repeat-each=10` ran **399 tests** (the whole suite), because pnpm eats `-g` (its own
> `--global`) even after `--`. `--grep` survives; `-g` does not. Prefer
> `pnpm exec playwright test … --grep` for scoped runs.

### 1b. Full-suite rate on this commit

Four full-suite runs at `f3db330` under my stack: **399 passed, 399 passed, 399 passed,
399 passed. 0/4 failures.** (One via `pnpm e2e`, three via `pnpm exec playwright test
--project=chromium`.)

This directly contradicts the "3 failures in 6 runs (~50%)" figure in `progress.md`. If
the branch rate were 50%, P(0 failures in 4 runs) ≈ 6%. Combined with the base's 5/5
green, the honest read is that **both samples measured the machine, not the branch** —
see §4, where the same metric moves 57% → 95% on unchanged code within one session.

### 1c. What DID reproduce, at high rate

A purpose-built probe (`e2e/_flakeprobe.spec.ts`, written into the worktree, run, and
deleted again — the worktree is clean at `f3db330`) reproduced the underlying condition
and, three times in 96 sweeps, the exact failure:

```
NULLBOX pass=0 i=0 n0=13 outer=<a class="tab" href="/today" data-discover="true">…
NULLBOX pass=2 i=0 n0=13 outer=<a class="tab" href="/today" data-discover="true">…
NULLBOX pass=3 i=0 n0=13 outer=<a class="tab" href="/today" data-discover="true">…
```

Byte-for-byte the same element the real failure names — captured in the recorded run at
`wu-impl/app/playwright-report/data/f242783e….md`:

```
Error: missing bounding box for: <a class="tab" href="/today" data-discover="true">…
```

Note `i=0` and `n0=13`: **the sweep enumerated 13 elements, and the manual-door summary
screen has 18.** That is the whole story.

---

## 2. The mechanism

### Causal chain

**Link 1 — the describe's readiness gate cannot tell the two screens apart.**

`app/e2e/design.spec.ts:4356-4361` (the manual-door `beforeEach`):

```ts
await page.locator(".workout-row").filter({ hasText: title }).click();
await expect(page.locator("h1.workout-detail-title")).toHaveText(title);
await page.getByRole("link", { name: "Log it after" }).click();
await expect(page).toHaveURL(/\/library\/[^/]+\/log$/);
await expect(page.getByRole("heading", { name: title })).toBeVisible();   // ← ambiguous
```

The screen it is leaving renders `<h1 className="workout-detail-title">{workout.title}</h1>`
(`app/src/workout/WorkoutDetail.tsx:394`). The screen it is waiting for renders
`<h1 className="screen-title summary-title">{title}</h1>`
(`app/src/session/PostWorkoutSummary.tsx:254`). **Both are `heading` role with the same
accessible name.** `getByRole("heading", { name: title })` is satisfied by the OUTGOING
screen, and `toHaveURL` is satisfied by React Router's history push, which lands before
React commits the new route. So the gate can pass with the workout-detail DOM still on
screen.

_Evidence:_ instrumented measurement of the interactive-element count at the instant the
gate passes, versus after the route settles (30 navigations × 4 workers):

| build | gate passes early | counts seen at gate |
| --- | --- | --- |
| `f3db330` (branch), epoch A | **88 / 120** | 13 (detail screen) or 5 (LOADING…), settling to 18 |
| `575c551` (base), epoch A | **68 / 120** | same shape |
| `f3db330`, epoch B | **114 / 120** | same shape |
| `f3db330` + proposed gate fix, epoch B | **0 / 120** | 18 every time |

The three counts are the three DOM states: **13** = workout detail, **5** = the log
route's `LOADING…` render (`ManualDoorLog`'s `workoutsState === "loading"` gate,
`LogSession.tsx:1022`; only the five tab links are interactive), **18** = the settled
summary.

**Link 2 — `assertTapTargets` re-queries by index, so every round trip can land on a
different element.**

`design.spec.ts:468-500`. `page.locator(sel).all()` does **not** return element handles;
Playwright returns one `locator.nth(i)` per match. Each of the three awaits per element
(`isVisible()`, `evaluate(className)`, `boundingBox()`) re-runs the selector and takes the
nth hit. With the set collapsing 13 → 5 → 18 during the sweep, index `i` denotes three
different nodes across those three calls.

**Link 3 — a node removed between resolution and measurement returns `null`, not a throw.**

`playwright-core@1.62.1/lib/coreBundle.js:37852`:

```js
async _getBoundingBox(handle) {
  const result2 = await this._client._sendMayFail("DOM.getBoxModel", { objectId: handle._objectId });
  if (!result2) return null;
```

`_sendMayFail` swallows every CDP error — including `Could not find node with given id`
for a node React has just unmounted — and the caller returns **null**. Proven
deterministically in the probe:

```
DETERMINISTIC boxBefore={"x":252.2,"y":20.3,"width":57.0,"height":44}
DETERMINISTIC boxAfter=null          // same handle, after node.remove()
```

**Link 4 — the failure message names the wrong element.**

`design.spec.ts:494-496` reads the box first and the label second:

```ts
const box = await el.boundingBox();
const label = await el.evaluate((node) => node.outerHTML.slice(0, 120));
expect(box, `missing bounding box for: ${label}`).not.toBeNull();
```

By the time `label` is read, the DOM has moved on to the `LOADING…` state, where the only
matches are the five tab links — so `nth(0)` is the `/today` tab link, and that is what
gets printed. **The `/today` tab link was never the element that failed to measure.** This
is also why the failure's own page snapshot (recorded in `wu-impl`'s report) shows a
perfectly healthy, fully-rendered page with all five tabs present: by snapshot time
everything had settled.

### The chain in one sentence

The sweep starts while the workout-detail screen is still mounted (the gate cannot tell it
from the summary screen), enumerates its 13 elements, and mid-sweep React unmounts that
subtree — so an index resolved a moment earlier points at a node that no longer exists
when `DOM.getBoxModel` runs, which Playwright reports as `null`, and the label read
afterwards misattributes it to the `/today` tab link.

---

## 3. Hypotheses

| # | Hypothesis | Verdict | Killed by |
| --- | --- | --- | --- |
| H1 | Extra row changes page height/scroll; the tab link is mid-transition or occluded | **ELIMINATED** | The branch changes nothing on this page — the manual-door fixture is `w 1:00 6k-2`, one step, untouched by the diff (`git diff 575c551 f3db330 -- app/e2e/design.spec.ts` has no hunk in that describe). Settled count is 18 on both builds. `boundingBox` is scroll-independent, and the failure index is `i=0`, not a tail index. |
| H2 | The 3-step save POST re-renders the page mid-sweep | **ELIMINATED** | No save happens in this test; the `beforeEach` never submits. `PostWorkoutSummary.tsx` contains zero `useEffect`/`useState`/observers — grep is empty. A settled page mutates twice in a 150-pass hammer loop. The only in-flight work is the mount fetches, which is Link 1, not a save. |
| H3 | `.all()` snapshots locators and measures stale handles | **HALF RIGHT, RESTATED** | `.all()` returns `nth(i)` locators that **re-query** on every call — worse than stale handles, because index `i` can denote a different element on each of the three round trips. This is the amplifier (Link 2), not the trigger. |
| H4 | Latent race, merely exposed by a timing shift | **CONFIRMED** | Base `575c551` shows the early-gate condition **68/120 (57%)**. The race is fully present at base. The branch measured 88/120 (73%) in the same epoch — but the metric then moved to 114/120 (95%) on unchanged branch code in a later epoch, and a deliberate base-ward change (restoring the `usePreferences()` fetch the branch deleted from `WorkoutDetail.tsx`) moved it to 113/120, i.e. the wrong way. Environment dominates the branch contribution. |

### Other producers of `boundingBox() === null`, enumerated and ruled out

- `display: none` on the element or an ancestor — would make `isVisible()` false first, so
  the `continue` skips it. The one CSS rule that hides `.tabbar`
  (`index.css:5615`, `.app-shell:has(.connected-surface) .tabbar`) cannot match on
  `/library/:id/log`; no connected surface is mounted.
- Zero-size element — yields a box with 0 width/height, which trips the `>= 44`
  assertions, not the null one.
- Element genuinely absent at index `i` — `boundingBox()` waits for *attached* and would
  throw a `TimeoutError`, not return null.
- Navigation destroying the execution context — would throw
  `Execution context was destroyed`, not return null.
- `visibility: hidden` — still produces a box model; also caught by `isVisible()`.

The only remaining producer that returns exactly `null` is a node that resolved and then
stopped existing, which is Link 3 and is proven directly above.

---

## 4. Why the base/branch statistic does not hold up

`progress.md` records base 5/5 green vs branch 3-in-6 and concludes "branch-introduced,
~97% confidence". Three findings undercut that:

1. **I could not reproduce the branch rate at all**: 0 failures in 4 full-suite runs and
   0 in 100 scoped repeats on `f3db330`.
2. **Base has the race**: 68/120 gate passes at `575c551` happen before the route commits.
   Base is not safe; it won five coin flips.
3. **The metric is dominated by the environment**: the same unchanged branch build
   measured 73% and then 95% a few hours apart, and load moved the *opposite* way from
   naive expectation (system load fell from ~20 to ~6 and the early-gate rate went **up**,
   because a faster machine reaches the gate assertion sooner relative to React's commit).
   Base and branch were measured at different times of day, with a second session running
   its own e2e suite on the same laptop throughout.

**Practical consequence:** the flake should be fixed in this branch, but "Phase WU
introduced a defect" is not supported. It is a pre-existing test bug that Phase WU makes
easier to hit — most plausibly just by reshuffling the parallel schedule (401 → 399 tests)
and shortening `WorkoutDetail`'s mount work by one fetch, both of which move the click
earlier. **I did not establish which branch change is the timing lever**; the one candidate
I tested by direct manipulation (restoring `usePreferences()`) did not behave as the lever.

---

## 5. Proposed fix

Two parts. Part A is the root cause and is a one-line change per site; part B removes the
whole failure class and is what stops this recurring.

### Part A — make the readiness gate name the screen it is waiting for (required)

Replace the ambiguous heading wait with a locator only `PostWorkoutSummary` renders:

```ts
-await expect(page.getByRole("heading", { name: title })).toBeVisible();
+await expect(page.locator("h1.summary-title")).toHaveText(title);
```

Waiting for `h1.summary-title` also implies both mount fetches have resolved (the
`LOADING…` render has no `h1` at all), so it lands the sweep on the settled 18-element DOM.

**Measured effect: 114/120 early → 0/120 early, back to back on the same stack.**

Sites (`app/e2e/design.spec.ts`): lines **4360** (manual door), **4602** (manual door, plan
active), **4697** (manual door, onboarding title), and by inspection **4093** (session
door) and **4526** (monitor door), which share the pattern. Three of the five come from a
workout-detail screen whose own `<h1>` carries the same name, so those three are certainly
affected; fixing all five costs nothing and removes the ambiguity everywhere.

**Blast radius:** test-only, five lines, one file. `h1.summary-title` is asserted
elsewhere in the design suite already, so it is not a new coupling.

### Part B — make `assertTapTargets` atomic (recommended, same PR)

The sweep currently costs three CDP round trips per element and re-queries the selector on
each one. Collapse it into a single in-page pass so no DOM change can interleave:

```ts
async function assertTapTargets(page: Page): Promise<void> {
  const offenders = await page.$$eval(
    "a, button, [role=button], input, select",
    (nodes) =>
      nodes
        .filter((n) => {
          const el = n as HTMLElement;
          // Playwright's own isVisible(): non-empty box AND visibility !== hidden.
          if (el.getClientRects().length === 0) return false;
          if (getComputedStyle(el).visibility === "hidden") return false;
          const c = el.className;
          return !(
            typeof c === "string" &&
            (c.includes("step-card-line1") || c.includes("step-card-sub"))
          );
        })
        .map((n) => {
          const r = (n as HTMLElement).getBoundingClientRect();
          return { w: r.width, h: r.height, outer: n.outerHTML.slice(0, 120) };
        })
        .filter((m) => m.w < 44 || m.h < 44),
  );
  expect(offenders, `tap targets under 44x44: ${JSON.stringify(offenders)}`).toEqual([]);
}
```

**Blast radius:** ten call sites, all in `design.spec.ts`, all in this repo's own design
sweep. Nothing in `app/src/`. It is also ~19× fewer round trips per sweep.

**Two things a reviewer must check, because this is exactly the "asserting a thing exists
instead of that it works" trap:**

1. **Prove the probe still bites.** Shrink one real button below 44px (e.g. force
   `min-height: 20px` on `.summary-discard`) and confirm the rewritten sweep goes red, and
   that its message names that button. A green rewrite proves nothing on its own.
2. **`getBoundingClientRect()` vs `DOM.getBoxModel`'s border quad** agree for every
   untransformed block/flex element, which is all of these — but a wrapped inline `<a>` or
   a transformed control would differ. Re-run the whole `design.spec.ts` file after the
   change and confirm the same set of tests passes, not just the manual-door ones.

If part B is judged too big for this branch, part A alone fixes the observed failure; part
B should then be queued in ROADMAP rather than left in a PR body (recurring failure 14).

---

## 6. Test layer or product defect?

**Test layer, unambiguously.** The transient the sweep trips over is React Router
committing a route change plus `ManualDoorLog`'s deliberate `LOADING…` gate — normal,
correct behaviour with no user-visible misbehaviour. There is nothing in that window a
rower can tap that does the wrong thing: the outgoing screen's controls are gone before
they can be pressed, and the incoming screen shows `LOADING…` with only the tab bar live.
No product change is warranted, and none is proposed.

One product-adjacent observation, **pre-existing and not the cause**, worth a ROADMAP line
rather than a fix here: `useWorkouts()` has no cache
(`app/src/api/useWorkouts.ts:21-45`, a fresh `GET /api/workouts` per mount), so tapping
"Log it after" re-downloads the whole ~300-workout library and shows a `LOADING…` flash on
a screen that already knew which workout it was for. Measured at 100–1500 ms in the probe
traces. That is a real (minor) UX cost on a slow connection.

---

## 7. What I could not establish

- **Which specific Phase WU change is the timing lever.** The branch measured worse than
  base in the same epoch (73% vs 57%, χ² p ≈ 0.007), but the metric moved 57% → 95% on
  unchanged code across epochs, so that 16-point gap is inside the environmental noise
  band. Restoring the `usePreferences()` fetch that the branch deleted from
  `WorkoutDetail.tsx` — the one candidate lever I could test by direct manipulation — made
  it *worse*, not better. The suite shrinking 401 → 399 (two deleted warm-up tests) also
  reshuffles the parallel schedule, which I did not isolate.
- **The observed full-suite failure rate at `f3db330` on this machine.** 0/4. I never saw
  a natural full-suite failure; every failure I analysed came from the probe or from the
  artifact `wu-impl` had already recorded. My rate estimate for the natural failure is
  therefore "somewhere under 25% here", not a number.
- **A natural `NULLBOX` with node-identity instrumentation.** The three natural captures
  (§1c) were taken with the light instrument; adding a `setAttribute` tag before the
  measurement shifted timing enough that 192 further passes produced zero nulls
  (a Heisenberg effect, and itself consistent with a window on the order of one CDP round
  trip). Link 3 is proven deterministically instead.
- **Whether the two sibling manual-door describes and the session/monitor doors have ever
  failed this way.** They share the ambiguous gate and would be vulnerable to the same
  race; I found no recorded failure for them.

---

## Appendix — commands and artifacts

```
# scoped repeat (the double-dash form pnpm eats; use pnpm exec instead)
pnpm exec playwright test --project=chromium \
  --grep "post-workout summary \(manual door\)" --repeat-each=10 --reporter=list
# → 100 passed

# full suite
pnpm exec playwright test --project=chromium --trace=retain-on-failure --reporter=line
# → 399 passed, ×4
```

- Recorded real failure analysed: `wu-impl/app/playwright-report/data/f242783e0467d5bce1108c7e4e4fabc5e2a233be.md`
- Playwright null-on-CDP-failure: `playwright-core@1.62.1/lib/coreBundle.js:37852`
- Probe (`app/e2e/_flakeprobe.spec.ts`) was created, run, and deleted; `wu-flakehunt` is
  clean at `f3db330`, nothing committed, its compose stack (`ergomatic-50864`) torn down.
