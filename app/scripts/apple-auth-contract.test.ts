import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(resolve(here, "..", path), "utf8");
const readOptional = (path: string) => {
  try {
    return read(path);
  } catch {
    return "";
  }
};

const swift = read("ios/App/App/AppleAuthPlugin.swift");
const wrapper = read("src/native/appleAuth.ts");
const controller = read("ios/App/App/MyViewController.swift");
const project = read("ios/App/App.xcodeproj/project.pbxproj");
const entitlements = read("ios/App/App/App.entitlements");
const consolePlugin = readOptional("ios/App/App/ErgomaticConsolePlugin.swift");

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
  it("keeps bridge result logging disabled and registers the app Console override", () => {
    const config = read("capacitor.config.ts");
    expect(config).toContain('loggingBehavior: "none"');
    expect(consolePlugin).toContain('let jsName = "Console"');
    expect(consolePlugin).toContain(
      'CAPPluginMethod(name: "log", returnType: CAPPluginReturnNone)',
    );
    // REGISTRATION ORDER IS NOT ASSERTED, deliberately. This used to pin
    // `console < webAuth` under the title "registers the app Console override
    // first", which reads as proving the override works and proves nothing:
    // the three registrations carry distinct jsNames, so their order among
    // THEMSELVES cannot matter. What makes the override take effect is vendor
    // sequencing — CapacitorBridge registers CAPConsolePlugin during bridge
    // construction, CAPBridgeViewController calls capacitorDidLoad afterwards,
    // and registerPluginInstance replaces by jsName — none of which a source
    // grep can see. Pinning that the registration EXISTS is the honest
    // remainder (RF26: a census proves structure, not runtime invocation).
    expect(controller).toContain(
      "bridge?.registerPluginInstance(ErgomaticConsolePlugin())",
    );
  });

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
      "guard activeToken == token, let call = activeCall",
    );
    // `activeState` joined the operation's refs when the nil-state fallback
    // landed: `finishActive` needs the state WE sent in order to complete a
    // credential that echoes none. It is per-attempt authority, so it is
    // cleared with the rest of them and exactly once — a stale value surviving
    // into the next attempt is the lifetime shape RF27 exists for, and this
    // line is what goes red if `clearActive` forgets it.
    expect(swift).toContain("let requestedState = activeState");
    // The mismatch guard itself, not just the ref it reads. Deleting the whole
    // guard left this census green: the reject-count below would have caught
    // it, but only incidentally, and a later reject added elsewhere would
    // restore the count and hide it again.
    expect(swift).toContain(
      "guard echoedState == nil || echoedState == requestedState",
    );
    expect(swift.match(/activeController = nil/g)).toHaveLength(1);
    expect(swift.match(/activeDelegate = nil/g)).toHaveLength(1);
    expect(swift.match(/activeCall = nil/g)).toHaveLength(1);
    expect(swift.match(/activeState = nil/g)).toHaveLength(1);
  });

  it("exposes a bounded error vocabulary without credential storage or logs", () => {
    const codes = rejectionCodes(swift);
    // Eleven reject SITES, six distinct codes. Two arrived with the nil-state
    // fallback: one for a genuine state MISMATCH (absence alone no longer
    // rejects), and one fail-closed arm for a nil `requestedState`, which
    // exists so `finishActive` can release the operation before it decides —
    // a return that skipped `clearActive` would wedge the plugin on "busy"
    // forever. Both reuse `invalidResponse` rather than widening the
    // vocabulary, which is why the set below is unchanged. The set is the
    // real invariant; the count only guards against a reject being added
    // without anyone looking at what it says.
    expect(codes).toHaveLength(11);
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
