import AuthenticationServices
import Capacitor
import UIKit
import WebKit

/// Wave E PR1.75b (docs/superpowers/specs/2026-09-02-concept2-pr175-app-bind-design.md
/// §4): the native return leg of the Concept2 link, on
/// `ASWebAuthenticationSession`.
///
/// WHY THIS AND NOT A URL SCHEME + `appUrlOpen` (design §4, "Why this over"):
/// Apple's `ASWebAuthenticationSession` CLASS DOCUMENTATION (developer.apple.com;
/// design §Research, PRIMARY -- NOT the SDK header, which does not carry this
/// sentence) is the whole reason, verbatim: "ASWebAuthenticationSession ensures
/// that only the calling app's session receives the authentication callback,
/// even when more than one app registers the same callback URL scheme." That
/// closes the RFC 8252 §7.1 shared-scheme ambiguity
/// ("multiple apps can typically register the same scheme, which makes it
/// indeterminate as to which app will receive the authorization code") for the
/// DENIAL leg. PKCE, the control RFC 8252 §8.1 would otherwise mandate, is not
/// offered by Concept2 (zero occurrences of `code_challenge` in their OAuth
/// reference); the REDEMPTION leg is closed instead by the confidential client
/// -- the secret never leaves our server.
///
/// The callback also arrives IN A PROMISE, in flow: no listener registration,
/// no readiness barrier, none of the lifetime hazards PR1.5 spent four rounds
/// on, and the OS dismisses the browser itself.
///
/// SINGLE FLIGHT IS ENFORCED HERE, IN SWIFT, ON PURPOSE (design §2's lifetime
/// table). A WebView reload destroys every JS value, so a JS-side guard could
/// not survive one; `activeSession`/`activeCall` do. `linkFlow.ts`'s own
/// `linkInFlight` is a UX convenience and is never the authority.
///
/// Every platform-behaviour claim below cites a NAMED source with its
/// attribute -- an `ASWebAuthenticationSession.h` line (iPhoneOS.sdk/.../
/// Headers/, read 2026-09-02), Apple's class documentation (PRIMARY, design
/// §Research), the vendored Capacitor sources by file:line, or a labelled
/// SECONDARY developer-forums post.
@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    // The in-flight link claim (design §2). All three are written and read on
    // the main thread only: `start(_:)` hops to main before touching them, the
    // completion handler hops back to main, and `shouldOverrideLoad(_:)` is a
    // `CAPPlugin` method that Capacitor calls from its `WKNavigationDelegate`
    // `decidePolicyFor` handler (`WebViewDelegationHandler.swift:67` ->
    // `:82`); `WKNavigationDelegate` is declared `WK_SWIFT_UI_ACTOR`
    // (`WebKit.framework/Headers/WKNavigationDelegate.h:69-70`), `#define`d
    // `NS_SWIFT_UI_ACTOR` at `WKFoundation.h:60` (iOS 26.5 SDK, read
    // 2026-09-02) -- WebKit, not UIKit, delivers it on the main actor.
    private var activeSession: ASWebAuthenticationSession?
    private var activeCall: CAPPluginCall?
    private var activeAnchor: ASPresentationAnchor?
    // Per-attempt identity. The completion closure captures its own token, so
    // `finish` can tell "my session finished" from "some earlier session's
    // completion finally arrived". See `finish(token:...)`.
    private var activeToken: UUID?

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("The plugin was released before the session could start", "pluginError")
                return
            }
            self.startOnMain(call)
        }
    }

    private func startOnMain(_ call: CAPPluginCall) {
        // One session per app PROCESS. Rejecting here rather than queueing is
        // deliberate: a second sheet would present over the first and there is
        // no correct answer for which call receives the callback.
        //
        // "One session per app PROCESS" holds because there is one plugin per
        // bridge, one bridge per `CAPBridgeViewController`, and one of those
        // per process: `Info.plist` declares no `UIApplicationSceneManifest`
        // and `AppDelegate.swift:7` holds a single `window`. Adopting UIScene
        // would demote this to one claim per bridge.
        //
        // THIS RETURN AND THE THREE BELOW IT MUST NOT CALL `clearActive()`.
        // They run BEFORE the claim is taken, so they hold nothing to clear --
        // and here specifically, clearing would strand the LIVE session this
        // very call was just refused in favour of: the sheet would still be up
        // with its own completion handler pending, but the plugin would have
        // forgotten the call to resolve. Only the two POST-claim returns
        // (`canStart`, `start()`) clear. See the plan's RF27 lifetime table,
        // clear-site (c).
        if activeSession != nil {
            call.reject("A link session is already in flight", "busy")
            return
        }

        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("start requires a valid `url`", "badRequest")
            return
        }
        // SDK header:66 -- "callbackURLScheme the custom URL scheme that the
        // app expects in the callback URL." It is the BARE scheme: an Apple
        // Systems Engineer on developer forums thread 679251 (SECONDARY)
        // states "A scheme should not include special characters such as ':'
        // or '/'", i.e. "haus.waffle.ergomatic", never
        // "haus.waffle.ergomatic://". The caller supplies it
        // (adapters/linkFlow.ts's LINK_CALLBACK_SCHEME) so the one place the
        // scheme is spelled is beside the one place the redirect_uri is
        // (server/routes/concept2.ts:67).
        guard let scheme = call.getString("callbackScheme"), !scheme.isEmpty,
              !scheme.contains(":"), !scheme.contains("/") else {
            call.reject("start requires a bare `callbackScheme` with no ':' or '/'", "badRequest")
            return
        }

        // NEVER a synthesised anchor. Passing a bare `ASPresentationAnchor()`
        // is exactly what produces error code 3 opaquely later (SDK header:
        // 27-28 -- "The presentation context returned was not elligible to
        // show the authentication UI. For iOS, validate that the UIWindow is
        // in a foreground scene."), so the honest failure is refused up front
        // with a code that says which thing was missing.
        guard let window = bridge?.viewController?.view.window else {
            call.reject("No window to present the authentication session from", "noWindow")
            return
        }

        // One token per attempt, captured by THIS session's completion closure.
        let token = UUID()
        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: scheme
        ) { [weak self] callbackURL, error in
            DispatchQueue.main.async {
                self?.finish(token: token, callbackURL: callbackURL, error: error)
            }
        }
        // The string initializer is `API_DEPRECATED("Use initWithURL:callback:
        // completionHandler: instead", ios(12.0, API_TO_BE_DEPRECATED), ...)`
        // (SDK header:69) -- Apple's "unspecified future release" sentinel, a
        // warning with no removal version. Its replacement takes an
        // `ASWebAuthenticationSessionCallback`, which is
        // `API_AVAILABLE(ios(17.4), ...)` (SDK header:71) -- above this
        // target's `IPHONEOS_DEPLOYMENT_TARGET = 15.0`
        // (project.pbxproj:322,344). An `#available(iOS 17.4, *)` branch onto
        // `.customScheme` is recorded as optional polish, not owed here.

        // SDK header:73-77 -- "A provider must be set prior to calling -start,
        // otherwise the authorization view cannot be displayed." The property
        // is declared `weak`, so the plugin instance must stay alive; it does,
        // because the bridge retains every registered plugin
        // (CapacitorBridge.swift:348-365 stores it in `plugins`).
        session.presentationContextProvider = self

        // `ephemeral: true` is a CONTROL, not a preference (design §4). SDK
        // header:79-82 -- "Ephemeral web browser sessions do not not share
        // cookies or other browsing data with a user's normal browser session.
        // This value is NO by default. Setting this property after calling
        // -[ASWebAuthenticationSession start] has no effect." Hence: set
        // before `start()`, below. Non-ephemeral would share Safari's
        // persistent cookies, so on a shared phone the next link could
        // silently complete against whoever last logged into Concept2 in
        // Safari, with no visible login -- the mirror image of the account
        // injection this whole PR closes on the Ergomatic side. It also
        // removes the sharing consent alert the class documentation describes
        // (SDK header:50-53), since there is nothing to share.
        //
        // Default TRUE: the design (§4) makes ephemeral a control, not a
        // preference; a caller omitting the key must not get the shared-cookie
        // session. The JS passes it explicitly and Task 2's contract test
        // asserts that.
        session.prefersEphemeralWebBrowserSession = call.getBool("ephemeral", true)

        // Claim BEFORE starting: `canStart`/`start()` can both fail, and those
        // two failure paths -- the ONLY two below this line, and the only two
        // in this function that clear -- release the claim again, so no path
        // can leave a claim without a session.
        activeAnchor = window
        activeSession = session
        activeCall = call
        activeToken = token

        // SDK header:89-92 -- "Returns whether the session can be successfully
        // started. This property returns the same value as calling -start, but
        // without the side effect of actually starting the session."
        // `API_AVAILABLE(ios(13.4), ...)`, under our 15.0 floor, so no
        // `#available` guard is needed.
        guard session.canStart else {
            clearActive()
            call.reject("The system will not start an authentication session right now", "cannotStart")
            return
        }
        // SDK header:94-99 -- "start can only be called once for an
        // ASWebAuthenticationSession instance. This also means calling start
        // on a canceled session will fail. @result Returns YES if the session
        // starts successfully."
        guard session.start() else {
            clearActive()
            call.reject("The authentication session failed to start", "cannotStart")
            return
        }
    }

    private func finish(token: UUID, callbackURL: URL?, error: Error?) {
        // A completion from a superseded session is discarded by TOKEN
        // IDENTITY, not by assuming it drains before the next `start()` --
        // `cancel()`'s effect on the completion handler is undocumented (SDK
        // header:101-104). Without the token this guard reads "is there ANY
        // pending call", which an abandoned session's late completion would
        // satisfy by resolving the NEXT session's call.
        guard activeToken == token, let call = activeCall else { return }
        clearActive()

        if let error = error {
            let ns = error as NSError
            if ns.domain == ASWebAuthenticationSessionErrorDomain,
               let code = ASWebAuthenticationSessionError.Code(rawValue: ns.code) {
                switch code {
                case .canceledLogin:
                    // SDK header:22-24 -- "The user has canceled login by
                    // cancelling the alert asking for permission to log in to
                    // this app, or by dismissing the view controller for
                    // loading the authentication webpage." ONE code for both,
                    // so a dismissed OS consent alert and a tapped Cancel on
                    // the page are indistinguishable here BY DESIGN. Never
                    // reported as anything narrower than "cancelled".
                    call.reject("The rower dismissed the authentication session", "cancelled")
                case .presentationContextNotProvided:
                    // SDK header:25-26 -- "A valid presentationContextProvider
                    // was not found when -start was called."
                    call.reject("No presentation context was provided", "noContext")
                case .presentationContextInvalid:
                    // SDK header:27-28. Real on iPad, where
                    // TARGETED_DEVICE_FAMILY = "1,2" (project.pbxproj:333,354)
                    // means a window can legitimately be in a background scene.
                    call.reject("The presentation context cannot show the authentication UI", "contextInvalid")
                @unknown default:
                    call.reject("Authentication session failed with an unknown code \(ns.code)", "pluginError")
                }
            } else {
                // Deliberately NOT folded into `cancelled`: an unrecognised
                // failure reported as a user cancellation is a swallowed bug.
                call.reject("Authentication session failed: \(ns.domain) \(ns.code)", "pluginError")
            }
            return
        }

        guard let callbackURL = callbackURL else {
            call.reject("The authentication session completed with neither a callback URL nor an error", "pluginError")
            return
        }
        call.resolve(["callbackUrl": callbackURL.absoluteString])
    }

    /// The WebView is about to navigate. On a MAIN-FRAME navigation with a
    /// live session, the session is cancelled and its call rejected
    /// `abandoned`.
    ///
    /// A main-frame navigation decision usually means this document is about
    /// to be replaced. Capacitor can still CANCEL it
    /// (`WebViewDelegationHandler.swift:108-115` hands top-level external URLs
    /// to `UIApplication.shared.open` and answers `.cancel`), in which case we
    /// abandon a session whose receiver survives. Deliberately over-broad: the
    /// alternative is guessing which decisions commit, and no supported path
    /// navigates this WebView while a sheet is up.
    ///
    /// The other producer, beyond a Safari-inspector reload: a WebContent
    /// process crash. `webViewWebContentProcessDidTerminate`
    /// (`WebViewDelegationHandler.swift:158-162`) does `bridge?.reset()` then
    /// `webView.reload()` -- that much is PRIMARY, read in the vendored
    /// source. **That the reload then re-enters `decidePolicyFor` with a
    /// MAIN-FRAME `targetFrame` is INFERENCE, not measured:** after a
    /// WebContent termination the frame tree has been destroyed, and nothing
    /// in WebKit's documentation says what `targetFrame` carries on the
    /// recovery load (a `nil` target frame fails this guard's
    /// `?.isMainFrame == true` and the claim would NOT be released). So the
    /// crash path is a PLAUSIBLE second producer, not a proven one; the
    /// reload path is the one that gates. Walk case (d)'s optional variant
    /// exists to measure it.
    /// Walk 2026-09-02: the WebContent-termination variant could not be
    /// reproduced (memory thrash did not kill the process); the reload variant
    /// PASSED.
    ///
    /// ORDERING CAVEAT: `bridge.plugins` is an unordered `[String:
    /// CapacitorPlugin]` Dictionary, iterated at
    /// `WebViewDelegationHandler.swift:77-92`, and the FIRST plugin returning
    /// a non-nil answer short-circuits the loop -- so another plugin
    /// overriding `shouldOverrideLoad` could pre-empt ours in an order we do
    /// not control. Zero iOS plugins in `node_modules` override it today
    /// (measured 2026-09-02: the only Swift hit is Capacitor's own handler,
    /// plus the `CAPPlugin.h`/`.m` declaration). Ours returns `nil`
    /// unconditionally, so it never pre-empts anyone else's.
    ///
    /// WHY THIS HOOK AND NOT `load()` (plan observation 1, measured against
    /// the vendored Capacitor 8 sources in this repo): `load()` runs ONCE, from
    /// `CapacitorBridge.registerPluginInstance(_:)`
    /// (CapacitorBridge.swift:348-365 -> CAPPlugin+LoadInstance.swift:10-19),
    /// which `MyViewController.capacitorDidLoad()` calls at construction
    /// (CAPBridgeViewController.swift:48-53). A reload never re-runs it; what
    /// a reload does run is `bridge?.reset()`
    /// (WebViewDelegationHandler.swift:45-48), whose whole body is
    /// `storedCalls.removeAll()` + `removeAllPluginListeners()`
    /// (CapacitorBridge.swift:295-298) and which never touches a plugin
    /// instance's own fields. Without this override, a reload mid-session
    /// would leave the claim set forever: every later `start()` would reject
    /// `busy` and the sheet would outlive its receiver.
    ///
    /// Returns `nil` unconditionally, which is the documented "defer to the
    /// default Capacitor policy" answer (CAPPlugin.h:34-40) -- this override
    /// observes, it never changes what the WebView loads.
    @objc public override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        if navigationAction.targetFrame?.isMainFrame == true, activeSession != nil {
            abandonActiveSession()
        }
        return nil
    }

    private func abandonActiveSession() {
        let call = activeCall
        let session = activeSession
        // Cleared FIRST, which also nils `activeToken`, so this session's own
        // completion -- whenever `cancel()` decides to deliver it -- fails
        // `finish`'s token check and resolves nothing (see `finish`).
        clearActive()
        session?.cancel()
        call?.reject("The web view navigated away while a link session was in flight", "abandoned")
    }

    private func clearActive() {
        activeSession = nil
        activeCall = nil
        activeAnchor = nil
        activeToken = nil
    }
}

