# Wave E walk fallout — the link-outs leave the app, and Concept2 becomes a row

**Date:** 2026-09-04 · **Status:** REV 2, for Gate 0
**Wave:** E (ROADMAP "Wave E — The Concept2 logbook", opened 2026-08-31).
Fallout from the first real walk of the shipped surface, not a new phase.
**Risk class:** NOT TRIAD. No stored shape, no number's meaning, no auth.
PR B removes a platform branch; PR A moves an existing surface behind a row
and a screen without changing what it can do. Gate skips are spoken in §7
rather than left silent, and REV 2 un-skips two of REV 1's.
**Predecessors:** `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`
(the wave), `docs/superpowers/specs/2026-09-04-concept2-per-user-gate.md`
(the cohort gate this walk ran behind).
**What REV 2 changed:** REV 1 proposed re-tiering the Unlink button. James
chose a different shape on 2026-09-04 — the whole card becomes a row, with
everything behind it, the way Diagnostics already works. §5.1 is rewritten
around that; the measurement that killed `.button-l4` is kept and its
conclusion is superseded, not appended to. The link-out half (§3, §4.1, §4.2,
§5.2, §5.3, §6.2, §6.3) is unchanged from REV 1 except where the PR order
moved.

---

## 1 · What and why

The Concept2 surface shipped in #290 (`2f258006`) and #293 (`3d0e2612`) turned
it on for one account. James walked it on his phone on 2026-09-03: he linked a
real Concept2 account, sent a real row, and Concept2's logbook showed the
workout's own end time — which is the thing the close-stamp work existed for.
The feature works.

Two things about it are wrong.

**First, the link-outs open in an in-app sheet that is signed out.** Tapping
"View on Concept2 →" on a row we just sent does not show the row. It shows
Concept2's "The user has made this result private" page, because the sheet
carries its own cookie jar and the rower's Concept2 session is in Safari. The
fix James ruled is to leave the app properly: open these links in the phone's
default browser, where the rower is already signed in. His words: _"opening in
safari is fine because it will be clear you're changing apps."_

**Second, the Concept2 card is too much screen for something a rower touches
twice.** The complaint James actually made was about one control — the Unlink
button is "too loud" — and REV 1 answered it by re-tiering that button. On
2026-09-04 he chose a bigger shape instead: _"maybe we put it in a sub-menu
like diagnostics."_ The whole card leaves You. You gets one quiet row that
says what state the link is in; Connect, the identity line, every panel and
Unlink live on a screen behind it. That is the shape DIAGNOSTICS already has
(`app/src/you/Diagnostics.tsx`), and following it rather than inventing one is
most of §5.1.

