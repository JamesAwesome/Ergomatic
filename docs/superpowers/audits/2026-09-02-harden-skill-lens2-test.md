# Lens 2 of the `harden` skill, tested against a pre-hardening plan draft

**What this is.** A controlled test of the `harden` skill's second lens, not a
review of shipped code. The subject was the DRAFT of Wave E PR1.75b's native
plan (`606d3f72` on `wave-e-pr175b-native`), before any of the eleven
antagonist passes ran, against a baseline worktree at `94b83c84` — the commit
the plan was written for. The antagonist ledger was withheld from the agent so
it could not read the answer key; it confirms it did not open it.

**Result.** Fifteen findings in ONE pass, recovering defects the original loop
needed passes 1, 2, 3, 4, 6, 7 and 11 to reach, plus four the eleven passes
never found.

**Disposition against the implemented branch** (checked 2026-09-02 at
`aba9e5ce`, which is NOT merged):

- **F5 is LIVE and unfixed.** `linkFlow.ts` derives `stateEchoed` as
  `returnedState !== null`, so a callback carrying `?state=` empty reports
  `stateEchoed: true` and also trips the mismatch refusal
  (`"" !== "abc"`), discarding a callback that carried a valid code.
  Reproduced against the shipped predicate in Node. No test covers an empty
  `state`; every fixture uses `state=abc` or omits it. It matters because the
  walk records design exit criterion 4 from this value, and the code's own
  comment says the echo shape is UNMEASURED.
- **F6 was fixed by per-task review**, after surviving all eleven passes:
  `linkFlow.ts` now maps an empty `code` to `null` with a test.
- **F4 was fixed by per-task review**: `LINK_CLIENT` now carries an
  independent literal pin.
- **F9 and F10 were fixed by per-task review** (the outcome payload reaching
  the readout; `ephemeral` defaulting true).
- The remaining findings describe the draft and were addressed by the eleven
  passes, by review, or do not apply to the implemented shape.

Everything below is the agent's report, unedited.

---

# Lens 2 — the prescribed code, read as code

Subject: `plan-draft.md` (Wave E PR1.75b, 2,034 lines).
Tree: `/private/tmp/harden-baseline` at `94b83c84`. All commands from
`/private/tmp/harden-baseline/app` with `PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"`
(Node v26.5.0). I did **not** open `.claude/agents/antagonist-ledger.md`.

Every prescribed block was extracted to its real path: `WebAuthPlugin.swift`,
`MyViewController.swift`, `Main.storyboard:14`, the four `project.pbxproj`
entries, `Info.plist`'s new URL type, `scripts/ios-google-client-id.sh`, the
`ios-release.sh` replacement, the `ios-release.test.sh` append, `webAuth.ts`,
`linkFlow.ts`, `linkFlow.test.ts`, `Concept2LinkProbe.tsx`,
`Concept2LinkProbe.test.tsx`, the Task 8 census script, and the walk card's
shell blocks.

---

## 1. Gate results on the prescribed code

### F1 — `pnpm typecheck` FAILS on the prescribed `Concept2LinkProbe.test.tsx`; so does `pnpm build`

`mockLink`'s `api` stub is declared with no parameters, so `c[0]` in the
re-read assertion has no type.

```
$ pnpm typecheck
src/monitor/Concept2LinkProbe.test.tsx(139,45): error TS2493: Tuple type '[]' of length '0' has no element at index '0'.
[ELIFECYCLE] Command failed with exit code 2.
```

`pnpm build` fails identically (`tsc -b` runs first), which also blocks
`npx cap sync ios` and therefore Task 1 step 9's Xcode gate.

Fix: `async (_path: string) =>` in `mockLink` (the `_` prefix is required —
plain `path` then trips `TS6133: 'path' is declared but its value is never
read`, measured). **Changes a code block.**

### F2 — `pnpm lint` FAILS on the prescribed `Concept2LinkProbe.tsx`, and the plan forbids a suppression

