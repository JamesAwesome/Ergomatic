# Straight to the numbers, if that is how you row

**Phase RN.** Status: HARDENED (lens 1 folded), awaiting lens 2 and Gate 0.

TRIAD (a stored shape), so this spec takes a full antagonist pass and the PR
takes a PM final gate. It changes user-visible copy and layout on
`/you/settings`, so Gate 0 — the rendered screen, and the two skipped paths
captured against what they replace — is approved before task 1.

## What and why

When the monitor is programmed and waiting, the app shows one more screen
before the numbers: `Ready when you pull`, a keep-your-screen-on line, and a
**Show me the numbers** button. It exists because the seconds before the
first pull are the last moment a warning can still change the outcome, and
because a rower who has just tapped Connect wants to know the erg took the
program.

A rower who has done that fifty times does not want the screen. James asked
for it to become a choice: an option on `/you/settings` that, when turned
off, makes the app behave as though the button had been pressed the instant
the monitor was ready. Default is today's behaviour, so a rower who never
opens Settings sees no change anywhere.

That is the whole feature. It stores one word, it changes the initial value
of two `useState` flags, and it touches nothing on the wire.

## What the rower gets

- A new section on `/you/settings`, below the two colour groups, with one
  two-option control. Its heading, its labels and its default-side wording
  are **Gate 0's to approve** — candidates are in "The screen" below.
- With the card turned off: tapping Connect on a workout runs the same
  looking/pairing/programming screens it does today, and then goes straight
  to the three panes instead of stopping at `Ready when you pull`.
- With the card turned off in Just Row: the same, at the moment the free row
  is armed.
- With the card left on (the default): nothing changes at all.

## What it deliberately does not change

- **Nothing on the wire.** By the time either card renders, the program has
  been sent and acked and the erg is armed — the card's lead button only
  flips local component state (`ConnectedInterstitial.tsx`'s and
  `JustRow.tsx`'s ready-card `onClick`, both `setState(true)` and nothing
  else). Skipping it cannot change what the monitor was told or when. I-5
  gates this rather than asserting it.
- **No earlier screen.** The looking / pairing / programming checklists, Just
  Row's `Starting your row` sending card, the failure screen and the
  interstitial's disconnected treatment all render exactly as they do now.
  The setting reaches one branch in each file — **with one exception, which
  is a decision rather than a footnote and is put to Gate 0 below.**
- **No behaviour after the first pull.** Once the rower is on the surface,
  every screen, control and number is the same one they see today.

## The two consumers, enumerated

Recurring failure 34: a spec that states an invariant and applies it to one
of the places it governs is worse than one that never stated it. There are
exactly two, and the count is derived by **two independent routes** rather
than by one grep (RF16's fourth corollary — a scope claim gets re-derived
from a second property of our own code, and both routes must agree).

Route 1, the button's own copy:

```sh
grep -rn "Show me the numbers" app/src --include='*.tsx' --include='*.ts' | grep -v '\.test\.'
```

Route 2, the state that gates it, plus every component that renders the
interstitial's own class:

```sh
grep -rn "numbersRequested\|showNumbers" app/src --include='*.tsx' --include='*.ts' | grep -v '\.test\.'
grep -rln "connected-interstitial" app/src --include='*.tsx' | grep -v '\.test\.'
```

Both run against this branch's base (`e70ce792`). They agree on two
consumers:

| File                                | Today                                                                                | With the card off                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `workout/ConnectedInterstitial.tsx` | `const [numbersRequested] = useState(false)`, gating `phase === "ready" && !numbersRequested` | initial value is `true`, so the `ready` branch is skipped and the phase gate renders |
| `justrow/JustRow.tsx`               | `const [showNumbers] = useState(false)`, gating `showNumbers && axes.program === "armed"`     | initial value is `true`, so the armed card is skipped and the surface renders        |

**Route 2 finds a third file and it is NOT a consumer — recorded so a
reviewer does not have to re-find it.** `monitor/JustRowObserver.tsx` renders
`className="screen connected-interstitial"` and reuses that screen's body,
action-stack and copy conventions, but it is the walk instrument: it holds no
hand-off flag, offers no ready card, and has no path to the surface. It
inherits none of this change, and it is the reason "grep the button string"
alone was not enough to trust the count.

