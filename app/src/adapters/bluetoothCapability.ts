import { isNative } from "../platform";

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
