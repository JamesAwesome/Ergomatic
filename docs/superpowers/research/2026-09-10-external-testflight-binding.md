# What external TestFlight actually binds

**Date:** 2026-09-10. **Asked by:** Wave A's own first row — the rebalance
inherited two claims it could not source, that Beta App Review triggers
guideline 4.8 (Sign in with Apple) and 5.1.1(v) (in-app account deletion),
and both were load-bearing INFERENCE. The row said: **"If Beta App Review
binds neither, this wave shrinks to the front door alone."**

**Answer: it binds both, so Wave A does not shrink.** But one of the two
claims is right for the wrong reason, and the wrong reason was hiding a
design option. Every quote below was fetched from `developer.apple.com` on
2026-09-10.

---

## 1. Does Beta App Review review against the App Review Guidelines?

**YES — PRIMARY, two independent sources, and the attribute the argument
needs is "which guidelines apply", not "is there a review".**

App Store Connect Help, *TestFlight overview*, verbatim:

> "When you add the first build of your app to a group, the build gets sent
> to App Review to make sure it follows the App Review Guidelines. A review
> is required only for the first build. Subsequent builds may not require a
> full review. Testing can begin once a build is approved."

App Review Guidelines, **2.2 Beta Testing**, verbatim and in full:

> "Demos, betas, and trial versions of your app don't belong on the App
> Store – use TestFlight instead. Any app submitted for beta distribution
> via TestFlight should be intended for public distribution and should
> comply with the App Review Guidelines. Note, however, that apps using
> TestFlight cannot be distributed to testers in exchange for compensation
> of any kind, including as a reward for crowd-sourced funding. Significant
> updates to your beta build should be submitted to TestFlight App Review
> before being distributed to your testers. To learn more, visit the
> TestFlight Beta Testing page."

**The scope is the WHOLE guidelines document, not a beta subset.** Neither
page names a reduced set, and no page found names one. That is the load
that matters: our two claims do not each need their own beta-specific
citation, they need only to be guidelines.

**What the sources DO qualify, and it is worth keeping straight:**

- **First build only.** "A review is required only for the first build."
  *Invite external testers*: "The first build you submit requires a full
  review, but later builds for the same version might not." So the gate is
  a one-time event per version, not a per-upload gate.
- **The verb in 2.2 is "should comply", not "must".** 5.1.1(v)'s own verb
  is "must" (§3 below). A softer verb in the beta clause does not soften
  the guideline it points at.
- **Internal TestFlight is not this.** `docs/RELEASING.md` is right that
  internal distribution takes no Beta App Review; every quote above is about
  a build added to a group with external testers.
- **`may require review`.** *Invite external testers* also says "If you
  invite external testers, your beta build **may** require review." That is
  the weakest sentence found on the question and it is contradicted by the
  overview page's flat "gets sent to App Review". Treated as loose drafting,
  not as an escape hatch — we plan for review.

**NOT SOURCED, and named so nobody promotes it later:** how *strictly* Beta
App Review enforces any individual guideline in practice. Developer folklore
holds it is lighter than App Store review. No Apple page says so, so this
document says nothing about it. The text binds; enforcement intensity is
INFERENCE and is not a thing to plan on in either direction.

---

## 2. Guideline 4.8 — it is **not** "Sign in with Apple", and that matters

The inherited claim called 4.8 "Sign in with Apple". **The guideline is
titled "Login Services" and it names no product.** Verbatim, in full:

