import AuthenticationServices
import Capacitor
import Foundation
import UIKit

private enum AppleAuthorizationOutcome {
    case success(ASAuthorizationAppleIDCredential)
    case invalidResponse
    case failure(Error)
}

private final class AppleAuthorizationDelegate: NSObject,
    ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding
{
    private let anchor: ASPresentationAnchor
    private let completion: (AppleAuthorizationOutcome) -> Void
    private var completed = false

    init(
        anchor: ASPresentationAnchor,
        completion: @escaping (AppleAuthorizationOutcome) -> Void
    ) {
        self.anchor = anchor
        self.completion = completion
    }

    func presentationAnchor(
        for controller: ASAuthorizationController
    ) -> ASPresentationAnchor {
        return anchor
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard !completed else { return }
        completed = true
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            completion(.invalidResponse)
            return
        }
        completion(.success(credential))
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        guard !completed else { return }
        completed = true
        completion(.failure(error))
    }
}

@objc(AppleAuthPlugin)
public final class AppleAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleAuthPlugin"
    public let jsName = "AppleAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    // These references are main-thread confined. The controller's delegate and
    // presentationContextProvider are weak, so the plugin must retain all three
    // objects until the single terminal delegate callback.
    private var activeController: ASAuthorizationController?
    private var activeDelegate: AppleAuthorizationDelegate?
    private var activeCall: CAPPluginCall?
    private var activeToken: UUID?
    /// The `state` WE sent, kept so a credential that echoes none can still be
    /// completed. See `finishActive`.
    private var activeState: String?

    @objc func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Apple authorization is unavailable", "authorizationFailed")
                return
            }
            self.authorizeOnMain(call)
        }
    }

    private func authorizeOnMain(_ call: CAPPluginCall) {
        guard activeController == nil else {
            call.reject("An Apple authorization is already in flight", "busy")
            return
        }
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else {
            call.reject("authorize requires a nonempty `nonce`", "badRequest")
            return
        }
        guard let state = call.getString("state"), !state.isEmpty else {
            call.reject("authorize requires a nonempty `state`", "badRequest")
            return
        }
        guard let window = bridge?.viewController?.view.window else {
            call.reject("No window can present Apple authorization", "noWindow")
            return
        }

        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = nonce
        request.state = state

        let token = UUID()
        let delegate = AppleAuthorizationDelegate(anchor: window) { [weak self] outcome in
            DispatchQueue.main.async {
                self?.finishActive(token: token, outcome: outcome)
            }
        }
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = delegate
        controller.presentationContextProvider = delegate

        activeController = controller
        activeDelegate = delegate
        activeCall = call
        activeToken = token
        activeState = state
        controller.performRequests()
    }

    private func finishActive(token: UUID, outcome: AppleAuthorizationOutcome) {
        // TWO clauses, never three. Folding `activeState` in here would mean a
        // future edit that leaves it nil returns WITHOUT `clearActive()`, so
        // `activeController` stays non-nil, every later authorize rejects
        // "busy", and the current call is never resolved or rejected — the JS
        // promise hangs and the rower sits on a spinner with no error path.
        // Nothing compiles this file in CI, so that would not be caught.
        // Capture it instead, release the operation, and fail closed below.
        guard activeToken == token, let call = activeCall else { return }
        let requestedState = activeState
        clearActive()

        switch outcome {
        case .success(let credential):
            guard
                let identityData = credential.identityToken,
                let idToken = String(data: identityData, encoding: .utf8),
                !idToken.isEmpty,
                let codeData = credential.authorizationCode,
                let authorizationCode = String(data: codeData, encoding: .utf8),
                !authorizationCode.isEmpty
            else {
                call.reject("Apple returned incomplete authorization proof", "invalidResponse")
                return
            }

            // ABSENCE IS NOT FAILURE. `ASAuthorizationAppleIDCredential.state`
            // is Optional, and Apple documents only "an arbitrary string that
            // your app provides to the request that generates the credential"
            // — no guarantee it comes back populated. Treating nil as a hard
            // reject made every native Apple sign-in fail forever on a code
            // path that has never run against real Apple, and it bought
            // nothing: the server compares `proof.state` to the attempt's own
            // state (`providers.ts`), and `activeToken` above already answers
            // "is this the credential for the request I just made". So fall
            // back to what we sent, and reject only a genuine MISMATCH, which
            // is the case actually worth catching.
            guard let requestedState else {
                call.reject("Apple returned incomplete authorization proof", "invalidResponse")
                return
            }
            let echoedState = credential.state.flatMap { $0.isEmpty ? nil : $0 }
            guard echoedState == nil || echoedState == requestedState else {
                call.reject("Apple echoed a different authorization state", "invalidResponse")
                return
            }
            let state = echoedState ?? requestedState

            var result: JSObject = [
                "idToken": idToken,
                "authorizationCode": authorizationCode,
                "state": state,
            ]
            if let name = displayName(from: credential.fullName) {
                result["name"] = name
            }
            call.resolve(result)

        case .invalidResponse:
            call.reject("Apple returned an unsupported credential", "invalidResponse")

        case .failure(let error):
            let nsError = error as NSError
            if nsError.domain == ASAuthorizationError.errorDomain,
               nsError.code == ASAuthorizationError.canceled.rawValue {
                call.reject("Apple authorization was cancelled", "cancelled")
            } else {
                call.reject("Apple authorization failed", "authorizationFailed")
            }
        }
    }

    private func displayName(from components: PersonNameComponents?) -> String? {
        guard let components = components else { return nil }
        let name = PersonNameComponentsFormatter()
            .string(from: components)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? nil : name
    }

    private func clearActive() {
        activeController = nil
        activeDelegate = nil
        activeCall = nil
        activeToken = nil
        // Cleared with the rest of the operation, not left to leak into the
        // next one: `activeState` is per-attempt authority, and a stale value
        // surviving here is exactly the lifetime shape RF27 exists for.
        activeState = nil
    }
}
