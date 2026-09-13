# Apple Native Authentication Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first-party iOS bridge that sends a server-minted nonce and state to Sign in with Apple and returns Apple's transient proof to the native auth adapter.

**Architecture:** A thin TypeScript `registerPlugin` declaration exposes one promise method. A first-party Swift `CAPPlugin` owns one `ASAuthorizationController`, its weak delegate/presentation provider, the pending Capacitor call, and an attempt token until one terminal callback clears all four. A source-contract test pins the Swift/TypeScript strings, Xcode membership, entitlement, single-flight fields, result keys, and absence of credential storage/logging; an unsigned simulator build proves the actual Swift source compiles in the App target at iOS 15.0.

**Tech Stack:** Capacitor 8, Swift 5, AuthenticationServices, UIKit, TypeScript 6, Vitest, Xcode

**Spec:** `docs/superpowers/specs/2026-09-12-apple-signin-design.md` (`Native and web authentication`; `Evidence and gates`)

## Global Constraints

- This module implements only the native Apple bridge. Server routes, the native auth-flow adapter, and all UI remain owned by the neighboring plans.
- The exact bridge contract is `AppleAuth.authorize({nonce,state}) -> {idToken,authorizationCode,state,name?}`, where `name` is a formatted string when Apple supplies a first-authorization name. The caller keeps these values in the adapter operation only and sends them to the server proof route; no general screen state, preferences, analytics, or logs receive them.
- Forward the server's nonce and state unchanged. Apple's iOS SDK says state is returned in the successful response and nonce can be verified in the identity token (`ASAuthorizationOpenIDRequest.h`, iPhoneOS 26.5 SDK, read 2026-09-12; approved spec, `Primary research and corrections`).
- Request `.fullName` and `.email`. Return the formatted name only when it is nonblank; email stays inside the signed ID token and is verified by the server.
- Reject absent or empty nonce/state before taking the in-flight claim. Reject an overlapping operation as `busy` without clearing the first operation.
- Clear the controller, delegate, call, and attempt token before resolving or rejecting every success, cancellation, invalid response, or provider failure. Never include Apple's error object or credentials in a message or log.
- `ASAuthorizationController.delegate` and `.presentationContextProvider` are weak, while `performRequests()` retains the controller until completion (`ASAuthorizationController.h:59-84`, iPhoneOS 26.5 SDK, read 2026-09-12). The plugin therefore strongly holds the controller, delegate, and call until the terminal delegate callback.
- Preserve every `IPHONEOS_DEPLOYMENT_TARGET = 15.0` setting (`app/ios/App/App.xcodeproj/project.pbxproj:247,304,323,346`). Every API in this block is available by iOS 15.0. Do not use `ASAuthorizationController.cancel()`, which begins at iOS 16.0 in the checked SDK header.
- Add `com.apple.developer.applesignin` with the single `Default` value to the existing entitlement file. Apple documents that exact key, array shape, and normal-operation value ([Sign in with Apple entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.applesignin), PRIMARY).
- Keep Google and `WebAuthPlugin` registration unchanged. `MyViewController.capacitorDidLoad()` is the existing first-party registration seam (`app/ios/App/App/MyViewController.swift:16-20`), and the App target's current file/source membership pattern is in `project.pbxproj:9-19,22-34,66-79,160-170`.
- No new npm or Swift dependency. No phone install or launch is part of this plan.

## File Map

| File | Responsibility |
| --- | --- |
| `app/src/native/appleAuth.ts` | TypeScript-only declaration of the native plugin contract. |
| `app/ios/App/App/AppleAuthPlugin.swift` | AuthenticationServices request, single-flight lifetime, delegate callbacks, transient response conversion. |
| `app/ios/App/App/MyViewController.swift` | Register one `AppleAuthPlugin` instance beside the existing `WebAuthPlugin`. |
| `app/ios/App/App/App.entitlements` | Enable normal Sign in with Apple for the App target. |
| `app/ios/App/App.xcodeproj/project.pbxproj` | Add the Swift file reference, App group entry, build-file entry, and Sources-phase membership. |
| `app/scripts/apple-auth-contract.test.ts` | Cross-language/native-project contract gate, included in the existing unit project by `app/vitest.config.ts:19-23`. |

