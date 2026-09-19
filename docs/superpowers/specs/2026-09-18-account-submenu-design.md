# The ACCOUNT submenu — design

## What and why

`Delete account` is the loudest thing on the You screen. It sits 433 px from
the top, visible without scrolling on a 390x844 phone, as a red button inside
a red-bordered box — louder than `Sign out`, louder than the career hero
(`docs/design/account-submenu-gate0/renders/layout-audit.json`, `01-today-you`).
James asked for it moved: _"I want to also move the account settings into a
submenu because 'delete your account' is FAR too prominent."_ (2026-09-15).

This spec moves the whole account block — the sign-in methods list AND the
delete box — behind a new ACCOUNT door at `/you/account`, and adds the one
sentence that says deleting will ask you to prove it is you. You is left with
identity, the career hero and its doors.

**Gate 0 is DONE and must not be re-run.** The pack is
`docs/design/account-submenu-gate0/` (three options rendered, both
orientations, contrast computed). **James ruled OPTION A on 2026-09-15**; the
ruling is recorded verbatim at the foot of that pack's `README.md`.

## Scope: two rows in, one row out

**In** (both `dies 2026-10-12`, both ruled, and they are one edit):

1. _Move the account block behind an ACCOUNT door on You_ (ROADMAP.md:1243).
2. _Delete account does not say that it will ask you to prove it is you_
   (ROADMAP.md:1272) — Gate 0 ruling 3 puts the disclosure at the TAP, in the
   ACCOUNT box, which is the box this change relocates.

**Out:** _A failed provider attach tells the rower nothing, ever_
(ROADMAP.md:1213, `dies 2026-11-15`). Its clause says it waits for this work, not
that it must ride it, and it is a different risk model: `confirmAttach`
swallows the failure (`src/adapters/authFlow.ts`), so surfacing it needs a new
carried state, which is an invented mechanism and pulls an antagonist pass
onto a navigation change. **Recommended: leave it dated where it is.** It
lands cheaper once this surface has settled, which is exactly what its own
clause predicted.

## The one thing Gate 0 left open, and the default taken

The pack's ruling closes with: where does PR2's follow-through land, given the
methods list is no longer on You to carry a notice? Its recommendation was
**Today, signed in, no notice**.

**That is the shipped behaviour and costs no code.** `authFlow.ts:251` maps the
`attached` terminal to destination `/`, and `methodsNotice`
(`src/you/SignInMethods.tsx:9`) has no `attached` branch — so today an attach
completed from the sign-in screen already lands on Today and already shows no
notice. Option A changes nothing about it. Taken as the default; James can
overrule at the PR with no rework.

## The design

### 1. Route

`/you/account`, registered in the signed-in fragment of
`src/shell/AppRoutes.tsx` beside `/you/baselines`, `/you/concept2`,
`/you/settings`, `/you/stats`. It sits OUTSIDE the existing `{authFlow && …}`
fragment and carries its own guard (§4), so a refusal lands on You rather
than on the signed-in wildcard's Today. (This paragraph said INSIDE until the
branch review caught it: the route was written the other way, deliberately,
and the spec was the half left stale.)

**NOT in `HIDDEN_TABBAR_PREFIXES`** (`AppRoutes.tsx:63-79`) — the tab bar stays,
as on every other `/you/*` door.

**`/you/sign-in-methods` is NOT available and is not touched.** It is a
flow-only route that renders link-confirm / link-authorize / attach-confirm /
delete-confirm and otherwise `Navigate to="/you" replace`
(`AppRoutes.tsx:275-309`), and it is in `HIDDEN_TABBAR_PREFIXES`
(`AppRoutes.tsx:72`). Renaming it would touch the delete path, which is the
path this change exists to make safer.

### 2. The screen — `src/you/AccountScreen.tsx`

The house subpage shape, identical to `SettingsScreen.tsx:196-198`:

```
<main className="screen">
  <BackLink fallback="/you" />
  <h1 className="screen-title">Account</h1>
  <SignInMethods auth={authFlow} />
</main>
```

