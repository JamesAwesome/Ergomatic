import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const read = (path) => readFileSync(resolve(appRoot, path), "utf8");

const configPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(appRoot, "ios/App/App/capacitor.config.json");
const syncedConfig = JSON.parse(readFileSync(configPath, "utf8"));
const descriptorSource = read(
  "node_modules/@capacitor/ios/Capacitor/Capacitor/CAPInstanceDescriptor.swift",
);
const configurationSource = read(
  "node_modules/@capacitor/ios/Capacitor/Capacitor/CAPInstanceConfiguration.m",
);
const bridgeControllerSource = read(
  "node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift",
);
const jsExportSource = read(
  "node_modules/@capacitor/ios/Capacitor/Capacitor/JSExport.swift",
);
const capacitorBridgeSource = read(
  "node_modules/@capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift",
);
const nativeBridge = read(
  "node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js",
);

// Pin the installed native path that turns the synced setting into the two
// logging switches exercised below. A dependency change must re-establish
// this mapping instead of silently inheriting this test's interpretation.
assert.match(
  descriptorSource,
  /case "none":\s+return InstanceLoggingBehavior\.none/,
);
assert.match(
  descriptorSource,
  /\(config\[keyPath: "ios\.loggingBehavior"\] as\? String\) \?\? \(config\[keyPath: "loggingBehavior"\] as\? String\)/,
);
assert.match(
  configurationSource,
  /case CAPInstanceLoggingBehaviorDebug:\s+_loggingEnabled = debug;/,
);
assert.match(configurationSource, /default:\s+_loggingEnabled = false;/);
assert.match(
  bridgeControllerSource,
  /CAPLog\.enableLogging = configuration\.loggingEnabled/,
);
assert.match(jsExportSource, /isLoggingEnabled: \\\(loggingEnabled\)/);
assert.match(
  capacitorBridgeSource,
  /CAPLog\.print\("⚡️  TO JS", resultJson\.prefix\(256\)\)/,
);
assert.match(
  nativeBridge,
  /if \(cap\.isLoggingEnabled && result\.pluginId !== 'Console'\) \{\s+cap\.logFromNative\(result\);/,
);

const behavior =
  syncedConfig.ios?.loggingBehavior ?? syncedConfig.loggingBehavior ?? "debug";
const debugLoggingEnabled = behavior === "debug" || behavior === "production";

const logs = [];
const sent = [];
const dom = new JSDOM("", {
  url: "https://app.test",
  runScripts: "outside-only",
});
const { window } = dom;
window.Capacitor = {
  DEBUG: true,
  isLoggingEnabled: debugLoggingEnabled,
  Plugins: {},
};
window.WEBVIEW_SERVER_URL = "https://app.test";
window.webkit = {
  messageHandlers: { bridge: { postMessage: (message) => sent.push(message) } },
};
window.fetch = fetch;
window.Headers = Headers;
window.Request = Request;
window.Response = Response;
window.prompt = () => null;
for (const method of [
  "debug",
  "dir",
  "error",
  "groupCollapsed",
  "groupEnd",
  "info",
  "log",
  "trace",
  "warn",
]) {
  window.console[method] = (...args) => logs.push([method, ...args]);
}
window.eval(nativeBridge);

const diagnostic = "ERGOMATIC_NON_CREDENTIAL_DIAGNOSTIC";
window.console.info(diagnostic);
assert.equal(
  sent.some(
    (message) =>
      message.pluginId === "Console" &&
      message.methodName === "log" &&
      message.options?.message === diagnostic,
  ),
  true,
  "application console diagnostics no longer reach the native Console plugin",
);

const credential = "ERGOMATIC_SYNTHETIC_APPLE_CREDENTIAL_F3";
const pending = window.Capacitor.nativePromise("AppleAuth", "authorize", {
  nonce: "synthetic-nonce",
  state: "synthetic-state",
});
const call = sent.findLast((message) => message.pluginId === "AppleAuth");
assert.ok(call, "the installed bridge did not emit the AppleAuth call");

window.Capacitor.fromNative({
  callbackId: call.callbackId,
  pluginId: "AppleAuth",
  methodName: "authorize",
  save: false,
  success: true,
  data: {
    idToken: "synthetic-id-token",
    authorizationCode: credential,
    state: "synthetic-state",
  },
});
await pending;

const renderedLogs = JSON.stringify(logs);
assert.equal(
  renderedLogs.includes(credential),
  false,
  "the installed JavaScript bridge logged the synthetic Apple credential",
);
assert.equal(
  debugLoggingEnabled,
  false,
  `synced Debug configuration enables native result serialization via loggingBehavior=${JSON.stringify(behavior)}`,
);

console.log(
  JSON.stringify({
    configPath,
    syncedLoggingBehavior: behavior,
    nativeSerializationLoggingEnabled: debugLoggingEnabled,
    applicationDiagnosticForwarded: true,
    credentialLogged: false,
  }),
);
dom.window.close();
