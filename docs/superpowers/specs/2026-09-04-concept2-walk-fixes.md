# Wave E walk fallout — the link-outs leave the app, and Concept2 becomes a row

**Date:** 2026-09-04 · **Status:** REV 3, for Gate 0
**Wave:** E (ROADMAP "Wave E — The Concept2 logbook", opened 2026-08-31).
Fallout from the first real walk of the shipped surface, not a new phase.
**Risk class: MIXED, and REV 3 is where that changes.** PR B (the link-outs)
and PR A (the row and the screen) are NOT TRIAD — no stored shape, no number's
meaning, no auth. **PR C is TRIAD on all three counts that matter to it**: it
is about what a stored number MEANS, which of two stored numbers is
authoritative, and what we send to a third party as a claim about a rowing
session. It gets the full treatment and it does not ride either of the others.
Gate skips are spoken in §7 rather than left silent.
**Predecessors:** `docs/superpowers/specs/2026-08-31-concept2-logbook-design.md`
(the wave), `docs/superpowers/specs/2026-09-04-concept2-per-user-gate.md`
(the cohort gate this walk ran behind).
**What REV 3 changed, and why there are now three pieces of work:**

1. **A third piece exists.** James walked the shipped surface again on
   2026-09-04 and Concept2 refused the verification code for a real row.
   §3.8 carries the measurement and §5.4 carries the question it opens. It is
   the largest of the three and it is the one ROADMAP calls the whole point of
   the phase.
2. **The order is ruled** (James, 2026-09-04): **PR B, then PR A, then PR C.**
   §2 ruling 4 records it in his words. REV 2 left the B-before-A order as a
   recommendation for the gate to rule; it is ruled now, and PR C goes last.
3. **A delta antagonist pass on REV 2 returned thirteen findings and two of
   them are blocking-shaped.** Both are ruled in §2 (rulings 5 and 6) and
   folded where they were argued rather than appended: §5.1's fifteen-frame
   table is REPLACED by a decision table over the two inputs the row actually
   reads, and R4's per-mount predicate is replaced by a persisted flag with
   the RF27 lifetime table it always owed.

