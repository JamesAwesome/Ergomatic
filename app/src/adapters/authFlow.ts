import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AuthUser,
  AuthError,
  AuthErrorCode,
  AuthOptions,
  AuthProvider,
  AuthPurpose,
  AuthStep,
  DeleteOutcome,
  NativeBegin,
  NativeProof,
  SignedIn,
  UnlinkOutcome,
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
    }
  | { kind: "linked"; targetProvider: AuthProvider }
  // WAVE A PR2: THE POST-PROOF CONFIRMATION. The rower signed in with a
  // provider Ergomatic did not recognise, said "I already have an account",
  // and has now proved that account with their usual provider — so they are
  // ALREADY SIGNED IN when this renders. That is why it is not a `confirm`:
  // `confirm` asks whether to create an account, this asks whether to attach
  // one identity to another, and refusing it is not a cancel.
  //
  // `carried` is the identity about to be ATTACHED (the one proved first and
  // held ever since). `account` is the one it attaches TO, which is what
  // makes this a control rather than a notice — "attach this to WHICH
  // account?" is the question a rower cannot answer without it.
  | {
      kind: "attach_confirm";
      targetProvider: AuthProvider;
      carried: { email: string; name: string };
      account: AuthUser;
    }
  // Wave A PR 1 Task 3: the rower has re-proved their provider and the
  // account may now be deleted. Task 4 gave it a screen (`you/DeleteAccount`)
  // and `destinationFor` a route.
  | { kind: "delete_ready" }
  // THE SERVER ANSWERED. All four unlink outcomes are HTTP 200, so these two
  // are discriminated on the BODY and never on the status.
  //
  // `unlinked` carries NO `appleRevoked`, deliberately: the server returns it
  // vacuously `true` for a Google unlink, where no Apple call happens at all,
  // so surfacing it would claim something about Apple that never occurred.
  // Nothing here ever reports an unlink's Apple outcome; `deleted` below is
  // the one place that flag reaches a rower.
  | { kind: "unlinked"; provider: AuthProvider }
  | {
      kind: "unlink_refused";
      provider: AuthProvider;
      reason: "last_provider" | "not_connected" | "account_gone";
    }
  // WE DO NOT KNOW. A transport failure or a non-200: distinct from a
  // refusal, because a refusal is a fact about the account and this is a fact
  // about the request. Its own member rather than a fourth `reason` so the
  // notice that renders it cannot borrow a refusal's copy, and its own member
  // rather than an `error` view because a failed REMOVAL must not render copy
  // written for a failed LINK proof.
  | { kind: "unlink_failed"; provider: AuthProvider; code: AuthErrorCode }
  // The account is gone. `appleRevoked: false` means we held at least one
  // Apple grant and at least one revoke failed, which is the only case with
  // anything left for the rower to do.
  | { kind: "deleted"; appleRevoked: boolean }
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
  /** WAVE A PR2, the post-proof confirmation's two exits. */
  confirmAttach(): Promise<void>;
  declineAttach(): Promise<void>;
  prepareLink(provider: AuthProvider): Promise<void>;
  startPreparedLink(): Promise<void>;
  authorizeLinkTarget(): Promise<void>;
  removeMethod(provider: AuthProvider): Promise<void>;
  startDelete(provider: AuthProvider): Promise<void>;
  confirmDelete(): Promise<void>;
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

/** Exported for its own unit gate: this is pure view->route mapping over
 * every view kind, and it previously had no client coverage at all —
 * `return null` as its first line left the whole client suite green,
 * with two e2e cases reaching about three of its branches. Gating
 * pure logic exclusively through a browser inverts the pyramid. */