**One deviation from the approved render, stated so it can be overruled:** the
pack drew the back control as `← YOU` (`index.html:531`). Every sibling
subpage — baselines, concept2, settings, diagnostics, stats — uses the house
default `← BACK`, and `BackLink` reserves a custom label for a different KIND
of exit (`← DONE` on the summary). **This ships `← BACK`**; it is one word and
reversible.

The `<h1>Account</h1>` and the quarantine box's own `<h2>ACCOUNT</h2>` both
appear, exactly as the approved render draws them (`index.html:504`, `:531`).

### 3. You loses the block and gains a door

`src/You.tsx:100` (`{authFlow && <SignInMethods auth={authFlow} />}`) is
deleted. `.you-doors` gains ACCOUNT as its FIRST row, above BASELINES — Gate 0
ruling: it is the only row about the account rather than about rowing. Prior
rulings that fix CONCEPT2 above DIAGNOSTICS and keep DIAGNOSTICS last are
untouched. The row uses the group's existing idiom:

```
<Link to="/you/account" state={{ from: "/you" }} className="diag-row">
```

### 4. The door and the screen share ONE availability predicate

Today the entire block — list and delete button — renders only when
`auth.options.state === "ready" && auth.options.frontDoorEnabled`
(`SignInMethods.tsx:186`); otherwise `SignInMethods` returns `null` and You
shows nothing. **That reachability must not change**, so the same predicate
decides the row and the route:

- **New module `src/you/accountDoor.ts`** — one place, so the door and the
  screen cannot drift apart. (Its own module rather than an export from
  `SignInMethods.tsx`, which is a component file under
  `react-refresh/only-export-components`.)
- **You** renders the ACCOUNT row when `accountDoorAvailable(auth)` is true.
- **`/you/account`** asks `accountScreenController(auth)` which controller
  may serve it and renders `Navigate to="/you" replace` when the answer is
  `undefined` — a controller rather than a boolean, so the route has one
  decision and no narrowing guard of its own — the same idiom `/you/sign-in-methods`
  already uses for a state it does not own. This covers a deep link and an
  options flip mid-session.

**They are two predicates, and the asymmetry was measured, not guessed.**
`options` has THREE states — loading, ready-with-front-door, ready-without —
and "not yet known" is not "no". The door hides on unknown, which costs a
rower nothing: the row appears in the same frame the rest of You settles.
The route must WAIT on unknown, because a direct arrival — a bookmark, a deep
link, or an OAuth return, which §7 now sends here — hits the route before the
controller's read resolves. **With the route sharing the door's predicate,
`appleAuth.spec.ts`'s removal-refusal leg found no `Remove Apple` at all:**
the redirect had already fired. Caught by e2e, not by any client test.

**Invariant D1:** `Delete account` is reachable exactly when it was reachable
before this change. A door that appears while the screen would be empty, a
screen reachable while the door is permanently hidden, or a refusal fired on
an answer that has not arrived yet, are all defects.

### 5. The disclosure sentence

Inside the quarantine box, below the button
(`SignInMethods.tsx:294-311`), exactly as rendered at
`account-submenu-gate0/index.html:506`:

> Asks you to sign in with {Apple|Google} first.

- The provider named is `deleteProvider`, the one the delete re-auth will
  actually use (`SignInMethods.tsx:226-232`) — Apple first, matching the list.
- **Rendered only when `deleteProvider !== undefined`.** When it is undefined
  the button is disabled, no re-auth is possible, and there is no provider to
  name.
- The sentence is the button's `aria-describedby`, so a screen reader reads
  it AT the tap rather than after it. This adds nothing visible to the
  approved render.
- **The confirm screen (`DeleteAccount.tsx`) is untouched**, which keeps its
  own 2026-09-14 ruling (state facts, not prose) intact.
- Contrast: `--ink-3` on the box ground, computed and stated as a number in
  the PR (RF6). The pack reports every non-decorative pairing on this box
  clearing its floor; this spec does not inherit that claim without the
  measurement.

