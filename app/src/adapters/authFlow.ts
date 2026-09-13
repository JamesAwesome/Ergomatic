import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AuthError,
  AuthErrorCode,
  AuthOptions,
  AuthProvider,
  AuthPurpose,
  AuthStep,
  NativeBegin,
  SignedIn,
} from "../../shared/auth";
import { api } from "../api";
import { isNative } from "../platform";
import { navigateWeb } from "./webNavigate";

export type AuthOptionsView =
  | { state: "loading" }
  | {
      state: "ready";
      frontDoorEnabled: boolean;
      legacyGoogle: boolean;
      apple: boolean;
      google: boolean;
    };

export type AuthFlowView =
  | { kind: "idle" }
  | { kind: "busy"; purpose: AuthPurpose }
  | {
      kind: "confirm";
      targetProvider: AuthProvider;
      profile: { email: string; name: string };
    }
  | { kind: "usual"; provider: AuthProvider }
  | { kind: "link_confirm"; targetProvider: AuthProvider }
  | {
      kind: "link_authorize";
      targetProvider: AuthProvider;
      provider: AuthProvider;
      existingProofComplete: boolean;
    }
  | { kind: "linked"; targetProvider: AuthProvider }
  | {
      kind: "cancelled";
      purpose: AuthPurpose;
      targetProvider?: AuthProvider;
    }
  | {
      kind: "error";
      purpose: AuthPurpose;
      code: AuthErrorCode;
      email?: string;
      targetProvider?: AuthProvider;
    };

export interface AuthFlowController {
  options: AuthOptionsView;
  view: AuthFlowView;
  targetAuthorizationBusy: boolean;
  destination: "/" | "/you" | "/you/sign-in-methods" | null;
  startSignIn(provider: AuthProvider): Promise<void>;
  confirmAccount(): Promise<void>;
  useUsualSignIn(): Promise<void>;
  prepareLink(provider: AuthProvider): Promise<void>;
  startPreparedLink(): Promise<void>;
  authorizeLinkTarget(): Promise<void>;
  cancel(): Promise<void>;
  reset(): void;
  abandon(): void;
}

type ActiveStep = Exclude<AuthStep, SignedIn>;

interface ActiveOperation {
  step: ActiveStep;
  bindingSecret?: string;
  authorizationOwner?: symbol;
  cancellation?: Promise<boolean>;
}

interface FlowContext {
  native: boolean;
  generation: React.MutableRefObject<number>;
  operation: React.MutableRefObject<ActiveOperation | null>;
  onSignedIn: React.MutableRefObject<() => void>;
  setTargetAuthorizationBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setView: React.Dispatch<React.SetStateAction<AuthFlowView>>;
}

const ERROR_CODES = new Set<AuthErrorCode>([
  "invalid_request",
  "invalid_proof",
  "access_denied",
  "attempt_expired",
  "account_changed",
  "account_conflict",
  "email_required",
  "unavailable",
  "rate_limited",
  "signin_failed",
]);

const LEGACY_OPTIONS: AuthOptionsView = {
  state: "ready",
  frontDoorEnabled: false,
  legacyGoogle: true,
  apple: false,
  google: true,
};

function isAuthOptions(value: unknown): value is AuthOptions {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  for (const provider of ["apple", "google"] as const) {
    const entry = record[provider];
    if (typeof entry !== "object" || entry === null) return false;
    const surface = entry as Record<string, unknown>;
    if (
      typeof surface.native !== "boolean" ||
      typeof surface.web !== "boolean"
    ) {
      return false;
    }
  }
  return typeof record.frontDoorEnabled === "boolean";
}

