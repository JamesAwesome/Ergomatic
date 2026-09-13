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
  it("keeps bridge result logging disabled and registers the app Console override first", () => {
    const config = read("capacitor.config.ts");
    expect(config).toContain('loggingBehavior: "none"');
    expect(consolePlugin).toContain('let jsName = "Console"');
    expect(consolePlugin).toContain(
      'CAPPluginMethod(name: "log", returnType: CAPPluginReturnNone)',
    );
    const consoleRegistration = controller.indexOf(
      "bridge?.registerPluginInstance(ErgomaticConsolePlugin())",
    );
    const webAuthRegistration = controller.indexOf(
      "bridge?.registerPluginInstance(WebAuthPlugin())",
    );
    expect(consoleRegistration).toBeGreaterThan(-1);
    expect(consoleRegistration).toBeLessThan(webAuthRegistration);
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