export function destinationFor(
  view: AuthFlowView,
): "/" | "/you" | "/you/sign-in-methods" | null {
  // `delete_ready` joins the two link steps: all three are full-screen auth
  // stages, and this route is the one holder for them (AppRoutes.tsx).
  if (
    view.kind === "link_confirm" ||
    view.kind === "link_authorize" ||
    view.kind === "delete_ready"
  ) {
    return "/you/sign-in-methods";
  }
  // A terminal outcome goes back to the surface that started it, and for a
  // link OR a delete that surface is You — the only screen that renders
  // either notice. Finding I1 is the cost of getting this wrong: a delete
  // routed to "/" lands a signed-in rower somewhere that says nothing at all.
  if (
    view.kind === "linked" ||
    ((view.kind === "cancelled" || view.kind === "error") &&
      (view.purpose === "link" || view.purpose === "delete"))
  ) {
    return "/you";
  }
  // `unlinked`, `unlink_refused`, `unlink_failed` and `deleted` route
  // NOWHERE. The first three are answered in place on the methods list the
  // rower is already looking at; `deleted` hands over to the signed-out
  // transition, which replaces the whole tree (App.tsx).
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

/** THE VIEWS `you/DeleteAccount` OWNS, in one place because two callers
 *  need them and a disagreement between them is invisible: `AppRoutes`
 *  decides whether the route renders the screen at all, and the screen
 *  decides whether it draws. Drop `busy` from either and the confirm
 *  screen vanishes mid-request — from the router it becomes a redirect to
 *  `/you`, from the component a blank route. */
export function ownsDeleteScreen(view: AuthFlowView): boolean {
  return (
    view.kind === "delete_ready" ||
    view.kind === "deleted" ||
    (view.kind === "busy" && view.purpose === "delete")
  );
}

async function responseError(
  response: Response,
): Promise<{ code: AuthErrorCode; email?: string; status: number }> {
  const status = response.status;
  try {
    const body = (await response.json()) as Partial<AuthError>;
    const code =
      body.error && ERROR_CODES.has(body.error) ? body.error : "signin_failed";
    return {
      code,
      status,
      ...(code === "access_denied" &&
      typeof body.email === "string" &&
      body.email.trim() &&
      body.email.length <= 320
        ? { email: body.email.trim() }
        : {}),
    };
  } catch {
    return { code: "signin_failed", status };
  }
}

class AuthRequestError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly email?: string,
    readonly status?: number,
  ) {
    super(code);
  }
}

/** True when the server ANSWERED and refused this binding, which proves the
 * binding can no longer complete the attempt either. `status` is absent for a
 * transport failure, and 429 is the one 4xx the server did not act on: both
 * leave the attempt and its binding intact, so both are worth a retry. */