**The row has to earn its place, and that is the hard part.** The card draws
eleven states today (`app/e2e/design.spec.ts`, "it partitions all eleven drawn
frames correctly") and can render two more the design page never drew. A row
carries one line. §5.1 says which states reach that line and which only exist
behind it, and why the partition is forced by the code rather than chosen.

**They ship as two PRs, and REV 2 recommends the order flips.** REV 1 put the
Unlink change first because it was small and CI-provable while the link-out
change needs a device. It is no longer small: it is a new route, a new screen,
a redrawn discovery surface and a Gate 0 of its own. Meanwhile the link-out
change fixes a link that today shows a privacy page instead of the rower's own
row. §7 states the recommendation; the ruling is James's.

---

## 2 · Decisions already made (James, walk of 2026-09-03 and 2026-09-04)

These are rulings. They are recorded here so the design starts from them; they
are not re-opened by this spec.

1. **The link-outs open externally, in the phone's default browser**, rather
   than in the in-app sheet. Verbatim: _"opening in safari is fine because it
   will be clear you're changing apps."_ This **overrides** the design property
   that chose the in-app sheet — see §4, where the sentence that stated it is
   withdrawn.
2. **All three rendered link-outs get that treatment**, including the one on the
   no-weight refusal. Verbatim: _"the no-weight should externally link to
   concept 2."_ That button is the rower's only remedy for what blocked their
   send, so it stays and it leaves the app like the others.
3. **The whole Concept2 surface moves behind a row on You, Diagnostics-shaped.**
   Verbatim, 2026-09-04: the Unlink button is _"too loud"_, and _"maybe we put
   it in a sub-menu like diagnostics."_ **This supersedes REV 1's ruling 3**
   ("the Unlink button gets a quieter treatment"), which is withdrawn rather
   than kept alongside: the button is not re-tiered at all in REV 2, because a
   control on a screen the rower opened on purpose is allowed to be the loudest
   thing there. §5.1 carries the argument and keeps REV 1's measurement.
4. **Two PRs.** REV 1's "the Unlink weight first" was ruled on a premise ruling
   3 has now removed — that this was a small button-weight change. It is not,
   and REV 2 therefore does not treat the order as settled. §7 recommends the
   flip and states why; **the order is James's to rule at Gate 0.**

---

## 3 · Research record

Tagged PRIMARY / SECONDARY / INFERENCE. "Nothing found" is a result and is
recorded as one. Every code claim carries the `file:line` read on 2026-09-04
against this worktree at base `e72298d3`.

### 3.1 The sheet has its own cookie jar — measured, not inferred

**PRIMARY, measured on the walk of 2026-09-03.** James signed in to Concept2
*inside* the in-app sheet on the first tap; the next tap was already signed in.
The mechanism is established: the sheet keeps a cookie jar of its own, so the
first tap on a fresh install lands signed out, and a signed-out fetch of a
result URL renders Concept2's _"The user has made this result private"_ page
rather than the row. **An earlier draft of this reasoning was withdrawn once and
must not be restated as an open question.**

**SECONDARY, and it agrees.** The approved design page already carried the same
fact from the other direction, at
`docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`,
verbatim: _"The native arm is `SFSafariViewController`, whose website data has
been isolated from Safari since iOS 11 (SECONDARY; it is the same isolation
that forced the OAuth hop onto `ASWebAuthenticationSession`). The rower's
Concept2 session lives in Safari's jar, so the sheet lands them at a sign-in
and the id-less path takes them to their own account afterwards."_ The page
predicted a sign-in and treated it as acceptable; the walk showed that for the
*result* link there is no sign-in offered at all, only a privacy page. §4
records what this does to the conclusions built on it.

### 3.2 Can the result URL hand off to the ErgData app? No — and record it

**PRIMARY, fetched 2026-09-04 and re-fetched independently while writing this
spec** (`curl -s -w "%{http_code}" https://log.concept2.com/apple-app-site-association`
→ `200`, body verbatim):

```json
{ "applinks": { "apps": [], "details": [ { "appID": "P6DVCL2264.com.concept2.ergdata", "paths": ["/share/*"] } ] } }
```

The log-dev sandbox's own file names a dev ErgData build with the same single
path. `https://concept2.com/.well-known/apple-app-site-association` claims `*`
for ErgData and ErgRace, but that is the **marketing site**, not the logbook,
and a universal link is matched against the host of the URL being opened.

**Consequence, and it is the answer to a question that will be asked again:**
our result URL is `{origin}/profile/{c2_user_id}/log/{result_id}`
(`app/src/log/concept2Send.ts:71`), which is not under `/share/*`, so **it
cannot hand off to ErgData**. And the result object Concept2 returns to us
carries no share token from which a `/share/` URL could be built. Opening a
link-out means opening a browser. There is no third option.

### 3.3 Reusing the existing native arm changes nothing

**PRIMARY, from our own tree.** `@capacitor/browser`'s own documentation says
`Browser.open` is `SFSafariViewController` on iOS — quoted verbatim in
`app/src/native/externalBrowser.ts:14-15` — and that function is exactly what
`openReadOnlyUrl`'s native branch calls
(`app/src/adapters/externalBrowser.ts:79-86`). So that arm **is** the sheet.
Reusing it, or routing the other link-out through it, changes nothing about the
problem.

### 3.4 The probe: deleting the branch MAY be the whole fix

**INFERENCE, and the spec says so on purpose.** `@capacitor/ios` 8.5.0 (pinned
in `app/pnpm-lock.yaml:75-77`) hands both new-window requests and outside-origin
top-level navigations to the system. Read at
`node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift`
in a sibling worktree carrying the identical pinned 8.5.0 (this worktree has no
`node_modules` installed), two sites, both verbatim:

- `createWebViewWith` (the `WKUIDelegate` new-window hook), lines 328-333:
  ```swift
  open func webView(_ webView: WKWebView, createWebViewWith configuration: ..., for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
      if let url = navigationAction.request.url {
          UIApplication.shared.open(url, options: [:], completionHandler: nil)
      }
      return nil
  }
  ```
- `decidePolicyFor`, lines 102-115:
  ```swift
  let toplevelNavigation = (navigationAction.targetFrame == nil || navigationAction.targetFrame?.isMainFrame == true)
  let isApplicationNavigation = navURL.absoluteString.starts(with: bridge.config.serverURL.absoluteString) || ...
  if !isApplicationNavigation, toplevelNavigation {
      if webView.window?.windowScene?.activationState == .foregroundActive {
          UIApplication.shared.open(navURL, options: [:], completionHandler: nil)
      }
      decisionHandler(.cancel)
  ```

**PRIMARY, our own config:** `app/capacitor.config.ts` declares no `server`
block at all and therefore no `server.allowNavigation`, so
`bridge.config.shouldAllowNavigation(to: "log.concept2.com")` cannot short-
circuit either path.

**PRIMARY, our own web arm:** it is already `window.open(url, "_blank",
"noopener,noreferrer")` (`app/src/adapters/webNavigate.ts:29-31`).

**So deleting the `isNative()` branch in `openReadOnlyUrl` MAY give exactly the
behaviour James asked for, with no new dependency.** It is an inference and it
is unproven: which of the two delegate methods WebKit routes a `noopener`
`window.open` through, and whether it routes it at all rather than silently
dropping it, is a WebKit behaviour nothing in this repo can observe.

**The probe is therefore an explicit precondition of PR B, not an assumption in
either direction** (§6). Build with the branch removed, tap a link on a device,
and record *which browser opens*. Only if that fails does a launcher plugin
enter, and then:

**PRIMARY, measured 2026-09-04:** `npm view @capacitor/app-launcher version` →
`8.0.1`; `npm view @capacitor/app-launcher peerDependencies` →
`{ '@capacitor/core': '>=8.0.0' }`, satisfied by our `@capacitor/core@8.5.0`.
Re-verify at the moment of adding rather than trusting this line — the standing
rule is that versions are checked, never remembered.

### 3.5 If the probe succeeds, a dependency loses its last consumer

**PRIMARY.** `@capacitor/browser` has exactly one importer:
`app/src/native/externalBrowser.ts:5`. That module has exactly two potential
callers, and one of them is already dead:

- `openReadOnlyUrl`'s native arm (`adapters/externalBrowser.ts:80-83`) — the
  arm this change deletes.
- `openExternalUrl`'s native arm (`adapters/externalBrowser.ts:59-62`) — **dead
  since PR1.75b.** Its only production caller is `adapters/linkFlow.ts:330`,
  which sits inside `if (!native)` (`linkFlow.ts:329`); the native link
  completes through `ASWebAuthenticationSession` at `linkFlow.ts:332`. The
  adapter's own header already says so: _"nothing reaches this function's
  native arm today"_ (`adapters/externalBrowser.ts:48-49`).

So if the probe passes, the dependency has **no consumer at all**. Leaving it
installed is recurring failure 5 with a package name instead of a CSS class.
What goes with it is enumerated in §6.3.

### 3.6 Nothing found

- **Nothing found** that lets a native app open a specific logbook result in
  ErgData (§3.2 is the negative result, with its evidence).
- **Nothing found** in `@capacitor/browser`'s API that selects the system
  browser over `SFSafariViewController` — the plugin's iOS implementation is
  the sheet, full stop.

---

### 3.7 The precedent, read rather than assumed

**PRIMARY, our own tree, read 2026-09-04.** James named Diagnostics. Every
part of it that this design copies is listed here, and every part it departs
from is listed with the reason, so the departures are decisions rather than
drift.

**What is followed, verbatim in shape:**

- **The row.** `app/src/You.tsx:142-145` — a `<Link to="/you/diagnostics"
  state={{ from: "/you" }} className="diag-row">` holding a label `<span>` and
  an `aria-hidden` chevron `<span>`. `.diag-row` (`app/src/index.css`) is a
  44px (`var(--tap)`) mono row, 12px, `letter-spacing: 0.08em`, `--ink-3` on
  `--page`, with a `border-top: 1px solid var(--rule-2)` and no fill.
- **The screen.** `app/src/you/Diagnostics.tsx` — `<main className="screen
  overlay-screen" tabIndex={0}>`, a `<BackLink fallback="/you" />` first, then
  an `<h1 className="screen-title">`. `.overlay-screen` (`index.css`) is
  `position: fixed; inset: 0` on `--page` at `z-index: 10`, with the tab bar
  explicitly kept above it (`index.css`, the `z-index` comment at the tab-bar
  rule).
- **The route.** `app/src/shell/AppRoutes.tsx:241-260` — registered FLAT
  (`/you/diagnostics` is a sibling of `/you`, not a nested child) and inside
  the `{user && onSignedOut && …}` fragment (`AppRoutes.tsx:241-260`). Not listed
  in `HIDDEN_TABBAR_PREFIXES` (`AppRoutes.tsx:50-64`), so the tab bar stays drawn.
- **The back chain.** The row supplies `state={{ from: "/you" }}`; the screen's
  `BackLink` resolves it through `resolveBackTarget` (`shell/BackLink.tsx:27-30`)
  and falls back to `/you` when there is no `from` — a deep link or a cold
  load. Both halves are needed; neither is optional.

**What is departed from, and why:**

- **Diagnostics has no data of its own.** Its own header says so verbatim:
  _"No data of its own: a static menu, so there is nothing here to read on
  mount and nothing to keep in sync."_ This screen reads
  `GET /api/concept2/link` on mount, on every foreground and on a bfcache
  restore (`api/useConcept2Link.ts:200-215`), and holds four pieces of attempt
  state (`you/Concept2Card.tsx:86-92`). Every question §5.1 has to answer comes
  from that one difference.
- **The DIAGNOSTICS row carries no state, and this one must.** A stateless row
  is honest for a menu of tools; it is not honest for a link that can break
  while the rower is not looking. §5.1's state table is the whole of that
  argument.
- **Diagnostics is a menu; this is a leaf.** `/you/diagnostics` exists to hold
  future tools ("the extensible home for every diagnostic tool that follows").
  `/you/concept2` holds one thing and is not claiming otherwise.
- **`.diag-row` is written for exactly one row, and the M-3 rule that pins it
  says so.** `.you-screen .diag-row { margin-top: auto }` (`index.css`) carries
  the comment _"`.diag-row` is used ONLY on the You screen (grep confirmed,
  single JSX site)"_, and the grep still returns one site
  (`grep -rn 'diag-row' app/src --include="*.tsx" | grep -v '\.test\.'` →
  `src/You.tsx:142`, one hit, 2026-09-04). A second row carrying an `auto` top
  margin is a **flex free-space split**, not a second row beneath the first:
  CSS Flexbox §8.1 distributes positive free space equally among auto margins
  on the main axis (SECONDARY — spec text, not measured in this engine).
  Invariant R7 in §5.1 states what must be true instead, and leaves the
  mechanism to the plan.

---

## 4 · What these changes falsify, and the Gate 0 they therefore owe

**Both PRs need a Gate 0 amendment, even though PR B moves no pixel.** A
behavioural sentence on an approved design page is an approved claim, and this
change makes it false.

### 4.1 The sentence, named and withdrawn

`docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html`,
lines 2187-2190, verbatim:

> _"PR2 adds a second adapter arm that opens a new context on web and
> `SFSafariViewController` on native. **Both surfaces come back to Ergomatic
> with the row still on screen.**"_

**WITHDRAWN.** After PR B the native arm is not `SFSafariViewController`, and
"comes back with the row still on screen" stops being a property the app
guarantees — it becomes a property of iOS's app-switching and memory pressure.
§5.3 says what the app can actually promise instead. The withdrawal is struck
**on the page**, not appended beneath it.

### 4.2 Three more claims the brief did not name, and they are load-bearing

A grep for the retired mechanism finds five source files and one design page
(`grep -rln SFSafariViewController app/src docs/design`, run 2026-09-04). Three
of the hits are behavioural claims, not history:

- **`app/src/log/Concept2SendBlock.tsx:222-225`**, verbatim: _"On native the
  link-out is `SFSafariViewController`, which RETURNS to the app onto a
  still-mounted block, so `Send again` is the affordance the return lands on."_
  This is the same claim as §4.1, in the code, justifying why the no-weight
  state keeps its `Send again` button. **The conclusion survives and the
  premise does not:** `Send again` must stay (a state that tells the rower to
  fix something on Concept2 and offers no way to finish is worse than useless),
  but the reason is no longer "the sheet dismisses back onto a mounted block".
  Rewrite it to say what §5.3 establishes.