> **4.8 Login Services**
>
> "Apps that use a third-party or social login service (such as Facebook
> Login, Google Sign-In, Log in with X, Sign In with LinkedIn, Login with
> Amazon, or WeChat Login) to set up or authenticate the user's primary
> account with the app must also offer as an equivalent option another login
> service with the following features:
>
> - the login service limits data collection to the user's name and email
>   address;
> - the login service allows users to keep their email address private as
>   part of setting up their account; and
> - the login service does not collect interactions with your app for
>   advertising purposes without consent.
>
> A user's primary account is the account they establish with your app for
> the purposes of identifying themselves, signing in, and accessing your
> features and associated services.
>
> Another login service is not required if:
>
> - Your app exclusively uses your company's own account setup and sign-in
>   systems.
> - Your app is an alternative app marketplace, or an app distributed from
>   an alternative app marketplace, that uses a marketplace-specific login
>   for account, download, and commerce features.
> - Your app is an education, enterprise, or business app that requires the
>   user to sign in with an existing education or enterprise account.
> - Your app uses a government or industry-backed citizen identification
>   system or electronic ID to authenticate users.
> - Your app is a client for a specific third-party service and users are
>   required to sign in to their mail, social media, or other third-party
>   account directly to access their content."

### Does it trigger for us? YES, and the trigger clause names us by name.

**Google Sign-In is in the trigger list verbatim**, and it is how Ergomatic
sets up the primary account: `server/auth/signin.ts` is the only account
creation path, and `server/index.ts` requires `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` to serve it. Our Google account IS "the account they
establish with your app for the purposes of identifying themselves".

**All five exemptions checked, one at a time, rather than waved at:**

| Exemption | Applies? | Why |
| --- | --- | --- |
| "exclusively uses your company's own account setup" | **No** — but see §2.1 | The word is *exclusively*; we use Google. |
| alternative app marketplace | No | We are not one and are not distributed from one. |
| education/enterprise/business with an existing account | No | Ergomatic requires no employer or school account. |
| government/industry citizen ID | No | Not used. |
| "client for a specific third-party service" | No | Ergomatic is not a Google client, and the optional Concept2 link is not the primary account — a rower signs in and rows without ever linking it. |

⇒ **4.8 binds.** The practical conclusion the rebalance reached survives.

### 2.1 The correction is not cosmetic — it exposed an option

Because 4.8 demands *an equivalent login service with three properties* and
not a named product, two things follow that "4.8 = Sign in with Apple" hid:

1. **Sign in with Apple is a satisfier, not the requirement.** Any service
   with the three properties qualifies. In practice Apple's own is the only
   mainstream one that offers a private-relay address, which is the second
   bullet — so the shortlist really is one long. Recorded so the next reader
   knows it was checked, not assumed.
2. **Dropping Google entirely reaches the FIRST exemption.** An Ergomatic
   whose only front door is our own email-based account is an app that
   "exclusively uses your company's own account setup and sign-in systems",
   and 4.8 then does not apply at all. **This is a real option for Wave A's
   sign-up-policy design and it should appear on that gate's option list.**
   It is not a recommendation: it trades one build (Apple sign-in) for a
   password/reset/verification surface we do not have, and it takes away the
   one-tap door every current tester uses.
   **UNTESTED COST, said out loud per RF30:** nobody has priced the
   own-accounts surface. If that option is ruled out at the gate, it gets a
   measured reason, not a clause.
   **Adding our own accounts ALONGSIDE Google does not discharge 4.8** — the
   exemption's word is "exclusively", and our own system cannot offer the
   private-email property in any case.

---

## 3. Guideline 5.1.1(v) — CONFIRMED, unconditional, and it says more than we quoted

Verbatim, in full:

> **(v) Account Sign-In:** "If your app doesn't include significant
> account-based features, let people use it without a login. If your app
> supports account creation, you must also offer account deletion within the
> app. Apps may not require users to enter personal information to function,
> except when directly relevant to the core functionality of the app or
> required by law. If your core app functionality is not related to a
> specific social network (e.g. Facebook, WeChat, Weibo, X, etc.), you must
> provide access without a login or via another mechanism. Pulling basic
> profile information, sharing to the social network, or inviting friends to
> use the app are not considered core app functionality. The app must also
> include a mechanism to revoke social network credentials and disable data
> access between the app and social network from within the app. An app may
> not store credentials or tokens to social networks off of the device and
> may only use such credentials or tokens to directly connect to the social
> network from the app itself while the app is in use."