```
$ pnpm lint
/private/tmp/harden-baseline/app/src/monitor/Concept2LinkProbe.tsx
  73:10  error  Error: Calling setState synchronously within an effect can trigger cascading renders
  ...  react-hooks/set-state-in-effect
✖ 1 problem (1 error, 0 warnings)
```

`eslint.config.js:34` spreads `reactHooks.configs.recommended.rules`, which
carries `set-state-in-effect`; the plan's Global Constraints say "Typed-lint
ratchet: no new suppressions". The mount-time `useEffect(() => { void
readStatus(); }, [readStatus])` must be restructured. **Changes a code block.**

### F3 — the prescribed `linkFlow.test.ts` cannot pass: 17/18, one 5s timeout, three independent causes

```
$ NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project client src/adapters/linkFlow.test.ts
 FAIL  ... > refuses a SECOND concurrent call with `busy` without minting again
Error: Test timed out in 5000ms.
 Test Files  1 failed (1)
      Tests  1 failed | 17 passed (18)
```

Peeling them one at a time (each fix exposes the next):

1. `release(...)` is called before the first attempt has reached the plugin.
   `const second = await startLink(...)` returns `busy` synchronously, so its
   `await` yields one microtask — not enough for the first call's mint,
   `res.json()` and dynamic `import("../native/webAuth")` to land. `release` is
   still the `() => undefined` initialiser, so `await first` never settles.
2. With that fixed: `TypeError: Body is unusable: Body has already been read`
   at `linkFlow.ts:219`. `mockApi` stages ONE `Response` instance for
   `/connect` and the test deliberately mints twice.
3. With that fixed: timeout again. The final `await startLink({weightClass:"H"})`
   awaits a plugin promise nobody resolves.

With all three repaired (`mint.clone()`, a `setTimeout(0)` before `release`,
and `void startLink(...)` + `vi.waitFor`) the file is **18 passed (18)**.
The implementation `linkFlow.ts` needed no change. **Changes a code block.**

### F14 — `pnpm format:check` fails on all four new TS/TSX files

```
$ pnpm format:check
[warn] src/adapters/linkFlow.test.ts
[warn] src/adapters/linkFlow.ts
[warn] src/monitor/Concept2LinkProbe.test.tsx
[warn] src/monitor/Concept2LinkProbe.tsx
[warn] Code style issues found in 4 files.
```

Whitespace only (union members and one JSX button re-wrap). **Changes a code
block**, but it is one `prettier --write`.

### Gates that came back CLEAN (stated so the report is not one-sided)

- **`Concept2LinkProbe.test.tsx` passes once F1 is repaired:** `Tests 9 passed (9)`.
- **The Swift compiles.** After `pnpm build && npx cap sync ios`, Task 1 step 9's
  command returned `** BUILD SUCCEEDED **`, rc=0, `grep -n "error:"` empty, and
  zero warnings naming `WebAuthPlugin.swift` or `MyViewController.swift` — so
  observation 13's actor-isolation contingency did not fire, and the deprecated
  string initializer emits nothing.
- **`xcodebuild -list` still prints `Targets: App`** after the four pbxproj
  inserts; `plutil -lint App/Info.plist` → `OK`.
- **Every pbxproj / storyboard / plist line citation in Task 1 is exact.**
  `:13`, `:24`, `:66`, `:159`, storyboard `:14`, plist `:21-31` all match.
- **`bash -n` passes on all five prescribed shell blocks.**
- **`dist:grep` behaves exactly as Task 4 step 6 predicts**, including the RF12
  red proof: flag unset → `dist-grep: OK — none of the 8 dev-only markers found
  in dist/client.`; `VITE_ENABLE_C2_LINK_PROBE=1 pnpm build && pnpm dist:grep` →
  `dist-grep: FOUND dev-only reference "C2 link probe (dev harness)" in the
  production bundle: dist/client/assets/Concept2LinkProbe-D3CkvMSS.js` and
  `exit code 1`.
- **The six new `ios-release.test.sh` cases all pass** when placed correctly
  (see F7), against a tree where `Info.plist` had not yet been edited —
  confirming the plan's own step-10 non-bite prediction.

---

## 2. The four named finding classes

### F4 — a self-comparing test: `LINK_CLIENT`'s VALUE is never pinned

The mint assertion is `toStrictEqual({ weightClass: "H", linkClient: LINK_CLIENT })`,
where `LINK_CLIENT` is imported from the module under test. `LINK_CALLBACK_SCHEME`
gets an independent literal one line later (`expect(LINK_CALLBACK_SCHEME).toBe("haus.waffle.ergomatic")`);
`LINK_CLIENT` gets none. The only other occurrence of the string in `src/` is a
test *title*.

Mutation, against a repaired (18/18) baseline:

```
$ grep -rn "webauth-1" src/
src/adapters/linkFlow.ts:37:export const LINK_CLIENT = "webauth-1";
src/adapters/linkFlow.test.ts:56:  it("mints with linkClient webauth-1, ...

--- baseline ---            Tests  18 passed (18)
--- LINK_CLIENT = "webauth-99" ---   Tests  18 passed (18)
```

The server rejects any value ≠ `NATIVE_LINK_CLIENT` with `409 {error:"update_required"}`
(`server/routes/concept2.ts:74,238`), so a drifted constant means **every native
mint 409s in a shipped build** and no gate in the plan bites. Fix: one independent
literal, `expect(LINK_CLIENT).toBe("webauth-1")`. **Changes a code block.**

### F5 / F6 — absent / empty / valued over the callback URL

`completeNative` does `const code = params.get("code")`, `const returnedState =
params.get("state")`, `const stateEchoed = returnedState !== null`. Ran all three
states through the real predicate:

```
$ node -e '...'   # replaying linkFlow.ts's own branch logic
"...?code=CODE1&state=abc"        | code="CODE1" state="abc" stateEchoed=true  -> EXCHANGE {code:"CODE1"}
"...?code=&state=abc"             | code=""      state="abc" stateEchoed=true  -> EXCHANGE {code:""}
"...?code=CODE1&state="           | code="CODE1" state=""    stateEchoed=true  -> stateMismatch
"...?code=CODE1"                  | code="CODE1" state=null  stateEchoed=false -> EXCHANGE {code:"CODE1"}
"...?error=access_denied&state="  | code=null    state=""    stateEchoed=true  -> declined
```

**F5 (the worse one): `?state=` present-but-empty.** `stateEchoed` reports
`true`, so the probe card prints `Callback carried state: yes` and the walk
records a YES for design exit criterion 4 — for a callback that echoed nothing.
Worse, `"" !== "abc"` trips the mismatch refusal, so a link with a valid `code`
is thrown away as `stateMismatch`. The prescribed comment says "when it is absent
this check is a deliberate no-op" — true for absent, false for empty, and the
plan's own text says the echo behaviour is UNMEASURED, i.e. empty is exactly one
of the shapes the walk exists to discover. **Changes a code block, and changes
the value the walk records.**

**F6: `?code=` present-but-empty** survives the `code === null` guard and POSTs
`{code: "", state}` to `/exchange`, producing a server round-trip that can only
fail (`502 c2_error` / `400`) and surfacing as `serverError`/`exchangeFailed`
rather than `malformed`. **Changes a code block.**

Neither shape appears in the prescribed tests: every fixture is absent-or-valued.

### F9 — dropped diagnostics: the probe is the only readout and it drops everything but `kind`

Three, all in `Concept2LinkProbe.tsx`, all measured by rendering the prescribed
component:

(a) **`pluginError`'s `code` and `message` never reach the screen.** Plan
observation 2 adds `pluginError { code, message }` precisely so `cannotStart`, a
failed `start()`, and a foreign `NSError` are not swallowed — and the card renders
`Last outcome: ${outcome.kind}` only:

```
SCREEN TEXT: C2 LINK PROBE (DEV HARNESS)Link status: not linkedStart real link (log-dev)Last outcome: pluginErrorCallback carried state: n/aRe-read link status
```

The same applies to `mintFailed`/`exchangeFailed`'s `status` + `error` and
`serverError`'s `status`. On the walk, `cannotStart`, `badRequest` and an unknown
NSError are indistinguishable.

(b) **A failed `GET /api/concept2/link` leaves the card at `reading...` forever.**
`readStatus` never checks `res.ok` and has no `catch`; `void readStatus()` in the
mount effect swallows the rejection. Rendered against a `502` HTML response:

```
<section>
  <p>Link status: reading...</p>
...
⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯
SyntaxError: Unexpected token '<', "<!DOCTYPE html>nope" is not valid JSON
```

The walk card's only failure branch here is "If the card is not there the build
did not carry the flag"; a card that is there and stuck has no diagnosis.

(c) **`onStart` has `try/finally` but no `catch`.** `startLink` can throw —
`new URL(callbackUrl)` at `linkFlow.ts:135` is unguarded, and `res.json()` on an
`ok` non-JSON mint throws — so a real failure clears `busy`, leaves `Last outcome:`
stale, and dies as an unhandled rejection in the WebView console.

**Changes a code block; (a) and (b) also change what walk steps (a)-(d) can record.**

### F10 — a fail-open default: `ephemeral`

`WebAuthPlugin.startOnMain` validates `url` and `callbackScheme` with an explicit
`badRequest` rejection, then reads the one option that is a security control as:

```swift
session.prefersEphemeralWebBrowserSession = call.getBool("ephemeral", false)
```

An omitted `ephemeral` therefore yields the **non-ephemeral, Safari-cookie-sharing
session** — the exact thing the surrounding comment says the flag exists to prevent
("on a shared phone the next link could silently complete against whoever last
logged into Concept2 in Safari"). The vendored SDK offers the safe alternative:
`JSTypes.swift:35` declares `func getBool(_ key: String) -> Bool?`, so a
`guard let` + `badRequest` matches the two neighbouring reads.

TypeScript mitigates but does not close it: `WebAuthStartOptions.ephemeral` is
required, so the one prescribed caller passes `true`. It is not the enforcement
boundary — the Capacitor bridge accepts any JS object, and the plugin ships in a
dev build whose whole purpose is manual console poking. Asymmetric validation on
the one option whose wrong value is silent. **Changes a code block.**

### F11 — an untested seam / a "cannot happen" that is ordering luck

`finish()` opens with `guard let call = activeCall else { return }` and the comment
claims "single resolution by construction, not by ordering luck". The guard reads a
**shared slot**, not an identity. Sequence, entirely inside walk case (d):

1. `shouldOverrideLoad` fires on the reload → `abandonActiveSession()` clears the
   slots, calls `session.cancel()`, rejects call A `abandoned`.
2. `cancel()`'s completion is delivered asynchronously and the handler hops with
   `DispatchQueue.main.async`.
3. The fresh document mounts and the operator taps Start again → `startOnMain`
   sets `activeCall = B`, `activeSession = B`.
4. Session A's late completion runs `finish`, finds `activeCall` non-nil, and
   **resolves or rejects call B with session A's outcome.**

Both hops go through `DispatchQueue.main.async`, so which block is enqueued first
is exactly the ordering the comment denies. Walk case (d)'s own script ("reload,
then confirm a fresh Start real link works") is the procedure that produces it.
Fix: capture the session (or a token) in the completion closure and compare it to
`activeSession` before consuming `activeCall`. **Changes a code block.**

I could not execute this on device; it is settled by reading the prescribed Swift
against `WebViewDelegationHandler.swift:67-93` (the `decidePolicyFor` hook that
calls `shouldOverrideLoad`, read this session), not by observation.

### F15 — the release-mode `presentationAnchor` fallback ships the failure it documents

```swift
guard let anchor = activeAnchor else {
    assertionFailure("WebAuthPlugin: presentation anchor requested with no active session")
    return ASPresentationAnchor()
}
```

`assertionFailure` is compiled out in Release. The plan's own `startOnMain` comment
says a bare `ASPresentationAnchor()` "is exactly what produces error code 3 opaquely
later". So the branch the lifetime table says cannot happen delivers, in the shipped
configuration, precisely the opaque `presentationContextInvalid` the `noWindow` guard
was written to avoid. Cheap fix: re-derive `bridge?.viewController?.view.window`
before falling back. Reachability on device is **unsettled** — I report it as a
code-reading finding, not an observed one. **Changes a code block.**

---

## 3. Gates that cannot run as prescribed

### F7 — the `ios-release.test.sh` insertion point is inside a heredoc; the six new checks silently never run

Task 1 step 1: "Append ... immediately before the trailing `case "$1" in` dispatch
at `:212`". There is no trailing dispatch in that file — it ends at
`if [ "$fails" -gt 0 ]`. Line 212 is inside the quoted heredoc opened at line 209
that writes the `pnpm` stub:

```
$ sed -n '209,216p' scripts/ios-release.test.sh
cat >"$SIM/bin/pnpm" <<'STUB'
#!/usr/bin/env bash
echo "pnpm $*" >>"$STUB_LOG"
case "$1" in
  ios:build) exit 0 ;;