function bindingRefused(error: unknown): boolean {
  return (
    error instanceof AuthRequestError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 429
  );
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await api(path, init);
  if (!response.ok) {
    const error = await responseError(response);
    throw new AuthRequestError(error.code, error.email, error.status);
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
    throw new AuthRequestError(error.code, error.email, error.status);
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
    } catch (error) {
      // A refused binding is spent: it cannot complete the attempt either, and
      // the server row expires on its own within the same 300s. Retaining it
      // would leave cancel, both providers and usual-sign-in all failing until
      // the page reloads. Only an unanswered or server-side failure retries.
      if (!bindingRefused(error)) return false;
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

/** WAVE A PR2. `link_ready` HAS TWO PRODUCERS NOW and they want opposite
 *  things, so every call site has to choose.
 *
 *  A LINK reached `link_ready` from You, where the rower was already looking
 *  at their own methods list and already consented on the way in — finalizing
 *  immediately is right and is what shipped.
 *
 *  A SIGNIN reached it from the sign-in screen, and James ruled on 2026-09-14
 *  that the confirmation comes AFTER the proof. Finalizing immediately would
 *  attach the identity with no confirmation shown, defeating that ruling in
 *  the client while every server test stayed green. It nearly did: revision 4
 *  of the plan qualified ONE of the two call sites, and the one it missed
 *  (`authorizeNative`) is the only route the phone takes.
 *
 *  AND THE SIGNIN ARM MUST CONSUME THE SESSION. The server delivers it beside
 *  the live attempt; nothing here used to store it, so `finalize`'s
 *  `requireUser` would have answered 401 on native and the web rower would
 *  have landed back on a sign-in screen holding a live 60-day cookie. No type
 *  catches this — widening `AuthStep` produces zero client errors. */
async function linkReady(
  context: FlowContext,
  active: ActiveOperation,
  generation: number,
  owner?: symbol,
): Promise<void> {
  if (active.step.outcome !== "link_ready") return;
  if (active.step.purpose === "link") {
    await finalizeLink(context, active, generation, owner);
    return;
  }
  const step = active.step;
  if (context.native) {
    if (!step.session?.token) throw new AuthRequestError("signin_failed");
    const { storeToken } = await import("../native/session");
    await storeToken(step.session.token);
    if (context.generation.current !== generation) return;
  }
  if (!ownsOperation(context, active, generation, owner)) return;
  if (!step.session) throw new AuthRequestError("signin_failed");
  context.setTargetAuthorizationBusy(false);
  context.setView({
    kind: "attach_confirm",
    targetProvider: step.targetProvider,
    carried: step.profile,
    account: step.session.user,
  });
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
    await linkReady(context, active, generation);
    return;
  }
  // BEFORE the `step.stage` read below: a delete_ready member carries no
  // `.stage`, so without this early return that line is a TS2339 and the
  // client build fails even though the server project type-checks.
  if (step.outcome === "delete_ready") {
    context.setView({ kind: "delete_ready" });
    return;
  }
  if (step.purpose === "link" && step.stage === "target") {
    context.setTargetAuthorizationBusy(false);
    context.setView({
      kind: "link_authorize",
      targetProvider: step.targetProvider,
      provider: step.provider,
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
    // The SHARED contract, not a re-declaration. `NativeProof` had exactly one
    // reference in the repo — its own declaration — so the native proof shape
    // was written twice independently (here, and parsed field-by-field on the
    // server) and compiler-checked against neither. It could not drift loudly,
    // only silently. Typing the body against it makes a rename a build error.
    let proof: Omit<NativeProof, "bindingSecret">;
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
    const body: NativeProof = { bindingSecret, ...proof };
    const next = await postJson<AuthStep>(
      `/api/auth/native/attempts/${encodeURIComponent(step.attemptId)}/proof`,
      body,
    );
    if (!ownsOperation(context, active, generation, owner)) return;
    if (next.outcome === "link_ready") {
      active.step = next;
      // NATIVE NEVER REACHES `acceptStep` FOR THIS OUTCOME — this returns
      // first — so qualifying only the branch there would have left the
      // phone attaching with no confirmation. Both sites route through
      // `linkReady`.
      await linkReady(context, active, generation, owner);
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
      const retainedError =
        error instanceof AuthRequestError && error.code === "access_denied"
          ? error
          : new AuthRequestError("signin_failed");
      setFailure(
        context,
        generation,
        step.purpose,
        retainedError,
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
    // EVERY purpose the server can put in this redirect, not just the one we
    // happened to need first (finding I1). Coercing "delete" to "signin" here
    // sent a failed delete re-auth to a screen a signed-in rower never sees,
    // so the rower was bounced to Today with no message at all.
    purpose:
      rawPurpose === "link" || rawPurpose === "delete" ? rawPurpose : "signin",
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

  // A BFCACHE RESTORE IS NOT A RELOAD, and `busy` outlives it.
  //
  // On web, `start()` sets `busy` and then hands the browser to the provider.
  // `busy` disables BOTH provider buttons (`SignIn.tsx`). Coming back with the
  // browser's own Back or edge-swipe restores the SAME document from the
  // back/forward cache with React state intact: no remount, no reload, so
  // nothing here ever ran again and both buttons stayed dead until a manual
  // refresh. Reported from staging, and the "until a refresh" detail is what
  // identifies it — a fresh load is already idle.
  //
  // NOT the provider's own Cancel button: `frontDoorRoutes.ts` has a live
  // `user_cancelled_authorize` branch that discards the attempt and 303s to
  // `/?authResult=cancelled`, which produces a FRESH document with the
  // buttons live. An earlier draft of this comment claimed Back was also how
  // a rower leaves Apple's sheet; that would make the server branch dead code,
  // and it is not.
  //
  // PRIOR ART, which this deliberately diverges from: `you/Concept2Card.tsx`
  // and `api/useConcept2Link.ts` already handle this defect class (their
  // "invariant I5") and do NOT gate on `persisted`. They can afford not to,
  // because at ordinary load there is no outcome or busy flag to wipe. This
  // flow cannot: the return-URL effect above sets `busy` while it fetches
  // `/?authAttempt=<id>`, and `pageshow` fires on every ordinary load too,
  // after mount and after effects — so an ungated clear would strand every
  // OAuth return on an idle Welcome screen. The `persisted` check is the whole
  // difference, and `authFlow.test.tsx` pins both halves.
  //
  // `persisted: true` on `pageshow` is the only signal a restore gives us.
  //
  // It clears ONLY a `busy` view, and deliberately does NOT check
  // `operation.current` — an earlier draft did, and that guard defeated the
  // whole fix: on web `start()` stores the operation BEFORE handing the
  // browser away, so the in-flight attempt is exactly the state this runs in.
  // A live attempt is not a reason to keep the screen dead. It stays live
  // server-side, its cookie is untouched, and the next tap replaces it
  // through `start()`'s own cancel-then-mint path.
  //
  // Narrow to `busy` on purpose: a restore landing on a real resumable view
  // (a confirm screen, a link step) must keep it, and the return-URL effect
  // above owns those. This is strictly the stuck-spinner case.
  useEffect(() => {
    if (native) return;
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setView((current) =>
        current.kind === "busy" ? { kind: "idle" } : current,
      );
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [native]);

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
    /** WAVE A PR2. This USED to cancel the attempt outright, which destroyed
     *  a subject the rower had just proved and sent them back to the sign-in
     *  screen — so the same "Create your account" screen returned on every
     *  future sign-in with that provider until they went to You and added it
     *  by hand. It now carries the attempt forward instead: one trip, not
     *  two. */
    async useUsualSignIn() {
      const active = operation.current;
      if (!active || active.step.outcome !== "confirm") return;
      const usualGeneration = generation.current;
      setView({ kind: "busy", purpose: "signin" });
      try {
        const surface = context.native ? "native" : "web";
        const step = await postJson<AuthStep>(
          `/api/auth/${surface}/attempts/${encodeURIComponent(active.step.attemptId)}/follow-through`,
          context.native ? { bindingSecret: active.bindingSecret } : {},
        );
        if (generation.current !== usualGeneration) return;
        // `autoAuthorize` so the rower goes straight to their provider —
        // they already chose it by tapping "I already have an account".
        await acceptStep(
          context,
          step,
          active.bindingSecret,
          true,
          usualGeneration,
          active,
        );
      } catch (error) {
        setFailure(
          context,
          usualGeneration,
          "signin",
          error,
          active.step.targetProvider,
          true,
        );
      }
    },
    /** Attach the carried identity, then go to Today SIGNED IN. */
    async confirmAttach() {
      const active = operation.current;
      if (!active || view.kind !== "attach_confirm") return;
      const attachGeneration = generation.current;
      setView({ kind: "busy", purpose: "signin" });
      try {
        const surface = context.native ? "native" : "web";
        const result = await postJson<{ outcome: "linked" }>(
          `/api/auth/${surface}/attempts/${encodeURIComponent(active.step.attemptId)}/finalize`,
          context.native ? { bindingSecret: active.bindingSecret } : {},
        );
        if (generation.current !== attachGeneration) return;
        if (result.outcome !== "linked")
          throw new AuthRequestError("signin_failed");
        operation.current = null;
        setTargetAuthorizationBusy(false);
        // NO NOTICE, AND TODAY RATHER THAN THE ACCOUNT SCREEN (Gate 0 ruling,
        // James, 2026-09-15). The rower set out to sign in and now is; the
        // screen they just approved named both identities, and the proof it
        // worked is being in the app. Landing them on a settings subpage
        // would put one navigation between them and rowing.
        setView({ kind: "idle" });
        onSignedInRef.current();
      } catch (error) {
        setFailure(
          context,
          attachGeneration,
          "signin",
          error,
          active.step.targetProvider,
          true,
        );
      }
    },
    /** "Not now". NOT a cancel — the rower is already signed in, and that
     *  session was earned by their own credential at their own provider.
     *  The attempt is discarded and they go to Today; the same screen will
     *  offer again on their next sign-in with the unattached provider. */
    async declineAttach() {
      const active = operation.current;
      if (!active || view.kind !== "attach_confirm") return;
      const declineGeneration = generation.current;
      setView({ kind: "busy", purpose: "signin" });
      await cancelActive(context, active);
      if (generation.current !== declineGeneration) return;
      operation.current = null;
      setTargetAuthorizationBusy(false);
      setView({ kind: "idle" });
      onSignedInRef.current();
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
    async removeMethod(provider) {
      const removeGeneration = generation.current;
      // `purpose: "link"` is the SURFACE's purpose, not the wire's: no
      // attempt is minted here, so no `AuthPurpose` is literally true, and
      // "link" is the one that keeps the busy view on the methods screen.
      setView({ kind: "busy", purpose: "link" });
      let body: UnlinkOutcome;
      try {
        const response = await api(
          `/api/auth/methods/${encodeURIComponent(provider)}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          const { code } = await responseError(response);
          if (generation.current !== removeGeneration) return;
          setView({ kind: "unlink_failed", provider, code });
          return;
        }
        body = (await response.json()) as UnlinkOutcome;
      } catch {
        // `api` rejects on a dropped connection, and an unhandled rejection
        // here would leave the screen spinning on `busy` forever.
        if (generation.current !== removeGeneration) return;
        setView({ kind: "unlink_failed", provider, code: "signin_failed" });
        return;
      }
      if (generation.current !== removeGeneration) return;
      setView(
        body.outcome === "unlinked"
          ? // NOT `...body`: `appleRevoked` stops here. See the `unlinked`
            // member's own comment.
            { kind: "unlinked", provider }
          : { kind: "unlink_refused", provider, reason: body.outcome },
      );
    },
    async startDelete(provider) {
      // A delete re-proves the SAME provider the rower already holds, so
      // unlike `prepareLink` only that one provider's surface must be
      // available (frontDoorRoutes.ts: "A link needs BOTH providers; a
      // delete re-proves only the one the rower already holds").
      if (
        options.state !== "ready" ||
        !options.frontDoorEnabled ||
        !options[provider]
      ) {
        return;
      }
      await start(provider, "delete");
    },
    async confirmDelete() {
      const active = operation.current;
      if (!active || active.step.outcome !== "delete_ready") return;
      const deleteGeneration = generation.current;
      const surface = native ? "native" : "web";
      // A SECOND TAP IS NOT A SECOND DELETION, and unlike a removal this one
      // cannot be taken back. Nothing here bumps `generation` (only
      // `start`, `prepareLink` and `cancel` do), so two calls would share a
      // generation and both would reach `setView`: the first commits the
      // deletion, the second finds no session and answers `account_changed`,
      // and the rower ends on a Welcome screen that says NOTHING — not even
      // the Apple remedy `appleRevoked: false` exists to deliver. `busy`
      // closes it at the source rather than at the button: it is what
      // `DeleteAccount` disables both controls on, and `ownsDeleteScreen`
      // above is what keeps the screen mounted while it is set. It also
      // takes Cancel out of reach for the length of the request, which is
      // the other reachable loss — `cancel()` bumps the generation, so a
      // cancel mid-flight made this method swallow its own success and tell
      // a rower whose account was gone that nothing had happened.
      setView({ kind: "busy", purpose: "delete" });
      // THE TOKEN MUST STILL BE LIVE FOR THIS CALL — the route is behind
      // requireUser. `nativeSignOut` clears first on purpose, because there
      // the network call is best-effort cleanup; here it is the operation
      // itself, and clearing first would 401 the deletion.
      let response: Response;
      try {
        response = await api(
          `/api/auth/${surface}/attempts/${encodeURIComponent(active.step.attemptId)}/delete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              native ? { bindingSecret: active.bindingSecret } : {},
            ),
          },
        );
      } catch {
        if (generation.current !== deleteGeneration) return;
        setView({ kind: "error", purpose: "delete", code: "signin_failed" });
        return;
      }
      if (!response.ok) {
        // The SERVER's code, never a hardcoded one: `account_changed` and
        // `rate_limited` are not the same event as a bad proof, and the
        // record has to be able to tell them apart later.
        const { code } = await responseError(response);
        if (generation.current !== deleteGeneration) return;
        operation.current = null;
        setView({ kind: "error", purpose: "delete", code });
        return;
      }
      // THE ACCOUNT IS ALREADY GONE — the server answered 200 and the
      // deletion commits before the response is written. A body we cannot
      // read costs us only `appleRevoked`, and it is not a reason to tell
      // the rower nothing happened. `false` is the honest default of the
      // two: it shows the Apple remedy, which is wrong-but-harmless for a
      // Google-only account (a list the rower looks at and finds nothing
      // in) where `true` would silently leave a real grant standing.
      let body: DeleteOutcome;
      try {
        body = (await response.json()) as DeleteOutcome;
      } catch {
        body = { outcome: "deleted", appleRevoked: false };
      }
      if (generation.current !== deleteGeneration) return;
      // Only AFTER the server confirms. The account is gone; this device's
      // copy of the credential goes with it.
      if (native) {
        const { clearToken } = await import("../native/session");
        await clearToken();
        if (generation.current !== deleteGeneration) return;
      }
      operation.current = null;
      setTargetAuthorizationBusy(false);
      setView({ kind: "deleted", appleRevoked: body.appleRevoked });
      // The session this document holds no longer resolves to anything. A
      // re-read of /api/me is how the app learns that: it 401s, `useMe`
      // becomes signed out, and the Welcome screen renders the notice.
      onSignedInRef.current();
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