function destinationFor(
  view: AuthFlowView,
): "/" | "/you" | "/you/sign-in-methods" | null {
  if (view.kind === "link_confirm" || view.kind === "link_authorize") {
    return "/you/sign-in-methods";
  }
  if (
    view.kind === "linked" ||
    (view.kind === "cancelled" && view.purpose === "link") ||
    (view.kind === "error" && view.purpose === "link")
  ) {
    return "/you";
  }
  if (
    view.kind === "confirm" ||
    view.kind === "usual" ||
    (view.kind === "cancelled" && view.purpose === "signin") ||
    (view.kind === "error" && view.purpose === "signin")
  ) {
    return "/";
  }
  return null;
}

async function responseError(
  response: Response,
): Promise<{ code: AuthErrorCode; email?: string }> {
  try {
    const body = (await response.json()) as Partial<AuthError>;
    const code =
      body.error && ERROR_CODES.has(body.error) ? body.error : "signin_failed";
    return {
      code,
      ...(code === "access_denied" &&
      typeof body.email === "string" &&
      body.email.trim() &&
      body.email.length <= 320
        ? { email: body.email.trim() }
        : {}),
    };
  } catch {
    return { code: "signin_failed" };
  }
}

class AuthRequestError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly email?: string,
  ) {
    super(code);
  }
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await api(path, init);
  if (!response.ok) {
    const error = await responseError(response);
    throw new AuthRequestError(error.code, error.email);
  }
  return (await response.json()) as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return jsonRequest<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postNoContent(path: string, body: unknown): Promise<void> {
  const response = await api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await responseError(response);
    throw new AuthRequestError(error.code, error.email);
  }
}

function setFailure(
  context: FlowContext,
  generation: number,
  purpose: AuthPurpose,
  error: unknown,
  targetProvider?: AuthProvider,
  retainOperation = false,
): void {
  if (context.generation.current !== generation) return;
  if (!retainOperation) context.operation.current = null;
  context.setTargetAuthorizationBusy(false);
  const requestError = error instanceof AuthRequestError ? error : undefined;
  context.setView({
    kind: "error",
    purpose,
    code: requestError?.code ?? "signin_failed",
    ...(requestError?.code === "access_denied" && requestError.email
      ? { email: requestError.email }
      : {}),
    ...(targetProvider ? { targetProvider } : {}),
  });
}

function isProviderCancellation(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "cancelled" || code === "USER_CANCELLED";
}

async function finishSignedIn(
  context: FlowContext,
  result: SignedIn,
  generation: number,
): Promise<void> {
  if (context.generation.current !== generation) return;
  if (context.native) {
    if (!result.token) throw new AuthRequestError("signin_failed");
    const { storeToken } = await import("../native/session");
    if (context.generation.current !== generation) return;
    await storeToken(result.token);
    if (context.generation.current !== generation) return;
  }
  context.operation.current = null;
  context.setTargetAuthorizationBusy(false);
  context.setView({ kind: "idle" });
  context.onSignedIn.current();
}

function ownsOperation(
  context: FlowContext,
  active: ActiveOperation,
  generation: number,
  owner?: symbol,
): boolean {
  return (
    context.generation.current === generation &&
    context.operation.current === active &&
    (owner === undefined || active.authorizationOwner === owner)
  );
}

function claimAuthorization(
  context: FlowContext,
  active: ActiveOperation,
  generation: number,
): symbol | null {
  if (
    !ownsOperation(context, active, generation) ||
    active.authorizationOwner
  ) {
    return null;
  }
  const owner = Symbol("auth-authorization");
  active.authorizationOwner = owner;
  return owner;
}

function releaseAuthorization(
  context: FlowContext,
  active: ActiveOperation,
  generation: number,
  owner: symbol,
): boolean {
  if (!ownsOperation(context, active, generation, owner)) return false;
  active.authorizationOwner = undefined;
  return true;
}