```

Splicing the block there and running it:

```
$ bash scripts/ios-release.test.spliced.sh | grep -c "google client id"
0
$ bash scripts/ios-release.test.spliced.sh | tail -1
ios-release.test.sh: all passed
```

`bash -n` on the spliced file passes (the block is inert heredoc text), so the file
reports **all passed while running zero of the six new checks** — RF21's exact shape.
Placed correctly (before the final `if`) all six pass:

```
ok    google client id: derived when the Google URL type is first
ok    google client id: derived when the Concept2 URL type is first (the index-0 trap)
ok    google client id: exits non-zero when no reversed scheme is present
ok    google client id: the failure names what it looked for
ok    google client id: the committed Info.plist still derives the real id
ok    ios-release: no longer derives the client id from URL-type index 0
ios-release.test.sh: all passed
```

**Changes a gate command** (the step's insertion instruction).

### F8 — Task 1 step 9's Xcode gate cannot run in a fresh worktree

Run as written at that point in the plan (Task 1, before any `pnpm build`):

```
$ xcodebuild -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
error: The file "config.xml" couldn't be opened because there is no such file.
error: The file "capacitor.config.json" couldn't be opened because there is no such file.
** BUILD FAILED **
The following build commands failed:
	CpResource .../App.app/public /tmp/harden-baseline/app/ios/App/App/public
	CpResource .../App.app/config.xml ...
	CpResource .../App.app/capacitor.config.json ...
