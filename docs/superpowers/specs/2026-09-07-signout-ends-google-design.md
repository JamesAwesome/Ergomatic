# Sign out does not sign you out

**Date:** 2026-09-07 · **Class:** TRIAD (auth) · **Status:** DRAFT, awaiting
antagonist pass and James's review · **Gate 0:** none — no copy or layout
changes; the button already says "Sign out" and this makes that true.

## What and why

James, on the v0.42.0 TestFlight build: _"signout works but when i hit sign in
it doesnt ask me to choose an account, it just auto signs in with the account i
used"_.

Our native sign-out ends OUR session and never tells Google. `nativeSignOut`
(`app/src/native/signin.ts`) posts to `/api/auth/signout` and clears the stored
token; it has never called the plugin's `logout`. Verified against the whole
history, not just the current file: `git log -S"SocialLogin.logout" -- app/src`
returns nothing.

So the Google session on the device survives. The next `SocialLogin.login()`
finds it, returns silently, and the rower is back in as the same account with no
chooser. **The defect is not the missing chooser. It is that a button labelled
Sign out leaves the identity provider signed in**, and the chooser is just how
you notice.

Consequence worth stating plainly: handing the phone to someone else does not
let them sign in as themselves, and the button implies a cleaner break than
happens. Behind an invite allowlist that is mild, but a sign-out that does not
sign out is the kind of thing that should not need a caveat.

## Not caused by the version bump — PROVEN, not hedged

v0.42.0 moved `@capgo/capacitor-social-login` from 8.4.4 to 8.5.5 and this was
noticed on that build, so a regression is the natural suspicion. It is not one.

**PRIMARY, measured.** `GoogleProvider.swift` is byte-identical between the two
releases — `md5 ba0b4e057b4c38cfec9803a36206ab7b` in both, checked against the
vendored 8.5.5 and against 8.4.4 fetched with `npm pack`. The only iOS-facing
differences anywhere in the plugin are a new Telegram provider and three
`google#*RestoreCredential` cases that reject as Android-only. `Package.swift`,
which pins the GoogleSignIn-iOS SPM range, is identical too.

So the bump could not have changed session reuse on iOS. The gap predates it by
the entire life of the file. **This paragraph originally hedged the claim as
untested inference on the grounds that proving it needed a build against 8.4.4.
That was wrong and the receipt cost under a minute:** both versions are
obtainable without building anything. Recorded because the reflex to price a
check as expensive is itself worth catching.

## The fix

`nativeSignOut` also calls `SocialLogin.logout({ provider: "google" })`.

**Ordering is the part that matters, and it is broader than the plugin call.**
The invariant is: *clearing the local token is the sign-out, and nothing that
can fail may be awaited before it.* Two things can fail — the server call and
the plugin call — and BOTH move after it, each swallowed but logged.

**REVISED after James asked why the offline case was not in scope, and he was
right.** The first draft moved only the plugin call and left
`api("/api/auth/signout")` awaited FIRST, which meant a rower offline or with
the server down tapped Sign out and stayed signed in completely: token intact,
Google session intact, rejection unhandled at the click handler. That is the
same mistake this spec exists to correct, one line higher, and it fails worse —
a plugin failure costs a chooser, a network failure costs the whole sign-out.
A spec that half-applies its own invariant is worse than one that never stated
it, because it reads as though the case were considered.

Order: `clearToken()`, then the server call, then the plugin logout.

A failed server call leaves an orphaned session row that cannot be used, since
the token authorising it is already destroyed. A failed Google logout leaves
the old behaviour, no chooser. Neither is worse than not signing out at all.

## Rejected: `forcePrompt: true` on login

The plugin's Google login options carry `forcePrompt?: boolean`, documented as
"forces the account selection prompt to appear on iOS". It is the obvious
one-line answer to the symptom James reported and it is the wrong fix.

It makes the chooser appear while leaving the Google session alive after sign
out. The observable complaint goes away and the actual defect stays: the button
still would not do what it says, and the next thing built on top of "signed out"
would inherit a false premise. **Fix the state, not the symptom of the state.**

Not proposed as a belt-and-braces addition either: once logout genuinely ends
the session, login prompts naturally, so `forcePrompt` would be a second
mechanism producing the same effect for a different reason — the shape
recurring failure 23 is about.

**What the fix does and does not promise, so nobody is surprised.** It ends the
session, which restores an interactive sign-in. It does not promise a
multi-account chooser every time. Google's SDK presents that flow through
`ASWebAuthenticationSession`, and nothing in the vendored source sets
`prefersEphemeralWebBrowserSession`, so it shares Safari's cookies. A rower
already signed into Google in Safari may therefore see a one-tap "Continue as
X" rather than a full account list. That is ordinary OAuth single-sign-on
behaviour and materially different from the silent, no-UI reuse reported here.
SUSPECTED, untested on device.

