# Phase RN — the ready card becomes a choice

**Archived 2026-09-10** — closed 2026-09-09 · #381 · released in v0.45.0.

A rower who does not want the `Ready when you pull` card can turn it off in Settings, and the app behaves as though `Show me the numbers` had been pressed the instant the monitor was ready.

---

## Phase RN — straight to the numbers, if that is how you row

**Status: GATE 0 CLOSED 2026-09-09 — cleared to implement.** Both hardening
lenses run and folded; three rulings tabled in the spec. Spec:
[docs/superpowers/specs/2026-09-09-ready-card-preference-design.md](docs/superpowers/specs/2026-09-09-ready-card-preference-design.md).

James asked for the `Ready when you pull` card to become a choice (2026-09-09):
an option on `/you/settings` that, when turned off, makes the app behave as
though **Show me the numbers** had been pressed the instant the monitor was
ready. Default is today's behaviour, so a rower who never opens Settings sees
no change. One stored word, the initial value of two `useState` flags, and
nothing on the wire.

TRIAD (a stored shape), so the spec takes a full antagonist pass and the PR
takes a PM final gate. It changes user-visible copy and layout, so Gate 0 —
the rendered settings screen, plus both skipped paths beside the cards they
replace — is approved before task 1.

- [x] **Hardening — RUN 2026-09-09, both lenses, closed.** The mechanism lens
      returned one BLOCKING (the store's read precedence made both of its own
      persistence gates unfailable) and three MAJOR; the prescribed-code lens
      returned one (I-5's two consumers need different test seams, and the
      harder one had no name). All folded; one ledger entry landed. **S**
- [x] **Gate 0 — CLOSED 2026-09-09, ROUND 2 CLOSED the same day.** Three
      rulings from round 1, tabled in the spec, plus round 2's.
      Copy candidate A; the pre-pull link loss takes option C (Just Row's
      hand-off arm requires the link to be up, for a tapped hand-off as well
      as a skipped one); the parked comfort settings do NOT ride. **S**
- [x] **The PR — MERGED as #381 (`2157a9bd`), ticked 2026-09-09.** Seven
      tasks, spec §"PR shape". Shipped: the `you/readyCard.ts` store; the
      READY SCREEN section on `/you/settings` with its own save-failure
      notice; both consumers reading the setting; Gate 0 ruling 2's link
      guard in `JustRow.tsx`; the upstream-of-the-producer seam test; a
      wire-equality test proving the byte sequence is identical under both
      settings **on the programmed door only** — Just Row's half of I-5 is
      gated one layer up, as a `beginFreeRow` call-count pair, because that
      screen takes no transport injection; the spec's prescribed `vi.doMock`
      seam was not built, and the downgrade is stated in the test rather than
      silent; six e2e legs across `connected.spec.ts` and
      `justrow.spec.ts`; a `design.spec.ts` assertion for the new group; and
      the recaptured settings screen. Unticked deliberately until it merges.
      **M**