(6 failures)
```

The prerequisite chain, walked to the first command whose inputs are all tracked:

```
$ git check-ignore -v app/ios/App/App/public
app/ios/.gitignore:4:App/App/public	app/ios/App/App/public
```

`public/`, `config.xml` and `capacitor.config.json` are `cap sync` outputs;
`npx cap sync ios` needs `dist/client`, which is gitignored at repo root
(`.gitignore:2`), which needs `pnpm build` — the plan's first `pnpm build` is in
**Task 4 step 6**, three tasks later. With `pnpm build && npx cap sync ios` first,
the same command returns `** BUILD SUCCEEDED **`.

The step must name `pnpm build && npx cap sync ios` as its precondition (and note
that `pnpm build` also runs `tsc -b`, so F1 blocks it too). **Changes a gate command.**

### F13 — the walk card's shell blocks fail in James's shell

fish 4.8.1 (`/opt/homebrew/bin/fish`). Section 3:

```
$ fish -c 'set -a; . /tmp/.../fake.env; set +a'
set: expected >= 1 arguments; got 0
```

and even with that repaired, fish cannot read a bash-style `.env` at all:

```
$ fish -c '. fake.env; echo "X=$X"'
fake.env (line 1): Unsupported use of '='. In fish, please use 'set X 1'.
X=1
^~^
.: Error while reading file 'fake.env'
```

so `C2_CLIENT_ID`/`C2_CLIENT_SECRET` would both be empty. Section 7:

```
$ fish -c 'unset VITE_ENABLE_C2_LINK_PROBE'
fish: Unknown command: unset
```

(`export VAR=1` and the `VAR=v cmd` prefix form DO work in fish 4.8.1 — those two
are fine.) This is the failure the agent briefing already names verbatim
("`set -a; . .env; set +a` ... his default shell is fish, and the walk card's FIRST
block would have failed"), reproduced in the new card. **Changes a walk step.**

---

## 4. Expected values contradicted by the plan's own code

### F12 — two rows of Task 8 step 3's census table are wrong at the head the plan itself creates

Ran the plan's own census script against the tree with every prescribed block in place:

```
$ bash census.sh /private/tmp/harden-baseline
=== appUrlOpen ===
  1  app/ios/App/App/WebAuthPlugin.swift          <-- table says "0 under app/src and app/ios"