## Native Lifetime Table

| State | Minted | Cleared | WebView reload | App relaunch | Next authorize |
| --- | --- | --- | --- | --- | --- |
| `activeController` | Immediately before `performRequests()` | `clearActive()` before every terminal resolve/reject | The native authorization continues to its OS callback; no JS value can claim it | Process memory is discarded | A live controller rejects overlap as `busy`; a cleared controller admits one request |
| `activeDelegate` | Beside controller; strongly held because controller's delegate/provider references are weak | Same `clearActive()` | Retained until the OS callback, then released | Discarded | Never reused |
| `activeCall` | Beside controller after all input/window checks | Same `clearActive()` | Capacitor may no longer have a live JS receiver, but the native claim still clears at the terminal callback | Discarded | Never resolved by another attempt because token identity must match |
| `activeToken` | Fresh `UUID` captured by this delegate closure | Same `clearActive()` | Survives only until this authorization's terminal callback | Discarded | A late callback cannot resolve a later call |
| delegate `completed` guard | `false` in the per-request delegate | Becomes `true` before invoking the plugin completion | Survives with that delegate until release | Discarded | A duplicate delegate callback is ignored |
| nonce/state, identity token, authorization code, name | Nonce/state are local request inputs; proof values are local callback values | Function/delegate scope ends after resolve/reject | Never persisted | Never persisted | No value is reused |

**Invariants:** at most one Apple authorization belongs to this bridge instance; exactly one terminal delegate callback may settle its call; a callback may settle only the attempt token it captured; all provider proof remains transient; every terminal path releases the plugin's strong references. On iOS 15 a WebView reload cannot programmatically cancel `ASAuthorizationController`, because the SDK's cancel API starts at iOS 16; the controller finishes through its OS callback and the bridge then releases the claim.

---

### Task 1: Add the AppleAuth bridge and its executable contract gate

**Files:**
- Create: `app/scripts/apple-auth-contract.test.ts`
- Create: `app/src/native/appleAuth.ts`
- Create: `app/ios/App/App/AppleAuthPlugin.swift`
- Modify: `app/ios/App/App/MyViewController.swift:17-20`
- Modify: `app/ios/App/App/App.entitlements:4-9`
- Modify: `app/ios/App/App.xcodeproj/project.pbxproj:9-19,22-34,66-79,160-170`

**Interfaces:**
- Consumes: server-minted `{nonce: string, state: string}` from the native auth adapter.
- Produces: `AppleAuth.authorize(options: AppleAuthAuthorizeOptions): Promise<AppleAuthAuthorizeResult>`.
- Produces result: `{idToken: string, authorizationCode: string, state: string, name?: string}`.
- Rejects with one of: `badRequest`, `busy`, `noWindow`, `cancelled`, `invalidResponse`, `authorizationFailed`.

- [ ] **Step 1: Write the failing cross-language contract test**

Create `app/scripts/apple-auth-contract.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, "..", path), "utf8");

const swift = read("ios/App/App/AppleAuthPlugin.swift");
const wrapper = read("src/native/appleAuth.ts");
const controller = read("ios/App/App/MyViewController.swift");
const project = read("ios/App/App.xcodeproj/project.pbxproj");
const entitlements = read("ios/App/App/App.entitlements");

function interfaceKeys(source: string, name: string): string[] {
  const body =
    new RegExp(`interface ${name} \\{([^}]*)\\}`).exec(source)?.[1] ?? "";
  return [...body.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\??:/gm)]
    .map((match) => match[1]!)
    .sort();
}

function stringArguments(source: string, call: string): string[] {
  return [...source.matchAll(new RegExp(`${call}\\("([^"]+)"`, "g"))]
    .map((match) => match[1]!)
    .sort();
}

function rejectionCodes(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => line.includes("call.reject("))
    .map((line) => {
      const strings = [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)];
      return strings[strings.length - 1]?.[1] ?? "";
    })
    .sort();
}

