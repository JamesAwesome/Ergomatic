# Gate 0 — the two Phase MT follow-on changes to the failure frames

2026-09-08. Both changes live on `app/src/workout/ConnectedInterstitial.tsx`'s
`renderFailureScreen` and on the landscape action-stack rule `#370` shipped in
`app/src/index.css`. Neither is implemented on this branch; everything here is
a capture and a measurement, produced so James can rule on the rendered thing.

**THIS IS THE APPROVAL RECORD FOR THE CHANGES THAT SHIPPED IN #378** — the
rendered artifact James ruled on, landed here (Phase MT close-out) because a
design gate's approved artifact outlives the PR body that presented it. Do not
confuse it with its sibling `docs/design/mt-closeout-gate0/`, which is the
AFTER-the-ruling re-measurement of the same two changes across all thirteen
`ConnectedError` reasons they reach, and which shipped inside #378 itself.
This directory is the BEFORE: the options, their measured costs, and the two
layouts put in front of him.

**Change 1 — the refusal frame loses "Row on the phone timer instead."**
Ruled by James, 2026-09-08: after a SkiErg refusal that button routes the rower
into storing a ski piece as a rowing log by hand. Four action buttons become
three.

**Change 2 — the `permission-denied` frame's DETAIL panel repeats its own body
line, verbatim.** Not ruled. The options and their measured costs are below.

## How these were produced

`app/e2e/gate0/mt-followon.gate.ts`, run with
`app/playwright.gate0.config.ts` against the worktree's own compose stack.
That config exists so the harness never joins `pnpm e2e` or CI: the default
`testMatch` rejects `.gate.ts`.

```
cd app
export REPO_ROOT="$(cd .. && pwd)"; source scripts/stack-env.sh
GATE_VARIANT=before pnpm exec playwright test -c playwright.gate0.config.ts
```

Frames are reached through the same supported producers the shipped suites
use — the fake monitor's `ergMachineType: 128` (`ERGMACHINE_TYPE_STATIC_SKI`)
for the refusal, `stubBluetoothPermissionDenied` for the permission frame,
`stubBluetoothScanFailure` for the link failure. `refusal-landscape.png` here
is byte-identical to the committed
`docs/screenshots/connected-interstitial-unsupported-machine-landscape.png`,
which is the check that this harness renders the shipped screen. Its portrait
twin matches the committed portrait capture the same way.

### What is real and what is reconstructed

- `before/` was captured against HEAD (`d7319040`).
- `after/` was captured against a temporary working-tree edit implementing
  change 1 (scoped to `unsupported-machine`) and change 2 option A. That edit
  was **reverted**; it is not on the branch. The stack was rebuilt to HEAD
  afterwards and re-verified (the refusal frame reports four buttons again).
- Every file with `reconstructed` in its name was produced by editing the live
  DOM rather than the source — removing a leaf node, or injecting the
  `Open Settings` button. Three of the four reconstructions have a real
  counterpart in `after/`, and the pairs are **byte-identical**
  (`refusal-landscape`, `permission-web4-landscape`, `permission-web4-portrait`);
  the fourth (`refusal-portrait`) differs in 29 bytes of the decoded image with
  every measured value equal. That is the evidence that the reconstruction
  method does not lie.
- **The five-button `permission-denied` stack could not be driven on the web
  build when these captures were taken.** `Open Settings` renders only when
  `canOpenAppSettings()` is true, and that was `isNative()` alone
  (`src/adapters/appSettings.ts`); `e2e/helpers.ts` said the same thing in its
  own comment. Forcing `isNative()` also flips
  `src/adapters/monitorTransport.ts` onto the Capacitor BLE arm, so the frame
  would never have been reached. Those captures inject the identical button
  node the native render produces, first child of the stack, and are labelled
  `reconstructed`.

  SUPERSEDED AFTERWARDS, and the sentence above is left in the past tense
  rather than deleted because it is what these captures were made under: the
  Phase MT close-out gave that adapter a dev-only door override
  (`window.__appSettingsDoor__`, gated on the same build-time fold every other
  dev seam uses and needled by `scripts/dist-grep.sh`), so the shape is now
  driven for real by `e2e/design.spec.ts`'s five-button case. Nothing in this
  directory was re-captured; the `reconstructed` labels still describe exactly
  how these files were made.

## The numbers

`measure.json` in each directory carries every field; `contrast.json` carries
every colour pairing. Landscape is 844x390, portrait 390x844. "Window" is
`.connected-interstitial-body`'s client height — the box the rower can see.
"Content" is its `scrollHeight`, which is floored at the window, so a frame
that fits reports the window's own number.

### Landscape, 844x390