extension WebAuthPlugin: ASWebAuthenticationPresentationContextProviding {
    /// SDK header:118-121 -- "Return the ASPresentationAnchor in the closest
    /// proximity to where a user interacted with your app to trigger
    /// authentication."
    ///
    /// The anchor is captured in `startOnMain(_:)`, which REFUSES with
    /// `noWindow` when the bridge has no window, so `activeAnchor` is non-nil
    /// for the whole lifetime of any session that can call this back. The
    /// fallbacks exist only because the return type is non-optional.
    ///
    /// NO `assertionFailure` HERE. The walk build is a Debug build -- the
    /// `debug.xcconfig` at `app/ios/debug.xcconfig` is the base configuration
    /// for both Debug configs (`project.pbxproj:195,316`) and Xcode's Run
    /// action uses them -- so an `assertionFailure` would TRAP the app on the
    /// one build this whole plan exists to walk, turning a cosmetic
    /// last-resort into a crash.
    ///
    /// The bare `ASPresentationAnchor()` is the last resort the `noWindow`
    /// guard exists to prevent (it is what produces the opaque
    /// `presentationContextInvalid`, SDK header:27-28). It is only reachable
    /// if the window vanished between `start()` and presentation; the live
    /// bridge window is tried first so that case still has a chance of
    /// presenting rather than failing opaquely.
    ///
    /// `ASWebAuthenticationPresentationContextProviding` is `NS_SWIFT_UI_ACTOR`
    /// (SDK header:114); under `SWIFT_VERSION = 5.0` that isolation is advisory
    /// (no diagnostic); a Swift 6 language-mode move makes it an error --
    /// annotate the METHOD `@MainActor` then, never the class.
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return activeAnchor ?? bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
