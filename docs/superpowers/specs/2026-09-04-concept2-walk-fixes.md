# Wave E walk fallout — the link-outs leave the app, and Unlink stops shouting

**Date:** 2026-09-04 · **Status:** REV 1, for Gate 0
**Wave:** E (ROADMAP "Wave E — The Concept2 logbook", opened 2026-08-31).
Fallout from the first real walk of the shipped surface, not a new phase.
**Risk class:** NOT TRIAD. No stored shape, no number's meaning, no auth —
PR B removes a platform branch and PR A repaints one control. Gate skips are
spoken in §7 rather than left silent.
**Predecessors:** `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`
(the wave), `docs/superpowers/specs/2026-09-04-concept2-per-user-gate.md`
(the cohort gate this walk ran behind).

---

## 1 · What and why

The Concept2 surface shipped in #290 (`2f258006`) and #293 (`3d0e2612`) turned
it on for one account. James walked it on his phone on 2026-09-03: he linked a
real Concept2 account, sent a real row, and Concept2's logbook showed the
workout's own end time — which is the thing the close-stamp work existed for.
The feature works.

Two things about it are wrong, and both are about what happens when the rower
taps a link that leads to Concept2.

**First, the link-outs open in an in-app sheet that is signed out.** Tapping
"View on Concept2 →" on a row we just sent does not show the row. It shows
Concept2's "The user has made this result private" page, because the sheet
carries its own cookie jar and the rower's Concept2 session is in Safari. The
fix James ruled is to leave the app properly: open these links in the phone's
default browser, where the rower is already signed in. His words: _"opening in
safari is fine because it will be clear you're changing apps."_

**Second, the Unlink button on the linked card is too loud.** It is the only
control on a healthy linked card, and it is drawn as the heaviest thing there —
full width, accent-outlined, 52px, taller than the card's own primary action in
every state that renders one. A rower whose account is linked and working should
not be looking at a disconnect button as the loudest element on the card.

They ship as two PRs, **the Unlink weight first**, because it can be proven by
capture and an e2e pin while the link-out change cannot be proven by CI at all
and needs a device in a hand.

---

## 2 · Decisions already made (James, walk of 2026-09-03, recorded 2026-09-04)

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
3. **The Unlink button gets a quieter treatment.**
4. **Two PRs, the Unlink weight first.**

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

- **PR A:** the linked card at rest, redrawn, beside today's `you-concept2-
  linked.png`; and the armed card, unchanged, beside it — so the escalation
  from rest to armed is visible as a pair. Portrait and landscape. Numbers in
  §5.1.
- **PR B:** no frame changes, so the artifact is the **withdrawal**: §4.1's
  sentence struck on the amendment page and replaced by what §5.3 can honestly
  promise, plus the three corrected code comments quoted in the Gate 0 note.
  Presenting it is the gate; the gate is the approval, not the presentation.

---

## 5 · The design

### 5.1 PR A — the Unlink control stops being the loudest thing on the card

#### What is actually there today, measured

Read from `app/src/index.css` and `app/src/theme/tokens.css` on 2026-09-04;
ratios computed, not judged (`#fffdf7` surface throughout):

| control | class | min-height | width | border / label | contrast |
| --- | --- | --- | --- | --- | --- |
| Unlink, at rest | `.c2-card-danger` (index.css:10420) | 52px | full (parent `.c2-card-act` is `flex-direction: column`, index.css) | `--accent` `#b5341f` on transparent | 5.94:1 |
| Unlink, armed | `+ .c2-card-danger-armed` (index.css:10431) | 52px (inherited) | full | `--on-color` on `--accent` fill | 5.94:1 |
| Connect / Reconnect | `.c2-card-primary` (index.css:10341) | **48px** | full | `--on-color` on `--ink` fill | 17.11:1 |
| Retry | `.c2-card-retry` (index.css:10404) | 52px | full | `--ink` on transparent | 17.11:1 |
| Sign out (same screen, card above) | `.button-outline` (index.css:162) | **44px** | content (`display: inline-flex`, `padding: 0 16px`) | `--ink` on transparent | 17.11:1 |

So the complaint is exact: at rest, Unlink is **4px taller than the card's
primary action**, full width, and the only accent-coloured element on the card.

#### The brief's proposed tier does not deliver "quieter" — measured

The brief says `.button-l4` and the log detail's own delete trigger are the
house quiet destructive treatment. **They are the same control, and it is not
quieter.** `app/src/log/FromTheLog.tsx:582` renders
`className="button-l4 log-delete-trigger"`, and `.log-delete-trigger`
(index.css:2719) sets `margin: 24px 0 0` **and nothing else** — its own comment
says so: _"no new interactive rule needed, only this spacing"_. The tier itself
(`.button-l4`, index.css:344-353) is `min-height: 52px`, `border: 1px solid
var(--accent)`, `color: var(--accent)`, `font-size: 16px`, `width: 100%` (from
the shared base at index.css:229-242).

