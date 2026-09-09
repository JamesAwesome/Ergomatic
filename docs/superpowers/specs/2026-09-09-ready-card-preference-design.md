# Straight to the numbers, if that is how you row

**Phase RN.** Status: DRAFT, awaiting the anchor antagonist pass and Gate 0.

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
  The setting reaches one branch in each file.
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
`loadReadyCard() === "skip"`. It also gives the parse the same totality
`judgeColors.ts` has for free — anything that is not one of the two members
resolves to the default.

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
  if (lastSet !== null) return lastSet;
  try {
    const raw = localStorage.getItem(READY_CARD_KEY);
    return isReadyCardChoice(raw) ? raw : READY_CARD_DEFAULT;
  } catch {
    return READY_CARD_DEFAULT;
  }
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

The `saveFailed` notice already on the screen is reused verbatim if it fits
both controls; if Gate 0 prefers wording specific to each, that is two
notices and the spec is amended.

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
- **I-4 — `skip` removes the ready card and nothing else.** Every other
  screen either entry point can render — looking, pairing, programming, Just
  Row's sending card, failed, disconnected, and the whole surface — is
  byte-identical to what it renders today at the same phase.
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
| I-1 | The existing `ConnectedInterstitial`, `JustRow`, `connected.spec.ts`, `justrow.spec.ts` and `screenshots.spec.ts` legs, unchanged — they all run at the default and every one of them taps the button | flip `READY_CARD_DEFAULT` to `"skip"`; the existing suites go red without a line being added to them |
| I-2 | Unit tests over `loadReadyCard`, one per falsification, plus a `localStorage.getItem` stub that throws                                                | narrow the bare `catch` to `catch (e) { if (e.name === "SecurityError") … }`; the throwing-getter case escapes |
| I-3 | **The seam test, and it starts upstream of the producer (RF24):** render `SettingsScreen`, click the skip option, unmount, then mount `ConnectedInterstitial` and drive it to `ready`. Nothing writes storage by hand. Plus an e2e leg doing the same through a real browser and the real store | delete the initializer's `loadReadyCard()` call (back to `useState(false)`); both go red. Also: replace the settings-screen click with a direct `localStorage.setItem` — the test must still pass, and if it does not, it is testing the wrong thing |
| I-4 | Client tests at both entry points with `skip` stored, asserting each earlier phase screen still renders                                              | widen the initializer to force `numbersRequested` regardless of phase; the pairing/programming assertions go red |
| I-5 | A test that records the transport's writes across a full connect under both settings and asserts the two logs are equal                              | add one extra write on the skip path; the equality fails |
| I-6 | Unit test: `saveReadyCard` returns `false` when `setItem` throws, and `loadReadyCard` still returns the chosen value afterwards. Client test: the notice renders and the control shows the new choice | make `saveReadyCard` swallow and return `true`; the notice test goes red. Remove the `lastSet` fallback; the load-after-failure test goes red |
| I-7 | The existing `design.spec.ts` settings block and the `you-settings-colors` screenshot, recaptured                                                    | none needed: the block already carries its own mutations. Its tap-target and a11y sweeps extend to the new control for free |

**The e2e leg is the load-bearing one**, for the reason Phase JC's was: a
client test can prove the flag, but only a browser proves the value survives
a real store and a real navigation. It taps the skip option on
`/you/settings`, navigates by **click** rather than `page.goto`, walks a
workout to the point `walkToReady` would find the ready line, asserts the
surface's own positive observable first, and only then asserts the ready line
never appeared — a negative async assertion waits for positive readiness
(CLAUDE.md).

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

**Lens 1 (mechanism) — dispatched.** Full pass, not a delta: phase open and
TRIAD work. Findings and the vetted ground fold back into this document.

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
4. The copy table above, resolved: heading, slot name, hint, option words.
5. The comfort-settings question, answered.
