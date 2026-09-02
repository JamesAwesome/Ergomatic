// Wave E PR1.75b (2026-09-02-concept2-pr175-app-bind-design.md §3-§4): the ONE
// place the Concept2 link's platform conditional lives. Native opens an
// `ASWebAuthenticationSession` through the local `WebAuth` plugin and finishes
// the link itself; web hands off to a full-page navigation and learns the
// outcome on the fresh mount after Concept2 redirects to our own callback page
// -- never through a return hook. That asymmetry is the whole reason PR1.5's
// `useReturnToApp` return arm (its modal-dismiss signal included) is retired
// in this PR: with the callback arriving in a promise on native and the SPA
// unloading on web, nothing is left for a second return mechanism to do, and
// "two mechanisms for one return must not survive on one surface" (design §4).
//
// Native-first idiom, same as `appLifecycle.ts`/`externalBrowser.ts`:
// `isNative()` picks the arm and the native arm reaches its plugin ONLY through
// a dynamic `import()` inside that branch, so `src/native/webAuth.ts` (and the
// Capacitor plugin registration it performs at module scope) never executes in
// a web session.

import { api } from "../api";
import { isNative } from "../platform";
import { openExternalUrl } from "./externalBrowser";

/** RFC 8252 §7.1's reverse-domain scheme of the bundle id
 *  `haus.waffle.ergomatic` (`app/ios/App/App.xcodeproj/project.pbxproj`'s
 *  PRODUCT_BUNDLE_IDENTIFIER). The BARE scheme -- Apple's own guidance is that
 *  a scheme "should not include special characters such as ':' or '/'". Must
 *  equal the scheme half of the server's `NATIVE_REDIRECT_URI`
 *  (`server/routes/concept2.ts:67`, `haus.waffle.ergomatic://oauth/callback`);
 *  they are two spellings of one registration at Concept2. */
export const LINK_CALLBACK_SCHEME = "haus.waffle.ergomatic";

/** Design §3: a bearer mint must DECLARE it can receive the native redirect.
 *  A capability, not a version -- it only ever narrows. Must equal
 *  `NATIVE_LINK_CLIENT` (`server/routes/concept2.ts:74`); a build that omits
 *  it is answered `409 {error:"update_required"}` and issued nothing, which is
 *  what makes flipping `C2_LINK_ENABLED` safe against an installed build that
 *  predates the `WebAuth` plugin. */
export const LINK_CLIENT = "webauth-1";

export type WeightClass = "H" | "L";

/**
 * Every way a link attempt can end. Design §4 names nine; this union adds
 * `linked`/`navigating` (the two successes), `updateRequired`/`mintFailed`/
 * `exchangeFailed` (the two server hops the design describes in prose), and
 * `pluginError` (plan observation 2 -- `cannotStart`, a failed `start()`, or a
 * foreign `NSError` have no other home, and folding them into `cancelled`
 * would report a real failure as a user's decision).
 *
 * `networkError` is the TRANSPORT's member. Every other member names a failure
 * somebody designed; this one names the failures nobody designed -- `api()`'s
 * own `fetch` rejecting, `res.json()` on a truncated body, `new URL()` on a
 * callback string that is not a URL. Without it a thrown request escapes
 * `startLink` as a rejected promise and the walk operator taps the button and
 * sees NOTHING, on a walk conducted over a cloudflared quick tunnel where a
 * dropped request is a normal event.
 *
 * `stateEchoed` rides every outcome derived from a parsed callback because it
 * is a MEASUREMENT the walk owes (design exit criterion 4): whether Concept2
 * echoes `state` on a private-use-scheme redirect is UNMEASURED, and nothing
 * here depends on it -- the exchange always sends the MINT's `state`.
 * **`stateMismatch` is the one parsed-callback outcome that does NOT carry it,
 * and deliberately: that member is only reachable when a state WAS echoed (an
 * absent one cannot mismatch), so the flag would be a constant `true` there
 * and would read as a measurement when it is a tautology.**
 *
 * `mintFailed` carries `error: string | null`, and the `null` is not an
 * oversight: a mint answered by something that is not `{error}` JSON (an old
 * image's HTML during a rolling deploy) has no error string to report, so the
 * member degrades rather than inventing one. **That is deliberately asymmetric
 * with the exchange leg**, which splits the same condition into its own
 * `serverError` member -- the exchange's callers must distinguish "Concept2
 * refused us" from "our own server is mid-deploy", and the mint's callers have
 * only one door to show either way.
 */
