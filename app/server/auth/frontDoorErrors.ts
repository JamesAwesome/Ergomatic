import type { AuthErrorCode } from "../../shared/auth.js";
export class AuthFailure extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
  }
}
export const authStatus: Record<AuthErrorCode, number> = {
  invalid_request: 400,
  invalid_proof: 401,
  attempt_expired: 410,
  account_changed: 409,
  account_conflict: 409,
  email_required: 422,
  unavailable: 503,
  rate_limited: 429,
  signin_failed: 500,
};
export function requiredText(value: unknown, max = 16384): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new AuthFailure("invalid_request");
  return value;
}
export function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new AuthFailure("invalid_request");
  return value as Record<string, unknown>;
}