...
=== browserFinished ===
  1  app/src/adapters/linkFlow.ts                 <-- table says "0 under app/src"
```

Both hits are text the plan prescribes:

- `WebAuthPlugin.swift:10` — `/// WHY THIS AND NOT A URL SCHEME + `appUrlOpen` ...`
- `linkFlow.ts:7` — `// `useReturnToApp`/`browserFinished` arm is retired in this PR`

Task 3 step 3's replacement header for `adapters/externalBrowser.ts` adds two more
`browserFinished` occurrences (`**`onBrowserFinished`/`onNativeBrowserFinished` were
REMOVED at PR1.75b**`). Task 8 step 3 says "Any hit not in this table is a defect in
this task", so as written the reconciliation task fails against the code the plan
itself wrote. Either the expected column becomes "1 (the design rationale comment)"
and "≥3 (the retirement narration)", or the pass conditions replace the counts.
**Changes an expected value.**

The census script itself is sound: it runs, and its red-proof reasoning holds —
`sed -E 's@^[[:space:]]*(\*|//|--|>)[[:space:]]?@@'` is what lets the wrapped
`posts nothing and\n * carries no client id` phrase be found, and `tr -s` alone
leaves the ` * ` marker inside the phrase.

---

## 5. BOOKKEEPING (folded, not worth a pass)

- The probe test titled "tapping Start real link calls startLink with the **selected**
  weight class" — there is no weight-class selector; `onStart` hardcodes
  `{ weightClass: "H" }`. Title wording only; the assertion and its mutation are fine.
- Task 8 step 1's census script does `cd "$1"` under `set -u` but no step shows the
  invocation with its argument.

---

## 6. What I could not settle

- **Everything on device.** Walk cases (a)-(e), the OS consent modal, whether
  Concept2 echoes `state` (and in which of the three shapes F5 distinguishes), and
  whether F11's late-completion window or F15's release-mode fallback is ever
  reached in practice. Reported as code-reading findings, not observations.
- **`pnpm e2e` / `pnpm screenshots` / `pnpm test:coverage`** — not run; out of this
  lens's brief and they need the compose stack.
- **The `ios-release.sh` replacement was applied and exercised only through
  `ios-release.test.sh`**, which stubs `git`/`pnpm`/`xcodebuild`; I did not run a
  real release.
- I did not verify the Task 8 step 2 baseline claim ("at `94b83c84` the script
  reports 1 hit in `Concept2LinkProbe.tsx` for both phrases") against the pristine
  file, because the prescribed rewrite had already replaced it in my tree.