- **`app/src/log/concept2Send.ts:96-101`**, verbatim: _"So the id-less path is
  the one that lands a rower in their own account after signing in — and
  signing in is the likely case, because the native arm opens
  `SFSafariViewController`, whose website data has been isolated from Safari
  since iOS 11."_ **This premise INVERTS.** In Safari the rower's Concept2
  session is present, so signing in becomes the *unlikely* case. The
  conclusion — target the **id-less** `{origin}/profile`, never
  `/profile/{id}` — still holds and gets stronger: signed in, the id-less path
  is the rower's own profile; signed out, it 302s to `/login` and lands there
  after. The id-bearing path renders a public read-only card with no form in
  either state. Correct the sentence; do not change the constant.
- **`app/src/api/useConcept2Link.ts:74-81`**, verbatim: an empty
  `logbookBaseUrl` _"would build `/profile/2211/log/339` — a RELATIVE url,
  which the web arm opens as a new tab on ERGOMATIC's own origin and the
  native arm hands to `SFSafariViewController` as a bare path."_ After PR B
  both arms are the same arm; the degradation to `null` is still right and the
  mechanism half of the sentence is stale.

`app/src/monitor/Concept2LinkProbe.tsx:11` also mentions the sheet, but as a
record of a **retired** PR1.5 card. It is history and stands.

### 4.3 What Gate 0 must present

Per the standing design gate, James approves the **rendered** thing, at real
proportions, in both orientations, against what it replaces, with every colour
pairing's contrast ratio computed and stated as a number.