async function cancelActive(
  context: FlowContext,
  active = context.operation.current,
): Promise<boolean> {
  if (!active || context.operation.current !== active) return active === null;
  if (active.cancellation) return active.cancellation;
  const surface = context.native ? "native" : "web";
  const body = context.native ? { bindingSecret: active.bindingSecret } : {};
  const cancellation = (async () => {
    try {
      await postNoContent(
        `/api/auth/${surface}/attempts/${encodeURIComponent(active.step.attemptId)}/cancel`,
        body,
      );
    } catch {
      return false;
    }
    if (context.operation.current !== active) return false;
    context.operation.current = null;
    return true;
  })();
  active.cancellation = cancellation;
  const cleaned = await cancellation;
  if (
    !cleaned &&
    context.operation.current === active &&
    active.cancellation === cancellation
  ) {
    active.cancellation = undefined;
  }
  return cleaned;
}

async function finalizeLink(
  context: FlowContext,
  active: ActiveOperation,
  generation: number,
  owner?: symbol,
): Promise<void> {
  if (
    !ownsOperation(context, active, generation, owner) ||
    active.step.outcome !== "link_ready"
  ) {
    throw new AuthRequestError("invalid_request");
  }
  const surface = context.native ? "native" : "web";
  const body = context.native ? { bindingSecret: active.bindingSecret } : {};
  const result = await postJson<{ outcome: "linked" }>(
    `/api/auth/${surface}/attempts/${encodeURIComponent(active.step.attemptId)}/finalize`,
    body,
  );
  if (!ownsOperation(context, active, generation, owner)) return;
  if (result.outcome !== "linked") throw new AuthRequestError("signin_failed");
  const targetProvider = active.step.targetProvider;
  context.operation.current = null;
  context.setTargetAuthorizationBusy(false);
  context.setView({ kind: "linked", targetProvider });
}

async function acceptStep(
  context: FlowContext,
  step: AuthStep,
  bindingSecret?: string,
  autoAuthorize = false,
  generation = context.generation.current,
  existing?: ActiveOperation,
): Promise<void> {
  if (context.generation.current !== generation) return;
  if (step.outcome === "signed_in") {
    await finishSignedIn(context, step, generation);
    return;
  }
  const active =
    existing && context.operation.current === existing
      ? existing
      : { step, bindingSecret };
  active.step = step;
  if (bindingSecret !== undefined) active.bindingSecret = bindingSecret;
  context.operation.current = active;
  if (step.outcome === "confirm") {
    context.setView({
      kind: "confirm",
      targetProvider: step.targetProvider,
      profile: step.profile,
    });
    return;
  }
  if (step.outcome === "link_ready") {
    await finalizeLink(context, active, generation);
    return;
  }
  if (step.purpose === "link" && step.stage === "target") {
    context.setTargetAuthorizationBusy(false);
    context.setView({
      kind: "link_authorize",
      targetProvider: step.targetProvider,
      provider: step.provider,
      existingProofComplete: true,
    });
  }
  if (context.native && autoAuthorize) {
    const owner = claimAuthorization(context, active, generation);
    if (!owner) return;
    await authorizeNative(context, active, owner, generation);
  } else if (!context.native && autoAuthorize && step.authorizationUrl) {
    navigateWeb(step.authorizationUrl);
  }
}