describe("AppleAuth native contract", () => {
  it("registers the same plugin and promise method in Swift and TypeScript", () => {
    expect(swift).toContain('let jsName = "AppleAuth"');
    expect(swift).toContain(
      'CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)',
    );
    expect(wrapper).toContain('registerPlugin<AppleAuthPlugin>("AppleAuth")');
    expect(controller).toContain(
      "bridge?.registerPluginInstance(AppleAuthPlugin())",
    );
  });

  it("accepts only the server nonce and state and forwards both unchanged", () => {
    expect(stringArguments(swift, "call\\.getString")).toStrictEqual([
      "nonce",
      "state",
    ]);
    expect(interfaceKeys(wrapper, "AppleAuthAuthorizeOptions")).toStrictEqual([
      "nonce",
      "state",
    ]);
    expect(swift).toContain("request.nonce = nonce");
    expect(swift).toContain("request.state = state");
  });

  it("requests Apple profile fields and returns only transient proof plus optional name", () => {
    expect(swift).toContain("request.requestedScopes = [.fullName, .email]");
    expect(interfaceKeys(wrapper, "AppleAuthAuthorizeResult")).toStrictEqual([
      "authorizationCode",
      "idToken",
      "name",
      "state",
    ]);
    expect(swift).toContain('"idToken": idToken');
    expect(swift).toContain('"authorizationCode": authorizationCode');
    expect(swift).toContain('"state": state');
    expect(swift).toContain('result["name"] = name');
  });

  it("holds one controller/delegate/call until one terminal callback clears them", () => {
    expect(swift).toContain("guard activeController == nil else");
    expect(swift).toContain(
      "private var activeController: ASAuthorizationController?",
    );
    expect(swift).toContain(
      "private var activeDelegate: AppleAuthorizationDelegate?",
    );
    expect(swift).toContain("private var activeCall: CAPPluginCall?");
    expect(swift).toContain(
      "guard activeToken == token, let call = activeCall else { return }",
    );
    expect(swift.match(/activeController = nil/g)).toHaveLength(1);
    expect(swift.match(/activeDelegate = nil/g)).toHaveLength(1);
    expect(swift.match(/activeCall = nil/g)).toHaveLength(1);
  });

  it("exposes a bounded error vocabulary without credential storage or logs", () => {
    const codes = rejectionCodes(swift);
    expect(codes).toHaveLength(9);
    expect([...new Set(codes)].sort()).toStrictEqual([
      "authorizationFailed",
      "badRequest",
      "busy",
      "cancelled",
      "invalidResponse",
      "noWindow",
    ]);
    for (const forbidden of [
      "UserDefaults",
      "Keychain",
      "SecItem",
      "print(",
      "debugPrint(",
      "dump(",
      "NSLog",
      "os_log",
      "CAPLog",
      "Logger(",
    ]) {
      expect(swift).not.toContain(forbidden);
    }
  });

  it("puts the Swift file in the App target and enables the Apple entitlement", () => {
    expect(
      project.match(
        /E2A1B0052C5D4F0100AA1105 \/\* AppleAuthPlugin\.swift \*\//g,
      ),
    ).toHaveLength(3);
    expect(
      project.match(
        /E2A1B0062C5D4F0100AA1106 \/\* AppleAuthPlugin\.swift in Sources \*\//g,
      ),
    ).toHaveLength(2);
    expect(entitlements).toContain(
      "<key>com.apple.developer.applesignin</key>",
    );
    expect(entitlements).toMatch(
      /<key>com\.apple\.developer\.applesignin<\/key>\s*<array>\s*<string>Default<\/string>/,
    );
  });
});
```

- [ ] **Step 2: Run the focused test and record the red proof**

From `app/`:

```bash
export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit scripts/apple-auth-contract.test.ts
```

Expected: FAIL before test collection with `ENOENT` naming `AppleAuthPlugin.swift`. This proves the gate starts upstream of the missing native producer rather than passing against a hand-built fixture.

- [ ] **Step 3: Add the TypeScript plugin declaration**

Create `app/src/native/appleAuth.ts`:

```ts
/* v8 ignore start -- thin native plugin wrapper; Swift behavior is compiled
 * by the iOS gate and its cross-language literals are pinned by
 * scripts/apple-auth-contract.test.ts. */