Both consumers are a plain boolean with one setter and one reader. Neither is
passed down, persisted, or read by anything else. The change to each is one
line; the risk lives entirely in the store and the seam, which is where the
gates are.

**No line numbers in this table, on purpose.** They differed between the main
checkout and this branch's base while the spec was being written, which is
exactly how a cited number rots. The commands above re-derive them.

**James ruled the scope covers both (2026-09-09).** One setting, both cards.
A per-flow distinction would be a second setting nobody asked for.

## The exception: a link lost BEFORE the first pull

Found by the anchor antagonist pass, verified here independently against
`connectedAxes.ts` and `JustRow.tsx`. This is not a footnote — it deletes an
affordance from the one state where that affordance is the whole point.

`deriveProgram("ready")` is `"armed"`, and `deriveLink` at `ready` returns
`frameSilence ? "lost" : "up"`. So `armed ∧ lost` is a reachable pair. Just
Row's render ladder tests the surface arm — `axes.session !== "none" ||
(showNumbers && axes.program === "armed")` — **above** its link-lost branch,
so with the flag seeded true:

| | Today (card shown, untapped) | Under `skip` |
| --- | --- | --- |
| Link goes silent before the first pull | the pre-row lost screen: **Try again** and Cancel | the connected surface's LOST banner, whose only control is a two-tap End |

**The screen being bypassed states its own precondition**, and the change
breaks it: _"A link lost BEFORE any run opened (a run in flight renders the
surface above, which owns the mid-row lost treatment). The monitor does not
advertise while a Just Row is open, so Try again is honest here only because
no row was under way."_ Skipping routes the pre-row case into the mid-row
treatment. That is RF18's tripwire class — a comment naming the condition
that holds it up, and a change that changes exactly that condition.

**And the producer is the same event as the accepted loss.** In-stream frame
gaps do not reach the 2500 ms watchdog (`liveness.ts`'s own comment: worst
measured in-stream gap 810.3 ms across 3,442 gaps, zero over 2500 ms). The
documented producer is a background/resume gap, which latches `frameSilence`
identically and is exactly what RF19's 2026-08-26 walk recorded over a link
that never dropped. In plain terms: **the phone sleeping during the pre-pull
wait** — the event `KEEP YOUR PHONE SCREEN ON` exists to prevent, on the
screen `skip` removes. The two accepted losses and this one are one event,
not three.

The programmed interstitial diverges in the OTHER direction: its ready branch
carries no link check at all, so today a frame-silent ready card says "Ready
when you pull" with no warning, and under `skip` the rower gets the surface's
LOST banner instead. Arguably an improvement; stated because it is a change.

**Reachability, split honestly.** PROVEN: the state is reachable in the axes,
and the watchdog has no phase guard. NOT PROVEN: that it has ever latched at
`ready` on hardware — no committed capture pins it there, and native's own
inter-frame gap distribution is unmeasured (that constant's own comment says
so). So this is a real mechanism at an unmeasured frequency, which is a
reason to decide it deliberately rather than to wave it through.

### Gate 0 decides this, with the costs measured rather than argued

| | What it does | Cost, measured |
| --- | --- | --- |
| **A — accept** | `skip` lands a pre-row link loss on the surface. | Zero code. The rower loses **Try again** in the one state where nothing was under way, and reconnecting means End, then Connect again. Note this is already what a rower who TAPPED the button gets today, so it is not a new screen, only a new way to reach it without choosing. |
| **B — guard the seeded arm only** | The skip arm additionally requires `link !== "lost"`; a tapped `showNumbers` behaves as today. | Needs a second piece of state to tell seeded from tapped — the ladder currently cannot distinguish them. More mechanism than the feature has anywhere else. |
| **C — guard both arms (recommended)** | The `showNumbers` arm requires `link !== "lost"`, for tap and skip alike. `axes.session !== "none"` is untouched, so a mid-row loss still reaches the surface's own treatment. | One clause. It also CHANGES today's tapped behaviour, which is why it is James's call and not mine. The argument for it: `session === "none"` is precisely the test the bypassed screen's comment names ("Try again is honest here only because no row was under way"), so C makes the ladder say what that comment already claims. |

I recommend **C** and I am not neutral about it: A leaves a rower stranded on
an End button in the exact state a reconnect would have worked, and the state
is produced by the phone sleeping — the thing this feature makes more likely
by removing the warning.

## The other exit: End does not go where Cancel went

Also from the anchor pass, and it sharpens what was accepted. The Cancel/End
trade is not only a different confirmation, it is a different **destination**.
The wire half is fine — `endSession` calls `driver.terminate()` unconditionally
when a driver exists, so the erg is put back either way. What differs is where
the rower lands:

| | Card shown | Under `skip` |
| --- | --- | --- |
| Programmed workout | Cancel → back to the workout's detail screen | End → the workout's **log door**, for a workout that was never rowed |
| Just Row | Cancel → back to the Just Row door | End → **`/justrow/log`**, likewise |

`closeRecord` at `ready` with no run open logs `close-no-record` and returns,
so both doors open on an empty record. Gate 0 carries these two as rendered
items; they are not a copy question but they are a "what does the rower see"
question, which is the same gate.

## What is lost with the card, and why James accepted it

The ready card carries two things that exist nowhere else in that moment:

1. **`KEEP YOUR PHONE SCREEN ON`.** Phase LM's Gate 0 called it "the only
   preventive element in the phase" — five quiet words, every session,
   because the rower who forgets is exactly the rower it exists for
   (`ConnectedInterstitial.tsx`, the comment above the line). A rower who
   turns the card off stops seeing it.
2. **Cancel.** From the card, Cancel runs `useMonitorSession`'s `ready`-phase
   terminate, which puts the erg back (DEVIATIONS row 63). From the surface,
   the equivalent is the header's **End session**, which is a different act
   with a different confirmation.

**Ruled: accept the loss (James, 2026-09-09.)** The reasoning, recorded so it
is not re-opened: the default is on, so nobody loses either affordance by
accident; a rower who turns the card off has said, in as many words, that
they do not want the screen the warning lives on; and the surface has its own
exit. Moving the keep-on line onto the pre-pull surface was offered and
declined — it would add copy to a screen whose layout is separately gated, to
serve a rower who just asked for less.

The consequence is written into the ROADMAP rather than left implicit, next
to the phone-sleep instrumentation that already lives there.

## The stored shape

One key, one word. Modelled on `you/judgeColors.ts`, which is the app's only
other real preference and settled every one of these questions eight days
ago.

```ts
export const READY_CARD_KEY = "ergomatic.readyCard";