async function authorizeNative(
  context: FlowContext,
  active: ActiveOperation,
  owner: symbol,
  generation = context.generation.current,
): Promise<void> {
  const step = active.step;
  if (
    step.outcome !== "authorize" ||
    !ownsOperation(context, active, generation, owner)
  ) {
    return;
  }
  const bindingSecret = active.bindingSecret;
  try {
    if (!bindingSecret) throw new AuthRequestError("invalid_request");
    let proof: {
      state: string;
      idToken: string;
      authorizationCode?: string;
      name?: string;
    };
    if (step.provider === "apple") {
      const { AppleAuth } = await import("../native/appleAuth");
      if (!ownsOperation(context, active, generation, owner)) return;
      proof = await AppleAuth.authorize({
        nonce: step.nonce,
        state: step.state,
      });
    } else {
      const { initNativeAuth, nativeGoogleProofAfterInit } =
        await import("../native/signin");
      if (!ownsOperation(context, active, generation, owner)) return;
      await initNativeAuth();
      if (!ownsOperation(context, active, generation, owner)) return;
      proof = {
        ...(await nativeGoogleProofAfterInit(step.nonce)),
        state: step.state,
      };
    }
    if (!ownsOperation(context, active, generation, owner)) return;
    const next = await postJson<AuthStep>(
      `/api/auth/native/attempts/${encodeURIComponent(step.attemptId)}/proof`,
      { bindingSecret, ...proof },
    );
    if (!ownsOperation(context, active, generation, owner)) return;
    if (next.outcome === "link_ready") {
      active.step = next;
      await finalizeLink(context, active, generation, owner);
      return;
    }
    if (!releaseAuthorization(context, active, generation, owner)) return;
    context.setTargetAuthorizationBusy(false);
    await acceptStep(context, next, bindingSecret, false, generation, active);
  } catch (error) {
    if (!ownsOperation(context, active, generation, owner)) return;
    const cancelled = isProviderCancellation(error);
    const cleaned = await cancelActive(context, active);
    if (context.generation.current !== generation) return;
    context.setTargetAuthorizationBusy(false);
    if (cancelled) {
      if (!cleaned) {
        active.authorizationOwner = undefined;
        setFailure(
          context,
          generation,
          step.purpose,
          new AuthRequestError("signin_failed"),
          step.targetProvider,
          true,
        );
        return;
      }
      context.setView({
        kind: "cancelled",
        purpose: step.purpose,
        targetProvider: step.targetProvider,
      });
    } else if (!cleaned) {
      active.authorizationOwner = undefined;
      setFailure(
        context,
        generation,
        step.purpose,
        new AuthRequestError("signin_failed"),
        step.targetProvider,
        true,
      );
    } else {
      setFailure(context, generation, step.purpose, error, step.targetProvider);
    }
  }
}

