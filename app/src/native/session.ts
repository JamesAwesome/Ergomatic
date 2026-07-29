/* v8 ignore start -- thin Keychain wrapper; proven on device. */
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

const KEY = "erg_bearer";

export async function getStoredToken(): Promise<string | null> {
  const v = await SecureStorage.get(KEY);
  return typeof v === "string" && v !== "" ? v : null;
}

export async function storeToken(token: string): Promise<void> {
  await SecureStorage.set(KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStorage.remove(KEY);
}
/* v8 ignore stop */
