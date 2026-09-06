# Concept2 link-out device walk — 2026-09-04 (PR B, Task 3)

**Outcome: Branch A.** Tapping `View on Concept2 →` on a sent row left the
app and opened the phone's DEFAULT browser (Chrome, not Safari), already
signed in, on the rower's own result. The in-app `SFSafariViewController`
sheet and its isolated cookie jar are gone from the path, which is what PR B
exists to prove. `@capacitor/browser` now has no consumer.

## Provenance

- Build: branch `wave-e-c2-walk-fixes`, head `9c2faa80` (Task 2's card plus
  the default-browser wording fix); `pnpm ios:build` stamped `0.37.0 (860)`;
  Debug configuration, built with `xcodebuild -project App.xcodeproj -scheme
  App -destination id=<Kaito>` and installed wirelessly with
  `xcrun devicectl device install app` to James's iPhone 17 Pro ("Kaito").
  iOS version not captured. Version stamps restored before any commit.
- Server: the deployed production API (`VITE_API_BASE` default), untouched
  by PR B. The link host was not read off the app separately (W0's first
  half); the page that loaded is the Concept2 logbook result page shown in
  the capture.
- No erg, no rowing, no recording. Native builds do not expose the web
  recording seam; this card is the whole instrument (see the card's own
  "what this proves").
- One capture, `w4-result-in-chrome.png`: an original, unedited phone
  screenshot taken in Chrome after W3. No W3 photograph of the transition
  itself was taken; W3's outcome is James's report ("it took me to chrome
  and I was logged in").

## Checks

| Check | Result | Evidence |
| --- | --- | --- |
| W0 default browser signed in | PASS (by report) | Default browser is Chrome; James reports being logged in when the page opened. Not checked in the browser BEFORE the tap, so "signed in" is established by W4's page rather than by a prior check. |
| W1 You card `LINKED ✓` | NOT RECORDED | Not reported; the surface is unchanged by PR B. |
| W2 log detail `SENT` / `RESULT <id>` | PASS (by report) | James opened a sent row and returned to it showing SENT. Result id not captured. |
| **W3 which app is in front** | **PASS — default browser (Chrome)** | Chrome's tab bar is visible in the capture (back, forward, +, tabs `5`, more). Not the sheet (no `Done`), not nothing, not another app, not the WebView navigating away. |
| **W4 the page that loaded** | **PASS — the actual result** | `james morelli · 30:00 row`: 5,708 METERS · 25:00.0 TIME · 2:11.3 PACE · 350 CALORIES; Rest Distance 525, Rest Time 5:00.0, Overall Distance 6,233, Overall Time 30:00.0, Average Watts 154, Calories Per Hour 831, Stroke Rate 21; Visible To: Training Partners Only; dated September 04 2026 17:19. Not the "private result" page. |
| W5 return to Ergomatic | PASS — warm return | "Went back to the log row showing sent." Not a cold relaunch to Today. Design page §7.2's promise holds for this run. |
| W6 CONCEPT2 block still rendered | PASS (by report) | The row still showed SENT on return; no flicker reported (not specifically watched for). |
| W7 no-weight refusal → `OPEN CONCEPT2 PROFILE` | NOT REACHED | Cannot be provoked on an account whose weight class Concept2 already knows. Its sharing `openReadOnlyUrl` with W3 remains an inference from the two call sites, not a walked fact. |

## What this does and does not establish

- Establishes: on this phone and build, a `noopener` `window.open` from the
  Capacitor WebView reaches the default browser, which carries the rower's
  Concept2 session. One run, one device, one iOS version (not captured).
- Does not establish: behaviour on a phone whose default browser has no
  Concept2 session (that rower sees Concept2's sign-in page, which the spec
  accepts); the W7 call site; W0's host discipline (read the host off the
  app before assuming it, next time).
- Side observation for PR C (the verification question, LAST in the
  spec's order): Concept2 stores this row as 5,708 m work with 525 m rest
  distance and 6,233 m overall. Which of those the PM5's verification code
  is computed over is the question PR C has to answer before changing what
  we send.

## Re-walk on the rebuilt binary (Task 5, same day)

Task 4 (`8dc634e9`) removed `@capacitor/browser` from `package.json`,
`pnpm-lock.yaml` and `CapApp-SPM/Package.swift`. A new plugin set is a new
binary, so W1-W4 were run again on it.

- Build: head `8dc634e9`, `pnpm ios:build` stamped `0.37.0 (862)`, Debug,
  same `xcodebuild` + `xcrun devicectl` install path as above, same phone.
  `App.app/Frameworks` contains no browser framework. Stamps restored.
- W1 `LINKED ✓`, W2 `SENT`, W3 default browser (Chrome), W4 the actual
  result: James reports "All the same" against the first run's four checks.
  No new capture; the first run's screenshot stands as the shape of the
  page. The plugin's removal changed nothing the rower can see, which is
  the claim Task 4 makes.