REV 1 proposed re-tiering the Unlink button; James chose a different shape on
2026-09-04 — the whole card becomes a row, the way Diagnostics already works.
The measurement that killed `.button-l4` is kept and its conclusion is
superseded, not appended to. The link-out half (§3.1-§3.6, §4.1, §4.2, §5.2,
§5.3, §6.2, §6.3) is unchanged from REV 1 except where §3.4 gained a
counter-claim from our own tree (§3.4's last paragraph).

---

## 1 · What and why

The Concept2 surface shipped in #290 (`2f258006`) and #293 (`3d0e2612`) turned
it on for one account. James walked it on his phone on 2026-09-03: he linked a
real Concept2 account, sent a real row, and Concept2's logbook showed the
workout's own end time — which is the thing the close-stamp work existed for.
The feature works.

**And then he walked it again on 2026-09-04, and Concept2 refused to verify a
row it had accepted.** That is the third thing, it is the largest, and it is
the one the phase exists for.

Three things about it are wrong.

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

**Third, a verification code cannot validate, and that is the whole point of
the phase.** A row sent to Concept2 carries the PM5's own verification code so
Concept2 can mark it machine-confirmed. On 2026-09-04 James entered a code that
matched the monitor exactly and Concept2 refused it: _"This workout cannot be
verified. Please check your date, time and distance exactly match the monitor."_
The distance is where they disagree. **We send the sum of our own intervals; the
monitor's own summary reports a different total; Concept2 checks against the
monitor.** §3.8 carries the three measurements; §5.4 states the question, which
is which of the two numbers is authoritative and why — not a fix.

**They ship as three PRs, in the order James ruled: PR B, then PR A, then
PR C** (§2 ruling 4). PR B fixes a link that today shows a privacy page instead
of the rower's own row, and its gate is a walk that is happening anyway. PR A
is a new route, a new screen and a redrawn discovery surface, so it waits behind
its own Gate 0. PR C is the verification question, and it goes last because the
other two are the quicker fixes.

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
4. **Three PRs, and the order is RULED: PR B, then PR A, then PR C.** James,
   2026-09-04, on being shown the three-piece slate: **the verification defect
   goes LAST, because the other two are the quicker fixes.** The link-out order
   was ruled earlier the same day and stands: PR B first, because it repairs
   something a rower sees today and its gate is a walk that is happening
   anyway, while the row and screen need a design gate before a line is
   written. This supersedes REV 1's "the Unlink weight first" and REV 2's
   "the order is James's to rule at Gate 0" — both are withdrawn, not kept
   alongside. **The spec does not re-derive this order from risk or size.**
   §7 records it as a ruling rather than a recommendation, and §5.4 states
   what PR C blocks so the cost of it going last is visible rather than
   implied.
5. **On the row, `RECONNECT NEEDED` beats `COULDN'T READ`.** Ruled 2026-09-04
   after the delta antagonist pass proved REV 2's R4 silently overrode its own
   R3 (§5.1, finding F1). A retained link carrying `needsReauth: true` is a
   retained AVAILABLE link, so REV 2's rule would have replaced the sticky,
   server-set, rower-actionable warning with a transient one on any failed
   re-read — and §5.3 names waking with no network as reachable, and says PR B
   makes foreground re-reads MORE frequent. `needsReauth` is server-sticky and
   **a read that FAILED cannot have resolved it**: the server clears
   `needsReauthAt` only on a successful relink
   (`server/routes/concept2.ts:459-462`, its own comment: _"Clears any
   previously-set needsReauthAt … a successful relink IS the recovery"_). The
   row keeps saying `RECONNECT NEEDED`; the screen keeps its read-failed panel
   and its Retry.
6. **"This account has been told Concept2 is available" is a PERSISTED fact,
   not a per-mount one.** Ruled 2026-09-04, same pass (finding F2). REV 2
   expressed it as `link !== null && link.available` and claimed it needed
   "no new ref, no new lifetime, and nothing for RF27 to tabulate". That claim
   is the defect: `link` and `failed` are `useState` inside the hook
   (`api/useConcept2Link.ts:159-160`), routes are flat and mutually exclusive
   (`shell/AppRoutes.tsx:241-261`), so **You unmounts on every trip to the
   screen and back and every visit is a first-ever read**. Under REV 2's rule a
   cohort rower whose read fails gets no row, therefore no door, therefore no
   Retry — strictly worse than today's card, which at least draws a panel with
   a Retry in it. §5.1 promotes the fact to a lifetime that matches it and
   carries the RF27 table, including the clear on sign-out without which the
   next account on the device inherits a cohort claim.

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

**AND OUR OWN TREE CARRIES A COUNTER-CLAIM, named here rather than left for a
reviewer to find.** The doc comment on the very function this PR edits asserts
the opposite outcome for the neighbouring case, verbatim
(`app/src/adapters/externalBrowser.ts:75-77`):

> _"This is also why callers render a `<button>` rather than an `<a href>`:
> inside the Capacitor WebView a plain anchor drives the WebView **ITSELF** to
> concept2.com, with no way back."_

Both cannot be right. Either that sentence is testimony nobody measured — it
carries no evidence and a grep of this tree finds none — or `decidePolicyFor`
does not fire on the path it describes, in which case §3.4's inference is
weaker than it reads. **It is recorded as a live counter-claim, not as
history**, and W3's NO cases (§6.2) now include the outcome it predicts: the
WebView itself navigates to concept2.com with no way back. That was not one of
W3's three listed NOs in REV 2, which is how a prediction our own code makes
could have gone unobserved on the walk that exists to settle it.

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
  while the rower is not looking. §5.1's DECISION TABLE — the row's value over
  `failed` crossed with `link`'s five shapes — is the whole of that argument.
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

### 3.8 The verification failure — what was measured, and which two numbers exist

**PRIMARY, measured by James on hardware, 2026-09-04**, and filed at ROADMAP's
queued register in commit `c2e7f76a`. The evidence is carried here rather than
pointed at, because a spec that cites a register cannot be read without it.

Three artefacts in one sitting, on the program `v12:30/3:00r...3`:

- **PM5 View Detail, Sep 04 2026.** The total row reads **25:00.0 / 5706 m**.
  Its own interval rows read 2837 + 1953 + 918 = **5708 m**; its rest rows read
  357 + 168 + 0 = 525 m over 3:00 + 2:00 = 5:00. **The monitor's own total
  disagrees with the sum of its own intervals by 2 m.**
- **What we sent:** work **5,708** m / 25:00.0, rest 525 m / 5:00 — so
  Concept2's overall for the row reads **6,233 m** where the monitor's own
  overall is 5706 + 525 = **6,231 m**.
- **What Concept2 said.** On entering the code `D9BD-F964-32E2-7F18` — which
  matches the monitor's own display and ours exactly — Concept2 refused it:
  _"This workout cannot be verified. Please check your date, time and distance
  exactly match the monitor."_ The code was right. The distance was not.

**PRIMARY, our own tree: the two candidate numbers BOTH already exist, on the
same stored row, and the send picks one of them.**

- **Ours.** `monitorRun.ts`'s `computeWorkRestSums` is
  `const workMeters = actuals.reduce((sum, a) => sum + a.distanceMeters, 0)`
  (`app/src/monitor/monitorRun.ts:952`) — a reduce over the interval actuals
  the driver assembled from 0x0037/0x0038. `LogSession.tsx:2269` posts it as
  `workMeters: monitorRun.workMeters`, and `server/concept2/mapping.ts:492`
  sends it to Concept2 as `distance: workMeters`.
- **The machine's.** The same posted row ALSO carries
  `machineWorkMeters: Math.round(monitorRun.summaryTotals.workDistanceMeters)`
  (`LogSession.tsx:2279-2281`), and `summaryTotals.workDistanceMeters` is
  0x0039's own `meters` field verbatim (`src/monitor/driver.ts:4371`, `:4613`).
- **They come from the same burst as the verification code.**
  `summaryTotals` and `verificationBytes` are written by one call of one writer,
  `appendSummaryObservations` (`monitorRun.ts:1395-1398`), and
  `verificationBytes` is 0x003F's raw hash from that same burst
  (`monitorRun.ts:280-286`). **So the number Concept2's code was minted
  alongside is on the row, and it is not the number we send.** INFERENCE, and
  the strongest one in this section: that Concept2 validates the code against
  the piece the monitor logged, and therefore against the monitor's own
  distance. §5.4 says what would settle it.

**PRIMARY, the wire fact, and it is settled rather than open.** 0x0039's
Distance is a whole-workout, work-only cumulative total —
`docs/monitor/pm5-interface-notes.md` §27.1, verbatim: _"Both §23 premises
therefore hold: 0x0039 is a whole-workout cumulative total, and it counts work
only."_ Measured on `walk-2026-08-25/rests-finished-recording.jsonl.gz`: 935 m
against three intervals summing to 935 m, over a program carrying 120 s of
programmed rest it excludes entirely. **So the two candidates are the same
QUANTITY measured two ways** — which is what makes "which is authoritative" a
real question rather than a units mistake.

**PRIMARY, and this is the part that explains why nothing caught it: we already
own the comparison, it already records a disagreement, and nothing downstream
reads its answer.** `app/src/monitor/oracleCorpusReplay.test.ts`'s RC-9(b)
block compares 0x0039's own totals against the sum of the actuals the driver
recorded, over **five** committed captures — counted 2026-09-04 with
`awk 'NR>=658' src/monitor/oracleCorpusReplay.test.ts | grep -c '^  it('` →
`5`. **Three agree on distance to the metre** (`rests-finished` 935/935,
`boundaries-terminated` 500/500, `keystone` 500/500). **One is an asymmetry
rather than a disagreement:** `smoke-terminated` asserts the machine's
31.5 s / 110 m against our `0`, because a terminate inside interval 1 means no
boundary ever reached us — a different failure with a different cause.
**And one genuinely diverges:** the `rest-boundary` case asserts
`machine.meters` is `198` and `ours.meters` is `197`, with
`expect(Math.abs(machine.meters - ours.meters)).toBeLessThanOrEqual(1)`
— its own test title calls it _"the corpus's widest 0x0039 gap"_. The
divergence class James hit at 2 m is therefore **already visible in our corpus
at 1 m, already asserted, and already tolerated**, because RC-9(b) exists to
characterise the two oracles and has no consumer: nothing on the send path
reads `machineWorkMeters`, and `isSendable`/`buildC2Payload` never see it
(`src/log/concept2Send.ts:12-20`, `server/concept2/mapping.ts:448-455` and `:492`).

**PRIMARY, and it answers "would a Just Row row verify?" with a mechanism
rather than a coincidence.** A free row's totals are not a second
accumulator that happens to agree — `justrow/totals.ts`'s `freeRowTotals`
**reads the machine's summary first**, verbatim: _"FIRST the machine's own
0x0039 (`summaryTotals`)"_ — it returns
`run.summaryTotals.workElapsedSeconds` and
`run.summaryTotals.workDistanceMeters` directly (`totals.ts:38-43`), and
`JustRowLog.tsx:302-303` posts that pair as `workSeconds`/`workMeters`. **So a
Just Row send already posts the monitor's own number**, by construction — not
a second accumulator that happens to land on the same figure.
**A single-interval workout is the weaker half of this and is tagged
accordingly: INFERENCE.** Its send posts a one-element reduce against a
one-boundary summary, so a divergence has one place to come from rather than
three — likelier to agree, not guaranteed to. §5.4's question 3 settles it by
observation rather than by this paragraph.
That is a mechanism for the miss rather than a guess at one: the path that
CANNOT exhibit the defect is the path this feature was most walked on.

**Nothing found — and the scope of that search is stated, because an
under-scoped negative reads as a settled one.** Nothing in this repo states
what the verification code is checked against, what tolerance (if any) the
distance comparison allows, or whether the check is against the logbook's
`distance` field or against something the code itself encodes. **No search of
Concept2's own developer documentation was made in this pass**, so this is a
recorded GAP rather than a negative result about the vendor. §5.4's question 1
is that search, and it is the first thing PR C does.

---

## 4 · What these changes falsify, and the Gate 0 they therefore owe

**PR A and PR B both need a Gate 0 amendment, even though PR B moves no
pixel.** A behavioural sentence on an approved design page is an approved
claim, and this change makes it false. **PR C's gate is its own** and is stated
as exit criterion C5 rather than here: nothing in §5.4 changes a pixel, but a
number a rower reads is a design question too, so if the fix moves a displayed
figure the before and after go side by side.

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
  - **You with no row at all, drawn TWICE**, because after ruling 6 the
    silence has two causes and they are not the same product statement: the
    surface is unavailable (decision table rows 3 and 4), and this account has
    never had a successful read (row 2a). Both beside today's capture, so the
    silence is approved rather than assumed — and row 2b, the `seen` account
    whose read failed, is a THIRD frame that must be drawn beside them or the
    trade R4 makes cannot be seen.
  - **The two rows together at the foot of You** — CONCEPT2 and DIAGNOSTICS —
    in both the short-content case (space above the group) and the
    tall-content case (no space left). This adjacency has never been drawn and
    it is what R7 exists to protect.
  - **The screen**, portrait and landscape, in every state §5.1 assigns to it.
    The amendment page already draws eleven of them as cards; what is new is
    the chrome around them (BackLink, title, and whatever the head becomes)
    and the three combinations the page never drew (§5.1's screen-frames table,
    rows 13, 14 and 15).
  - **The copy question, drawn rather than described.** The screen's frame
    contains the word Concept2 twice — once as the screen's own title and once
    as the card's `<h2>CONCEPT2</h2>` head (`you/Concept2Card.tsx:318-327`).
    Gate 0 rules on which survives; §5.1 states the measured cost of each
    answer, because one of them spends invariant R6.
  - **THE SECOND COPY QUESTION, and it is about a string that already ships.**
    `Concept2SendBlock.tsx:211` renders _"Concept2 stopped accepting this link.
    Reconnect on the You tab."_ — approved copy, drawn verbatim on the
    amendment page at `:2377`. After PR A the You tab carries a mono row and
    **no Connect control**; Reconnect is one tap deeper, and on an account
    whose read has never succeeded there is nothing about Concept2 on that tab
    at all (decision table row 2a). **Gate 0 sees BOTH candidate strings drawn
    in the send block's own frame**, at real proportions, beside today's:
    (a) the string unchanged, and (b) a string naming the door rather than the
    tab. The gate rules; the spec does not pick, because this is approved copy
    and changing a word of it is a design question by the standing rule
    `server/concept2/callbackPage.ts:20-22` states for its own siblings.
  - **THE ROW ORDER, drawn both ways.** R7 says the two doors read as one
    group and does not say which is first. CONCEPT2 above DIAGNOSTICS keeps
    `You.tsx:139-141`'s "LAST child" ruling and `e2e/concept2.spec.ts:305-307`'s
    sentinel contract true; CONCEPT2 below falsifies both. Gate 0 sees the pair
    in both orders and rules.
  - **Numbers**, from §5.1's own numbers block: every pairing on the row and
    on the screen.
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
a **sibling route**, not a nested child (`AppRoutes.tsx:241-261` registers flat
routes), so returning to You unmounts the card and discards all four of those.
(**There is a fifth attempt value and it does NOT unmount** — see below; it is
not rendered anywhere, so R2 is unaffected, but the count matters.) There is
no path on which the row is mounted while any of the four is set:

- **Native.** The consent leg is `ASWebAuthenticationSession`
  (`adapters/linkFlow.ts:332`) — a modal over a live WebView. The rower cannot
  navigate the app underneath it.
- **Web.** `startLink` hands off with `openExternalUrl` → `navigateWeb` →
  `window.location.assign` (`adapters/webNavigate.ts:19-21`), which unloads the
  document, so nothing preserves the attempt across it either way.
  **REV 2's stated mechanism for the return does not exist and is withdrawn.**
  It said the rower "returns by browser Back **to `/you/concept2`**, whose
  `pageshow` handler clears the attempt anyway". The web callback is a
  server-rendered page with **no outbound link at all, by design** —
  `server/concept2/callbackPage.ts:9-17`, verbatim: _"this HTML carries NO
  subresource and NO outbound link… No page names a destination either"_, and
  its action line reads "Return to the app." So there is no return affordance
  on the page, and Back lands on Concept2's authorize URL first. **The
  conclusion survives** — the document was unloaded, so no attempt state can
  cross — and it now rests on the unload rather than on a path the app does not
  provide.

So: **the row shows what the SERVER last said; the screen shows what the last
TAP did.** That is not a taste call. Putting an attempt state on the row would
require lifting `outcome`/`busy`/`armed`/`unlinkFailed` above the route into a
context or a store, which nothing here asks for and which invariant I1 (the
card never infers the link from an outcome) exists to discourage.

**The attempt state is FIVE values, not four, and the fifth does not unmount.**
`adapters/linkFlow.ts:110` declares a module-level `let linkInFlight = false`,
taken at `:295` and released in a `finally` at `:348`. It survives every
unmount and route change; only a native promise that never settles can wedge
it. R2 is unaffected — `linkInFlight` is not rendered anywhere — but "discards
all four" was wrong as written, and a lifetime claim that miscounts its own
population is not a claim a reviewer can check.

**One reachable consequence, named because it is new in likelihood rather than
in kind.** `.overlay-screen` is `z-index: 10` and the tab bar is deliberately
above it (`index.css:5624-5625`, the rule's own comment, and `:5626-5634`), so
the tab bar is tappable while the screen is open. During the
`POST /api/concept2/connect` window the card's own buttons are `disabled` and
**the You tab is not**: tap Connect, then tap You, and the card unmounts with
`startLink` still in flight. On native `completeNative`
(`adapters/linkFlow.ts:176`, called at `:333`) then opens
`ASWebAuthenticationSession` over You, and a cancel or a failure resolves
into an unmounted component — **the failure is reported to nobody**, and the
row simply keeps saying `NOT LINKED`. This is the same shape as tapping any
other tab today, so it is not new; what is new is that the You tab now reads as
"go back to where I was" rather than "leave the feature", which makes the tap
likely rather than perverse. Gate 0 sees it; no fix is specified here.

#### The row's decision table, over the inputs the row actually reads

**REV 2 put a fifteen-row table here, over the CARD's frames, and that shape is
the defect rather than the length.** The row's value is a function of two
independent inputs; a table over frames enumerates one axis of a two-axis
function, and the collision ruling 5 now settles — `RECONNECT NEEDED` silently
replaced by `COULDN'T READ` on any failed re-read — was invisible in frame
space and obvious the moment the inputs were crossed. The frame list is still
true and still useful; it is kept below as **what the SCREEN draws**, which is
the question it can actually answer.

**The axes, and why these are all the values there are.** `useConcept2Link`
returns `link` and `failed` as independent `useState`
(`api/useConcept2Link.ts:159-160`), and a failed read leaves `link` untouched:
the non-`ok` arm calls `setFailed({ status: res.status })` and nothing else
(`:175-178`), the throw arm calls `setFailed({ status: null })` (`:196`), and
only a successful read reaches `setLink(...)` / `setFailed(null)` (`:191-192`).

- **`failed`** has two values: `null`, or a `LinkReadFailure`.
- **`link`** has **five** shapes and no more, and that is a code fact rather
  than a judgement. `normalizeLink` is its only writer and collapses everything
  it is handed into one of them (`useConcept2Link.ts:52-56`): `raw.available
  !== true` returns `LINK_UNAVAILABLE`; `raw.linked !== true` returns
  `{ ...LINK_UNAVAILABLE, available: true }`, whose `needsReauth` is `false`.
  **So `available && !linked && needsReauth` is not representable** — the fifth
  shape below is the last one, not the last one anybody thought of.
- **`seen`** — the persisted "this account has been told Concept2 is
  available" flag ruling 6 introduces. It is an input **only where `link` is
  `null`**: once a read has resolved this mount, `link` is newer than the flag
  and answers for it. Its full lifetime table is below.

**Two axes, plus a third that is live on exactly two cells.** Ten
`(link × failed)` combinations; two of them split on `seen`; **eleven leaf
cells, all eleven written out below.** The third axis is named rather than
hidden on purpose — a table that concealed it would be REV 2's defect with a
different arity. A reader who cannot enumerate every combination the row can
be in from this table should reject it.

| # | `link` | `failed` | `seen` | the ROW says | why |
| --- | --- | --- | --- | --- | --- |
| 1 | `null` | `null` | either | **nothing** | no read has resolved this mount. There is nothing to say yet and a read is in flight; a placeholder here would be a state the rower has to learn |
| 2a | `null` | set | `false` | **nothing** | the first thing we ever tell a rower about Concept2 must not be an error about a feature they may not have. This is the live defect §9 item 3 names, closed |
| 2b | `null` | set | `true` | **`COULDN'T READ`** | this account HAS been told Concept2 is available, on some previous visit. Ruling 6: the row keeps its door, so the Retry behind it stays reachable |
| 3 | `available: false` | `null` | n/a | **nothing** | 1h. The server said this deployment or this account has no Concept2, and it said it successfully |
| 4 | `available: false` | set | n/a | **nothing** | the retained `link` is a SUCCESSFUL read that said no. A later failed re-read is not evidence against it. (`seen` is cleared by the read that produced this `link` — see I-C) |
| 5 | `available && !linked` | `null` | n/a | **`NOT LINKED`** | the discovery state, and the one most rowers are in |
| 6 | `available && !linked` | set | n/a | **`COULDN'T READ`** | a retained AVAILABLE link, so the rower knows the feature exists and the failure is worth telling them about |
| 7 | `available && linked && !needsReauth` | `null` | n/a | **`LINKED ✓`** | the door with an answer: nothing has changed, and reading the row is how they learn that without a tap |
| 8 | `available && linked && !needsReauth` | set | n/a | **`COULDN'T READ`** | same as 6. The link was healthy when last read; the read failed; say so |
| 9 | `available && linked && needsReauth` | `null` | n/a | **`RECONNECT NEEDED`** | the server's own `needs_reauth_at`, rendered |
| 10 | `available && linked && needsReauth` | set | n/a | **`RECONNECT NEEDED`** | **RULING 5, and the cell REV 2 could not see.** `needsReauth` is server-sticky and a read that FAILED cannot have resolved it (`server/routes/concept2.ts:459-462`). Overwriting a sticky, rower-actionable warning with a transient one that reads as a network blip loses R3 exactly where R3 matters |

**What cell 10 costs, stated rather than buried:** the rower is not told that
the read failed, on the one combination where we suppress it. That is the trade
and it is deliberate — the screen behind the row still draws 1i's panel and its
Retry in every state (R5), so the failure is one tap away and the warning that
cannot be recovered any other way stays on the surface. Gate 0 rules it.

**This table departs from a comment in the tree, and the departure is stated
rather than left as drift.** `you/Concept2Card.tsx:212-219` rules the opposite
way for the CARD, verbatim:

> _"`failed` wins over a stale `link` on purpose (invariant I1) — including
> when a background re-read from `pageshow` fails over a card that was fine a
> moment ago. The cost is one transient panel; the alternative is a link state
> nobody observed staying on screen, and the panel carries a Retry that fixes
> it in one tap."_

**The reason the row differs is the last clause: the row has no Retry.** "The
panel carries a Retry" is what makes the card's ordering cheap, and it does not
transfer to a one-line row whose only affordance is a tap into the screen. The
card keeps its rule unchanged under R6; the row takes the other one; and
`Concept2Card.tsx:212-219` is on A7's list so the tree does not ship two
surfaces silently disagreeing about one ordering.

#### The lifetime table for `seen` (RF27)

Ruling 6 introduces state, so it carries the table REV 2 claimed it did not
owe. **Invariants first, mechanisms nowhere** — the plan chooses how.

- **I-A.** Exactly one `seen` per signed-in account. No account can read
  another's.
- **I-B.** It asserts one thing only: *a successful read on this account has
  reported `available: true` at least once*. It never asserts linked, healthy,
  or current, and nothing may treat it as any of those.
- **I-C.** A successful read reporting `available: false` clears it, in the
  same pass that observes it. The live read is always newer than the flag, so
  a revoked cohort membership cannot leave a row behind.
- **I-D.** **Sign-out clears it.** Without this, the next account signing in on
  the same device inherits a cohort claim it was never granted, and sees a
  Concept2 row for a feature its own server answers `available: false` for.
- **I-E.** It survives unmount, route change, tab switch, backgrounding and
  **relaunch**. This is the invariant that makes it a fix at all: per-mount
  state is what failed, and module-level state dies on relaunch, so **I-E
  admits only a persisted store.** The repo already writes one from this
  WebView (`src/monitor/monitorRun.ts:588`), and the plan names the storage
  API's availability floor against `IPHONEOS_DEPLOYMENT_TARGET` with a
  citation.
- **I-F.** Its only consumer is the row's `link === null && failed !== null`
  cell (rows 2a/2b). It is never an input to anything the SCREEN draws, and
  never an input to the Send block — a stored flag must not be able to make a
  surface claim something the live read did not.
- **I-G.** A persist that FAILS degrades to `false` ("not seen"), never to a
  claim. RF25 is the reason this is written down: this repo already ships a
  writer that swallows a failed `localStorage` write and lets its caller
  proceed as if it succeeded (`monitorRun.ts`'s `saveMonitorRun`, AUD-016), and
  the honest failure mode here is the row going quiet, not the row asserting a
  cohort from a write nobody made.

| state | mint | cleared by | survives unmount | survives relaunch | survives sign-out |
| --- | --- | --- | --- | --- | --- |
| `seen` (new) | the first successful read reporting `available: true` | a successful read reporting `available: false` (I-C); sign-out (I-D) | **yes** | **yes** (I-E) | **no** (I-D) |
| `link` | `setLink` on a successful read (`useConcept2Link.ts:191`) | nothing clears it; a failed read leaves it (`:175-178`, `:196`) | no — `useState` | no | no |
| `failed` | `setFailed` on a non-`ok`, unparseable or thrown read (`:176`, `:184`, `:196`) | the next successful read (`:192`) | no — `useState` | no | no |
| `generation` | once per hook instance (`:167`) | never reset; unmount discards it | no — `useRef` | no | no |

**Four values and an absence. The row mints no copy of its own:** all four
strings are ones `Concept2Card` already renders — `LINKED ✓`,
`RECONNECT NEEDED`, `NOT LINKED` (`Concept2Card.tsx:278-284`) and
`COULDN'T READ` (`:227`). The card's fifth status value, `WAITING`, is the
opening state and is therefore unreachable on the row; the row never says it.
No new string means no new copy decision and no second spelling of a state to
drift apart.

**Why each of the four earns the row, stated as a product judgement:**

- **`RECONNECT NEEDED` is the one that makes this a design gate rather than a
  refactor, and REV 2's argument for it was WRONG — corrected here rather than
  softened.** REV 2 said: _"The You surface is their only warning, and a row
  that hides it behind a tap removes the only warning there is."_ **That is
  false.** The log's Send block has a first-class reauth state, spelled
  `reauth` on the client and `needs_reauth` on the wire, never `needsReauth` —
  which is why REV 2's `grep -c needsReauth app/src/log/Concept2SendBlock.tsx`
  → `0` proved nothing about behaviour. The falsifying lines, read 2026-09-04:
  server `res.status(409).json({ error: "needs_reauth" })`
  (`server/routes/concept2.ts:746`, and again at `:856`, `:912`, `:1134`,
  `:1202`); client mapping `if (error === "needs_reauth") return { kind:
  "reauth" }` (`log/concept2Send.ts:311`); rendered status `state === "reauth"
  ? "RECONNECT NEEDED"` (`Concept2SendBlock.tsx:116`); and the rendered
  sentence _"Concept2 stopped accepting this link. Reconnect on the You tab."_
  (`Concept2SendBlock.tsx:209-212`), with a re-read of the link on that outcome
  (`:59`).
  **The real argument, which is the one Gate 0 should see, is PRE-EMPTIVE
  versus POST-FAILURE.** Today a rower learns their link is stale by trying to
  send a row and failing. `needs_reauth_at` is set on the server, it is sticky,
  the rower did nothing to cause it, and nothing in the app resolves it on its
  own — so it can be told to them before they spend a send on it. That is worth
  a line on a surface they pass anyway; "the only warning there is" is not true
  and must not be the sentence a design gate is approved on.
  **And that sentence now points at a moved surface.** After PR A the You tab
  carries a mono row reading `RECONNECT NEEDED` and no Connect control — the
  Reconnect button is one tap deeper. §4.3 sends the copy question to Gate 0
  with two candidate strings drawn.
- **`LINKED ✓` is what makes the row worth reading when nothing is wrong.** A
  door with no answer is a door the rower opens to learn nothing has changed.
- **`NOT LINKED` is the discovery state** — the reason the surface exists at
  all. It is also the state most rowers will be in.
- **`COULDN'T READ` is carried because the alternative is a lie.** The rule
  lives at `you/Concept2Card.tsx:212-215`, not in the hook — REV 2 attributed
  it to `useConcept2Link.ts:126-136`, which says something adjacent and
  different. Verbatim, in its real home: _"a read that FAILED is a different
  answer from a deployment that has no Concept2, and drawing them the same way
  tells a rower whose server does have it that it does not."_ The decision
  table above scopes when that applies on the ROW rather than dropping it, and
  states its one departure from the four lines that follow that quote.

#### What the SCREEN draws — the card's fifteen frames

Unchanged from REV 2 in content, and **it is not an input to the row.** It is
here because R2 is argued from it: the ten states born from a tap live in
`Concept2Card`'s own `useState` and cannot coexist with a mounted row.

| # | card frame | the SCREEN draws it | note |
| --- | --- | --- | --- |
| 1 | 1a unlinked, at rest | yes | |
| 2 | 1b opening | yes | attempt state |
| 3 | 1c linked and healthy | yes | |
| 4 | 1d unlink armed | yes | attempt state |
| 5 | 1e link attempt failed | yes | attempt state |
| 6 | 1f needs re-auth | yes | |
| 7 | 1f-b re-auth + failed attempt | yes | attempt state |
| 8 | 1f-c re-auth + update required | yes | |
| 9 | 1g update required, unlinked | yes | |
| 10 | 1i read failed | yes, **in every state, retained link or not** (R5) | |
| 11 | 1j unlink refused | yes | attempt state |
| 12 | 1h unavailable | no — the screen redirects to `/you` (R5) | |
| 13 | armed while needing re-auth | yes, **never drawn on the design page** | Gate 0 |
| 14 | unlink refused while needing re-auth | yes, **never drawn** | Gate 0 |
| 15 | RECONNECT in flight | yes, **never drawn — and it draws no panel at all**: `!link.linked && opening` gates the OPENING CONCEPT2 panel (`Concept2Card.tsx:429`), so both buttons go `disabled` and nothing says why | Gate 0 |

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

**R4 closes it, and ruling 6 is what makes the fix sound.** REV 2 said this
needed no new state — that "have we ever been told this account has Concept2"
was already expressible as `link !== null && link.available`, with "no new ref,
no new lifetime, and nothing for RF27 to tabulate". **That sentence is
withdrawn, and it was the defect rather than the reassurance.**

**Why it does not work, read rather than reasoned.** `link` and `failed` are
`useState` inside the hook (`useConcept2Link.ts:159-160`); nothing is
module-scoped, nothing is persisted, and `Me` carries no capability flag
(`src/useMe.ts:4-8`). Routes are flat and mutually exclusive
(`shell/AppRoutes.tsx:241-261` — `<Routes>` matches one), so **You unmounts on
every trip to `/you/concept2` and back**. "We have never been told" therefore
means *this mount*, and every visit to You is a first-ever read. Under REV 2's
rule a cohort rower whose read fails gets **no row, therefore no door,
therefore no Retry** — strictly worse than today's card, which draws a panel
with a Retry in it. The evidence had a shorter lifetime than the fact it was
asked to carry, which is RF27's exact shape.

**So the fact is promoted to a lifetime that matches it**: the persisted `seen`
flag, its seven invariants and its lifetime table, above. Rows 2a and 2b of the
decision table are the whole of R4's behaviour.

**The cost that remains, stated rather than buried:** a rower whose FIRST-EVER
read on a device fails — no successful read has ever happened on this account,
so `seen` is `false` — sees no row and cannot reach the Retry until a read
succeeds. Their remedy is the automatic re-read the hook already performs on
every foreground and on every fresh visit to You
(`useConcept2Link.ts:199-214`). **That is a genuinely first-visit-only cost,
and it is the one the flag cannot remove**, because the alternative is showing
a Concept2 error panel to every rower who has never had Concept2 — which is the
live defect on production today. It is a change to what a rower sees, so
Gate 0 rules it; if Gate 0 declines, the row inherits today's ordering
unchanged and the defect stays as it is, named here.

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
  `AppRoutes.tsx:261`'s own `<Route path="*" element={<Navigate to="/today"
  replace />} />` is the house idiom for a route with nothing behind it.
  **THE PREDICATE IS PINNED HERE, because the obvious one is AUD-015 and the
  prescribed mutation cannot catch it.** It is `link !== null &&
  !link.available`. **Never `!link?.available` and never `link === null`**:
  `link` is `null` until the first read lands (`useConcept2Link.ts:159`), so
  the falsy form bounces on EVERY mount, the screen is unopenable, and the row
  reads as a dead door — the exact shape RF25/AUD-015 records for
  `Countdown.tsx` navigating to a Timer that silently bounces to Today. Deleting
  the redirect makes that case pass HARDER, so §6.1 carries a second, inverted
  mutation for it: **a mount whose read is still pending renders the screen and
  does not navigate.** "Still loading" is a third value, not a falsy one.

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
- **R3 — a broken link is visible without a tap, and NO OTHER STATE CAN HIDE
  IT.** `needsReauth` reaches the row, and reaches it in every combination
  where it holds — including a concurrent read failure (decision table row 10,
  ruling 5). This is the invariant the whole design is at risk of losing, and
  the one a reviewer should attack first.
- **R4 — silence means "this account has never been told Concept2 is
  available".** The row draws only once a successful read has reported
  `available: true`, on this account, ever — the persisted `seen` flag, not a
  per-mount `link`. A failed read draws `COULDN'T READ` on the row over a
  retained available link, or over a `seen` account whose read has not resolved
  yet, and **never as the first thing a rower has ever been told about
  Concept2**.
- **R11 — `seen` can only widen what the rower is told, never narrow it, and
  never outlive its account.** It is an input to exactly one cell of the
  decision table (I-F), a successful `available: false` read clears it (I-C),
  sign-out clears it (I-D), and a failed persist degrades to "not seen" (I-G).
  A stored flag that could make a surface assert something the live read did
  not would be a worse defect than the one R4 closes.
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
- **R7 — the two doors at the foot of You read as one group, and their ORDER
  is ruled at Gate 0.** Exactly one auto top margin separates the group from
  the content above it, not one per row. Stated as an invariant, not a
  mechanism: §3.7 records why (`.diag-row`'s own M-3 rule assumes a single
  site) and the plan chooses how.
  **The order is not an implementer's call, and REV 2 never stated it.**
  `You.tsx:139-141` requires DIAGNOSTICS to stay You's last child, verbatim:
  _"Stays the LAST child (dev-only C2LinkProbe, present or absent, sits above
  it) per this comment's own 'at the bottom of You, on purpose'."_ And
  `e2e/concept2.spec.ts:305-307` builds its readiness sentinel on that same
  fact: _"You is rendered when its LAST child is on screen: the DIAGNOSTICS row
  is `You.tsx`'s own final element and its comment requires it stay there."_
  **Putting CONCEPT2 below DIAGNOSTICS falsifies both**, so Gate 0 rules the
  order and both comments are on A7's list either way.
- **R8 — no new tier and no new accent.** The Unlink control's classes are
  unchanged, `--accent`'s census does not grow, and
  `docs/design/DEVIATIONS.md`'s one Concept2 row (line 241, the Send block's
  link-out) is untouched and no second row is minted.
- **R9 — Unlink keeps its two-tap arm and its 4-second disarm**, and the arm
  cannot survive leaving the screen it was made on.
- **R10 — the CARD is gone from You, and the prose says only that.** After
  this change `grep -n 'Concept2Card' app/src/You.tsx` returns nothing. **That
  grep returns 2 today** (the import at `You.tsx:6` and the mount at `:119`),
  which is what makes it a check rather than decoration — `grep -n 'c2-card'
  app/src/You.tsx` already returns nothing, because You names the component and
  never the class, and would have been an RF21 gate that cannot go red.
  **REV 2 also claimed "You imports no Concept2 component other than the row",
  and its own grep does not prove that. Withdrawn.** `You.tsx:22-23` lazily
  imports `./monitor/Concept2LinkProbe` and `:127-131` mounts it, between the
  card and the DIAGNOSTICS row — a Concept2 component, on You, that the grep
  passes straight over (RF26: the gate proves the card is gone; the sentence
  claimed the surface was). **Gate 0 rules which of the two answers it wants**,
  and the spec recommends the first:
  - **Move the probe behind `/you/concept2`.** It is a Concept2 diagnostic and
    that is now where Concept2 diagnostics live; it also removes a third
    element from the foot-of-You group R7 exists to protect. Its own reason for
    being on You — _"this probe needs a TAPPABLE entry point, and the You tab
    is already one"_ (`You.tsx:19`) — is satisfied by the row, which is a
    tappable entry point one tap away.
  - **Or leave it and narrow R10's prose to what the grep proves**, with the
    reason it stays written down beside it.
  Either way the PR body states which, and R10's sentence matches its gate.

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
| `app/src/index.css:10171-10173` | the comment names the set of 12px-top blocks on You | verbatim: _"`.baselines-card`, `.retest`, `.reset-baselines` and `.diag-row` are each `margin-top: 12px`"_ — a claim about a SET that gains a member and loses another |
| `app/src/index.css:10185-10188` | the "Bottom stays 0 on purpose" comment | verbatim: _"`.you-screen .diag-row` below is `margin-top: auto`"_ — false the moment R7's mechanism changes, and it is the justification for a declaration, not a note |
| `app/src/you/Concept2Card.tsx:212-219` | the `failed`-wins comment gains the row's departure | the row takes the other ordering (ruling 5). **This is the ONE comment edit R6 has to permit**, and it touches no markup, so the fixture equality gate and the five surviving `design.spec.ts` cases are unaffected |
| `app/e2e/design.spec.ts:10572` and `:10585` | both reason from a single-`.diag-row` You layout | `:10572` transcribes the same four-member set as `index.css:10171`; `:10585` asserts nothing about the gap below **because** `.you-screen .diag-row` is `margin-top: auto`. Neither is wrong today and both describe a layout R7 changes |
| `app/src/You.test.tsx` | the three Concept2 cases (`You.test.tsx:183-234`) become row cases; the document-order case gains a second row to order against | they assert `.c2-card` on You |
| `app/src/you/Concept2Screen.test.tsx` (new) | R5's cases: chrome in every state, the `available:false` redirect, the back target | R5 is the invariant with no existing gate |
| `app/src/you/Concept2Card.test.tsx` | **untouched under R6** | the card does not change |
| `app/e2e/concept2.spec.ts` | `openYou`'s sentinel is REPLACED, not repaired; six card tests re-route | `openYou` asserts `page.locator(".diag-row")` `toBeVisible()` (`:310`) — **a second `.diag-row` is a Playwright strict-mode violation** and every test through that helper throws. Scoping the locator fixes strict mode and leaves the third door to break it again, so the sentinel moves to a stable You observable (the screen's own container plus the Sign out control) rather than a feature row's class. Card tests at `:324, :353, :394, :638, :666, :743`; the five Send-block tests at `:431, :460, :511, :539, :567` are unaffected |
| `app/e2e/screenshots.spec.ts` | the same sentinel at `:6180`; the five You captures change subject | `you-concept2-read-failed`'s fake serves 502 to the FIRST read, which under R4 draws no row on a device that has never seen a good read — it must serve one good read first, or move to the screen |
| `app/e2e/design.spec.ts` | the in-situ test "the card stands off the row above it on You" (`:10554`) is **falsified outright** — its `inSitu` composition hand-writes `.reset-baselines`, the card fixture and a `.diag-row`. The block header's "Task 8 HAS now mounted it (`You.tsx`, between Reset baseline setup and the DIAGNOSTICS row)" is corrected in place | the card is not on You any more. The describe's other five tests are untouched under R6 |
| `docs/screenshots/` | `you-concept2-{unlinked,linked,armed,read-failed,landscape}.png` all draw the card on You | all five change subject. The three `log-concept2-*.png` are Surface 2 and are untouched |
| `docs/design/handoffs/2026-08-31-concept2-connect/amendment-2026-09-03.html` | 14 frames stop describing what ships | **measured**, see the script below: 54 frames, 24 draw the card, **12 of those draw it inside a You column**, and 2 more draw You without it. Per RF9 the page is reconciled — the superseded in-situ frames struck **on** the page — rather than left as accidental history |
| `docs/design/handoffs/.../README.md` | reconciled wherever it describes the card as living on You | same reason |
| `ROADMAP.md` | the two rows §10 already owes | RF17 |