| frame                                        | buttons | stack | window | content | overflow | headline  | on screen |
| -------------------------------------------- | ------- | ----- | ------ | ------- | -------- | --------- | --------- |
| refusal, today                               | 4       | 120   | 206    | 206     | 0        | 46.5-82.5 | yes       |
| refusal, change 1                            | 3       | 120   | 206    | 206     | 0        | 46.5-82.5 | yes       |
| refusal, change 1 + layout B                 | 3       | 120   | 206    | 206     | 0        | 46.5-82.5 | yes       |
| refusal, change 1 + layout C                 | 3       | 120   | 206    | 206     | 0        | 46.5-82.5 | yes       |
| permission, web (4 buttons), today           | 4       | 120   | 206    | 308     | 102      | 22-94     | yes       |
| permission, web, change 2 option A           | 4       | 120   | 206    | 206     | 0        | 37.5-109  | yes       |
| permission, web, change 2 option B           | 4       | 120   | 206    | 259     | 53       | 22-94     | yes       |
| permission, iOS (5 buttons), today           | 5       | 188   | 138    | 308     | 170      | 22-94     | yes       |
| permission, iOS, option A                    | 5       | 188   | 138    | 175     | 37       | 22-94     | yes       |
| permission, iOS, option B                    | 5       | 188   | 138    | 259     | 121      | 22-94     | yes       |
| permission, iOS, option A + button dropped   | 4       | 120   | 206    | 206     | 0        | 37.5-109  | yes       |
| link-failed, today (control)                 | 4       | 120   | 206    | 219     | 13       | 22-94     | yes       |
| link-failed, option B                        | 4       | 120   | 206    | 206     | 0        | 25-97     | yes       |

### Portrait, 390x844

| frame                              | buttons | stack | window | content | overflow | headline    | on screen |
| ---------------------------------- | ------- | ----- | ------ | ------- | -------- | ----------- | --------- |
| refusal, today                     | 4       | 248   | 532    | 532     | 0        | 179-251     | yes       |
| refusal, change 1                  | 3       | 184   | 596    | 596     | 0        | 211-283     | yes       |
| permission, web, today             | 4       | 248   | 532    | 532     | 0        | 130-202     | yes       |
| permission, web, option A          | 4       | 248   | 532    | 532     | 0        | 198.5-270.5 | yes       |
| permission, web, option B          | 4       | 248   | 532    | 532     | 0        | 154.5-226.5 | yes       |
| permission, iOS, today             | 5       | 316   | 464    | 464     | 0        | 96-168      | yes       |
| permission, iOS, option A          | 5       | 316   | 464    | 464     | 0        | 164.5-236.5 | yes       |
| link-failed, today                 | 4       | 248   | 532    | 532     | 0        | 176.5-248.5 | yes       |

Nothing overflows in portrait, in any variant, before or after. The headline
is on screen in every row of both tables.

### Tap targets

Minimum measured height across every `a`/`button`/`[role=button]`/`input`/
`select` on the frame: **44px** on the refusal frames (the
`WHICH ERGS WORK ›` support link, which sits exactly on `var(--tap)`) and
**52px** on the permission and link-failed frames. Minimum width 214px in
landscape (a paired button) and 350px in portrait. The floor holds in every
capture, before and after, both orientations. Change 1 removes a button; it
adds nothing that could sit under 44px.

### Contrast

Every pairing on these frames, computed from the rendered `getComputedStyle`
colours against the nearest painted ancestor background (`contrast.json`):

| ratio   | element                          | fg / bg           |
| ------- | -------------------------------- | ----------------- |
| 5.94:1  | `.button-l1` label               | #fffdf7 / #b5341f |
| 6.30:1  | `.connected-detail-title`        | #57544c / #efeade |
| 6.30:1  | `.connected-detail-raw`          | #57544c / #efeade |
| 6.69:1  | `.connected-status-label`        | #57544c / #f4f1e8 |
| 6.69:1  | `.connected-reassurance`         | #57544c / #f4f1e8 |
| 9.16:1  | `.connected-detail-line`         | #3f3c35 / #efeade |
| 9.74:1  | `.connected-body-line`           | #3f3c35 / #f4f1e8 |
| 15.41:1 | `.connected-serif-line`          | #1b1a17 / #f4f1e8 |
| 15.41:1 | `.connected-support-link`        | #1b1a17 / #f4f1e8 |
| 17.11:1 | `.button-l2` label               | #1b1a17 / #fffdf7 |

All eleven clear the 4.5:1 AA floor; the lowest is 5.94:1. **Neither change
introduces a new pairing** — both only remove elements. `contrast.json` also
carries a 7.41:1 row for `Open Settings` at `#9c2c19`: that is `--accent-hover`
caught on the injected button, not a resting colour. At rest that button is
`.button-l1` on `--accent`, i.e. the 5.94:1 row.

## Change 1: what three buttons do to #370's pairing rule

`#370`'s rule is
`.connected-interstitial-actions--failure > button:nth-last-child(-n + 4) { grid-column: auto; }`
over a base of `grid-column: 1 / -1`. At **three** children, `-n + 4` matches
**all three**, so every button pairs and the stack resolves to:

```
[ Try again ] [ View connection log ]
[ Cancel     ] (empty cell)
```