### 5b. Copy that named a control by its old place

**Moving a control falsifies every sentence that tells a rower where it is.**
Three were found by grepping the proposition rather than the string:

- **The `account_conflict` four-step recovery** (`SignInMethods.tsx`). It used
  to render ON You, beside `Sign out` and above the list holding
  `Delete account` and `Add <provider>` — so "Tap Sign out." meant the button
  in view. Read on `/you/account`, that screen has NONE of the three. Every
  step now names its screen: step 1 `On "You", tap Sign out.`, steps 3 and 4
  `On "You", open ACCOUNT, then tap …`.
- **The sign-in screen's conflict line** (`SignIn.tsx`): "delete it from You"
  becomes "delete it from You under ACCOUNT".
- **Left alone: the v0.48.0 release note** saying deletion "is on You, under
  ACCOUNT". It is dated history and still reads true of the door.

These are wording changes on rendering surfaces, so they carry the
before/after presentation rather than a capture (James, 2026-09-16). They are
CORRECTIONS forced by the move, not new copy: the alternative is shipping a
recovery that sends a stuck rower to a screen without the control.

### 6. CSS

`.auth-account-block`, `.auth-methods`, `.auth-account-notice` and
`.auth-danger-zone` all move with the component and keep their class names, so
the portrait rules (`index.css:415-630`) and the landscape two-column grid
(`index.css:12949-12990`) follow it. **The landscape grid must be checked on
the SUBPAGE** — it was written against You's flow, and the screen above it is
now a back link and a title rather than identity plus a hero. RF37: a moved
rule is a browser question, so this is settled by a capture, not by reading.

No rule is MOVED in `index.css` by this change; any new rule is appended in
its own block.

### 7. The terminal destination moves with the list, and that is a finding

**Found during implementation; Gate 0 assumed it away.** The ruling says the
You-initiated link "starts and ends inside that one component and its success
notice follows it". It does not: the return is routed by
`destinationFor` (`src/adapters/authFlow.ts:206`), which sends `linked`, and
`cancelled`/`error` on the `link` and `delete` purposes, to **`/you`** — with
its own comment saying why ("the only screen that renders either notice", and
finding I1 as the cost of getting it wrong).

Move the list to `/you/account` and leave that line alone, and every one of
those notices lands on a screen that cannot render it: the success line, the
`account_conflict` four-step recovery, the "We couldn't confirm it was you"
after a failed delete re-auth. **That is finding I1 exactly, arriving by a new
route.** So the destination becomes `/you/account` for those views, and the
comment says the route and the notice are one fact.

**Priced, not waved through.** The spec's own tripwire says to stop if the
implementation reaches into the auth state machine. This is `destinationFor`,
a pure view → route table with its own unit tests — no stage, no attempt, no
`consistent()` invariant, nothing stored. It is the navigation half of the
change, which is what the change IS. Still: it is the one edit in this PR
inside `adapters/authFlow.ts`, and the PR says so above the fold.

Two client tests reached `Remove` by rendering `You`
(`adapters/authFlow.test.tsx`, the RF24 re-read seam and the double-tap
guard). They now render `AccountScreen` — the same real component, the same
real write and re-read, on the surface that holds it.

## Tests, failing first

**Unit / client** (`pnpm test --project client <file>`):

- `You.test.tsx` — ACCOUNT is the FIRST row of `.you-doors`; the methods list
  and the delete button are ABSENT from You; the row is absent when
  `frontDoorEnabled` is false and when options are not ready (D1).
- `you/AccountScreen.test.tsx` — renders the list and the delete box; back
  link targets `/you`.
- `you/accountDoor.test.ts` — both predicates over every `options` state,
  including the one they disagree on, and that the resolver hands back the
  very controller it was given rather than a copy.