Against `.c2-card-danger` that is **identical in every dimension that carries
loudness** — same height, same width behaviour, same accent border, same accent
label, same size and weight. The only differences are `border-radius`
(`var(--radius)` vs `0`) and a `--surface` fill against a transparent one over
the same `--surface` card. Swapping to `.button-l4` would change the corner
radius and nothing a rower would call volume. This is recorded as a
contradiction with the brief in §9.

#### The invariants (what must be true)

- **U1 — rest is not the peak.** On a linked card the rest-state Unlink is
  never the visually heaviest control on that card, and never taller or wider
  than the card's primary action in any state that renders one.
- **U2 — arming escalates.** The armed state is at least as prominent as the
  rest state, and visibly distinct from it. A destructive confirm may shout;
  a destructive *offer* may not.
- **U3 — the floors hold in every state.** Every state of the control clears
  44×44 px, and every text/background pairing clears 4.5:1, with the ratio
  stated as a number.
- **U4 — no fourth tier.** The rest state's values are an existing tier's
  values, named by that tier's class, plus at most a positional rule. The
  precedent is `.log-delete-trigger` itself: spacing only, no new interactive
  rule.
- **U5 — the accent census does not grow.** Whatever is chosen, `--accent`
  gains no new meaning. The DEVIATIONS row for `.c2-send-linkout`
  (`docs/design/DEVIATIONS.md:241`) is untouched and no second row is minted.

#### The recommendation Gate 0 rules on

**Rest becomes `.button-outline`; armed stays exactly as it is.**

- Rest: `.button-outline` — 44px, `--ink` on `--surface` at **17.11:1**,
  content-width, ink border. It is the tier the **same screen** already uses
  for **Sign out**, one card above (`app/src/You.tsx:68`) — the nearest sibling
  action there is: revoking an authorisation the rower granted. Reusing it
  makes the two reads as one family instead of two.
- Armed: unchanged `.c2-card-danger c2-card-danger-armed` — 52px, `--on-color`
  on `--accent` at **5.94:1**, full width. The escalation from a 44px ink
  outline to a 52px full-width accent fill is now legible as an escalation,
  which it currently is not (52 → 52, accent → accent).
- One positional rule is needed and only one: `.c2-card-act` is a flex column
  whose items stretch, so an `inline-flex` button still fills the width unless
  it is given `align-self: flex-start`. That single declaration is the whole
  CSS addition, and it is `.log-delete-trigger`'s own shape.
- **Consequence worth naming:** the linked card at rest then paints no
  `--accent` at all. U5 is satisfied by subtraction rather than by argument.

**The alternative, if Gate 0 prefers one class over two:** keep the
`.c2-card-danger` name and restyle its *rest* rule to `.button-outline`'s
values, moving `min-height: 52px` onto `.c2-card-danger-armed` so the armed
state keeps its height. Same rendered result, one class instead of two, at the
cost of a tier that exists only here. The recommendation is the first, because
U4 asks for an existing tier by name and this is that tier.

**What it costs elsewhere, checked:**

- **The e2e height pin does not move.** `app/e2e/design.spec.ts:10505` pins
  `["c2-card-armed.html", ".c2-card-danger", 52]`, and that fixture
  (`app/e2e/fixtures/c2-card-armed.html:13`) carries `c2-card-danger
  c2-card-danger-armed` — the **armed** state, which this design leaves at 52.
  The existing row stays green *without being retuned*, which is the point:
  the change is invisible to it. **A gate that cannot go red on your change is
  not evidence about your change** — so PR A owes a *new* rest-state pin
  (§6.1), or it ships a redraw with no gate at all.