Measured: `Try again` 214x56 at x=202, `View connection log` 214x56 at x=428,
`Cancel` 214x52 at x=202 — and an empty bottom-right cell. **The 206px window
survives**: the stack is 120px tall at three buttons and at four, because both
resolve to two rows and row height is set by `.button-l1`'s own `min-height:
56px` plus `.button-l2`'s 52px, not by the button count.

That last point corrects a claim in `index.css`'s own `--failure` comment,
which says the first row "is the taller because `Row on the phone timer
instead` wraps to two lines at 214px and grid row-stretch takes `Try again`
with it." Measured: with that button gone, row one is still 56px, because
`Try again` alone is 56px (`.button-l1 { min-height: 56px }`, `.button-l2
{ min-height: 52px }`).

Three layouts, all measured, all with identical stack height (120px) and
identical window (206px) — the choice is visual only:

- **A** (`refusal-3btn-reconstructed-landscape.png`) — today's rule, untouched.
  Ragged: an empty cell bottom-right.
- **B** (`refusal-3btn-optionB-landscape.png`) — `Try again` full width above
  a `[View connection log][Cancel]` pair. One extra CSS declaration.
- **C** (`refusal-3btn-optionC-landscape.png`) — `[Try again][View connection
  log]` above a full-width `Cancel`. One extra CSS declaration.

Portrait is unaffected by the pairing rule (it never applies there); the stack
simply loses one 52px row plus its 12px gap, 248px to 184px, and the message
window grows 532px to 596px.

## Change 2: the duplication, and what it actually costs

On `permission-denied` the panel prints, in order: `DETAIL`,
`PERMISSION-DENIED`, `error.detail` — **the same sentence already rendered as
the body line** — and `error.raw`. Panel height 125px of a 308px frame; the
duplicated line alone is 49px of that (option B's panel measures 76px).

**Two corrections to the premise this gate was filed on:**

1. **The refusal's argument does not transfer whole.** `#366` dropped the
   panel from the refusal frame partly because that error is built with
   `{reason, detail}` and no `raw`, "so the only non-duplicate token is the
   reason slug". `permission-denied` **always** carries a `raw`:
   `useMonitorSession.ts`'s `mapRadioFailure` returns `raw: message` on that
   arm. So dropping the whole panel here also drops a genuinely
   non-duplicated platform string (`BLE permission denied` in the web
   capture; the plugin's own message on device).
2. **The duplication is not one frame's problem.** `failedSerifLine` returns
   `error.detail` as the HEADLINE for every non-machine-refusal reason, so
   `link-failed`, `bluetooth-off`, `busy`, `transport-missing`,
   `scan-dismissed`, `disconnected`, the four `target-*` reasons and
   `scan-cleanup-failed` all print their detail twice as well — see
   `before/linkfailed-portrait.png`, where "The link to the monitor failed."
   is the headline and the panel's third line. Only the seven genuine machine
   statements (`nak`, `bad`, `not-ready`, `garbled`, `timeout`,
   `not-observed`, `structure-mismatch`) have a headline the panel does not
   repeat.

### Options

- **A — drop the whole DETAIL panel on `permission-denied`** (what was filed).
  Landscape web: content 308 to 206 against a 206 window, so the frame stops
  overflowing entirely and the remedy sentence reads in full. Cost, measured:
  the reason slug and the `raw` platform string leave the screen; both remain
  in the connection log. Landscape iOS (5 buttons): content 308 to 175 against
  a 138 window — **still 37px short**, and the part still cut is the remedy's
  last line ("try again."). See
  `after/permission-ios5-reconstructed-landscape.png`.
- **B — drop only the line that repeats.** Panel 125px to 76px; landscape web
  overflow 102px to 53px, so the frame still overflows and the panel is still
  cut in landscape. Keeps the reason slug and the platform string on screen.
  Applies unchanged to the ten other reasons named above.
- **C — leave it.** Today's frame: the sentence twice, and in landscape a
  `DETAIL` heading with nothing legible under it.
- **A + drop the phone-timer button on every failure frame** (not just the
  refusal). This is the only combination measured that makes the iOS landscape
  permission frame fit: 4 buttons, stack 120, window 206, content 206,
  overflow 0. Cost, measured: `Open Settings` loses its full-width row and
  pairs with `Try again`, putting **two `--accent` buttons side by side** —
  see `before/permission-ios4-optionA-reconstructed-landscape.png` — which
  `index.css` elsewhere rules out in as many words ("two reds on one screen
  would compete for the eye"). It also removes the phone-timer fallback from
  frames where the rower IS on a rowing machine, which is not what change 1
  was ruled for.

## Other observations, not part of either change

- The free-row refusal (`src/justrow/JustRow.tsx`, `axes.program === "failed"`)
  renders `Try again` + `Cancel` only, has no phone-timer button, and wears
  `.connected-interstitial-actions` **without** the `--failure` modifier — so
  `#370`'s landscape pairing does not reach it. At two buttons it is a 120px
  stack either way, so nothing is cut today.
- `permission-denied`'s body copy reads "Ergomatic can't reach your PM5
  without Bluetooth." The rower is not being told WHICH monitor here, which is
  what CLAUDE.md's recurring failure 32 reserves the brand name for.