import { registerPlugin } from "@capacitor/core";

export interface AppleAuthAuthorizeOptions {
  /** Server-minted OpenID nonce. Forwarded to Apple unchanged. */
  nonce: string;
  /** Server-minted authorization state. Forwarded to Apple unchanged. */
  state: string;
}

export interface AppleAuthAuthorizeResult {
  /** Apple's signed identity JWT. It remains transient client state. */
  idToken: string;
  /** Apple's single-use authorization code. It remains transient client state. */
  authorizationCode: string;
  /** The state echoed by Apple, for server-side attempt validation. */
  state: string;
  /** Apple's first-authorization name, omitted when Apple supplies none. */
  name?: string;
}

export interface AppleAuthPlugin {
  authorize(
    options: AppleAuthAuthorizeOptions,
  ): Promise<AppleAuthAuthorizeResult>;
}

export const AppleAuth = registerPlugin<AppleAuthPlugin>("AppleAuth");
/* v8 ignore stop */
```

- [ ] **Step 4: Add the Swift plugin**

Create `app/ios/App/App/AppleAuthPlugin.swift`:

```swift
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
        controller.performRequests()
    }

    private func finishActive(token: UUID, outcome: AppleAuthorizationOutcome) {
        guard activeToken == token, let call = activeCall else { return }
        clearActive()

        switch outcome {
        case .success(let credential):
            guard
                let identityData = credential.identityToken,
                let idToken = String(data: identityData, encoding: .utf8),
                !idToken.isEmpty,
                let codeData = credential.authorizationCode,
                let authorizationCode = String(data: codeData, encoding: .utf8),
                !authorizationCode.isEmpty,
                let state = credential.state,
                !state.isEmpty
            else {
                call.reject("Apple returned incomplete authorization proof", "invalidResponse")
                return
            }

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
    }
}
```

- [ ] **Step 5: Register the plugin, enable the entitlement, and add App-target membership**

In `app/ios/App/App/MyViewController.swift`, keep the existing registration and add the Apple plugin immediately after it:

```swift
class MyViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(WebAuthPlugin())
        bridge?.registerPluginInstance(AppleAuthPlugin())
    }
}
```

In `app/ios/App/App/App.entitlements`, add the Apple key before the existing NFC key; the final file is:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.applesignin</key>
  <array>
    <string>Default</string>
  </array>
  <key>com.apple.developer.nfc.readersession.formats</key>
  <array>
    <string>TAG</string>
  </array>
</dict>
</plist>
```

In `app/ios/App/App.xcodeproj/project.pbxproj`, add these exact entries beside the corresponding `WebAuthPlugin.swift` entries. The IDs are new and intentionally pinned by the contract test:

```text
/* PBXBuildFile section */
		E2A1B0062C5D4F0100AA1106 /* AppleAuthPlugin.swift in Sources */ = {isa = PBXBuildFile; fileRef = E2A1B0052C5D4F0100AA1105 /* AppleAuthPlugin.swift */; };

/* PBXFileReference section */
		E2A1B0052C5D4F0100AA1105 /* AppleAuthPlugin.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = AppleAuthPlugin.swift; sourceTree = "<group>"; };

/* 504EC3061FED79650016851F App PBXGroup children */
				E2A1B0052C5D4F0100AA1105 /* AppleAuthPlugin.swift */,

/* 504EC3001FED79650016851F Sources files */
				E2A1B0062C5D4F0100AA1106 /* AppleAuthPlugin.swift in Sources */,
```

Do not add another `CODE_SIGN_ENTITLEMENTS` setting: Debug and Release already point to `App/App.entitlements` (`project.pbxproj:320,343`). Do not change any deployment target.

- [ ] **Step 6: Format and run the contract test green**

From `app/`:

```bash
export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"
pnpm exec prettier --write scripts/apple-auth-contract.test.ts src/native/appleAuth.ts
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --project unit scripts/apple-auth-contract.test.ts
```

Expected: `1 passed`, `6 passed`.

- [ ] **Step 7: Run repository and project-shape gates**

From the repository root:

```bash
plutil -lint app/ios/App/App/App.entitlements app/ios/App/App.xcodeproj/project.pbxproj
git diff --check
```

Expected: both plist/project files print `OK`; `git diff --check` prints nothing.

From `app/`:

```bash
export PATH="$HOME/.local/share/nvm/v26.5.0/bin:$PATH"
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm exec cap sync ios
git status --short -- ios
```

Expected: all commands pass. The final status contains only the four intended native changes: `App.xcodeproj/project.pbxproj`, `App/App.entitlements`, `App/MyViewController.swift`, and the new `App/AppleAuthPlugin.swift`. Any other tracked iOS path means `cap sync` changed scope; stop and reconcile it before continuing. Generated `App/public`, `capacitor.config.json`, and `config.xml` are ignored by `app/ios/.gitignore:4,12-13`.

- [ ] **Step 8: Compile the real App target at the checked deployment floor**

From `app/ios/App/`:

```bash
timeout 600 xcodebuild -list -project App.xcodeproj
apple_dd="$(mktemp -d /tmp/ergomatic-apple-native-dd.XXXXXX)"
timeout 1800 xcodebuild -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath "$apple_dd" build CODE_SIGNING_ALLOWED=NO 2>&1 | tee /tmp/ergomatic-apple-native-build.log | tail -40
swift_list="$apple_dd/Build/Intermediates.noindex/App.build/Debug-iphonesimulator/App.build/Objects-normal/arm64/App.SwiftFileList"
test "$(grep -c 'App/AppleAuthPlugin\.swift$' "$swift_list")" -eq 1
test "$(grep -c 'App/MyViewController\.swift$' "$swift_list")" -eq 1
xcodebuild -project App.xcodeproj -scheme App -configuration Debug -showBuildSettings 2>/dev/null | rg '^\s*(IPHONEOS_DEPLOYMENT_TARGET|CODE_SIGN_ENTITLEMENTS) ='
```

Expected: the project lists target and scheme `App`; the build ends `** BUILD SUCCEEDED **`; both membership assertions exit 0; build settings print `CODE_SIGN_ENTITLEMENTS = App/App.entitlements` and `IPHONEOS_DEPLOYMENT_TARGET = 15.0`. Keep the build log in the task report. This is an unsigned simulator build only; do not install or launch it.

- [ ] **Step 9: Commit the tested bridge before mutation probes**

From the repository root:

```bash
git rev-parse --show-toplevel
git add app/scripts/apple-auth-contract.test.ts app/src/native/appleAuth.ts app/ios/App/App/AppleAuthPlugin.swift app/ios/App/App/MyViewController.swift app/ios/App/App/App.entitlements app/ios/App/App.xcodeproj/project.pbxproj
git diff --cached --check
git commit -m "feat(auth): add native Apple authorization bridge"
git log -1 --oneline
```

Expected: top-level is this task's implementation worktree; the commit lands and `git log -1` shows that message. Do not start a mutation if the commit did not land.

- [ ] **Step 10: Prove the contract assertions bite, restoring the clean commit after each probe**

Before every probe, run `git status --short` and require empty output. Apply only the named one-line mutation, run the focused test, record the failed assertion, then restore only that committed file and require empty status again.

Probe A: in `AppleAuthPlugin.swift`, change:

```diff
-        request.state = state
+        request.state = nonce
```

