import { isNative } from "../platform";

// `navigator.bluetooth`'s own type comes from `monitor/transports/
// webBluetooth.ts`'s ambient `declare global { interface Navigator {...} }`
// augmentation — a MODULE-PRIVATE `Bluetooth` interface (that file has no
// `export`, so its name isn't reachable here to extend by declaration
// merging). Rather than fight that with a second global augmentation of a
// name this file cannot see, this probes for `getAvailability` at runtime
// and types the result narrowly, right where it's used — TypeScript's DOM
// lib ships no Web Bluetooth types at all (`webBluetooth.ts`'s own header
// comment: verified, nothing in lib.dom.d.ts), and `getAvailability` is
// Chromium-only, genuinely absent on older Chromium/other engines.
interface BluetoothAvailabilityProbe {
  getAvailability?(): Promise<boolean>;
}

export type BluetoothCapability = "available" | "off" | "absent";

export async function probeBluetoothStatus(): Promise<BluetoothCapability> {
  if (isNative()) {
    // WKWebView has no navigator.bluetooth; the Capacitor plugin owns
    // permission/off detection at connect time (phone-BLE spec §6).
    return "available";
  }
  const bt = (navigator as { bluetooth?: unknown }).bluetooth;
  if (bt === undefined) return "absent";
  const probe = bt as BluetoothAvailabilityProbe;
  if (typeof probe.getAvailability !== "function") return "available";
  try {
    return (await probe.getAvailability()) ? "available" : "off";
  } catch {
    return "available";
  }
}