export type LinkOutcome =
  | {
      kind: "linked";
      c2UserId: number;
      weightClass: WeightClass;
      stateEchoed: boolean;
    }
  | { kind: "navigating" }
  | { kind: "declined"; stateEchoed: boolean }
  | { kind: "malformed"; stateEchoed: boolean }
  | { kind: "stateMismatch" }
  | {
      kind: "exchangeFailed";
      status: number;
      error: string;
      stateEchoed: boolean;
    }
  | { kind: "serverError"; status: number; stateEchoed: boolean }
  | { kind: "mintFailed"; status: number; error: string | null }
  | { kind: "updateRequired" }
  | { kind: "busy" }
  | { kind: "cancelled" }
  | { kind: "abandoned" }
  | { kind: "noWindow" }
  | { kind: "noContext" }
  | { kind: "contextInvalid" }
  | { kind: "pluginError"; code: string; message: string }
  | { kind: "networkError"; message: string };

// UX convenience ONLY, and the comment says so because the distinction is the
// design's (§2 lifetime table): the AUTHORITY on "one link session per app
// process" is `WebAuthPlugin`'s `activeSession`, in Swift, because a WebView
// reload destroys this module and everything in it. This flag exists so a
// double-tap in one document does not mint twice.
let linkInFlight = false;

async function readError(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const error = (body as { error: unknown }).error;
      return typeof error === "string" ? error : null;
    }
    return null;
  } catch {
    // Not JSON at all: an old server image's Express 404 HTML during a rolling
    // deploy is the named case (design §4).
    return null;
  }
}

function pluginRejection(err: unknown): LinkOutcome {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  const message = err instanceof Error ? err.message : String(err);
  // The nine codes `WebAuthPlugin.swift` can emit split two ways. Six get an
  // explicit arm below; the rest are named here, and `scripts/webauth-contract
  // .test.ts` PARSES this line -- so a Swift code that is neither cased nor
  // listed fails that census rather than silently becoming `pluginError`:
  // falls through to pluginError: badRequest, cannotStart, pluginError
  switch (code) {
    case "cancelled":
      return { kind: "cancelled" };
    case "abandoned":
      return { kind: "abandoned" };
    // The plugin's `busy` is the AUTHORITY (design §2); this module's
    // `linkInFlight` is not, and the two can legitimately disagree: JS releases
    // its flag in `startLink`'s `finally` while Swift's `activeSession` claim
    // stands until the sheet actually finishes. A tap in that window mints a
    // NEW attempt -- replacing the live attempt's nonce server-side -- and then
    // is refused here. PR2's card must therefore not render one string for both
    // `busy` sources: the JS guard means "your last tap is still working", the
    // plugin's means "a sheet is already up and your fresh mint just superseded
    // the attempt it belongs to".
    case "busy":
      return { kind: "busy" };
    case "noWindow":
      return { kind: "noWindow" };
    case "noContext":
      return { kind: "noContext" };
    case "contextInvalid":
      return { kind: "contextInvalid" };
    default:
      return {
        kind: "pluginError",
        code: code === "" ? "unknown" : code,
        message,
      };
  }
}