- **PR A** is now a redrawn discovery surface plus a new screen, so its
  artifact is a new amendment page, not a pair of before/after frames:
  - **You, with the row, in each of the four values §5.1 assigns to it**
    (`NOT LINKED`, `LINKED ✓`, `RECONNECT NEEDED`, `COULDN'T READ`), portrait
    and landscape, each beside today's committed capture of the same state
    (`docs/screenshots/you-concept2-unlinked.png`, `you-concept2-linked.png`,
    `you-concept2-read-failed.png`, `you-concept2-landscape.png`). The
    before/after pair is the point: what a rower loses from You is the whole
    question.
  - **You with no row at all** (the surface unavailable), beside the same, so
    the silence is approved rather than assumed.
  - **The two rows together at the foot of You** — CONCEPT2 and DIAGNOSTICS —
    in both the short-content case (space above the group) and the
    tall-content case (no space left). This adjacency has never been drawn and
    it is what R7 exists to protect.
  - **The screen**, portrait and landscape, in every state §5.1 assigns to it.
    The amendment page already draws eleven of them as cards; what is new is
    the chrome around them (BackLink, title, and whatever the head becomes)
    and the two states the page never drew (§5.1's table rows 13 and 14).
  - **The copy question, drawn rather than described.** The screen's frame
    contains the word Concept2 twice — once as the screen's own title and once
    as the card's `<h2>CONCEPT2</h2>` head (`you/Concept2Card.tsx:318-327`).
    Gate 0 rules on which survives; §5.1 states the measured cost of each
    answer, because one of them spends invariant R6.
  - **Numbers**, from §5.1's table: every pairing on the row and on the screen.
- **PR B:** no frame changes, so the artifact is the **withdrawal**: §4.1's
  sentence struck on the amendment page and replaced by what §5.3 can honestly
  promise, plus the three corrected code comments quoted in the Gate 0 note.
  Presenting it is the gate; the gate is the approval, not the presentation.

---

## 5 · The design

### 5.1 PR A — Concept2 becomes a row on You and a screen behind it

#### The shape

`You` loses `<Concept2Card email={user.email} />` (`You.tsx`, between Reset
baseline setup and the DIAGNOSTICS row) and gains **one row** in the same
idiom as DIAGNOSTICS: a label, a state line, a chevron, 44px, mono, no fill.
Tapping it opens **`/you/concept2`**, an overlay screen carrying the card
exactly as it is today. Connect, Reconnect, the identity line, all six panels,
Unlink and its arm live there and nowhere else.

Everything structural is Diagnostics', named part by part in §3.7. What
follows is the part Diagnostics cannot answer, because Diagnostics has no
state.

#### The state question, which is the whole of this design

**The card's real state space, measured.** The brief says ten drawn states.
The repo's own count is eleven, and the component can render two more:

- `app/e2e/design.spec.ts`'s Concept2 block and `you/Concept2Card.tsx:286-315`
  both say **eleven drawn frames** — 1a, 1b, 1c, 1d, 1e, 1f, 1f-b, 1f-c, 1g,
  1i, 1j — plus **1h**, which draws nothing at all.
- `Concept2Card.tsx:294-296` says the `singleColumn` predicate "answers the two
  states the page never drew (an in-flight attempt on the reauth card, and 1f-c
  before it was drawn)". 1f-c has since been drawn; **the in-flight attempt on
  the reauth card has not**, and reading the render gates finds two more that
  have not either: **armed while the link needs re-auth** (`link.linked &&
  armed` is unconditional at `Concept2Card.tsx:500-523`; `needsReauth` does not
  suppress it) and **a refused unlink on a reauth card** (`:411`, same gate).
  So three undrawn combinations, not two. The in-flight one is worth Gate 0's
  attention on its own: `!link.linked && opening` gates the OPENING CONCEPT2
  panel (`:429`), so a RECONNECT in flight draws **no panel at all** — both
  buttons simply go `disabled` and nothing on the card says why.

**The partition, and it is forced rather than chosen.** Ten of those states
are born from a tap and live in `Concept2Card`'s own `useState` — `outcome`,
`busy`, `armed`, `unlinkFailed` (`Concept2Card.tsx:86-92`). `/you/concept2` is
a **sibling route**, not a nested child (`AppRoutes.tsx` registers flat
routes), so returning to You unmounts the card and discards all four. There is
no path on which the row is mounted while any of them is set:

- **Native.** The consent leg is `ASWebAuthenticationSession`
  (`adapters/linkFlow.ts:332`) — a modal over a live WebView. The rower cannot
  navigate the app underneath it.
- **Web.** `startLink` hands off with `openExternalUrl` → `navigateWeb` →
  `window.location.assign` (`adapters/webNavigate.ts:19-21`), which unloads the
  document. The rower returns by browser Back **to `/you/concept2`**, whose
  `pageshow` handler clears the attempt anyway (`Concept2Card.tsx:117-136`).

So: **the row shows what the SERVER last said; the screen shows what the last
TAP did.** That is not a taste call. Putting an attempt state on the row would
require lifting `outcome`/`busy`/`armed`/`unlinkFailed` above the route into a
context or a store, which nothing here asks for and which invariant I1 (the
card never infers the link from an outcome) exists to discourage.

**The table.** "Unreachable" means the row cannot be on screen while that state
holds, for the reason above — not that it was judged unimportant.

| # | card state | the ROW says | drawn on |
| --- | --- | --- | --- |
| 1 | 1a unlinked, at rest | `NOT LINKED` | row + screen |
| 2 | 1b opening | (unreachable) | screen only |
| 3 | 1c linked and healthy | `LINKED ✓` | row + screen |
| 4 | 1d unlink armed | (unreachable) | screen only |
| 5 | 1e link attempt failed | (unreachable) | screen only |
| 6 | 1f needs re-auth | `RECONNECT NEEDED` | row + screen |
| 7 | 1f-b re-auth + failed attempt | (unreachable) | screen only |
| 8 | 1f-c re-auth + update required | (unreachable) | screen only |
| 9 | 1g update required, unlinked | (unreachable) | screen only |
| 10 | 1i read failed | `COULDN'T READ`, conditionally — R4 | row + screen |
| 11 | 1j unlink refused | (unreachable) | screen only |
| 12 | 1h unavailable | nothing at all | neither |
| 13 | armed while needing re-auth (never drawn) | (unreachable) | screen only |
| 14 | unlink refused while needing re-auth (never drawn) | (unreachable) | screen only |
| 15 | RECONNECT in flight (never drawn; no panel, buttons disabled) | (unreachable) | screen only |

**Four values and an absence. The row mints no copy of its own:** all four
strings are ones `Concept2Card` already renders — `LINKED ✓`,
`RECONNECT NEEDED`, `NOT LINKED` (`Concept2Card.tsx:278-284`) and
`COULDN'T READ` (`:227`). The card's fifth status value, `WAITING`, is the
opening state and is therefore unreachable on the row; the row never says it.
No new string means no new copy decision and no second spelling of a state to
drift apart.

**Why each of the four earns the row, stated as a product judgement:**

- **`RECONNECT NEEDED` is the one that makes this a design gate rather than a
  refactor.** It is set from the server's own `needs_reauth_at`
  (`server/routes/concept2.ts`, the GET `/link` handler) and it is sticky: the
  rower did nothing to cause it and nothing in the app resolves it on its own.
  **And nothing else in the app tells them.** `grep -rn "needsReauth" app/src
  --include="*.ts" --include="*.tsx" | grep -v '\.test\.'` (2026-09-04)
  returns 13 lines across exactly three files — `api/useConcept2Link.ts` (the
  type), `monitor/Concept2LinkProbe.tsx` (dev-only, absent from a release
  build), and `you/Concept2Card.tsx`. `grep -c needsReauth
  app/src/log/Concept2SendBlock.tsx` → **0**: the log's Send block gates on
  `!link.linked` alone (`Concept2SendBlock.tsx:77`), so a rower whose link has
  gone stale is still offered Send and still fails. The You surface is their
  only warning, and a row that hides it behind a tap removes the only warning
  there is.
- **`LINKED ✓` is what makes the row worth reading when nothing is wrong.** A
  door with no answer is a door the rower opens to learn nothing has changed.
- **`NOT LINKED` is the discovery state** — the reason the surface exists at
  all. It is also the state most rowers will be in.
- **`COULDN'T READ` is carried because the alternative is a lie.**
  `useConcept2Link.ts:126-136` is explicit that a failed read and
  `available: false` are different answers and that _"drawing them the same way
  tells a rower whose server does have it that it does not."_ R4 scopes when
  that applies rather than dropping it.

#### What happens when the surface is unavailable — and one thing today gets wrong

**Today, for `available: false`, both surfaces render nothing.** The card
returns `null` (`Concept2Card.tsx:259`) and the Send block returns `null`
(`Concept2SendBlock.tsx:77`). The server answers `200 {available:false}` — a
capability read, not an error (`server/routes/concept2.ts`, the GET `/link`
handler's own comment: _"200 on purpose (the matrix's one non-403 row) — this
is a capability read, not an action"_) — for any rower off `C2_ALLOWED_EMAILS`
as well as any deployment with the flag unset. **The row disappearing is
exactly the behaviour the card already had**, and this design keeps it.

**But the brief's premise is not quite true of a FAILED read, and that is a
live defect.** `Concept2Card.tsx:220` branches on `failed !== null` **before**
the availability check at `:259`. So a read that never succeeded draws the
COULDN'T READ card regardless of whether this rower has Concept2 at all. On
production today that means: **any rower who opens You while offline sees a
CONCEPT2 error panel about a feature gated to one account.** It is reachable
on every deployment and every account, and the committed capture
`docs/screenshots/you-concept2-read-failed.png` is a picture of it (its fixture
serves 502 to the FIRST read — `app/e2e/screenshots.spec.ts`,
`link: { status: 502 }`).

**R4 closes it without new state.** The hook already retains the last good
`link` across a failed re-read, deliberately (`useConcept2Link.ts:126-136`:
_"a failed re-read deliberately leaves the last good `link` in place"_). So
"have we ever been told this account has Concept2" is already expressible as
`link !== null && link.available`, with no new ref, no new lifetime, and
nothing for RF27 to tabulate.

**The cost, stated rather than buried:** a cohort rower whose *first* read of a
visit fails sees no row and therefore cannot reach the Retry. Their remedy is
the automatic re-read the hook already performs on every foreground and on
every fresh visit to You (`useConcept2Link.ts:200-215`) — one tab-switch
instead of one tap. **The trade is one tap for one rower against a Concept2
error panel shown to every rower who has no Concept2, and that is the
recommendation.** It is a change to what a rower sees, so Gate 0 rules it; if
Gate 0 declines, the row inherits today's ordering unchanged and the defect
stays as it is, named here.

**The screen is the asymmetric half, and the asymmetry is the principle.** A
surface the rower did not ask for may go quiet when it does not know; a screen
the rower deliberately opened must always answer. So:

- `/you/concept2` renders its chrome — BackLink and title — in **every** state,
  including before the first read resolves and on a read that failed. It never
  renders nothing, because a blank screen with no way out is the worst thing on
  this list.
- On the screen, a failed read always draws 1i's panel and its Retry, retained
  link or not.
- Reached with `available: false` — possible only by a typed URL or a stale
  history entry, since the row is absent — the screen returns the rower to
  `/you` rather than drawing a blank or naming a capability they do not have.
  `AppRoutes.tsx`'s own `<Route path="*" element={<Navigate to="/today"
  replace />} />` is the house idiom for a route with nothing behind it.

#### Where the transient states live, and what the rower sees coming back

The brief asks it directly: the rower taps Connect on the sub-screen, the sheet
opens, what does the row behind it say and what do they see on return?

**The row is not behind it.** `/you/concept2` is a route, not a modal; You is
unmounted while the rower is on the screen. On native the consent view sits
over the screen, and on web the document is gone. There is no frame in which a
row and an open attempt coexist.

**On return:** native resolves inside `startLink`'s promise and the screen
draws 1b → the outcome, exactly as the card does on You today. Web returns by
Back to `/you/concept2`; `pageshow` clears the attempt (`Concept2Card.tsx:127-136`)
and the mount read reports the truth. **Neither path changes**, because the
card's own code does not change. What changes is only which route it happens
on, and both handlers key on document events, not on a path.

**Then the rower presses BACK.** They land on `/you` (the row's
`state={{from:"/you"}}`, or `BackLink`'s `/you` fallback on a cold load), You
mounts, the hook reads, and the row shows the server's answer — which after a
successful link is `LINKED ✓`. The attempt state they left behind is gone, and
that is correct: it described a tap, and the tap is finished.

#### Unlink: no new tier, and the arm stays

**REV 1's conclusion is superseded, and this is the sentence that replaces it.**
The Unlink control's classes, heights and colours **do not change**.
`.c2-card-danger` keeps its 52px accent outline at rest and its accent fill
armed. The complaint was that it was the loudest thing on a card the rower did
not ask to see; the answer is that the card is no longer on You. On a screen
whose only job is this link, the destructive control being prominent in the
linked state is correct — in that state it is the only thing there is to do.

REV 1's measurement of the alternative tier is kept below because it is still
true and still useful; what is withdrawn is the conclusion it fed
(`.button-outline` for the rest state, `align-self: flex-start`, a re-captured
pair). None of that is built.

**The two-tap arm stays, with its 4-second disarm.** Three reasons, and the
third is the binding one:

1. **Relocation does not make the action less destructive.** Unlinking revokes
   the grant; re-linking is a full OAuth round trip through Concept2's consent
   page. One tap is still not enough confirmation for that.
2. **The arm is doing disclosure work, not only mis-tap work.** The sentence
   _"Unlink removes this app's access. Rows already sent stay on Concept2."_
   (`Concept2Card.tsx:399-402`) renders **only while armed**. Removing the arm
   means either losing that sentence or making it permanent — a new copy
   decision and a new frame, for a problem nobody reported.
3. **James complained about volume, not friction.** A spec does not get to
   spend a ruling it was not given.

**Invariant I2 changes one word and nothing else.** It reads today that the arm
can never survive leaving You; it now reads that the arm can never survive
leaving **the screen it was made on**. The mechanism that guarantees it is
unchanged — `useEffect(() => disarm, [disarm])` (`Concept2Card.tsx:105`) runs
its cleanup on unmount, and a route change unmounts the card exactly as leaving
You did. **The comment at `Concept2Card.tsx:102-104` names You by name and is
corrected in place, not appended to.**

#### REV 1's measurement, kept — the conclusion it fed is superseded

Read from `app/src/index.css` and `app/src/theme/tokens.css` on 2026-09-04;
ratios computed with the WCAG 2.x sRGB relative-luminance formula, not judged.

| control | class | min-height | width | border / label | contrast |
| --- | --- | --- | --- | --- | --- |
| Unlink, at rest | `.c2-card-danger` (index.css:10420) | 52px | full (parent `.c2-card-act` is a flex column) | `--accent` `#b5341f` on transparent over `--surface` | 5.94:1 |
| Unlink, armed | `+ .c2-card-danger-armed` (index.css:10431) | 52px | full | `--on-color` on `--accent` fill | 5.94:1 |
| Connect / Reconnect | `.c2-card-primary` (index.css:10341) | 48px | full | `--on-color` on `--ink` fill | 17.11:1 |
| Retry | `.c2-card-retry` (index.css:10404) | 52px | full | `--ink` on transparent | 17.11:1 |
| Sign out (You, card above) | `.button-outline` (index.css:162) | 44px | content | `--ink` on transparent | 17.11:1 |