function consumeReturnParams(): {
  attemptId?: string;
  result?: string;
  error?: AuthErrorCode;
  email?: string;
  purpose: AuthPurpose;
  targetProvider?: AuthProvider;
} | null {
  const url = new URL(window.location.href);
  const attemptId = url.searchParams.get("authAttempt") || undefined;
  const result = url.searchParams.get("authResult") || undefined;
  const rawError = url.searchParams.get("authError");
  const rawEmail = url.searchParams.get("authEmail");
  const rawPurpose = url.searchParams.get("authPurpose");
  const rawProvider = url.searchParams.get("authProvider");
  if (!attemptId && !result && !rawError) return null;
  for (const key of [
    "authAttempt",
    "authResult",
    "authError",
    "authEmail",
    "authPurpose",
    "authProvider",
  ]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
  const error =
    rawError && ERROR_CODES.has(rawError as AuthErrorCode)
      ? (rawError as AuthErrorCode)
      : rawError
        ? "signin_failed"
        : undefined;
  return {
    attemptId,
    result,
    error,
    ...(error === "access_denied" && rawEmail?.trim() && rawEmail.length <= 320
      ? { email: rawEmail.trim() }
      : {}),
    purpose: rawPurpose === "link" ? "link" : "signin",
    targetProvider:
      rawProvider === "apple" || rawProvider === "google"
        ? rawProvider
        : undefined,
  };
}

export function useAuthFlow(onSignedIn: () => void): AuthFlowController {
  const native = isNative();
  const generation = useRef(0);
  const operation = useRef<ActiveOperation | null>(null);
  const onSignedInRef = useRef(onSignedIn);
  const [options, setOptions] = useState<AuthOptionsView>({ state: "loading" });
  const [view, setView] = useState<AuthFlowView>({ kind: "idle" });
  const [targetAuthorizationBusy, setTargetAuthorizationBusy] = useState(false);
  const context = useMemo<FlowContext>(
    () => ({
      native,
      generation,
      operation,
      onSignedIn: onSignedInRef,
      setTargetAuthorizationBusy,
      setView,
    }),
    [native],
  );

  useEffect(() => {
    onSignedInRef.current = onSignedIn;
  }, [onSignedIn]);

  useEffect(() => {
    let live = true;
    void api("/api/auth/options")
      .then(async (response) => {
        if (!response.ok) throw new Error("missing options");
        const body: unknown = await response.json();
        if (!isAuthOptions(body)) throw new Error("invalid options");
        if (!live) return;
        const surface = native ? "native" : "web";
        setOptions({
          state: "ready",
          frontDoorEnabled: body.frontDoorEnabled,
          legacyGoogle: !body.frontDoorEnabled,
          apple: body.apple[surface],
          google: body.google[surface],
        });
      })
      .catch(() => {
        if (live) setOptions(LEGACY_OPTIONS);
      });
    return () => {
      live = false;
    };
  }, [native]);

  useEffect(() => {
    if (native) return;
    const returnGeneration = generation.current;
    const returned = consumeReturnParams();
    if (!returned) return;
    void Promise.resolve().then(async () => {
      if (generation.current !== returnGeneration) return;
      if (returned.result === "signed_in") {
        onSignedInRef.current();
        return;
      }
      if (returned.result === "cancelled") {
        if (generation.current !== returnGeneration) return;
        setView({
          kind: "cancelled",
          purpose: returned.purpose,
          ...(returned.targetProvider
            ? { targetProvider: returned.targetProvider }
            : {}),
        });
        return;
      }
      if (returned.error) {
        if (generation.current !== returnGeneration) return;
        setView({
          kind: "error",
          purpose: returned.purpose,
          code: returned.error,
          ...(returned.email ? { email: returned.email } : {}),
          ...(returned.targetProvider
            ? { targetProvider: returned.targetProvider }
            : {}),
        });
        return;
      }
      if (!returned.attemptId) return;
      setView({ kind: "busy", purpose: returned.purpose });
      try {
        const step = await jsonRequest<AuthStep>(
          `/api/auth/web/attempts/${encodeURIComponent(returned.attemptId)}`,
        );
        if (generation.current !== returnGeneration) return;
        try {
          await acceptStep(context, step, undefined, false, returnGeneration);
        } catch (error) {
          setFailure(
            context,
            returnGeneration,
            step.outcome === "signed_in" ? returned.purpose : step.purpose,
            error,
            step.outcome === "signed_in"
              ? returned.targetProvider
              : step.targetProvider,
          );
        }
      } catch (error) {
        setFailure(
          context,
          returnGeneration,
          returned.purpose,
          error,
          returned.targetProvider,
        );
      }
    });
  }, [context, native]);

  async function start(provider: AuthProvider, purpose: AuthPurpose) {
    const startGeneration = ++generation.current;
    setTargetAuthorizationBusy(false);
    setView({ kind: "busy", purpose });
    const previous = operation.current;
    if (previous) {
      const cleaned = await cancelActive(context, previous);
      if (generation.current !== startGeneration) return;
      if (!cleaned) {
        setFailure(
          context,
          startGeneration,
          previous.step.purpose,
          new AuthRequestError("signin_failed"),
          previous.step.targetProvider,
          true,
        );
        return;
      }
    }
    try {
      if (native) {
        const result = await postJson<NativeBegin>(
          "/api/auth/native/attempts",
          {
            purpose,
            provider,
          },
        );
        await acceptStep(
          context,
          result,
          result.bindingSecret,
          true,
          startGeneration,
        );
      } else {
        const result = await postJson<AuthStep>("/api/auth/web/attempts", {
          purpose,
          provider,
        });
        await acceptStep(context, result, undefined, true, startGeneration);
      }
    } catch (error) {
      setFailure(context, startGeneration, purpose, error, provider);
    }
  }

  return {
    options,
    view,
    targetAuthorizationBusy,
    destination: destinationFor(view),
    startSignIn: (provider) => start(provider, "signin"),
    async confirmAccount() {
      const active = operation.current;
      if (!active || active.step.outcome !== "confirm") return;
      const confirmGeneration = generation.current;
      setView({ kind: "busy", purpose: "signin" });
      try {
        const surface = native ? "native" : "web";
        const body = native ? { bindingSecret: active.bindingSecret } : {};
        const signedIn = await postJson<SignedIn>(
          `/api/auth/${surface}/attempts/${encodeURIComponent(active.step.attemptId)}/confirm`,
          body,
        );
        await finishSignedIn(context, signedIn, confirmGeneration);
      } catch (error) {
        setFailure(
          context,
          confirmGeneration,
          "signin",
          error,
          active.step.targetProvider,
        );
      }
    },
    async useUsualSignIn() {
      const active = operation.current;
      if (!active || active.step.outcome !== "confirm") return;
      const usualGeneration = generation.current;
      const provider =
        active.step.targetProvider === "apple" ? "google" : "apple";
      setView({ kind: "busy", purpose: "signin" });
      const cleaned = await cancelActive(context, active);
      if (generation.current !== usualGeneration) return;
      if (!cleaned) {
        setFailure(
          context,
          usualGeneration,
          "signin",
          new AuthRequestError("signin_failed"),
          active.step.targetProvider,
          true,
        );
        return;
      }
      setView({ kind: "usual", provider });
    },
    async prepareLink(provider) {
      if (
        options.state !== "ready" ||
        !options.frontDoorEnabled ||
        !options.apple ||
        !options.google
      ) {
        return;
      }
      const prepareGeneration = ++generation.current;
      setTargetAuthorizationBusy(false);
      const previous = operation.current;
      if (previous) {
        const cleaned = await cancelActive(context, previous);
        if (generation.current !== prepareGeneration) return;
        if (!cleaned) {
          setFailure(
            context,
            prepareGeneration,
            previous.step.purpose,
            new AuthRequestError("signin_failed"),
            previous.step.targetProvider,
            true,
          );
          return;
        }
      }
      setView({ kind: "link_confirm", targetProvider: provider });
    },
    async startPreparedLink() {
      if (
        view.kind !== "link_confirm" ||
        options.state !== "ready" ||
        !options.frontDoorEnabled ||
        !options.apple ||
        !options.google
      ) {
        return;
      }
      await start(view.targetProvider, "link");
    },
    async authorizeLinkTarget() {
      const active = operation.current;
      if (!active || active.step.outcome !== "authorize") return;
      const authorizationGeneration = generation.current;
      const owner = claimAuthorization(
        context,
        active,
        authorizationGeneration,
      );
      if (!owner) return;
      if (native) {
        setTargetAuthorizationBusy(true);
        await authorizeNative(context, active, owner, authorizationGeneration);
      } else if (active.step.authorizationUrl) {
        navigateWeb(active.step.authorizationUrl);
      } else {
        releaseAuthorization(context, active, authorizationGeneration, owner);
      }
    },
    async cancel() {
      const purpose =
        operation.current?.step.purpose ??
        (view.kind === "link_confirm" || view.kind === "link_authorize"
          ? "link"
          : "signin");
      const targetProvider = operation.current?.step.targetProvider;
      const cancelGeneration = ++generation.current;
      const active = operation.current;
      const cleaned = await cancelActive(context, active);
      if (generation.current !== cancelGeneration) return;
      if (!cleaned) {
        if (active) active.authorizationOwner = undefined;
        setFailure(
          context,
          cancelGeneration,
          purpose,
          new AuthRequestError("signin_failed"),
          targetProvider,
          true,
        );
        return;
      }
      setTargetAuthorizationBusy(false);
      setView({
        kind: "cancelled",
        purpose,
        ...(targetProvider ? { targetProvider } : {}),
      });
    },
    reset() {
      generation.current += 1;
      operation.current = null;
      setTargetAuthorizationBusy(false);
      setView({ kind: "idle" });
    },
    abandon() {
      generation.current += 1;
      operation.current = null;
      setTargetAuthorizationBusy(false);
      setView({ kind: "idle" });
    },
  };
}