- **A census comment goes stale and must be corrected, not appended to.**
  `app/e2e/design.spec.ts:10480-10484` transcribes the amendment page's own
  inline styles: _"all seven LIVE in-card outline buttons carry `min-height:
  52px`, `.btn-primary` is 48px and `.btn-danger` is 52px."_ After the redraw
  the page's rest-state `.btn-danger` is no longer 52px. Measured on the page
  today: `grep -c 'class="btn-danger">'` → **12** rest instances,
  `grep -c 'class="btn-danger armed">'` → **2** armed. The original board
  (`Concept2 connect.dc.html`) contains **0** `btn-danger` and is unaffected.
- **`.c2-card-danger`'s own comment** (index.css:10415-10419) claims accent's
  "third canonical job, a destructive control". Still true of the armed state;
  no longer true of the rest state. Correct it in the same commit.
- **Captures:** `docs/screenshots/you-concept2-linked.png`,
  `you-concept2-armed.png` and `you-concept2-landscape.png` all render this
  control and all three are re-captured.

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

### 6.1 PR A — provable, and it must be made provable

- **Capture.** `docs/screenshots/you-concept2-linked.png`,
  `you-concept2-armed.png`, `you-concept2-landscape.png` re-captured and
  **opened and looked at**, with the rest and armed frames described in the PR
  body as a pair.
- **A NEW e2e pin, because the existing one cannot go red.** §5.1 established
  that `design.spec.ts:10505` measures the *armed* fixture, which this change
  leaves at 52px. PR A therefore adds a rest-state fixture
  (`app/e2e/fixtures/c2-card-linked.html` — none exists today; the fixture
  directory carries `c2-card-armed`, `c2-card-read-failed`,
  `c2-card-unlinked`, `c2-card-update-required` and no linked-at-rest frame)
  and a row in the same control-height table.
- **Independent literals, never the production symbol.** The expected heights
  are written as `44` and `52` in the test, transcribed from the redrawn
  amendment page — not read back off `index.css`, so retuning the CSS cannot
  retune the test with it.
- **The mutation that must bite:** revert the rest-state rule to
  `min-height: 52px` with the accent border. Expected: the new rest row goes
  red, the armed row stays green. Record what the failure said. If the mutation
  does not redden the new row, the row is measuring the wrong element — the
  known trap on this exact table.

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

## 7 · Gates that are being skipped, and why

Spoken rather than left silent, per the standing rule.

- **Antagonist, PR A: SKIP.** Inherits Wave E's vetted ground; it invents no
  mechanism, touches no wire semantics, changes no number's meaning, and moves
  one control's height and colour. Pure UI.
- **Antagonist, PR B: DELTA pass, and it is not optional.** The wave's anchor
  pass never saw this ground: PR B removes a platform branch and rests on a
  WebKit/Capacitor navigation behaviour that is tagged INFERENCE in §3.4, and
  it withdraws an approved behavioural claim (§4). The delta attacks §3.4's
  inference, §5.3's return analysis, and the walk's ability to produce a NO —
  nothing else.
- **PM gate: SKIP for both.** Neither changes what the app does as a
  capability, what a tester receives, or the shape of planned work. PR A is
  styling; PR B changes which browser a link opens. Wave E's own open/close PM
  bookends are unaffected.
- **Fast path: NO, for both**, checked mechanically rather than by feel. PR A
  is one product file plus CSS plus a fixture and would qualify on the file
  count — but it changes what a rower sees on an approved screen, so it takes
  the design gate, and a change taking Gate 0 is not saving a cycle by skipping
  review. PR B touches a platform adapter and removes a shipped dependency,
  whose failure mode is a dead button on a device — not cosmetic, not test-only.

---

## 8 · Exit criteria

Each one falsifiable, each one checkable by someone who did not write it.

### PR A — the Unlink weight

- **A1.** Gate 0 approved on the rendered pair (rest and armed, both
  orientations, against today's captures) before implementation starts.
- **A2.** `docs/screenshots/you-concept2-linked.png`, `you-concept2-armed.png`
  and `you-concept2-landscape.png` re-captured; the PR body describes what is
  in each frame, from having opened them.
- **A3.** A rest-state fixture exists and `app/e2e/design.spec.ts`'s
  control-height table carries a row for it with an independent literal; the
  existing armed row is unchanged and green.
- **A4.** The mutation in §6.1 reddens the new row and only the new row, and
  the PR records the failure message verbatim.
- **A5.** `grep -n 'c2-card-danger' app/src/index.css app/src/you/Concept2Card.tsx`
  and a grep for the chosen rest-state tier both return a count the PR body
  states, and no class exists in `index.css` that did not exist before except
  at most one positional rule.
- **A6.** The stale census at `app/e2e/design.spec.ts:10480-10484` and the stale
  claim at `app/src/index.css:10415-10419` are **corrected in place**, not
  appended to. `docs/design/DEVIATIONS.md` gains no row and its existing
  Concept2 row is unchanged.
- **A7.** Every state's contrast ratio and hit-target size appear in the PR body
  as numbers.

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

The brief is not automatically right, and two of its claims did not survive
reading the code.

1. **`.button-l4` is not a quieter tier than `.c2-card-danger`.** The brief
   names it, and the log detail's delete trigger, as "the house quiet
   destructive treatment". Measured (§5.1): `.button-l4` is 52px, full width,
   `--accent` border, `--accent` label, 16px/600 — the same on every axis that
   carries loudness as the control it would replace, differing only in corner
   radius. And the log detail's delete trigger **is** `.button-l4`
   (`FromTheLog.tsx:582`), with `.log-delete-trigger` supplying margin and
   nothing else, so the two named references are one tier, not two. Adopting it
   would satisfy the letter of "reuse a tier" and none of the intent. §5.1
   proposes `.button-outline` instead, with the numbers.
2. **"All three link-outs" is three rendered states across two call sites**, not
   three call sites. `openReadOnlyUrl` is called at
   `Concept2SendBlock.tsx:189` (the result link, drawn for both `sent` and
   `duplicate`) and `:245` (the no-weight profile link). Nothing else in
   `app/src` calls it. The ruling is unaffected — all three states change
   together because they share a function — but a plan that goes looking for a
   third call site will not find one.
3. **The brief names one falsified design sentence; there are four.** §4.2 adds
   three behavioural claims in shipped code, one of which
   (`concept2Send.ts:96-101`) has its premise **inverted** by this change while
   its conclusion survives. That is the one worth a reviewer's attention: it is
   the justification for a URL constant, and "the reason changed but the answer
   didn't" is exactly the shape that gets quietly left alone.

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