**`.button-l4` was never a quieter tier, and that finding stands.**
`app/src/log/FromTheLog.tsx:582` renders `className="button-l4
log-delete-trigger"`, and `.log-delete-trigger` (index.css:2719) sets
`margin: 24px 0 0` **and nothing else** — its own comment says so: _"no new
interactive rule needed, only this spacing"_. The tier itself (`.button-l4`,
index.css:344-353) is `min-height: 52px`, `border: 1px solid var(--accent)`,
`color: var(--accent)`, `font-size: 16px`, `width: 100%`. Against
`.c2-card-danger` that is identical on every axis that carries loudness,
differing only in corner radius. **So the brief's two named references are one
tier, and adopting it would have changed nothing a rower would call volume.**
That is still true and it is still the reason no tier swap appears in REV 2 —
but REV 2 does not swap tiers at all, so it is now a recorded negative result
rather than an argument for a different class.

#### The row's own numbers

Tokens: `--page #f4f1e8`, `--surface #fffdf7`, `--ink #1b1a17`,
`--ink-3 #57544c`, `--ink-4 #6f6a5f` (`app/src/theme/tokens.css`). The row sits
on `--page`.

| element | colour | ratio on `--page` | floor |
| --- | --- | --- | --- |
| row label `CONCEPT2` | `--ink-3` | **6.69:1** | 4.5:1 ✓ |
| row state line, all four values | `--ink-3` | **6.69:1** | 4.5:1 ✓ |
| chevron (`aria-hidden`) | `--ink-3` | **6.69:1** | decorative |
| hit target | `min-height: var(--tap)` = **44px** | | 44px ✓ |

`--ink-4` on `--page` is **4.76:1** and would also pass if Gate 0 prefers the
state line dimmer than the label; `--ink` is **15.41:1** if it prefers it
darker. All three are stated so the gate can rule on a number rather than an
impression. **`--accent` gains no new use** — it is 5.35:1 on `--page` and
appears nowhere on the row.

One thing the card does that the row must decide: `.c2-card-status-on`
(`index.css`) draws `--ink` at weight 600 whenever `link.linked` is true, which
means **`LINKED ✓` and `RECONNECT NEEDED` are drawn identically today** and are
told apart only by the word. On a one-line row that is worse than on a card.
Gate 0 rules whether `RECONNECT NEEDED` gets its own weight; the spec's
recommendation is that it does not get `--accent` (R8), and that if it needs
distinction it takes `--ink` at 600 against `--ink-3` for the other three.

#### The invariants (what must be true)

- **R1 — the row says what the server said.** Its state line is one of the four
  strings `Concept2Card` already renders. The row mints no copy of its own.
- **R2 — the row never shows attempt state.** No value of the row depends on
  `outcome`, `busy`, `armed` or `unlinkFailed`.
- **R3 — a broken link is visible without a tap.** `needsReauth` reaches the
  row. This is the invariant the whole design is at risk of losing, and the one
  a reviewer should attack first.
- **R4 — silence means "we have never been told this account has Concept2".**
  The row draws only once a successful read has reported `available: true`; a
  failed read draws `COULDN'T READ` on the row only over a retained available
  link, never as the first thing a rower has ever been told about Concept2.
- **R5 — a screen the rower asked for always answers.** `/you/concept2` renders
  BackLink and title in every state, including pre-first-read and read-failed.
  With `available: false` it returns the rower to `/you`. It never renders
  nothing.
- **R6 — the card's markup does not change.** The screen mounts `Concept2Card`
  as it is. **What that buys, measured:** the four committed fixtures
  (`app/e2e/fixtures/c2-card-{armed,read-failed,unlinked,update-required}.html`),
  `Concept2Card.test.tsx`'s whole-`innerHTML` equality gate ("the e2e fixtures
  ARE this component's output"), and **five of the six tests** in
  `design.spec.ts`'s Concept2 describe (`design.spec.ts:10427, :10446, :10465,
  :10481, :10521` — the split, the two hairline cases, the control-height table
  and 1g) stay green **without being retuned**. The sixth (`:10554`, the
  in-situ standoff) dies for a different reason and is the row below. A gate
  that does not move is a gate that can still go red on something else.
  **If Gate 0 rules the card's `CONCEPT2` head must go** (§4.3's copy
  question), R6 is spent and the price is: four fixtures regenerated, one
  equality test updated, one `.c2-card-head` CSS rule reconsidered because the
  status chip would be alone in a `space-between` head. That is the whole
  price; it is not large, but it should be paid knowingly.
- **R7 — the two doors at the foot of You read as one group.** Exactly one
  auto top margin separates the group from the content above it, not one per
  row. Stated as an invariant, not a mechanism: §3.7 records why (`.diag-row`'s
  own M-3 rule assumes a single site) and the plan chooses how.
- **R8 — no new tier and no new accent.** The Unlink control's classes are
  unchanged, `--accent`'s census does not grow, and
  `docs/design/DEVIATIONS.md`'s one Concept2 row (line 241, the Send block's
  link-out) is untouched and no second row is minted.
- **R9 — Unlink keeps its two-tap arm and its 4-second disarm**, and the arm
  cannot survive leaving the screen it was made on.
- **R10 — the row is the only Concept2 thing on You.** After this change
  `grep -n 'Concept2Card' app/src/You.tsx` returns nothing and You imports no
  Concept2 component other than the row. **That grep returns 2 today** (the
  import at `You.tsx:6` and the mount at `:119`), which is what makes it a
  check rather than decoration — `grep -n 'c2-card' app/src/You.tsx` already
  returns nothing, because You names the component and never the class, and
  would have been an RF21 gate that cannot go red.

#### What it costs elsewhere, named file by file

Every row was read on 2026-09-04 against this worktree at base `2148f978`.

| file | what changes | why it is on this list |
| --- | --- | --- |
| `app/src/You.tsx` | the card mount (`<Concept2Card email={user.email} />`) becomes the row; its ~20-line comment block is rewritten in place | that comment records **James's 2026-09-04 "AS SHIPPED" position ruling**, made on captures of the CARD among BASELINES and Reset. A mono row at the foot beside DIAGNOSTICS is an adjacency that ruling never saw, so **it does not transfer** — Gate 0 re-rules the position |
| `app/src/you/Concept2Row.tsx` (new) | the row; calls `useConcept2Link` | You must not learn any Concept2 state itself; the hook belongs with the row |
| `app/src/you/Concept2Screen.tsx` (new) | the screen; BackLink, title, mounts `Concept2Card` | Diagnostics' shape (§3.7) |
| `app/src/shell/AppRoutes.tsx` | one flat route `/you/concept2` **inside** the `{user && onSignedOut && …}` fragment | the screen needs `user.email` for `identityLine` (`you/concept2CardModel.ts:38`; `You.tsx` passes it today) and there is no context to read it from. Not added to `HIDDEN_TABBAR_PREFIXES` |
| `app/src/index.css` | the row's rule; the doors-group rule (R7); the M-3 block's "single JSX site" comment corrected in place | the grep that comment cites stops returning one hit |
| `app/src/index.css`, `.c2-card` | its `margin: 12px 0 0` loses its justification | the 12px was ruled against `.reset-baselines` on You (`design.spec.ts`'s in-situ test and its "12 is BOTH authorities agreeing" comment). On the new screen the neighbour is a title, and the number has to be re-argued or re-ruled |
| `app/src/You.test.tsx` | the three Concept2 cases (`You.test.tsx:183-234`) become row cases; the document-order case gains a second row to order against | they assert `.c2-card` on You |
| `app/src/you/Concept2Screen.test.tsx` (new) | R5's cases: chrome in every state, the `available:false` redirect, the back target | R5 is the invariant with no existing gate |
| `app/src/you/Concept2Card.test.tsx` | **untouched under R6** | the card does not change |
| `app/e2e/concept2.spec.ts` | `openYou`'s sentinel breaks; six card tests re-route | `openYou` asserts `page.locator(".diag-row")` `toBeVisible()` (`:310`) — **a second `.diag-row` is a Playwright strict-mode violation** and every test through that helper throws. Card tests at `:324, :353, :394, :638, :666, :743`; the five Send-block tests at `:431, :460, :511, :539, :567` are unaffected |
| `app/e2e/screenshots.spec.ts` | the same sentinel at `:6180`; the five You captures change subject | `you-concept2-read-failed`'s fake serves 502 to the FIRST read, which under R4 draws no row — it must serve one good read first, or move to the screen |
| `app/e2e/design.spec.ts` | the in-situ test "the card stands off the row above it on You" (`:10554`) is **falsified outright** — its `inSitu` composition hand-writes `.reset-baselines`, the card fixture and a `.diag-row`. The block header's "Task 8 HAS now mounted it (`You.tsx`, between Reset baseline setup and the DIAGNOSTICS row)" is corrected in place | the card is not on You any more. The describe's other five tests are untouched under R6 |
| `docs/screenshots/` | `you-concept2-{unlinked,linked,armed,read-failed,landscape}.png` all draw the card on You | all five change subject. The three `log-concept2-*.png` are Surface 2 and are untouched |
| `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html` | 14 frames stop describing what ships | **measured**, see the script below: 54 frames, 24 draw the card, **12 of those draw it inside a You column**, and 2 more draw You without it. Per RF9 the page is reconciled — the superseded in-situ frames struck **on** the page — rather than left as accidental history |
| `docs/design/handoffs/.../README.md` | reconciled wherever it describes the card as living on You | same reason |
| `ROADMAP.md` | the two rows §10 already owes | RF17 |

**The frame census is a script, not a transcribed number** (a census in a
document is a measurement with an expiry date):

```bash
cd docs/design/handoffs/2026-08-31-concept2-connect && python3 - <<'EOF'
import re
s = open('amendment-2026-09-03.html').read()
opens = list(re.finditer(r'<div class="(frame(?: land)?(?: cb)?)"', s))
tag = re.compile(r'<div\b|</div>')
frames = []
for m in opens:
    depth = 0
    for t in tag.finditer(s, m.start()):
        if t.group() == '</div>':
            depth -= 1
            if depth == 0:
                frames.append(s[m.start():t.end()]); break
        else:
            depth += 1