Run:

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm --dir app exec vitest run --project unit scripts/apple-auth-contract.test.ts
```

Expected: FAIL in `accepts only the server nonce and state and forwards both unchanged` because `request.state = state` is absent. Restore with `git restore -- app/ios/App/App/AppleAuthPlugin.swift`.

Probe B: in `AppleAuthPlugin.swift`, delete only the line:

```diff
-        activeDelegate = nil
```

Run the same focused test. Expected: FAIL in `holds one controller/delegate/call until one terminal callback clears them`, received zero occurrences. Restore the Swift file.

Probe C: in `MyViewController.swift`, change:

```diff
-        bridge?.registerPluginInstance(AppleAuthPlugin())
+        bridge?.registerPluginInstance(WebAuthPlugin())
```

Run the same focused test. Expected: FAIL in `registers the same plugin and promise method in Swift and TypeScript`. Restore `MyViewController.swift`.

Probe D: in `App.entitlements`, change:

```diff
-    <string>Default</string>
+    <string>Primary</string>
```

Run the same focused test. Expected: FAIL in `puts the Swift file in the App target and enables the Apple entitlement`. Restore `App.entitlements`.

Probe E: in `AppleAuthPlugin.swift`, change the unique requested-scopes line from `request.requestedScopes = [.fullName, .email]` to `request.requestedScopes = [.fullName]`. Run the focused test; expect the profile-fields contract assertion to fail. Restore the committed Swift file and require the focused test green.

Probe F: immediately after the unique `private var activeController: ASAuthorizationController?` declaration, insert `private func mutationProbe() { print("probe") }`. Run the focused test; expect the no-credential-logging contract assertion to fail. Restore the committed Swift file and require the focused test green.

Finally run:

```bash
git status --short
NODE_OPTIONS=--no-experimental-webstorage pnpm --dir app exec vitest run --project unit scripts/apple-auth-contract.test.ts
```

Expected: empty status and `6 passed`. Runtime cancellation, sheet presentation, first-authorization name, and overlap behavior still require the overall Apple plan's on-device gate; this module's desk proof stops at the compiled platform boundary.

## Plan-author Paste-Test Evidence

The complete prescribed files above were placed at their real paths in `/tmp/ergomatic-apple-native-paste`, a detached worktree at `3cf849c7614caa25bff78c64517e8d2e47ada39a`. The coordinator asked that this candidate remain available until the implementation PR merges. Raw logs are archived beside this plan in `apple-native-evidence/`; large logs use gzip and the manifest hashes the uncompressed bytes. The original local copy is `/tmp/ergomatic-apple-native-evidence`.

| Command | Result measured 2026-09-12 |
| --- | --- |
| focused Vitest before implementation | FAIL, `ENOENT` naming `AppleAuthPlugin.swift`; 1 failed file, zero collected tests |
| focused Vitest after all blocks | PASS, 1 file and 6 tests |
| `pnpm format:check` | PASS after Prettier formatted the new contract test |
| `pnpm lint` | PASS, including `nul-check`, transport census, and mock-registration census |
| `pnpm typecheck` | PASS; e2e TypeScript membership `24/24` |
| `pnpm build` | PASS; Vite transformed 329 modules and both TypeScript builds completed |
| `pnpm exec cap sync ios` | PASS; eight existing Capacitor plugins found; no extra tracked iOS file appeared |
| `plutil -lint` on entitlement and pbxproj | both `OK` |
| `xcodebuild -list -project App.xcodeproj` | PASS; target and scheme `App` listed |
| unsigned generic iOS Simulator Debug build | `** BUILD SUCCEEDED **`; compiler input list contained `AppleAuthPlugin.swift` once and `MyViewController.swift` once |
| checked Debug build settings | `CODE_SIGN_ENTITLEMENTS = App/App.entitlements`; `IPHONEOS_DEPLOYMENT_TARGET = 15.0` |

The controller committed the tested native candidate as `202f6087` in the retained scratch worktree, with Husky formatting/lint/typecheck firing and the commit confirmed before any probe. All six probes above then failed their focused contract assertion and passed after restoration from that clean commit. Every mutation anchor was unique. The final worktree status was clean. Command: `NODE_OPTIONS=--no-experimental-webstorage pnpm --dir app exec vitest run --project unit scripts/apple-auth-contract.test.ts`. Exact fail/restore receipts are `apple-native-evidence/mutations.json` and its `mutation-*-{red,green}.log` files. These are source-contract probes, not runtime Apple authorization evidence.
