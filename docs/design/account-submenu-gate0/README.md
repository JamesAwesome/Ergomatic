# Account submenu · rendered Gate 0

**Why this exists.** James, 2026-09-15: *"I want to also move the account
settings into a submenu because 'delete your account' is FAR too prominent."*

Open `index.html`; the left rail selects every state and both orientations. No
control calls authentication. Structure and copy are read from `src/You.tsx`,
`src/you/SignInMethods.tsx`, `src/you/DeleteAccount.tsx` and
`src/shell/AppRoutes.tsx` in this worktree.

## The complaint, measured

`Delete account` sits **433 px from the top of You and is visible without
scrolling** on a 390 × 844 portrait frame (`renders/layout-audit.json`,
`01-today-you`). It is a red button inside a red-bordered box, which makes it
the loudest element on the screen — louder than `Sign out`, louder than the
career hero, and far louder than the four quiet mono door rows beneath it.

That box is itself a Gate 0 ruling from 2026-09-14 (*"in its own quarantined
section"* — a rule was not enough separation). **This request is the same
concern escalating:** quarantining it on the page did not make it less
prominent, because a quarantine box is a visually loud object.

In landscape it needs a scroll (`13-today-you-landscape`), which is not a
defect — You is a scrolling screen and always has been. This pack's audit
deliberately does **not** flag content below the fold for that reason; it
reports the delete button's distance from the top instead, which is the number
the complaint is actually about.

## The three options

`renders/03-options-side-by-side.png` shows them together; each has its own
full captures.

- **A — ACCOUNT door, all of it** (`04`, `05`, `11`). The methods list *and*
  the delete box move to a new subpage. You keeps identity, the career hero and
  the doors, and nothing else. Quietest result, biggest change.
- **B — ACCOUNT door, delete only** (`06`, `07`, `12`). The methods list stays
  where a rower already finds it; only the delete box moves. Smallest change
  that answers the complaint. Costs a subpage holding one button, which can
  read as thin.
- **C — under the existing SETTINGS subpage** (`08`). No new row, no new route.
  **But SETTINGS is display preferences today** (judge colours, ready card),
  and account deletion is not a preference. Mixing them is how a destructive
  action gets found by accident.

All three remove `Delete account` from the first screen a rower sees. The
question is how much else goes with it.

## Four things this decides beyond where the button sits

`renders/09-four-consequences.png`.

1. **Where PR2's success notice lands.** The attach flow ends with "You can
   sign in either way." directly above the row that now reads CONNECTED — that
   pairing is the whole reason the notice was trimmed on 2026-09-15. **Under A**
   the methods list is no longer on You, so the notice either follows it to the
   subpage (and a rower returning from their provider lands somewhere they did
   not start) or loses its row and stops making sense. Under B and C nothing
   changes. **This is the one that reaches into work already in flight.**
2. **Where the re-auth disclosure goes.** Your 2026-09-15 ruling puts it at the
   tap, in the ACCOUNT box, leaving the confirm screen untouched. That survives
   all three options — the box moves and the sentence moves with it. It is
   rendered in place on each subpage so you can see it at its new size.
3. **Whether the methods list stays glanceable.** Today it is the only place a
   rower sees which providers their account holds and that Apple can be added.
   Under A that costs a tap. **Untested** — nobody has been observed using this
   screen, and five users is not a population, so this is judgement, not data.
4. **Where the ACCOUNT row sits.** Prior rulings fix CONCEPT2 above DIAGNOSTICS
   and keep DIAGNOSTICS last. ACCOUNT is drawn **first**, above BASELINES, on
   the reasoning that it is the only row about the account rather than about
   rowing. Moving it is free.

## A constraint worth knowing before you choose

`renders/10-route-name-clash.png`. **`/you/sign-in-methods` already exists and
is not a browsable page.** It is a flow-only route that renders link-confirm,
link-authorize or delete-confirm and otherwise does `Navigate to="/you"
replace`, and it sits in `HIDDEN_TABBAR_PREFIXES` so it draws no tab bar
(`src/shell/AppRoutes.tsx:70`, `:285`). Correct for a flow, wrong for a
destination.

So the subpage needs its own path. **`/you/account`** is free and reads
correctly beside `/you/baselines`, `/you/concept2`, `/you/settings`,
`/you/diagnostics`. Renaming the flow route instead is possible but not free:
it is referenced by the prefix list and by the flow's own navigation, and a
rename would touch the delete path — the very path this change exists to make
safer.

## Rendering and checks

```sh
node contrast.mjs
node render.mjs
```

**Every non-decorative pairing clears its floor.** Lowest is cream-on-accent at
5.94:1 for the delete label; the delete border is 5.35:1 against page; the door
rows are 6.69:1, and 15.41:1 if an ACCOUNT row is promoted to ink. The `--rule`
separator is 1.32:1 and reported as decorative and exempt, consistent with your
2026-09-15 ruling that `--rule` stays decorative and a boundary carrying
meaning uses `--ink-4`.

`render.mjs` writes 13 captures at `deviceScaleFactor: 2` plus
`renders/layout-audit.json`, which records per capture the delete button's
distance from the top and whether it is reachable without scrolling. **No
horizontal overflow; every enumerated target clears 44 × 44** — the check sees
`button, a, [tabindex]` only, and excludes the `.mini` thumbnails inside option
boards, which are pictures of screens rather than controls.

## What I need from you

The option (A, B or C), and — if A — where PR2's success notice should land.
Everything else in the list above has a stated default I can proceed on.

## GATE 0 RULING (James, 2026-09-15)

**OPTION A.** The ACCOUNT door takes the sign-in methods list AND the delete
box to a new subpage. You is left with identity, the career hero and the doors.

Carried with it, from the pack's own list:

- **The subpage is `/you/account`.** `/you/sign-in-methods` is a flow-only
  route that redirects to `/you` unless the auth flow is mid-link or
  mid-delete, and it sits in `HIDDEN_TABBAR_PREFIXES`; it keeps its name and
  its job.
- **The re-auth disclosure rides the ACCOUNT box to the subpage**, per the
  2026-09-15 ruling — the box moves and the sentence moves with it, and the
  delete confirm screen stays untouched.
- **The ACCOUNT row sits first**, above BASELINES. Prior rulings fix CONCEPT2
  above DIAGNOSTICS and keep DIAGNOSTICS last; nothing constrains the top.
- **The You-initiated link needs no decision.** `prepareLink` is called only
  from `SignInMethods`, so "Add Apple" starts and ends inside that component:
  move the component and the success notice lands where the rower already is.

**OPEN, and the only thing this ruling does not settle: where PR2's
follow-through lands.** That flow starts at the sign-in screen, so the rower
ends up newly signed in with no methods list mounted to carry the notice.
Recommended: **Today, signed in, no notice** — the confirmation screen they
just approved named both identities, and the proof it worked is being in the
app. A transient notice is NOT an option: the app has no toast concept, and
`linked` is a persistent view rendered inside `SignInMethods`.