card = [b for b in frames if 'c2card' in b]
you = [b for b in card if any(k in b for k in ('DIAGNOSTICS','BASELINES','Sign out'))]
print(len(frames), len(card), len(you), len(card)-len(you))
EOF
```

Output on `2148f978`, 2026-09-04: `54 24 12 12`.

**The brief said twenty frames, most of them in a You column.** It is 24, and
exactly half. §9 records it.

---

### 5.2 PR B — the link-outs leave the app

#### The invariants

- **L1 — the rower arrives signed in.** A read-only link-out opens in the
  browser where the rower's Concept2 session already lives, so the destination
  renders their own content without a second sign-in. This is the whole point:
  today the sent-row link renders a privacy page (§3.1).
- **L2 — one behaviour for all three.** The three rendered link-outs — the
  result link on a SENT row, the result link on an ALREADY THERE row, and
  `OPEN CONCEPT2 PROFILE` on the no-weight refusal — take the same path. No
  state gets a different browser. (Mechanically this is two call sites of one
  function, `Concept2SendBlock.tsx:189` and `:245`, and three rendered states,
  because the result-link button draws for both `sent` and `duplicate` —
  `Concept2SendBlock.tsx:86-92, 185-193`.)
- **L3 — leaving costs the rower nothing durable.** Every fact the row carries
  is on the server before the rower can tap a link-out; leaving and returning
  re-derives the screen from it. §5.3 states exactly what *is* transient.
- **L4 — the consent hop is not touched.** The OAuth authorize leg stays
  `ASWebAuthenticationSession` on native (`linkFlow.ts:332`) and
  `window.location.assign` on web (`webNavigate.ts:19-21`). RFC 8252 §8.12
  forbids an embedded user-agent there, and the ephemeral session is what makes
  the account-injection ruling hold. The handoff README's "system browser" copy
  for **Connect** (README.md:141-152, 309) describes that hop and stands
  unchanged.
- **L5 — the platform conditional does not multiply.** After this change
  `openReadOnlyUrl` has either **zero** platform branches (the probe's success
  case) or exactly one, in the adapter layer, with a comment naming the WebKit
  behaviour that forced it. Nothing platform-conditional appears in a
  component.
- **L6 — no dependency without a consumer.** If nothing imports
  `@capacitor/browser`, it is not in `package.json` and not in the iOS SPM
  manifest. A shipped plugin with no caller is dead weight in the binary and a
  lie in the manifest.

#### The shape

One function loses one branch:

- `openReadOnlyUrl` (`adapters/externalBrowser.ts:79-86`) becomes the web arm
  unconditionally — `openWebInNewTab(url)`. Its `isNative()` test, its dynamic
  `import("../native/externalBrowser")`, and its doc paragraph about the sheet
  all go.
- **Conditional on the probe** (§6.2): `openExternalUrl`'s already-dead native
  arm (`:59-62`) goes with it, `src/native/externalBrowser.ts` is deleted, and
  `@capacitor/browser` is removed from `app/package.json:38` and from
  `app/ios/App/CapApp-SPM/Package.swift:19,32`, followed by `pnpm install` and
  a Capacitor sync so the manifest regenerates.
- `adapters/externalBrowser.test.ts:80-89` — the "native: goes through the
  plugin wrapper" case — is deleted, not adjusted. It asserts a branch that no
  longer exists. The web case (`:66-78`) stays and becomes the whole contract.

### 5.3 What a rower actually loses by leaving — read from the code

The brief asked for this to be read rather than assumed. It was.

**On a warm return (the normal case: rower taps the back-to-Ergomatic chip, or
the app switcher):** the WebView is not unloaded when iOS opens Safari — the
Capacitor app is backgrounded, not navigated. React state, the route, and the
DOM survive. **The rower comes back to the same log row, still on screen.**

**One thing does re-run, and it is worth knowing about.**
`useConcept2Link` registers a `visibilitychange` listener and re-reads
`GET /api/concept2/link` every time the document becomes visible
(`app/src/api/useConcept2Link.ts:200-213`). Returning from Safari is a
foreground transition, so the link is re-read on arrival. If that read **fails**
— no network yet on wake is the reachable case — then:

- `Concept2SendBlock` renders `null` and the entire CONCEPT2 block disappears
  from the log row (`Concept2SendBlock.tsx:77-79`);
- `Concept2Card` renders the `COULDN'T READ` panel with a Retry
  (`Concept2Card.tsx:220-257`).

Both are recoverable in one tap and both are pre-existing behaviour, not
something PR B introduces. What PR B changes is how *often* the foreground
transition happens: leaving for Safari certainly backgrounds the app, whereas
whether a modal sheet over the WebView sets `document.hidden` is not something
this repo can observe. **INFERENCE**, and it is a named walk observation (§6.2,
W6) rather than an assertion.

**On a cold relaunch (iOS reclaimed the app while the rower was in Safari):**
`app/capacitor.config.ts` declares no `server` block, so the WebView boots from
the bundled `dist/client` at `/`, and `app/src/shell/AppRoutes.tsx:149` sends
`/` to `/today`. **The rower comes back to Today, not to the row.** What is
lost with it:

| state | where | survives a cold relaunch? |
| --- | --- | --- |
| the row itself, `SENT` status, `RESULT <id>` | server row's `c2_result_id`, re-derived at `Concept2SendBlock.tsx:84` | **yes** — re-fetched by `/api/logs/:id` (`FromTheLog.tsx:166`) |
| `ALREADY THERE`, `SEND FAILED`, `NO WEIGHT CLASS` panels | component `useState` (`Concept2SendBlock.tsx:30`) | **no** — transient by design; `duplicate` re-renders as `SENT` on the next mount because the route records the colliding id first |
| an unsaved reflection draft — notes, pain, thumbs, mid-edit | component `useState` (`FromTheLog.tsx:263-268`) | **no** |
| which screen the rower was on | `BrowserRouter` in-memory history | **no** — lands on Today |

**So the honest promise, and the sentence that replaces §4.1's on the design
page:** *nothing the rower has saved is lost by leaving, and the row is exactly
where they left it if iOS keeps the app alive. If iOS reclaims it, they come
back to Today and reach the row from the log in two taps; an unsaved reflection
draft would not survive that.* That last clause is not new to this change — it
is true of any interruption — but it is now on a path the app deliberately
sends the rower down, which is why it is written here instead of assumed.

**The no-weight flow specifically:** rower taps `OPEN CONCEPT2 PROFILE`, sets
their weight on Concept2, returns, taps `Send again`. The server re-reads the
class from Concept2 on that send (nothing is cached — the wave spec's
invariant), so a cold relaunch costs them the panel but not the repair: the row
is still in the log, still un-sent, and Send works from its detail screen.

---

## 6 · What can and cannot be gated

### 6.1 PR A — what can go red, and the two things that cannot