**The attribute the argument needs:** the verb is **"must"**, there is no
date, no distribution-channel qualifier, and no exemption in the sentence.
Ergomatic supports account creation. It binds.

Apple's linked support page, *Offering account deletion in your app*,
verbatim on the parts a spec has to honour:

> "Starting June 30, 2022, apps submitted to the App Store that support
> account creation must also let users initiate deletion of their account
> within the app."

> "Offer to delete the entire account record, along with associated personal
> data. You may include additional options, but only offering to temporarily
> deactivate or disable an account is insufficient."

> "Deleting an account removes the account from the developer's records,
> along with any data associated with the account that the developer isn't
> legally required to maintain."

> "Make the account deletion option easy to find in your app. Typically,
> it's included in the app's account settings."

> "Apps in highly regulated industries, as described in App Store Review
> Guideline 5.1.1(ix), may use additional customer service flows to confirm
> and facilitate the account deletion process. Apps not operating in highly
> regulated industries should not require people to make a phone call, send
> an email, or go through other support flows."

> "All users should be allowed to delete their accounts, regardless of where
> they're located."

**Four things this hands Wave A's deletion spec that the ROADMAP row did not
have:**

1. **Deactivate is explicitly insufficient.** The row already enumerates
   what is removed and what survives; this is the sentence that makes the
   enumeration load-bearing, and it is what the `session_logs.workout_id`
   `onDelete: "set null"` decision has to be argued against.
2. **The entire account record goes, not only the personal data.**
3. **A support-flow deletion is out** — no email-us, no phone. Ergomatic is
   not a regulated industry.
4. **It must be findable, "typically in the app's account settings"** —
   which is You. That is a design-gate input, not just a route.

### 3.1 A SECOND obligation in the same sub-guideline, and nothing on the roadmap covers it

> "If your app doesn't include significant account-based features, let
> people use it without a login."

**Ergomatic requires a login for everything.** Whether it has "significant
account-based features" is genuinely arguable — the plan, the log, baselines
and the Concept2 link are all per-account and all durable — but *nobody has
argued it*, and this sentence sits three clauses above the one we did quote.
**Filed as an open question for Wave A's spec**, not as a finding: the
answer is probably yes-we-qualify, and "probably" is exactly what RF16 says
to stop writing.

---

## 4. What this changes

| Claim as the rebalance inherited it | Verdict |
| --- | --- |
| Beta App Review triggers guideline 4.8 (Sign in with Apple) | **Right conclusion, wrong reason.** Review does apply and 4.8 does bind, but 4.8 is "Login Services" and names no product; the trigger is our use of **Google Sign-In**, and the requirement is any service with three named properties. |
| Beta App Review triggers 5.1.1(v) (in-app account deletion) | **CONFIRMED**, unconditionally, plus four spec constraints and one open question we did not have. |
| "If Beta App Review binds neither, this wave shrinks to the front door alone." | **Does not fire.** Wave A keeps its shape. |

**Sizing is unchanged and nothing here shortens the wave.** What it changes
is what the specs must say: the sign-up-policy gate gains an option
(own-accounts-only, which exits 4.8 entirely), and the deletion spec gains
four constraints and one question.

**Sources, all fetched 2026-09-10 (PRIMARY, first-party):**

- App Review Guidelines — <https://developer.apple.com/app-store/review/guidelines/>
  (2.2, 4.8, 5.1.1(v)). **The page displays no revision date**; it was asked
  for and none is shown, so this document's date is the only freshness
  guarantee on these quotes. Re-read before Wave A's spec is written if that
  is more than a few weeks after this date.
- Offering account deletion in your app — <https://developer.apple.com/support/offering-account-deletion-in-your-app/>
- TestFlight overview (App Store Connect Help) — <https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/>
- Invite external testers (App Store Connect Help) — <https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/>
- TestFlight — <https://developer.apple.com/testflight/>