**A7 is this table's list, not a summary of it.** REV 2's A7 named five items
and this table names eleven; correcting a claim where it was ARGUED and leaving
it where it was USED is the failure the reconciliation rule exists to stop, and
A7 is the criterion someone actually checks.

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

**The number is right and its SCOPE is wrong, which is a different defect and
the more useful one.** The script buckets frames by `'c2card' in b`, so a
`c2send` frame is structurally invisible to it — and one of those, at
`amendment-2026-09-03.html:2377`, draws the approved sentence _"Concept2
stopped accepting this link. Reconnect on the You tab."_, which is the copy
question §4.3 now puts in front of Gate 0. §4.2's staleness sweep missed it for
the mirror-image reason: it greps for the retired MECHANISM
(`SFSafariViewController`) and duly flagged the code comment at
`Concept2SendBlock.tsx:222-225`, four lines below the string it walked past.
**When a surface MOVES, grep its user-facing name as well as the mechanism
being retired.** Run 2026-09-04 in this worktree,
`grep -rn "You tab" app/src app/e2e docs/design` returns exactly 13 lines.
**Five are in scope:** the rendered product string
(`Concept2SendBlock.tsx:211`), its own unit assertion
(`Concept2SendBlock.test.tsx:375`), the design page's section heading
_"1 · You tab — the Concept2 card"_ (`amendment-2026-09-03.html:802`), the
page's copy of the string (`:2377`), and the handoff README's own §1 row
(`README.md:48`). **The other eight are not**, and each is named so the count
is checkable rather than asserted: one unrelated comment on You
(`You.tsx:19`, about the dev probe needing a tappable entry point), five
release notes (`news/content/releaseNotes.ts:484, :495, :511, :599, :600`) and
two News article bodies (`yourFirstRow.tsx:36`, `baselines.tsx:63`) — all
about baselines, re-tests and the warm-up, none about Concept2.

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