**THREE LESSONS FOUND WHILE BUILDING IT, ALL THREE LANDED IN `CLAUDE.md` IN
THIS PR** rather than deferred to the merge-time agent-config check: this
section is archived at phase close, and two of them are facts about a fixture
and a module shape every future test touches (PM final gate, #381). Lesson 1
is now recurring failure 41; lesson 2 amends recurring failure 21; lesson 3
amends recurring failure 38. Kept here as the account of where they came
from. All three are the same shape — a gate that was green and could not
have been red — and all three were caught by running a mutation rather than
by reading.

1. **A fixture that streams frames makes any assertion about this feature
   decoration.** A rowing frame opens the run, and an open run renders the
   connected surface regardless of the ready-screen setting. Measured: with
   the store's `setItem` deleted, all three of the phase's first e2e legs
   passed. On a motionless fixture the same mutation fails two of them. The
   identical trap appeared twice in one day — first in the Gate 0 capture
   harness for Just Row, then in `connected.spec.ts` — so it is a property of
   the fake, not of one test.
2. **An in-memory fallback beside a store disarms every persistence gate,
   and the read order is not the half that matters.** Setting it on a
   SUCCESSFUL write is what lets a deleted `setItem` read back as a working
   save; four probes established that reversing the read order alone fails
   nothing.
3. **A same-document navigation is RF38's mirror.** Phase JC's lesson was
   that a reload made both legs pass; here a CLICK makes both legs blind,
   because the store module survives it. Two legs, and the reload one is the
   gate.

**DEVIATIONS: one row RECONCILED, no new row owed (2026-09-09).** The
ready-dwell row said "Ready holds until the rower presses Show me the numbers
or the first real pull" — this phase adds a third exit, and that row now says
so. The first version of this check reasoned only about colour pairings and
missed it (RF9, caught at the whole-branch review). No NEW row is owed: the new section introduces
no colour pairing `index.css`'s own computed table does not already carry —
its options are the colour options' rules with `.setting-*` appended to the
selector lists in place — so Phase JC's "`/you/settings` gets NO row" ruling
still holds for the same three reasons it gave.

**ACCEPTED CONSEQUENCE, ruled by James 2026-09-09 — and it is the REMINDER
that is lost, not the mechanism.** `keepAwakeOn()` is a mount-lifetime
`useEffect` in both consumers, independent of this setting, so SKIP costs the
printed line and nothing else. That belongs on this row because this row is
where the loss is re-opened, and an overstated cost is the version a future
author inherits (PM final gate, #381). What a rower who turns the card off
stops seeing is `KEEP YOUR PHONE SCREEN ON` — Phase LM's Gate 0 called it the
only preventive element in that phase, and the ready card is the only place it
appears — and trades the card's Cancel, which terminates on the erg,
for the surface's End session. Both were offered a home on the pre-pull
surface and declined: the default is on, and a rower who turned it off asked
for less copy, not more. This row is where that is re-opened if the
phone-sleep work ever needs the warning back.

**This was the SECOND SETTINGS PR** that the parked comfort settings (countdown
length, pace tolerance) retargeted to at Phase JC's Gate 0. **ANSWERED at RN's
Gate 0 (James, 2026-09-09): NO, neither rides.** Pace tolerance changes what a
judged number means, which is the triad's first clause and a second risk model
in one review; countdown length is genuinely cheap and was held on review shape
rather than difficulty. **The trigger is not struck — it retargets again, to
the THIRD settings PR.** The one thing that would change the countdown answer
is still untested: nobody has measured how `/you/settings` reads at four
sections on a 375px viewport.

**GATE 0 ROUND 2 (James, 2026-09-09): the silent-link screen says what is
true.** Ruling 2 was decided from an option table whose stated cost was
false — "A leaves a rower stranded on an End button in the exact state a
reconnect would have worked". The reconnect does not work: `frameSilence`
disposes nothing, so `connect()` early-returns on the installed driver and
Just Row's `Try again` was DEAD in that state, and had been before this phase.
An adversary then blocked the obvious fix (cancel-then-connect) twice over: the
naive form strands the connect claim and bricks the screen permanently, and the
sequenced form terminates an armed monitor off a heuristic that retracts itself
while awaiting an ack that has no bound. **Ruled: split the screen by what told
us the link was gone.** A transport-reported `disconnected` keeps `Lost the
monitor` and its working `Try again`; frame silence reads `Waiting for the
monitor / It has gone quiet. This usually clears on its own.` with Cancel
alone. RF30's own shape, pointed at the road TAKEN rather than the one refused.

**OWED, and deliberately out of scope here — the programmed door's version of
the same wire state.** At `ready` with frames stopped, `ConnectedInterstitial`
switches on raw `session.phase` and renders `Ready when you pull` over a silent
link: no warning, no lost treatment, and no `Try again` to be dead. It is the
least honest of the three treatments this one wire state produces, and nobody
has designed it. **Trigger:** the next phase that touches the programmed
connect flow, or a tester reporting a ready screen that never starts. **S**

**ACCEPTED DIVERGENCE, ruled at the same gate.** Ruling 2 changes `JustRow.tsx`
and deliberately does not change `ConnectedInterstitial.tsx`: the programmed
path has no pre-row lost screen to bypass, so under `skip` a frame-silent ready
lands on the surface's LOST banner rather than on a ready card that says
"Ready when you pull" and mentions nothing. That is more informative than
today, and it is the one place the two entry points behave differently.