- **A new e2e suite for the row and the screen**, because nothing today
  measures either. The four row values, the absent row, the navigation into the
  screen and the BackLink out of it are all reachable in the existing
  `e2e/concept2.spec.ts` harness — it already drives a fake `/api/concept2/*`
  and signs in through the backdoor.
- **`openYou`'s sentinel is repaired first, in the same PR.** It asserts
  `page.locator(".diag-row")` is visible (`e2e/concept2.spec.ts:310`;
  `e2e/screenshots.spec.ts:6180` carries the twin). Under R7 a second row with
  that class turns both into strict-mode violations. **This is the seam gate
  RF24 asks for**: the change that creates the ambiguity fixes it, rather than
  filing it.
- **The mutations that must bite**, each with its failure recorded verbatim:
  - **R3.** Force `needsReauth` to `false` in the row's derivation. Expected:
    the `RECONNECT NEEDED` row case goes red and the other three stay green. If
    it does not bite, the row is not reading the field it claims to.
  - **R4.** Remove the retained-link condition so a failed read always draws
    the row. Expected: the "no row on a deployment with no Concept2, offline"
    case goes red. **Anchor the mutation on a unique string** (RF22's second
    half) — grep first and confirm one hit.
  - **R5.** Delete the `available:false` redirect on the screen. Expected: the
    "typed URL with the surface off returns to /you" case goes red.
  - **R2.** Wire `busy` into the row's state line. Expected: nothing goes red,
    **and that is the finding, not a pass** — it means the test suite cannot
    tell R2 is holding, so R2 is gated by the state table and the code review
    rather than by a test, and the PR says so instead of claiming a gate it
    does not have.
- **Captures.** The five You captures re-shot for the row and new screen
  captures added, **opened and looked at**, each described in the PR body from
  having opened it (RF7).
- **What cannot go red, said plainly:** the two-column landscape behaviour and
  the control heights are unchanged under R6, so `design.spec.ts`'s existing
  Concept2 cases stay green through this PR and prove nothing about it. They
  are kept because they protect the card; they are not counted as a gate on
  this change.

---

### 6.2 PR B — **not gateable by anything this repo owns. Say it plainly.**

Every instrument is blind to it, and each for its own reason:

- **Unit tests mock the adapter.** `Concept2SendBlock.test.tsx:104` does
  `vi.doMock("../adapters/externalBrowser", ...)`; the tests assert *that
  `openReadOnlyUrl` was called with a URL*, which stays true either way.
- **`src/native/**` is coverage-exempt** (`vitest.config.ts`), and
  `src/native/externalBrowser.ts:1-4` carries the `v8 ignore` block itself.
- **e2e runs the web arm.** `isNative()` is `false` under Playwright, so
  `app/e2e/concept2.spec.ts:483-508` — which genuinely drives the real
  `window.open` and reads the URL off the browsing context that appears —
  exercises the arm that **does not change**. It will stay green through this
  PR and through a mutation of it, and that is not evidence. It is kept because
  it protects the web arm; it is not counted as a gate on this change.
- **`pnpm dist:grep`** proves the absence of dev-only seams. It says nothing
  about which browser a shipped chunk opens.

**The only instrument that can answer this is a phone in a hand.** The walk is
the gate.

#### The device walk

**Precondition that makes a NO possible** — without it, every observation below
is decoration:

- **W0.** In **mobile Safari** (not the app), open `log.concept2.com` and
  confirm the rower is signed in. This is the discriminator: if Safari has no
  session, "opened signed in" cannot be distinguished from "opened in a sheet".
  Record that this was checked before the build was launched.

Then, on a build with the `isNative()` branch removed
(`pnpm ios:build`; note that this command stamps tracked files — say who
restores them):

- **W1.** Ergomatic → You → the Concept2 card reads `LINKED ✓`.
- **W2.** Open the log detail of a row already sent to Concept2. The CONCEPT2
  block reads `SENT` with `RESULT <id>`.
- **W3.** Tap **View on Concept2 →**. **Observe which app is now in front.**
  Safari shows a URL bar, a tab bar, and a `← Ergomatic` chip at the top left;
  the sheet shows a `Done` button at the top left and no tab bar.
  **NO is possible three ways:** the sheet appears anyway; nothing happens at
  all (WebKit dropped the `noopener` `window.open`); or a different app opens.
  **PASS = Safari.**
- **W4.** Read the page that loaded. **PASS = the actual result** — the row's
  own numbers. **FAIL = "The user has made this result private"**, which is the
  walk's original symptom and means the jar is still wrong.
- **W5.** Return to Ergomatic via the top-left chip. **Record what is on
  screen:** the log row still showing `SENT` / `RESULT <id>` (warm return), or
  Today (cold relaunch). Both are acceptable outcomes; the point is to record
  which one a real return produces, because §5.3 predicts the first and the
  design page will say so.
- **W6.** On that return, confirm the CONCEPT2 block is still rendered and has
  not been replaced by nothing (log row) or `COULDN'T READ` (You card) — the
  foreground re-read of §5.3. If it flickers, record it; it is a pre-existing
  behaviour this change makes more frequent.
- **W7 — the second call site, honestly scoped.** The no-weight refusal cannot
  be provoked at will on an account whose weight class Concept2 already knows.
  If it cannot be reached on the walk, **do not claim it walked.** It shares one
  function with W3 (`Concept2SendBlock.tsx:189` and `:245` both call
  `openReadOnlyUrl`) and that identity is an INFERENCE from a two-line read,
  recorded as one. If it *can* be reached, tap it and record whether the id-less
  `/profile` lands on the rower's own account now that Safari carries the
  session — which is the open question §4.2 leaves behind.

**If W3 fails:** the fallback is `@capacitor/app-launcher` (§3.4 — verify the
version at that moment), the `isNative()` branch is restored in the adapter with
a comment naming the WebKit behaviour that forced it, L6's dependency removal is
cancelled, and the walk is re-run from W1.

### 6.3 Sequencing inside PR B

The dependency removal is a **native build change** and cannot be validated by
the same build that validated the code change. So PR B carries two commits and
two walks:

1. Commit 1: delete the branch. **Walk W0-W7.** If it fails, stop — the PR
   becomes the fallback shape instead.
2. Commit 2 (only on a pass): delete `src/native/externalBrowser.ts`, delete
   `openExternalUrl`'s dead native arm, remove the dependency from
   `package.json` and the SPM manifest, `pnpm install`, Capacitor sync.
   **Re-walk W1-W4** on the rebuilt app to prove the binary still launches,
   still links, and still opens Safari with the plugin gone.

The merge gate is the walk on the **final** build. A walk of commit 1 says
nothing about commit 2's binary.

---

## 7 · Gates, and the order — spoken rather than left silent

**The order. REV 2 recommends the flip: PR B (the link-outs) ships first.**
REV 1's order came from a premise that ruling 3 removed — that the You change
was a small button-weight edit provable by one capture and one pin. It is now a
new route, a new screen, a redrawn discovery surface, ~14 stale design frames
and a Gate 0 that must be drawn and approved before a line is written. PR B is
a one-branch deletion that fixes a link which today shows a privacy page
instead of the rower's own row, and its gate is a walk James is doing anyway.
**Blocking a broken-link fix behind a design gate is backwards.** The ruling is
his; the spec states the reason so he can rule against it knowingly.

**They stay two PRs, and the row work is not bundled into PR B.** The grouping
rule's own test: a reviewer holding a platform-adapter deletion and a new
screen in one pass would be holding two unrelated risk models. The row and its
screen ship together as one PR, because a row pointing at nothing is not
shippable.