## The web half — ADDED 2026-09-07 after James tested: "Works on mobile not on web"

**This spec said the web path "is separate, is not affected, and is not
touched". The first two words were wrong**, and this is the second time in one
evening that a scope sentence in this document turned out to be a guess (the
first was the offline case). The web path has the same symptom for a different
reason, and — this is the important part — **the correct fix there is the one
this spec REJECTS for native.**

**Why it looks identical and is not.** On native, the app held a Google session
of its OWN, in the device keychain, put there by our sign-in. Ending it is what
"sign out" means, so `forcePrompt` would have painted over a state we control
and should have repaired.

On web there is no session of ours to end. Sign-out already clears our cookie
correctly. What survives is the BROWSER's own cookie with Google, which is not
ours, and clearing it would sign the rower out of Gmail and everything else
along with us. **There is no state here for us to fix**, so asking Google to
show the account picker is not a symptom mask — it is the only correct
mechanism the platform offers.

**The fix:** `prompt: "select_account"` on the authorization URL
(`server/auth/google.ts`). PRIMARY, Google's OpenID Connect documentation:
`select_account` is defined as *"The authorization server prompts the user to
select a user account."* Omitted, which is what we sent, a rower who has
already authorised us and is still signed into Google is returned with no
screen at all. That is the observed behaviour exactly.

**A reader taking the native "Rejected" section as general guidance would
reject this too.** That is why the reasoning is repeated in the code comment
rather than left to a cross-reference.

**Testing it required un-ignoring code.** `server/auth/google.ts` carried a
file-wide `v8 ignore` as a "thin openid-client wrapper", and `routes.test.ts`
mocks `authorizationUrl` wholesale, so nothing anywhere asserted which
parameters we ask Google for. The ignore now covers discovery only; the
parameter set is tested (`server/auth/google.test.ts`), including that adding
the prompt did not displace the PKCE challenge, the state or the redirect.

## Scope

- `app/src/native/signin.ts` and `app/server/auth/google.ts`, plus their
  tests. Both halves of the same defect, on the two platforms, with opposite
  correct fixes.
- No server change. `/api/auth/signout` already does its half.
- No stored-shape change, no copy change.

## Test plan

Failing test first. `signin.ts` carries one file-wide `v8 ignore start/stop` as
a thin plugin wrapper, and that stops being honest the moment it holds ordering
logic that can be wrong. **`nativeSignOut` alone comes out from under it**;
`initNativeAuth` and `nativeSignIn` stay ignored and keep their justification,
so the ignore becomes two narrower spans rather than one file-wide one.

1. **Sign-out calls the plugin's logout for Google.** Mock `SocialLogin`; assert
   `logout` is called with `{ provider: "google" }`.
2. **Our teardown survives a plugin failure — the load-bearing one.** Make
   `logout` reject. Assert `clearToken` still ran and `nativeSignOut` resolves
   rather than throwing. This is the assertion that stops the fix from making
   things worse.
3. **Ordering.** Assert `clearToken` completes before the plugin call is
   awaited, so no interleaving can leave a live token behind.
4. **Mutation probes**, each recorded with its verbatim failure: remove the
   `logout` call (test 1 goes red); move it ahead of `clearToken` and let it
   throw (test 2 goes red); delete the `catch` (test 2 goes red).
   **And a fourth, which the antagonist pass found missing and which is the
   only one that gates test 3:** replace the sequential await with a
   concurrent kickoff that keeps the catch —
   `const p = SocialLogin.logout({...}).catch(() => {}); await clearToken(); await p;`
   Tests 1 and 2 both stay GREEN under that mutant: logout was called with the
   right arguments, `clearToken` ran, and the function resolves. Only test 3
   can fail on it. Without this probe, test 3 is an assertion nobody has shown
   can go red, which is recurring failure 21 exactly.

## What this does not fix

Signing out does not revoke Google's grant to the app. **The PLUGIN exposes no
revoke or disconnect, only `logout`** — but the GoogleSignIn-iOS SDK it wraps
does (`disconnectWithCompletion:`, which hits the OAuth revocation endpoint, as
distinct from `signOut()`'s local keychain wipe). So revoking is a solvable
future feature behind a plugin patch or native code, not something the platform
lacks. Recorded precisely so this doc cannot later be cited as "we can never do
that". Today a rower wanting to remove the app's access does it in their Google
account settings.
