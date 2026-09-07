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

## Not caused by the version bump, as far as we can show

v0.42.0 moved `@capgo/capacitor-social-login` from 8.4.4 to 8.5.5, and this was
noticed on that build. Tempting to call it a regression. **The gap predates it
by the entire life of the file**, so the most that can be said is that the
plugin or Google's own SDK may have changed how readily it reuses a cached
session, making a standing hole newly visible. INFERENCE, and untested: proving
it needs a build against 8.4.4, which is not worth doing to attribute a bug we
are fixing either way.

## The fix

`nativeSignOut` also calls `SocialLogin.logout({ provider: "google" })`.

**Ordering is the part that matters.** Our own teardown must complete even if
the plugin call fails, or a plugin error would leave the rower holding a valid
Ergomatic token while believing they signed out — strictly worse than today.
So: our signout and token clear happen first and unconditionally; the plugin
logout follows inside a `try`/`catch` that swallows and does not rethrow.

A failed Google logout leaves the old behaviour (no chooser) and nothing worse.
That is the correct trade: our session is the one that grants access to data.

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

## Scope

- `app/src/native/signin.ts` only. The web sign-out path is separate, is not
  affected, and is not touched.
- No server change. `/api/auth/signout` already does its half.
- No stored-shape change, no copy change.

## Test plan

Failing test first. `signin.ts` currently carries `v8 ignore` as a thin plugin
wrapper, and that stops being honest the moment it holds ordering logic that can
be wrong — the ignore comes off the function this change gives real behaviour to.

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

## What this does not fix

Signing out does not revoke Google's grant to the app. The plugin exposes no
revoke or disconnect, only `logout`. A rower wanting to remove the app's access
entirely does that in their Google account settings. Stated so nobody later
reads "sign out" as "revoked".