- **Antagonist, PR A: DELTA pass, and REV 2 un-skips it.** REV 1 skipped it as
  pure UI. That is no longer honest: PR A now invents a **state partition**
  (§5.1's table and R1/R2), a **new availability predicate** (R4) that changes
  what a rower sees on a failure path, and a **screen-versus-row asymmetry**
  (R5). RF27's own lesson is that a chunk inventing a new mechanism does not
  inherit a phase's vetted ground. The delta attacks R2's "unreachable" claims
  (the table's nine rows), R3's evidence that nothing else warns the rower, R4's
  trade, and the frame census — nothing else.
- **Antagonist, PR B: DELTA pass, unchanged from REV 1.** It rests on a WebKit
  navigation behaviour tagged INFERENCE in §3.4 and withdraws an approved
  behavioural claim (§4).
- **PM gate: RUN, once, on the spec slate — and REV 2 un-skips this too.** REV
  1 skipped both on the grounds that neither changed what a tester receives.
  PR A now changes **the shape and sequence of planned work** (the order flip)
  and **what a tester receives as a capability's front door**. One PM verdict on
  the slate — the order and PR A's scope — not a per-PR gate on either.
- **Fast path: NO, for both**, checked mechanically. PR A is four product files
  plus CSS plus a route plus a screen, and changes what a rower sees on an
  approved screen. PR B touches a platform adapter and removes a shipped
  dependency.

---

## 8 · Exit criteria

Each one falsifiable, each one checkable by someone who did not write it.

### PR A — the row and the screen

- **A1.** Gate 0 approved on the rendered artifact of §4.3 — the four row
  values, the absent row, the two-row foot in both content cases, the screen in
  every state, both orientations — before implementation starts. **Including
  the two rulings §5.1 hands the gate: the copy question (R6) and R4's trade.**
- **A2.** The state table of §5.1 is reproduced in the PR body, and every row
  marked "unreachable" is justified there by the same two mechanisms (flat
  routes; component-local attempt state) rather than by assertion.
- **A3.** `openYou`'s `.diag-row` sentinel is repaired in this PR
  (`e2e/concept2.spec.ts:310`, `e2e/screenshots.spec.ts:6180`), and the PR body
  states which form it took. Not filed as follow-on work.
- **A4.** The four mutations of §6.1 were run; each one's failure message is
  quoted verbatim, **including R2's, which is expected NOT to bite** — the PR
  says so rather than claiming a gate it does not have.
- **A5.** The five You captures re-shot and new screen captures added, each
  described in the PR body from having been opened.
- **A6.** `grep -n 'Concept2Card' app/src/You.tsx` returns nothing (R10 — it
  returns 2 on `2148f978`), and
  `grep -rn 'diag-row' app/src --include="*.tsx" | grep -v '\.test\.'` returns
  the count the PR body states (it returns 1 on `2148f978`).
- **A7.** Every stale claim corrected **in place**, never appended to:
  `You.tsx`'s mount comment (which carries James's position ruling),
  `Concept2Card.tsx:102-104` (I2 names You), `index.css`'s M-3 "single JSX
  site" comment, `design.spec.ts`'s Concept2 block header and its in-situ test.
  `docs/design/DEVIATIONS.md` gains no row and its line-241 row is unchanged.
- **A8.** The amendment page reconciled: the 12 in-situ frames the census
  script names are struck **on** the page, and the PR body re-runs the script
  and states its output.
- **A9.** Every contrast ratio and hit-target size on the row and the screen
  appears in the PR body as a number.
- **A10.** `pnpm lint` · `typecheck` · `format:check` · `test --project unit
  --project client` · `pnpm e2e` · `pnpm screenshots` all green — the layout of
  two screens changes, so captures are not optional here.

### PR B — the link-outs leave the app

- **B1.** The walk of §6.2 was run and its record committed, including **W0's
  precondition check**, a photograph or capture at **W3** showing which browser
  is in front, and the page at **W4**. `PASS` requires Safari at W3 and the
  actual result at W4.
- **B2.** `grep -n 'isNative' app/src/adapters/externalBrowser.ts` returns
  nothing — or, if the probe failed, returns exactly the fallback branch with a
  comment naming the WebKit behaviour that forced it and citing the walk that
  observed it.
- **B3.** On a probe pass: `grep -rn '@capacitor/browser' app/src app/package.json
  app/ios` returns nothing, `app/src/native/externalBrowser.ts` no longer
  exists, and the **rebuilt** app was re-walked (W1-W4) and still links and
  still opens Safari.
- **B4.** The amendment page's withdrawn sentence (§4.1) is struck **on the
  page**, and the three code comments in §4.2 are corrected in place. A grep for
  `SFSafariViewController` across `app/src` returns only lines that record a
  retirement — today it returns five source files
  (`grep -rln SFSafariViewController app/src`, 2026-09-04); the PR body states
  the new count and accounts for every survivor.
- **B5.** The PR body states, in its own words, that **no CI gate on this repo
  can go red on this change**, names `app/e2e/concept2.spec.ts:483-508` as the
  test that stays green while proving nothing about it, and names the walk as
  the only evidence. A claim of "gated" on this PR is a false claim.
- **B6.** `pnpm lint` · `typecheck` · `format:check` · `test --project unit
  --project client` · `pnpm e2e` all green (the diff touches `app/src/`), and
  `pnpm screenshots` is **not** run for PR B — no screen's layout changes, and
  captures are not taken for wording-only or mechanism-only diffs.

---

## 9 · Contradictions with the brief, recorded

The brief is not automatically right, and five of its claims did not survive
reading the code.

1. **The card draws eleven states, not ten — and can render three more.** The
   brief lists ten. `app/e2e/design.spec.ts`'s Concept2 block and
   `you/Concept2Card.tsx:286-315` both say **eleven drawn frames** (1a, 1b, 1c,
   1d, 1e, 1f, 1f-b, 1f-c, 1g, 1i, 1j), plus 1h which draws nothing. The brief's
   list also merges 1f-b and 1f-c into "the two-panel reauth variants" and omits
   1g (update required while unlinked) entirely. Three further combinations the
   page never drew are reachable in the component: **armed while needing
   re-auth**, **a refused unlink on a reauth card** (both because
   `link.linked && …` gates the Unlink control unconditionally at
   `Concept2Card.tsx:500-523` and `:411`), and **a RECONNECT in flight**, which
   draws no panel at all because `!link.linked && opening` gates the OPENING
   panel (`:429`). §5.1's table works from fifteen rows.
2. **The Gate 0 page has 54 frames, 24 of which draw the card, and exactly half
   of those are in a You column — not "twenty frames, most of which".** Measured
   with the script in §5.1 against `2148f978`: `54 24 12 12`. Two more frames
   draw You without the card. The correction matters because it halves the
   reconciliation the brief implies and doubles the number of card-only frames
   that survive unchanged.
3. **"Both surfaces render nothing when the server says unavailable" is true of
   `available: false` and false of a failed read.**
   `Concept2Card.tsx:220` branches on `failed` **before** the availability check
   at `:259`, so an offline You visit draws a CONCEPT2 error panel on every
   deployment and for every account, including the ones with no Concept2. It is
   a live defect, `docs/screenshots/you-concept2-read-failed.png` is a picture
   of it, and R4 is the smallest fix that closes it. It needed naming because
   the brief's question ("say whether the ROW disappears entirely") has a
   different answer for the two cases.
4. **The brief calls the Unlink work "PR B"; the spec it is revising calls it
   PR A.** REV 1 §2 ruling 4 and §5.1 both name the Unlink change PR A and the
   link-outs PR B, and the ruling was "the Unlink weight first". REV 2 keeps
   the letters attached to the work rather than the order, so PR A is still the
   You surface — and §7 recommends it ships **second**.
5. **`.button-l4` and the log detail's delete trigger are one tier, not two,
   and neither is quieter.** Carried forward from REV 1 unchanged, because it
   is still true: `FromTheLog.tsx:582` renders `button-l4 log-delete-trigger`,
   `.log-delete-trigger` supplies margin only, and `.button-l4` matches
   `.c2-card-danger` on every axis that carries loudness. What is superseded is
   what REV 1 concluded from it (swap to `.button-outline`); REV 2 changes no
   tier at all.

---

## 10 · Out of scope, named

- **Auto-upload.** Still the named follow-on phase; nothing here touches it.
- **The OAuth consent hop.** Stays `ASWebAuthenticationSession` on native
  (L4). Nothing in this spec is an argument for moving it, and RFC 8252 §8.12
  is an argument against.
- **Widening the Concept2 cohort.** `C2_ALLOWED_EMAILS` still gates the surface
  (`docs/superpowers/specs/2026-09-04-concept2-per-user-gate.md`); widening is a
  separate decision made on separate evidence.
- **Which Concept2 page carries the weight-class field.** Still PROVISIONAL
  (`concept2Send.ts:103-105`); one logged-in glance settles it, and W7 is the
  chance to take that glance — but the constant does not move in this spec.
- **A ROADMAP row.** This spec's dispatch was spec-only, so no ROADMAP edit was
  made. The two PRs take their rows in the Wave E block when the first one
  opens; that is owed and is recorded here so it is not lost.
- **Widening the row into a menu.** `/you/concept2` is a leaf. If a second
  Concept2 tool ever exists, the row becomes a menu the way DIAGNOSTICS did;
  nothing here is designed for that and nothing here forecloses it.
- **Lifting attempt state above the route.** §5.1's partition depends on
  `outcome`/`busy`/`armed`/`unlinkFailed` staying inside `Concept2Card`. A
  future context or store that hoisted them would make the row able to show
  attempt state, and would need R2 re-argued rather than silently broken.
