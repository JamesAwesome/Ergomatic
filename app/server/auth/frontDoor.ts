import { importPKCS8 } from "jose";
import type pg from "pg";
import { createAttempts } from "./attempts.js";
import { createProviders, type ProviderConfig } from "./providers.js";
import { createFrontDoorRoutes } from "./frontDoorRoutes.js";
import type { SessionStore } from "./sessions.js";
import type { AccessPolicy } from "./accessPolicy.js";

export async function frontDoorConfig(
  env: NodeJS.ProcessEnv,
  siteUrl: string,
): Promise<ProviderConfig | null> {
  const keys = [
    "APPLE_NATIVE_CLIENT_ID",
    "APPLE_WEB_CLIENT_ID",
    "APPLE_TEAM_ID",
    "APPLE_KEY_ID",
    "APPLE_PRIVATE_KEY",
  ] as const;
  if (keys.every((key) => !env[key]?.trim())) return null;
  function required(key: string) {
    const value = env[key];
    if (!value?.trim() || value.length > 8192)
      throw new Error(`${key} is required when Apple is configured`);
    return value.trim();
  }
  const nativeClientId = required("APPLE_NATIVE_CLIENT_ID");
  const webClientId = required("APPLE_WEB_CLIENT_ID");
  if (
    nativeClientId === webClientId ||
    nativeClientId.length > 255 ||
    webClientId.length > 255
  )
    throw new Error("Apple native/web client IDs must be distinct and bounded");
  if (new URL(siteUrl).protocol !== "https:")
    throw new Error("Apple configuration requires HTTPS SITE_URL");
  return {
    siteUrl,
    apple: {
      nativeClientId,
      webClientId,
      teamId: required("APPLE_TEAM_ID"),
      keyId: required("APPLE_KEY_ID"),
      key: await importPKCS8(required("APPLE_PRIVATE_KEY"), "ES256"),
    },
    google: {
      nativeClientId: env.GOOGLE_IOS_CLIENT_ID ?? "",
      webClientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
    },
  };
}
export async function createFrontDoor(
  pool: pg.Pool,
  sessions: SessionStore,
  config: ProviderConfig,
  accessPolicy: AccessPolicy,
) {
  const attempts = createAttempts(pool, accessPolicy);
  const providers = createProviders(config);
  async function sweepAttempts() {
    try {
      await attempts.sweep();
    } catch {
      console.warn(JSON.stringify({ event: "auth_attempt_cleanup_failed" }));
    }
  }
  async function sweepSessions() {
    try {
      await sessions.sweepExpired();
    } catch {
      console.warn(JSON.stringify({ event: "auth_session_cleanup_failed" }));
    }
  }
  async function sweep() {
    await Promise.all([sweepAttempts(), sweepSessions()]);
  }
  await sweep();
  const timer = setInterval(() => {
    void sweep();
  }, 60000);
  timer.unref();
  return {
    ...createFrontDoorRoutes({
      attempts,
      providers,
      sessions,
      siteUrl: config.siteUrl,
    }),
    attempts,
    providers,
    close: () => clearInterval(timer),
  };
}
export type FrontDoor = Awaited<ReturnType<typeof createFrontDoor>>;