/** SHOW is today's behaviour: the ready card renders and waits for the tap.
 *  SKIP hands over to the numbers the moment the monitor is ready. */
export type ReadyCardChoice = "show" | "skip";

export const READY_CARD_DEFAULT: ReadyCardChoice = "show";
```

**A two-member union, not a boolean, and that is not decoration.** The
feature is a triple negative in boolean form — the setting is "off", which
means "skip", which means the flag `numbersRequested` starts `true`. Every
place a boolean would appear (the parse, the screen's `value`, the
initializer, four test titles) is a place to invert it once too often. The
union carries the word the rower chose all the way to the call site:
`loadReadyCard() === "skip"`. It also makes the parse total in the shape
`judgeColors.ts` uses — anything that is not one of the two members resolves
to the default. **Not "for free":** `isReadyCardChoice` is hand-written
exactly as `isJudgeColor` is, and a boolean stored as a word would need the
same guard. The union's real justification is the triple negative, which
stands on its own.

**The parse is total and the catch is bare.**
`docs/superpowers/research/2026-09-03-localstorage-getter-wkwebview.md`,
quoted in `judgeColors.ts`: "Write them as bare `catch`, never
`catch (e) { if (e.name === "SecurityError") }` — the `nullptr` paths above
make detached-document access a `TypeError` that a name-filtered catch would
let escape." Unlike `judgeColors.ts` this module is **not** read at
`main.tsx` module scope — both reads happen inside a component — so an
escaping throw would cost one screen rather than the whole app. The
discipline is the same anyway; the reduced blast radius is stated so nobody
adds a boot read later thinking the two modules are interchangeable.

**No JSON envelope.** `judgeColors.ts` stores an object because it has four
independent slots and wants a corrupt fourth not to cost the other three.
This stores one value, so it stores the bare word and skips `JSON.parse`
entirely. A future second preference gets its own key, not a slot in this
one; the day there are six, the container question the ROADMAP already
carries is where that is re-litigated.

### Persistence is the mechanism here, unlike the colours

On the colour screen, a refused write costs the rower persistence and nothing
else — the four custom properties are already on the root, so the choice is
live for the session (`judgeColors.ts`, I-6). **This setting has no
equivalent live half**: its only consumer reads storage at the next connect,
so a refused write would mean the control moved and the setting did nothing.
The rower would find out at the erg.

So the module keeps a **module-scoped last-set value** and `loadReadyCard`
prefers it over storage. The whole module, paste-tested (see below):

```ts
let lastSet: ReadyCardChoice | null = null;