- `shell/AppRoutes.test.tsx` — `/you/account` renders the screen; redirects to
  `/you` on a settled refusal and when there is no controller at all; stays
  MOUNTED while the options read is in flight (D1's other half).
- `shell/backNavigationChain.test.tsx` — a You -> ACCOUNT -> BACK round trip
  through the real routed screens, starting upstream of the row that writes
  `state.from` (RF24). Its limit, stated: `BackLink`'s fallback is `/you`
  too, so this leg cannot go red on a MISSING `from` — the route and the
  back link are what it gates.
- `adapters/authFlow.test.tsx` — `destinationFor` sends every terminal link
  and delete outcome to `/you/account` (§7).
- `you/SignInMethods.test.tsx` — the disclosure names the provider
  `startDelete` is called with; is absent when the button is disabled; is the
  button's accessible description.

**Mutations (RF21, each stated in the PR with what its failure said):** delete
the `accountDoorAvailable` guard on the row and the route test must red; swap
`deleteProvider` for the other provider and the disclosure test must red;
restore the `<SignInMethods>` render on You and its absence test must red.

**e2e** — `appleAuth.spec.ts`, `design.spec.ts` and `screenshots.spec.ts` all
reach the list or the delete button through You (`appleAuth.spec.ts:80`,
`:320`, `:405`, `:435`, `:572`; `design.spec.ts:13219-13314`;
`screenshots.spec.ts:8015`) and must navigate through the new door. **The
design spec's landscape geometry assertions are the gate on §6.**

**Captures:** scoped `pnpm screenshots -g "<affected test names>"` — this is a
layout/structure change, so the PR carries the result (You without the block,
the subpage in both orientations).

## What this costs the rower, stated

`Delete account` goes from **0 taps and no scrolling** to **1 tap and no
scrolling**. The after-figure is measured in the Gate 0 pack —
`renders/layout-audit.json`, `04-option-a-you`, `contentBelowFoldPx: 0` — so
the ACCOUNT row is reachable without scrolling on a 390x844 frame. **That
number came off a mock: the PR confirms it against the shipped screen's own
capture.**

This matters because the row driving the work says deletion "is the one flow
App Review requires be easy to find and complete". Quieter is the design win;
further away is the product cost, and they arrive in the same change.

### 8. A failed methods read is not a blank screen

Found by the branch review (F1), and it is invariant D1's own first defect:
`useAuthMethods` terminates at `error` with no retry, and `SignInMethods`
answered that by rendering `null`. Survivable while it lived on You;
a dead end behind a door that promises a screen.

**The two reads have different lifetimes, which is what makes it reachable
rather than theoretical.** `options` is read ONCE per document
(`authFlow.ts`, at `useAuthFlow` mount) so the door is drawn on the signal
the rower had at launch; `methods` is read on EVERY mount of the component,
so the tap can happen with no signal at all. Native is one document for the
app's whole lifetime.

So the error state says so, in the component's existing error-notice
pattern: *"We couldn't load your sign-in methods. Check your connection and
open this screen again."* **A pending read still draws nothing** — a message
on it would flash on every ordinary open.

## Gates

- **Gate 0: NO.** Done and ruled 2026-09-15. The PR carries captures of the
  result, which is not a new gate.
- **PM: YES**, at the PR. It changes what a tester receives and where they
  find it.
- **Antagonist: SKIP, said aloud.** No new mechanism, no wire semantics, no
  invented state, no stored shape: a route, a moved component, one sentence,
  and one predicate that reproduces an existing condition. **If the
  implementation reaches into the auth state machine, stop and re-price it.**
- **DBA: SKIP.** No migration, no store, no bulk read.
- **TRIAD: no.** No number's meaning, no stored shape, no auth semantics
  changed — the delete flow itself is untouched.
- **Fast path: no.** More than one product file, and it changes what the app
  does.

## Housekeeping riding this PR

- Tick _""I already have an account" attaches the identity it just proved"_
  (ROADMAP.md:1057) — delivered by #453, released in v0.50.0, still `[ ]`.
- Date _"Door 2 can Save mid-entry and ship the clamped partial"_
  (`src/onboarding/KnowBaseline.tsx:52`), the one Wave A row with no `dies`
  stamp — campsite rule.