async function completeNative(
  authorizeUrl: string,
  state: string,
): Promise<LinkOutcome> {
  const { WebAuth } = await import("../native/webAuth");
  let callbackUrl: string;
  try {
    const result = await WebAuth.start({
      url: authorizeUrl,
      callbackScheme: LINK_CALLBACK_SCHEME,
      ephemeral: true,
    });
    callbackUrl = result.callbackUrl;
  } catch (err) {
    return pluginRejection(err);
  }

  // ONLY the query is read; the host and path of `callbackUrl` are ignored, and
  // two independent facts bound that. (1) The session delivers only THIS app's
  // callback: `ASWebAuthenticationSession` "ensures that only the calling app's
  // session receives the authentication callback, even when more than one app
  // registers the same callback URL scheme" (Apple class documentation,
  // PRIMARY, quoted verbatim in `WebAuthPlugin.swift`'s own header), and the
  // session filters on the `callbackScheme` we hand it. (2) Concept2
  // exact-matches the registered `redirect_uri` (`NATIVE_REDIRECT_URI`,
  // `server/routes/concept2.ts:67`), so a callback whose path is not
  // `//oauth/callback` is one Concept2 would not have redirected to. Parsing
  // the path defensively here would add a failure mode without closing one.
  //
  // INFERENCE (not measured against Concept2's live redirect): `searchParams`
  // decodes `+` as a SPACE (WHATWG application/x-www-form-urlencoded), so an
  // unencoded `+` inside a `code` would reach the exchange corrupted and fail
  // `502 c2_error` -> `exchangeFailed`, rather than silently linking the wrong
  // thing. MEASURED (2026-09-02, Node 26): a `#` truncates instead --
  // `?code=AB#CD` yields `"AB"`, because the fragment is not part of the query
  // at all. Both degrade to a failed exchange, neither to a wrong link, and the
  // walk would surface either.
  const params = new URL(callbackUrl).searchParams;
  // `?code=` (present but EMPTY) is `""`, not `null`, and an empty string is
  // not a code. Treating it as one would POST `{code: ""}` and, worse, would
  // step over the `access_denied` branch below -- a rower's decline arriving as
  // `?error=access_denied&code=` would surface as `exchangeFailed 400` instead
  // of `declined`.
  const rawCode = params.get("code");
  const code = rawCode === null || rawCode === "" ? null : rawCode;
  const returnedState = params.get("state");
  const stateEchoed = returnedState !== null;

  if (code === null) {
    // The rower declined at Concept2's own screen: a SUCCESS callback with no
    // code. Not an error, and the attempt is left to expire rather than being
    // consumed.
    if (params.get("error") === "access_denied")
      return { kind: "declined", stateEchoed };
    // Anything else with no code is `malformed`, never `cancelled`: a
    // cancellation is something the OS tells us about, and calling this one
    // would hide a callback shape we do not understand.
    return { kind: "malformed", stateEchoed };
  }

  // Defence in depth, not a control (design §4). `state` is undocumented as a
  // pass-through at Concept2 and UNMEASURED on a private-use redirect, so when
  // it is absent this check is a deliberate no-op. The log records THAT a
  // mismatch happened; printing either value would put a live correlation
  // secret in the console.
  if (returnedState !== null && returnedState !== state) {
    console.error(
      "[linkFlow] the callback carried a state that does not match this attempt's; refusing to exchange",
    );
    return { kind: "stateMismatch" };
  }

  // Always the MINT's `state` (design §3: mint returns it explicitly so the
  // app never depends on an echo).
  const res = await api("/api/concept2/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
  });
  if (res.ok) {
    const body = (await res.json()) as {
      linked: boolean;
      c2UserId: number;
      weightClass: WeightClass;
    };
    return {
      kind: "linked",
      c2UserId: body.c2UserId,
      weightClass: body.weightClass,
      stateEchoed,
    };
  }
  const error = await readError(res);
  if (error === null)
    return { kind: "serverError", status: res.status, stateEchoed };
  return { kind: "exchangeFailed", status: res.status, error, stateEchoed };
}

/**
 * Starts a Concept2 link. Mints an attempt, then finishes it on this surface.
 *
 * Native: the whole flow completes inside this promise. Web: resolves
 * `navigating` once the full-page navigation is handed off; the SPA is
 * unloading and the outcome is read from `GET /api/concept2/link` on the next
 * mount.
 */
export async function startLink({
  weightClass,
}: {
  weightClass: WeightClass;
}): Promise<LinkOutcome> {
  if (linkInFlight) return { kind: "busy" };
  linkInFlight = true;
  try {
    const native = isNative();
    const res = await api("/api/concept2/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The declaration is sent only where it means something. The server
      // reads it only when it derived `surface === "native"` from the bearer
      // (`routes/concept2.ts:238-240`), so a cookie caller asserting a native
      // capability would be a claim about a surface it is not on.
      body: JSON.stringify(
        native ? { weightClass, linkClient: LINK_CLIENT } : { weightClass },
      ),
    });
    if (!res.ok) {
      const error = await readError(res);
      if (res.status === 409 && error === "update_required")
        return { kind: "updateRequired" };
      return { kind: "mintFailed", status: res.status, error };
    }
    const { authorizeUrl, state } = (await res.json()) as {
      authorizeUrl: string;
      state: string;
    };
    if (!native) {
      await openExternalUrl(authorizeUrl);
      return { kind: "navigating" };
    }
    return await completeNative(authorizeUrl, state);
  } catch (err) {
    // The transport's own member. `api()`'s fetch can reject outright (a
    // cloudflared tunnel dropping mid-walk is the named case), `res.json()`
    // can throw on a truncated body, and `new URL(callbackUrl)` throws on a
    // callback string that is not a URL. Every one of those would otherwise
    // escape as a rejected promise and the caller -- the probe card, on a
    // device, with no console -- would show nothing at all.
    return {
      kind: "networkError",
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // In the `finally`, not the catch: the guard must release on EVERY exit,
    // or one thrown request wedges the surface until the document reloads.
    linkInFlight = false;
  }
}