### 5.4 PR C — which number is authoritative. **The spec owes the question.**

**This section deliberately specifies no fix.** Not as caution, and not as
scope management: we do not yet know which of two numbers is right, and a spec
that picked one would be choosing a number to send to a third party on the
strength of an argument nobody has tested. §3.8 carries what is measured. This
section carries what is not, what would settle it, and what a gate would have
to compare against — which is the work.

**It is TRIAD on all three counts**, so it takes the full antagonist pass on
its own spec and a PM final-PR gate on its PR, and it does not bundle with PR A
or PR B: it changes what a stored NUMBER means (`work_meters` stops being "the
number we send" or `machine_work_meters` stops being diagnostic), it touches a
STORED SHAPE (whichever one moves onto the send path), and what it sends is a
claim we make to Concept2 on the rower's behalf. **And it is the piece ROADMAP
calls the whole point of the phase** — the verification code exists so a
logbook row reads as machine-confirmed, and today, for an interval row whose
totals differ, it cannot.

#### The four questions, in the order they have to be answered

1. **What does Concept2 actually compare the code against?** Nothing found
   (§3.8). Until this is answered, "our sum is wrong" and "our sum is right and
   the tolerance is zero" are indistinguishable, and so are the fixes they
   imply. Concept2's own developer documentation and the refusal string's own
   wording (_"date, time and distance exactly match the monitor"_) are the two
   places to look; a second walk that sends a KNOWN-divergent row twice, once
   with each candidate number, is the answer that does not depend on finding a
   document.
2. **Which of the two numbers is authoritative, and why?** Both are on the row
   already. Ours is `Σ actuals.distanceMeters` over the intervals we assembled
   from 0x0037/0x0038 (`monitorRun.ts:952`); the machine's is 0x0039's own
   `meters` (`driver.ts:4371`), stored as `machine_work_meters`, minted in the
   same burst as the verification code (`monitorRun.ts:1395-1398`). **Neither
   is obviously right**: 0x0039's own total disagrees with the monitor's own
   interval rows by 2 m on James's walk, so the machine is not internally
   consistent either, and "send the monitor's" is a choice about WHICH of the
   monitor's numbers, not a retreat to an unambiguous source.
3. **Does a Just Row or single-interval row verify, and is that why nothing
   caught it?** §3.8 gives a mechanism for the Just Row half rather than a
   guess: `freeRowTotals` reads the machine's summary FIRST
   (`justrow/totals.ts:38-43`), so a free row already posts the monitor's own
   number and cannot exhibit the defect. **The single-interval half is
   INFERENCE and is exactly what this question exists to settle** — one
   boundary against one summary is likelier to agree, not guaranteed to.
   **If a Just Row row verifies and an interval row does not, question 2 is
   answered by observation.** That is one walk leg, and it is the cheapest
   evidence available.
4. **What is the rest number, and does it matter?** We send `rest_distance`
   separately (`server/concept2/mapping.ts:497-504`), and on the walk the
   monitor's own work+rest overall (6231) and ours (6233) differ by the same
   2 m. If the comparison is on work distance alone, rest is irrelevant to the
   refusal; if it is on the overall, then whichever work number changes must be
   checked against the rest number it is added to. The question is named so a
   fix cannot silently answer only half of it.

#### What a gate would have to compare against

**Not our accumulator. That is the whole lesson, and this repo has already paid
for it twice** — RF11's original case, and `recordTwdVerdict`, retired at RC-9c
for being a mirror that passed everywhere. Every gate we own today compares
`work_meters` with the intervals that produced it and therefore agrees with
itself.

- **The expected value comes from the CAPTURE's own summary frame.** A replay
  test whose oracle is 0x0039's decoded `meters` for that capture, compared
  against whatever number the send path would post for the same run. **That
  comparison already exists in one direction and already records a
  disagreement:** `oracleCorpusReplay.test.ts`'s RC-9(b) block asserts
  `machine.meters` `198` against `ours.meters` `197` on the `rest-boundary`
  capture — its own title calls it _"the corpus's widest 0x0039 gap"_ — and
  nothing downstream consumes that answer. **The gate PR C needs is RC-9(b)'s
  comparison carried onto the SEND PATH**, so a divergence stops being a
  characterised curiosity and starts being a thing the send has an opinion
  about.
- **It must start upstream of the producer** (RF24). A test that seeds
  `workMeters` and asserts the payload proves nothing here, because the defect
  is which number the producer chose. One test begins at the recorded wire
  bytes and asserts on the built payload.
- **It must be PROVEN to go red, on a capture where the two numbers actually
  differ.** Three of RC-9(b)'s five captures agree on distance to the metre, so
  a gate exercised only on those three is green whichever number the send
  path picks
  — RF21 by construction, a check that cannot fail dressed as evidence.
  **`rest-boundary` (machine 198 m, ours 197 m) is the fixture**, and the PR
  states what the failure said.
- **And the honest limit, said plainly:** no gate this repo owns can tell us
  what CONCEPT2 accepts. It can only tell us which of our two numbers we sent
  and whether that matched the monitor's own summary. **Question 1 is answered
  by a walk or by a document, never by CI**, and a PR that claims otherwise is
  making the claim §6.2 already refuses to make for PR B.

#### What PR C blocks, so the cost of it going last is visible

James ruled the order (§2 ruling 4) and this spec does not re-derive it. What
it does record, because a ruling made on a stated cost is a better ruling:

- **Until PR C lands, the verification code shipped in Wave E cannot validate
  for an interval row whose totals differ from its own interval sum.** That is
  ROADMAP's stated point of the phase, and it is currently a feature that
  renders correctly and does not work.
- **Every row sent in the meantime carries our number**, and a rower who tries
  the code gets the refusal James got. Whether that is worse than no code at
  all is a product question the PM gate should see, not one this spec settles.
- **Nothing in PR A or PR B depends on PR C**, and PR C depends on neither of
  them: it touches the send payload and the monitor record, and they touch a
  screen and a platform adapter. **The order is therefore free**, which is what
  makes ruling 4 cheap to hold.

---

## 6 · What can and cannot be gated

### 6.1 PR A — what can go red, and the two things that cannot

- **A new e2e suite for the row and the screen**, because nothing today
  measures either. The four row values, the absent row, the navigation into the
  screen and the BackLink out of it are all reachable in the existing
  `e2e/concept2.spec.ts` harness — it already drives a fake `/api/concept2/*`
  and signs in through the backdoor.
- **`/you/concept2` registers in `design.spec.ts`, in this PR.**
  `docs/TESTING.md:307-310` is not optional about it, verbatim: _"**New screens
  must register in `design.spec.ts`** — a new screen with no entry here is a
  screen the a11y/tap-target/token rules aren't actually checking. This is the
  hard half of the requirement, and `design.spec.ts` runs in CI."_ **REV 2
  discussed `design.spec.ts` only as a thing that protects the card, and the
  precedent this design copies is itself a record of forgetting this**:
  `design.spec.ts:4239-4245`, verbatim — _"Final whole-branch review, item 3:
  register the diagnostics door in the design sweep — Task 3's
  `/you/diagnostics` menu and the `/you/diagnostics/monitor-logs` list behind
  it **shipped with no entry here**."_ A `test.describe("concept2 screen")`
  with the tap-target and axe sweeps, both orientations. Exit criterion A11.
- **`openYou`'s sentinel is REPLACED first, in the same PR — repairing it is
  not enough.** It asserts `page.locator(".diag-row")` is visible
  (`e2e/concept2.spec.ts:310`; `e2e/screenshots.spec.ts:6180` carries the
  twin). Under R7 a second row with that class turns both into strict-mode
  violations, and scoping the locator (`.nth(0)`, or a filter on the
  DIAGNOSTICS text) fixes strict mode while leaving the next door to break it
  again. **The sentinel moves to a stable You observable** — the screen's own
  container plus the Sign out control — so it stops depending on which feature
  rows exist. **This is the seam gate RF24 asks for**: the change that creates
  the ambiguity fixes it, rather than filing it.
- **Every negative assertion about the new row polls the fake's read counter,
  never the sentinel.** `.diag-row` is SYNCHRONOUS and the Concept2 row is
  ASYNC, so a `toHaveCount(0)` gated on the sentinel is green before the read
  resolves and can never go red — RF21 with a readiness oracle for the wrong
  element. **The correct oracle already exists in this file and the new suite
  reuses it rather than inventing one:** `e2e/concept2.spec.ts:337` and
  `:341-343` both `await expect.poll(() => fake.linkReads).toBeGreaterThan(…)`
  before asserting absence. I went looking for the RF21 this design would
  inherit and did not find it; it is the sentinel that is the hazard, not the
  existing negatives.
- **The mutations that must bite**, each with its failure recorded verbatim:
  - **R3, twice.** (i) Force `needsReauth` to `false` in the row's derivation.
    Expected: the `RECONNECT NEEDED` row case goes red and the others stay
    green. If it does not bite, the row is not reading the field it claims to.
    (ii) **Reverse ruling 5** — let `failed` win over `needsReauth`, which is
    the card's own ordering and therefore the mutation a future edit is most
    likely to make by accident. Expected: **decision table row 10's case — a
    link needing re-auth whose next read fails still says `RECONNECT NEEDED` —
    goes red.** Without this second one the ruling has no gate, and it is the
    ruling this revision exists for.
  - **R4.** Remove the `seen`-and-retained-link condition so a failed read
    always draws the row. Expected: the "no row on a deployment with no
    Concept2, on a device that has never had a successful read" case goes red.
    **Anchor the mutation on a unique string** (RF22's second half) — grep
    first and confirm one hit.
  - **R5, and it takes TWO mutations because one of them cannot catch the
    defect that matters.** (i) Delete the `available: false` redirect.
    Expected: the "typed URL with the surface off returns to /you" case goes
    red. (ii) **Widen the predicate to `link === null || !link.available`** —
    the obvious form, and AUD-015's shape. Expected: **a new case, "a mount
    whose read is still pending renders BackLink and title and does not
    navigate", goes red.** Mutation (i) is blind to this: deleting the redirect
    makes the pending case pass HARDER, which is exactly how a screen ships
    unopenable behind a gate that stayed green.
  - **R11.** Force `seen` to `false` after a successful `available: true` read.
    Expected: the "a rower whose account HAS been told, whose next read fails,
    still sees a row with `COULDN'T READ`" case goes red. And the inverse:
    force `seen` to survive sign-out, and the "a second account on the same
    device sees no Concept2 row" case goes red. Both are needed — one proves
    the flag is read, the other proves I-D is enforced, and only the second can
    fail on the leak that matters.
  - **R2.** Wire `busy` into the row's state line. Expected: nothing goes red,
    **and that is the finding, not a pass** — it means the test suite cannot
    tell R2 is holding, so R2 is gated by the decision table and the code review
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
  **NO is possible FOUR ways**, and the fourth is the one our own tree
  predicts (§3.4's counter-claim): the sheet appears anyway; nothing happens at
  all (WebKit dropped the `noopener` `window.open`); a different app opens; or
  **the Ergomatic WebView ITSELF navigates to concept2.com, with no way back**
  — the outcome `adapters/externalBrowser.ts:75-77` asserts for a plain anchor.
  Recording which of the four occurred is the observation; "it didn't open
  Safari" is not. **PASS = Safari.**
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

**The order is RULED, not recommended: PR B, then PR A, then PR C** (§2 ruling
4, James 2026-09-04). His reason for PR C going last, in his words: **the other
two are the quicker fixes.** His reason for PR B before PR A, ruled earlier the
same day: PR B repairs something a rower sees today and its gate is a walk that
is happening anyway, while the row and screen need a design gate before a line
is written.

**REV 2's own recommendation is withdrawn rather than kept alongside**, even
though it reached the same B-before-A answer: it argued from scope and risk
("blocking a broken-link fix behind a design gate is backwards"), and an
argument that agrees with a ruling is still not the ruling. §5.4 records what
PR C going last COSTS, so the ruling is held on a stated cost rather than
re-derived from one.

**They stay three PRs, and nothing bundles.** The grouping rule's own test: a
reviewer holding a platform-adapter deletion and a new screen in one pass would
be holding two unrelated risk models, and adding "which of two stored numbers
do we send to a third party" would make three. The row and its screen ship
together as one PR, because a row pointing at nothing is not shippable. PR C
ships alone because it carries TRIAD weight and bundling it would make its own
gate harder to run — the narrow exception the grouping rule keeps.

- **Antagonist, PR A: the delta pass RAN on REV 2** (2026-09-04) and returned
  thirteen findings, two of them blocking-shaped. REV 1 had skipped the pass as
  pure UI; un-skipping it was right, because PR A invents a state partition
  (R1/R2), an availability predicate that changes what a rower sees on a
  failure path (R4), and a screen-versus-row asymmetry (R5) — and RF27's own
  lesson is that a chunk inventing a new mechanism does not inherit a phase's
  vetted ground. Both blocking findings are ruled in §2 and folded where they
  were argued; §9b lists all of what changed.
  **A further pass on REV 3 is owed before implementation**, and its scope is
  the ground REV 2's pass never saw: the decision table's exhaustiveness (both
  axes and the `seen` third input), the `seen` lifetime table, and §5.4's four
  questions.
- **Antagonist, PR B: DELTA pass, unchanged from REV 1**, plus §3.4's
  in-tree counter-claim, which was not on the table when that pass was scoped.
  It rests on a WebKit navigation behaviour tagged INFERENCE in §3.4 and
  withdraws an approved behavioural claim (§4).
- **Antagonist, PR C: FULL pass, not a delta.** TRIAD forces it regardless of
  phase position, and it inherits no vetted ground: nothing REV 1 or REV 2 was
  attacked on touches which number we send. Its spec is written before that
  pass, and §5.4 is a question rather than a design precisely so the pass has
  premises to attack rather than a mechanism to audit.
- **PM gate: RUN, once, on the spec slate — and REV 2 un-skips this too.** REV
  1 skipped both on the grounds that neither changed what a tester receives.
  PR A now changes **the shape and sequence of planned work** (the order flip)
  and **what a tester receives as a capability's front door**. One PM verdict on
  the slate — the order and PR A's scope — not a per-PR gate on either.
- **PM gate on PR C: RUN, at its own open and on its PR.** TRIAD forces the
  final-PR gate, and the slate gate above cannot cover it — §5.4's question 1
  may come back "Concept2 compares something we cannot match", which is a
  product decision about whether the code ships at all, not an implementation
  choice.
- **Fast path: NO, for all three**, checked mechanically. PR A is four product
  files plus CSS plus a route plus a screen, and changes what a rower sees on
  an approved screen. PR B touches a platform adapter and removes a shipped
  dependency. PR C is `app/src/` and `app/server/` and a stored number's
  meaning — it fails checks (1), (2) and (5) at once.

---

## 8 · Exit criteria

Each one falsifiable, each one checkable by someone who did not write it.

### PR A — the row and the screen

- **A1.** Gate 0 approved on the rendered artifact of §4.3 — the four row
  values, the absent row, the two-row foot in both content cases and **in both
  orders**, the screen in every state, both orientations — before
  implementation starts. **Including the four rulings §4.3 and §5.1 hand the
  gate: the screen's own copy question (R6), the send block's "Reconnect on the
  You tab" string with both candidates drawn, the row ORDER, and R4's
  first-visit trade.**
- **A2.** The **decision table** of §5.1 is reproduced in the PR body — all
  eleven leaf cells, both axes — and the two claims that make it exhaustive are
  justified there rather than asserted: that `normalizeLink` admits exactly
  five `link` shapes (`useConcept2Link.ts:52-56`), and that no attempt state
  can coexist with a mounted row (flat routes; component-local state; and the
  fifth value, `linkFlow.ts:110`'s module-level `linkInFlight`, named as the
  one that does NOT unmount).
- **A3.** `openYou`'s `.diag-row` sentinel is **replaced** in this PR
  (`e2e/concept2.spec.ts:310`, `e2e/screenshots.spec.ts:6180`) with an
  observable that does not depend on which feature rows exist, and the PR body
  states which form it took and why scoping the locator was not enough. Not
  filed as follow-on work. **And every negative assertion about the new row
  polls `fake.linkReads` first** — the PR body names the assertions and shows
  the poll.
- **A4.** The four mutations of §6.1 were run; each one's failure message is
  quoted verbatim, **including R2's, which is expected NOT to bite** — the PR
  says so rather than claiming a gate it does not have.
- **A5.** The five You captures re-shot and new screen captures added, each
  described in the PR body from having been opened.
- **A6.** `grep -n 'Concept2Card' app/src/You.tsx` returns nothing (R10 — it
  returns 2 on `2148f978`), and
  `grep -rn 'diag-row' app/src --include="*.tsx" | grep -v '\.test\.'` returns
  the count the PR body states (it returns 1 on `2148f978`).
- **A7.** Every stale claim corrected **in place**, never appended to — and
  **A7 is §5.1's cost table's list, not a summary of it** (REV 2's A7 named
  five of eleven, which is the failure the reconciliation rule exists to stop).
  In full: `You.tsx`'s mount comment (which carries James's position ruling);
  `You.tsx:139-141` (the DIAGNOSTICS "LAST child" comment);
  `Concept2Card.tsx:102-104` (I2 names You); `Concept2Card.tsx:212-219` (the
  `failed`-wins ruling the row departs from — the one comment edit R6 permits,
  touching no markup); `index.css`'s M-3 "single JSX site" comment;
  `index.css:10171-10173` (the four-member 12px set);
  `index.css:10185-10188` ("Bottom stays 0 on purpose");
  `e2e/concept2.spec.ts:305-307` (the sentinel's own contract);
  `design.spec.ts`'s Concept2 block header and its in-situ test; and
  `design.spec.ts:10572` and `:10585`. `docs/design/DEVIATIONS.md` gains no row
  and its line-241 row is unchanged.
  **And a phrasing sweep, not just a claim sweep:** after withdrawing REV 2's
  "the You surface is their only warning" and "You imports no Concept2
  component other than the row", grep the withdrawn WORDS ("only warning",
  "no Concept2 component", "all four", "unreachable") across the spec, the PR
  body and the design page, and reconcile each hit or state why it stands.
- **A8.** The amendment page reconciled: the 12 in-situ frames the census
  script names are struck **on** the page, and the PR body re-runs the script
  and states its output.
- **A9.** Every contrast ratio and hit-target size on the row and the screen
  appears in the PR body as a number.
- **A11.** **`/you/concept2` registers in `design.spec.ts`** — a
  `test.describe` carrying `assertTapTargets` and `assertNoA11yViolations`
  against the route, in both orientations, **in this PR**.
  `docs/TESTING.md:307-310` requires it, and `design.spec.ts:4239-4245` is this
  repo's own record of the last time a new door shipped without it.
- **A12.** The PR body states which answer Gate 0 gave on
  `monitor/Concept2LinkProbe` (moved behind `/you/concept2`, or left on You
  with R10's prose narrowed), and R10's sentence in the shipped spec matches
  the grep that gates it.
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
- **B7.** W3's record names **which of the four NO outcomes** occurred, or
  states PASS with the evidence that distinguishes Safari from the sheet. A
  walk that records "it worked" without naming what a NO would have looked like
  has not run W3.

### PR C — which number is authoritative

**These are the exit criteria of the QUESTION, not of a fix.** PR C's own spec
is written after they are met, and it is that spec — not this one — that
carries a design and a Gate 0 if a rower-visible number moves.

- **C1.** §5.4's question 1 is answered with a citation or a walk: what
  Concept2 compares the verification code against, and with what tolerance.
  **"Nothing found" is not an answer here** — it is the current state, and C1
  is met only by a primary source or an observation.
- **C2.** §5.4's question 3 is answered by observation: a Just Row row and a
  single-interval row are sent and their codes entered, and the result is
  recorded either way. This is one walk leg and it is the cheapest evidence
  available.
- **C3.** The authoritative number is named, with the reason, in a form that
  survives someone disagreeing with it: which stored field, why that one, and
  what would have to be true for the other to be right.
- **C4.** The gate is specified before it is built, to §5.4's four
  requirements: expected value from the capture's own summary frame; the test
  starts upstream of the producer; it is proven to go red on the DIVERGENT
  capture (`rest-boundary`, machine 198 m against our 197 m —
  `oracleCorpusReplay.test.ts`), not only on the three that agree; and the PR
  body says plainly that no gate here can tell us what Concept2 accepts.
- **C5.** A rendered before/after of any number a rower reads, per the standing
  design gate's own "a number change is a design question too" clause. If no
  displayed number moves, the PR body says so and names the screens checked.
- **C6.** The antagonist FULL pass ran on PR C's spec, and a PM gate on its PR.
  TRIAD, both non-negotiable.

---

## 9 · Contradictions with the brief, recorded

The brief is not automatically right, and five of its claims did not survive
reading the code. **REV 3 adds a second list below: five claims of REV 2's own
that did not survive the delta antagonist pass, and three things REV 3 found
while folding them.** Superseded reasoning is replaced where it was argued, so
this section is a record of what changed, not a place the old claims still
live.

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
   panel (`:429`). §5.1's screen-frames table works from fifteen rows; the ROW's
   own table is a different function and is enumerated separately.
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

### 9b · What REV 2 got wrong, and where the correction lives

Each of these was corrected in place above; they are listed here so the change
is countable rather than implied.

6. **"The You surface is their only warning" — FALSE.** The log's Send block
   has a first-class reauth state and renders `RECONNECT NEEDED` plus a
   sentence for it (`Concept2SendBlock.tsx:116`, `:209-212`). REV 2's
   `grep -c needsReauth` proved nothing because the wire spells it
   `needs_reauth` and the client spells it `reauth`. Corrected in §5.1's R3
   justification, and the real argument (pre-emptive versus post-failure) is
   stated in its place.
7. **"No new ref, no new lifetime, nothing for RF27 to tabulate" — that WAS
   the defect.** `link`/`failed` are per-mount `useState` and You unmounts on
   every trip to the screen, so R4's evidence had a shorter lifetime than the
   fact it carried. Corrected by ruling 6 and the `seen` lifetime table.
8. **A fifteen-row table over card frames could not express the row's value.**
   The row reads two inputs; the table enumerated one axis. The collision it
   hid is decision-table row 10. Replaced, not extended.
9. **A verbatim quote was attributed to the wrong file, and its real home is
   the argument AGAINST the claim it was cited for.** _"drawing them the same
   way tells a rower whose server does have it that it does not"_ is
   `Concept2Card.tsx:212-215`, not `useConcept2Link.ts:126-136`, and the four
   lines after it rule `failed` OVER a stale `link` — the exact ordering REV 2
   used it to reverse. Citation corrected; the departure is now stated as a
   departure.
10. **"You imports no Concept2 component other than the row" — not proven by
    its own grep, and false today.** `You.tsx:22-23` imports and `:127-131`
    mounts `monitor/Concept2LinkProbe`. R10's prose is narrowed and the choice
    goes to Gate 0.
11. **The web return path REV 2 described does not exist.** The callback page
    carries no outbound link by design (`server/concept2/callbackPage.ts:9-17`).
    The partition's conclusion survives on the unload; the mechanism is
    withdrawn.
12. **The attempt state is five values.** `linkFlow.ts:110`'s `linkInFlight` is
    module-level and survives unmount.
13. **No exit criterion registered the new screen in `design.spec.ts`**, which
    `docs/TESTING.md:307-310` requires — on a design whose own precedent
    (`design.spec.ts:4239-4245`) is a record of forgetting exactly that. Now
    A11.

### 9c · Three things REV 3 found while folding, worth stating on their own

14. **The row's decision table has a THIRD input on two of its cells, and that
    is forced by ruling 6 rather than chosen.** The `seen` flag is what makes
    R4 sound, and it is an input wherever `link` is `null`. The table says so
    and marks it n/a everywhere else, because a table that hid a third axis
    would be REV 2's defect with a different arity.
15. **The comparison PR C needs already exists, already records a
    disagreement, and has no consumer.** `oracleCorpusReplay.test.ts`'s RC-9(b)
    asserts 0x0039's `198` against our `197` on the `rest-boundary` capture and
    calls it the corpus's widest gap. The divergence class James hit at 2 m has
    been in our own corpus at 1 m, characterised and green, since RC-9(b)
    landed — because nothing on the send path reads the machine's number.
16. **A Just Row row does not "coincidentally" agree with the monitor — it
    POSTS the monitor's number.** `freeRowTotals` reads `summaryTotals` first
    (`justrow/totals.ts:38-43`) and `JustRowLog.tsx:302-303` posts that as the
    work pair. So the two paths this feature was most walked on are the two
    that cannot exhibit the defect, which is a mechanism for the miss rather
    than a guess at one.

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
  made. The **three** PRs take their rows in the Wave E block when the first
  one opens; that is owed and is recorded here so it is not lost. PR C's
  underlying defect is already filed in ROADMAP's queued register (`c2e7f76a`);
  what is owed is the PHASE row, not the finding.
- **PR C's fix.** §5.4 states the question, the four things that have to be
  answered, and what a gate would have to compare against. **It deliberately
  names no authoritative number and prescribes no change to the send payload.**
  That is not deferral: two numbers exist, the monitor disagrees with itself by
  2 m, and nothing yet establishes what Concept2 compares against. A spec that
  picked one would be choosing what we assert to a third party on the strength
  of an untested argument. PR C's own spec makes that choice, after C1-C3.
- **Widening the row into a menu.** `/you/concept2` is a leaf. If a second
  Concept2 tool ever exists, the row becomes a menu the way DIAGNOSTICS did;
  nothing here is designed for that and nothing here forecloses it.
- **Lifting attempt state above the route.** §5.1's partition depends on
  `outcome`/`busy`/`armed`/`unlinkFailed` staying inside `Concept2Card`. A
  future context or store that hoisted them would make the row able to show
  attempt state, and would need R2 re-argued rather than silently broken.