function isReadyCardChoice(value: unknown): value is ReadyCardChoice {
  return value === "show" || value === "skip";
}

export function loadReadyCard(): ReadyCardChoice {
  // STORAGE FIRST, `lastSet` ONLY AS THE FALLBACK. The precedence is the
  // whole point and it is not interchangeable — see below.
  try {
    const raw = localStorage.getItem(READY_CARD_KEY);
    if (isReadyCardChoice(raw)) return raw;
  } catch {
    /* fall through to the in-memory value, then the default */
  }
  return lastSet ?? READY_CARD_DEFAULT;
}

export function saveReadyCard(next: ReadyCardChoice): boolean {
  lastSet = next;
  try {
    localStorage.setItem(READY_CARD_KEY, next);
    return true;
  } catch {
    return false;
  }
}
```

**THE PRECEDENCE IS LOAD-BEARING, AND THE OBVIOUS ORDER DISARMS BOTH GATES.**
The first draft read `lastSet` first. The anchor antagonist pass ran that
module under Node with `setItem` replaced by a no-op and got:

```
saveReadyCard('skip') returned: true
raw storage now: (nothing written)
loadReadyCard() says: skip
```

and, with storage holding the opposite value, `loadReadyCard()` still said
`skip` — after a `localStorage.clear()` too. Three consequences, all fatal to
the gates this spec calls load-bearing:

1. **The I-3 client seam test could not fail on a broken store.** Settings →
   click → unmount → mount the consumer all happens in one JS realm, so
   `lastSet` carried the value and storage was never read. Delete the
   `setItem` call outright and the test stays green — RF35's exact shape: the
   named mutation bites, the mutation that matters does not.
2. **The e2e leg could not either, and this spec's own prescription
   guaranteed it.** Navigating by CLICK is same-document by construction, so
   the module instance and its `lastSet` survive the navigation. The leg
   would have proven that the module remembers, never that the store does.
   **This is RF38 inverted:** Phase JC's problem was that a reload made both
   legs pass; here a click makes both legs blind. So the e2e gate takes TWO
   legs — a click leg and a `reload()` leg — and the reload one is the gate.
3. **Cross-test poisoning.** Module state outlives an `it()` block, and a
   `beforeEach` calling `localStorage.clear()` does nothing against it.

With storage first, a successful write is proven by the store, `lastSet`
covers exactly the refused-write case it was invented for, and both gates
bite. **`saveReadyCard`'s `true` is a claim about not throwing, not a receipt
for durability** — the module header says so, because RF25's tell is a
boolean that reads as one.

`isReadyCardChoice` takes the raw `string | null` straight from
`getItem`, so absent (`null`), empty (`""`) and unknown (`"SKIP"`,
`"true"`) are one code path and all three land on the default — the
absent/empty/valued read the harden skill's second lens owes every input.
`lastSet` is assigned **before** the write is attempted, which is what makes
I-6 true: a refused write still governs the next connect.

**Paste-tested at its real path** (harden skill, phase 0 item 4): both blocks
written to `app/src/you/readyCard.ts` on this branch and run through
`pnpm typecheck` (clean, `E2E TypeScript membership: 21/21`) and
`pnpm exec eslint --max-warnings 0 --no-warn-ignored src/you/readyCard.ts`
(exit 0), then removed — the file lands for real in task 1, tests first.

That makes the failure mode identical to the colour screen's — it works this
session, it is gone after a reload — so one notice wording is honest for both
controls, and the screen's promise does not change halfway down. It is four
lines. **The alternative, considered and rejected:** no fallback, and a
notice that says the choice did not take effect at all. Honest, but it means
the same screen makes two different promises about the same failure, and the
one it makes here is the worse one.

Multi-tab staleness is the cost, and it is not reachable: the app is one
WKWebView, and the only writer is a screen you must navigate away from before
either consumer mounts.

### Lifetime table (recurring failure 27)

| State                        | Mint site                                       | Cleared by                        | Survives teardown | Survives relaunch                       |
| ---------------------------- | ----------------------------------------------- | --------------------------------- | ----------------- | --------------------------------------- |
| `ergomatic.readyCard` (storage) | the settings screen's `saveReadyCard`            | nothing — no Reset, no sign-out    | yes               | yes, except storage eviction / low disk |
| `lastSet` (module scope)     | `saveReadyCard`, on every call incl. a failed one | process exit only                  | yes               | no                                      |
| `numbersRequested` (`ConnectedInterstitial`) | the component's `useState` initializer, once per mount | unmount                    | no                | no                                      |
| `showNumbers` (`JustRow`)    | the component's `useState` initializer, once per mount | unmount                     | no                | no                                      |
| `readyCard` (`SettingsScreen`) | the screen's own `useState` initializer, once per mount | unmount                   | no                | no                                      |

**Read once per mount is the correct lifetime, and here is why it cannot go
stale.** The only writer is `/you/settings`, a screen the rower must leave to
reach either consumer, and leaving unmounts them. There is no path on which a
mounted interstitial outlives a change to the value. This is deliberately
NOT recurring failure 24's mount-time snapshot bug: that one had a producer
writing while the reader stayed mounted; this one has no such producer, and
I-3's gate is what proves the claim rather than this paragraph.

**Not account-scoped, and no clear path**, exactly as `judgeColors.ts` — same
argument, same consequence: a second rower on the same phone inherits the
first rower's choice, and the device account switcher is where that is
re-litigated for both.

## The screen

A third `<section>` on `/you/settings`, below `COLORS · SPM`, using the same
`OptionGroup` the colour slots use — recurring failure 8: reuse the house
radiogroup and its keyboard tests rather than hand-rolling a fourth. Two
options, no swatch, no preview specimen (there is nothing to preview: the
thing being toggled is a whole screen, and it is not this one).

**Copy is Gate 0's, not this spec's.** Candidates, to be presented rendered:

| Part          | Candidate A                                | Candidate B                     |
| ------------- | ------------------------------------------ | ------------------------------- |
| Heading       | `READY SCREEN`                             | `BEFORE THE NUMBERS`            |
| Slot name     | `SHOW ME THE NUMBERS` + hint                | (no slot row, heading only)     |
| Options       | `SHOW` / `SKIP`                            | `ON` / `OFF`                    |
| Hint          | `(the screen before the first pull)`        | `(tap to start, or go straight in)` |

Two constraints on whatever Gate 0 picks. The word **monitor**, never PM5 —
this copy is not disambiguating which machine (RF32). And no em-dashes in
anything a rower reads (house style).

**The existing `saveFailed` notice CANNOT be reused, and the first draft was
wrong to offer it.** It reads "These colors are on now, but they won't stick.
This device wouldn't let the app save them, so a reload brings the old ones
back." — a sentence about colours, whose central promise is about a control
the rower did not touch. Worse, one boolean shared between two writers means
a successful ready-card tap CLEARS a genuine colour-save failure, and the
reverse. So: **two notices, each owned by its own control**, and the ready
card's says what is true of it — the choice is live for this session and a
reload brings the old one back. Wording goes to Gate 0 with the rest of the
copy.

### CSS: add selectors, never move rules

`.judge-group`, `.judge-slot`, `.judge-slot-title`, `.judge-slot-hint`,
`.judge-options` and `.judge-option` are already generic — nothing in them
mentions colour except `.judge-swatch` and `.judge-preview-*`, which this
section does not use. The new markup uses `.setting-*` names, added to those
rules' **selector lists in place**:

```css
.judge-group,
.setting-group { … }
```

**Rules are extended where they sit; nothing moves.** Recurring failure 37 is
this repo's most recent production bug — moving verdict classes ~5000 lines
up `index.css` put them above an equal-specificity rule and turned every
judged summary row plain ink, and no client test could see it because Vitest
imports `.css` as `""` and jsdom resolves no `var()`. Appending a selector to
a rule at its existing position changes no cascade order for any existing
selector. Any reviewer proposing to rename or relocate these rules instead
is proposing the JC bug.

## Invariants

- **I-1 — the default is today, exactly.** With nothing in storage, both
  entry points render the ready card and wait for the tap, on every path that
  reaches `ready`/`armed`.
- **I-2 — the read is total and never throws.** Absent key, denied storage, a
  thrown getter, an unknown word, a number, an object, an empty string: all
  resolve to `show`, and none propagate.
- **I-3 — the choice the rower made is the choice the next connect obeys.**
  A `skip` written by the settings screen is what the interstitial and Just
  Row read on their next mount, through real storage, with nothing
  hand-written in between.
- **I-4 — `skip` removes the ready card, and changes exactly one other
  screen, deliberately.** Every screen either entry point can render at
  looking, pairing, programming, Just Row's sending card, failed, genuine
  `disconnected`, and the whole in-session surface is what it renders today
  at the same phase. **The single exception is the pre-pull link-lost state**,
  whose disposition Gate 0 chooses from the A/B/C table above; whichever it
  picks, the invariant is restated to say so and the gate below tests that
  state explicitly. _This invariant read "and nothing else" in the first
  draft, which was false — the honest version is what makes the exception
  a decision instead of a surprise._
- **I-5 — `skip` changes nothing on the wire.** The sequence of transport
  writes across a connect is identical under both settings.
- **I-6 — a refused write costs the reload, not the session** (RF25: the
  caller branches on the boolean). The screen shows the new choice, the next
  connect obeys it, and the rower is told it will not survive a reload.
- **I-7 — the colour controls are untouched.** The existing four slots, their
  preview specimens and their painted colours behave exactly as before, in a
  real browser.

## How each invariant is gated

Every assertion below gets a mutation that makes it fail, and the PR body
states what was mutated and what the failure said (RF21). The mutations are
named here so the implementer runs *these*, not ones chosen after the fix
(RF35).

| Inv | Gate                                                                                                                                                | Mutation that must bite                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| I-1 | The **five** existing e2e specs that tap the button, plus the two components' own suites, unchanged — they all run at the default. The five are derived, not typed: `grep -rln "Show me the numbers" app/e2e/` returns `justrow`, `design`, `diagnostics`, `screenshots`, `connected`. _The first draft named three and missed `design` and `diagnostics`._ | flip `READY_CARD_DEFAULT` to `"skip"`; the existing suites go red without a line being added to them |
| I-2 | Unit tests over `loadReadyCard`, one per falsification, plus a `localStorage.getItem` stub that throws | narrow the bare `catch` to `catch (e) { if (e.name === "SecurityError") … }`; the throwing-getter case escapes |
| I-3 | **The seam test, upstream of the producer (RF24):** render `SettingsScreen`, click skip, unmount, mount `ConnectedInterstitial`, drive to `ready`. Nothing writes storage by hand. Plus **two** e2e legs: a click leg and a `reload()` leg | **the reviewer's own mutant, not one of mine (RF35): delete the `setItem` call from `saveReadyCard`.** With storage-first precedence the reload leg and the seam test both go red; under the first draft's precedence every one of them stayed green. Second mutation: revert the initializer to `useState(false)` |
| I-4 | Client tests at both entry points with `skip` stored, asserting each earlier phase screen still renders — **and one test per entry point at `phase: "ready"` with `frameSilence: true`**, asserting whichever screen Gate 0's A/B/C answer names | widen the initializer to force the flag regardless of phase; the pairing/programming assertions go red. For the lost case, flip `frameSilence` and assert the other screen — the pair is what pins the ladder order |
| I-5 | A test that records the transport's writes across a full connect under both settings and asserts the two logs are equal | add one extra write on the skip path; the equality fails |
| I-6 | Unit test: `saveReadyCard` returns `false` when `setItem` throws, and `loadReadyCard` still returns the chosen value afterwards. Client test: the ready card's **own** notice renders, and a colour-save failure and a ready-card failure do not clear each other | make `saveReadyCard` swallow and return `true`; the notice test goes red. Remove the `lastSet` fallback; the load-after-failure test goes red. Point both controls at one `saveFailed` boolean; the independence test goes red |
| I-7 | The existing `design.spec.ts` settings block and the `you-settings-colors` screenshot, recaptured | **its sweeps extend, its assertions do not** — `assertTapTargets` and `assertNoA11yViolations` run over the whole page and so already cover the new control (measured: all four tests in that block pass against the Gate 0 render), but its third test keys on the "Pace slower color" radiogroup and would not notice the new group's absence. The new group needs its own assertion; "for free" was over-stated |

**Two e2e legs, and the reload one is the gate.** A click navigation is
same-document, so the module instance and its `lastSet` survive it — proven
above. The click leg proves the choice survives a client-side navigation; the
**reload** leg is the only one that proves it survived the store. Per RF38,
each leg asserts the property of HOW it navigated — a same-document sentinel,
present in one and absent in the other — rather than describing it in a
comment. Both walk a workout to the point `walkToReady` would find the ready
line, assert the surface's own positive observable first, and only then assert
the ready line never appeared: a negative async assertion waits for positive
readiness.

**The Just Row leg carries a trap that already caught this spec's own capture
run.** `injectJustRowShotFake` starts sending frames 8 s after injection, and
the first frame makes `axes.session !== "none"`, which renders the surface no
matter what the skip flag says. Measured, with the production initializer
reverted to `useState(false)`: a Just Row probe waiting 20 s for the surface
**passed anyway**; bounded to 4 s it failed correctly, and the workout probe
failed either way. Any Just Row assertion about this feature is bounded below
`JR_STORY_START_MS` or driven by a motionless fake, or it is decoration.

## What this deliberately does not do

- **No per-account storage and no sync.** Device-local, same as the colours.
- **No third state.** "Skip, but show me the keep-on line somewhere else" was
  offered at brainstorm and declined.
- **No mid-session re-read.** See the lifetime table: there is no producer
  that could make one necessary, and adding one would be a mechanism serving
  no invariant.
- **No change to the ready card itself.** Its copy, its word count pin and
  its Cancel are untouched.

## The parked comfort settings, which this PR is the trigger for

The ROADMAP's "two single-rower comfort settings" row (countdown length 0-60
s, pace tolerance 0-3 s) was ruled at Phase JC's Gate 0 not to ride that PR,
and its trigger was retargeted to "the SECOND SETTINGS PR". **This is that
PR**, so the question is put rather than quietly skipped.

- **Pace tolerance: recommend NO.** It changes what a judged number MEANS,
  which is the triad's first clause, and it would put a second independent
  risk model into one review — the exact split CLAUDE.md's grouping rule
  names as its one standing exception.
- **Countdown length: recommend NO, but the cost is stated rather than
  invented** (RF30). It is genuinely cheap and genuinely unrelated: a second
  stored key, a second section, no shared code with this one beyond the
  `OptionGroup`. The reason to hold it is review shape, not difficulty — it
  would double the Gate 0 surface for a screen whose layout James has to
  approve as rendered. **Untested claim, flagged as such:** nobody has
  measured how the settings screen looks at four sections on a 375px
  viewport, and that is the only thing that would change this
  recommendation. If Gate 0 wants it, it rides.

James decides at Gate 0. Either answer updates the ROADMAP row in this PR.

## PR shape

One PR — no part of this carries triad weight that bundling would make
harder to gate, and the store, the screen and the two consumers are one
coherent chunk. Task order is failing-test-first throughout.

1. `you/readyCard.ts` and its unit tests (I-2, I-6's store half).
2. The settings section: markup, `.setting-*` selectors appended in place,
   screen tests, the notice (I-6's screen half, I-7).
3. `ConnectedInterstitial` initializer and its tests (I-1, I-4 half).
4. `JustRow` initializer and its tests (I-1, I-4 half).
5. The client seam test (I-3) and the wire-equality test (I-5).
6. The e2e leg (I-3), `pnpm e2e` on the named specs, and
   `pnpm screenshots` for `you-settings-colors`.
7. ROADMAP: the phase row, the accepted-consequence row for the lost keep-on
   line, and the comfort-settings row updated with Gate 0's answer. Release
   note copy is a separate PR, as always.

Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, per-file coverage on every
file touched (RF2 — the aggregate gate cannot see a new file's branches),
the named e2e specs locally and the full suite on CI, and `pnpm dist:grep`
via the `app` job.

## Hardening record

Run under the `harden` skill, 2026-09-09.

**Phase 0, two of four cleared.** (1) Unmeasured numbers: the consumer table
cited six `file:line` positions taken from the main checkout, and three of
them were already wrong against this branch's base — the numbers are gone and
the deriving commands are in their place. (3) Self-describing bookkeeping: the
consumer census now ships as its two commands rather than as a transcribed
count. (2) Line citations into this document: none, at any revision.
(4) Untested prescribed blocks: the store module is the spec's only
executable content and it has now been paste-tested at its real path, with
the commands and their output recorded beside it.

**Lens 1 (mechanism) — RUN, and it earned its dispatch.** Full pass (phase
open, TRIAD). One BLOCKING and three MAJOR, all folded above:

- **BLOCKING:** the store's `lastSet`-first precedence made both persistence
  gates structurally incapable of failing. Proven by running the module under
  Node with `setItem` sabotaged, not argued. Precedence inverted; the e2e gate
  now takes a reload leg.
- **MAJOR:** I-4 was false — `skip` re-routes a pre-pull link loss past Just
  Row's `Try again`. Now its own section with an A/B/C decision for Gate 0.
- **MAJOR:** End does not land where Cancel did. Gate 0 items 5.
- **MAJOR:** the colour screen's save-failure notice cannot be reused, and one
  shared boolean would let each control clear the other's warning.

**Vetted ground (later RN work inherits these, attacked and held):** mounting
the surface early issues nothing on the wire — established by a census of
every effect and timer in `ConnectedSurface` and its subtree, not by its
header comment; both entry points hand ONE `useMonitorSession` instance down
as a value, so no second driver or record exists; exactly two consumers, by
two routes that do not share a method; read-once-per-mount holds because
reaching the writer necessarily unmounts the reader; and the CSS
selector-append claim holds structurally, with a browser check still owed.

**Lens 2 (prescribed code) — runs after lens 1**, scoped to the store module
and to the gate table. The table is the half worth the dispatch: I-5's
"transport writes are equal" gate asserts a recording seam this spec has not
proven exists, which is the shape of a gate that cannot go red (RF21).

## Gate 0 — what James approves before task 1

Rendered, at real proportions, in both orientations, with every colour
pairing's contrast ratio computed and stated as a number:

1. `/you/settings` with the new section, against today's screen.
2. The programmed-workout path at `ready` with the card OFF — the screen the
   rower now lands on — beside the card it replaces.
3. The Just Row path at `armed` with the card OFF, likewise.
4. The pre-pull link-lost pair, at both entry points — the screen today and
   the screen under each of A / B / C — because that table's choice is about
   what a rower sees.
5. Where **End** lands under `skip`, at both entry points: the log door for a
   workout that was never rowed, and `/justrow/log`, each against the screen
   Cancel reaches today.
6. The copy table above, resolved: heading, slot name, hint, option words,
   and the ready card's own save-failure notice.
7. The comfort-settings question, answered.
