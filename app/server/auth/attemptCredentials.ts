import type { AppleGrant } from "./appleRevoke.js";

/**
 *  THE ONE PLACE THAT DECIDES WHETHER AN ATTEMPT'S APPLE TOKEN IS REVOCABLE.
 *
 *  Both producers of destroyed attempt rows import this: `attempts.ts`, which
 *  deletes them by statement, and `sessions.ts`, where they vanish by
 *  `ON DELETE cascade` from `sessions`. Two tables, two collectors, one rule —
 *  duplicating the predicate is how the two drift apart.
 *
 *  THE RULE, and why it is keyed on the SUBJECT. A token must NOT be revoked
 *  while it still backs a relationship the rower is keeping, because Apple's
 *  own documentation will not say whether revoking a token revokes the whole
 *  authorization ("Invalidate the tokens and associated user authorizations"
 *  in the abstract, "The user session associated with the token provided" on
 *  the `token` field). We therefore assume the BROAD reading and refuse to
 *  revoke anything that could be load-bearing.
 *
 *  The identity that answers that question is the Apple subject, NOT
 *  `(user_id, client_id)`. Keying on the pair fails in both directions:
 *  a grant belonging to a DIFFERENT Apple subject would suppress a revoke
 *  that should happen (sign in with a second Apple ID, follow through with
 *  the other provider, `finalize` refuses with `account_conflict`, cancel —
 *  and that second subject's token leaks forever), and rows whose subject
 *  matches no user would be revoked even when a concurrent attempt has just
 *  created that account.
 *
 *  `purpose='delete'` rows are the one class with no `verified_subject` —
 *  `consistent()` does not require it at `delete_ready` — and they are the
 *  one class where the session's own user IS the right identity, because
 *  `accept()`'s reauth branch has already proved the subject it re-proved is
 *  that account's own `apple_sub`.
 *
 *  ORDERING INVARIANT, AND IT IS LOAD-BEARING (measured by the DBA gate,
 *  2026-09-19). Inside `deleteAccount`, `DELETE FROM apple_grants` MUST run
 *  before the attempts delete. The rower being deleted still holds their own
 *  grant until that statement runs, so with the order reversed this predicate
 *  reads the rower's own live grant and marks their own attempt token
 *  NON-revocable — silently. Measured on `postgres:18.4` against the real
 *  schema: `revocable = t` with grants deleted first, `revocable = f`
 *  without. That is exactly the credential `deleteAccount` used to push by
 *  hand, so reversing the two statements reintroduces the leak this module
 *  exists to close, with every test still green unless one of them swaps
 *  them deliberately. The gate for this invariant is a test whose mutation
 *  IS the swap.
 *
 *  A SUBJECT-ONLY ANTI-JOIN WOULD NOT WORK, for the same reason and worse.
 *  `LEFT JOIN users ON u.apple_sub = verified_subject … WHERE u.id IS NULL`,
 *  placed where this runs, returns EMPTY for the deleting rower — their
 *  `apple_sub` is still present. The `NOT EXISTS` over `apple_grants` is the
 *  form that survives, because the grants are gone by then.
 */
const REVOCABLE = `
  apple_client_id IS NOT NULL
  AND apple_refresh_token IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM apple_grants g
    WHERE g.client_id = auth_attempts.apple_client_id
      AND (
        (auth_attempts.verified_subject IS NOT NULL
          AND g.user_id = (
            SELECT u.id FROM users u
            WHERE u.apple_sub = auth_attempts.verified_subject))
        OR
        (auth_attempts.verified_subject IS NULL
          AND g.user_id = (
            SELECT s.user_id FROM sessions s
            WHERE s.id = auth_attempts.original_session_id))
      )
  )`;

/** Minimal surface both `pg.Pool`/`pg.PoolClient` and a drizzle handle can
 *  satisfy, so neither caller has to reach for the other's client type. */
export interface Queryable {
  query<R>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

interface Row {
  clientId: string;
  refreshToken: string;
}

/**
 *  Deletes the attempts matching `where` and returns the credentials among
 *  them that are safe to revoke.
 *
 *  RETURNS THE ROW COUNT, NOT JUST THE CREDENTIALS. `discard()` answers
 *  `rowCount === 1` to its callers, and that boolean gates real behaviour at
 *  three call sites in `frontDoorRoutes.ts` — an empty credential list cannot
 *  distinguish "matched nothing" from "matched, held no credential".
 *
 *  THE CALLER REVOKES, AND ONLY AFTER ITS TRANSACTION COMMITS. This function
 *  never calls Apple: our write can roll back and Apple's cannot, so a revoke
 *  inside the transaction can destroy a credential for a change that never
 *  lands.
 */
export async function dropAttempts(
  q: Queryable,
  where: string,
  params: unknown[],
): Promise<{ rowCount: number; credentials: AppleGrant[] }> {
  const deleted = await q.query<Row & { revocable: boolean }>(
    `DELETE FROM auth_attempts WHERE ${where}
     RETURNING apple_client_id AS "clientId",
               apple_refresh_token AS "refreshToken",
               (${REVOCABLE}) AS revocable`,
    params,
  );
  return {
    rowCount: deleted.rowCount ?? 0,
    credentials: deleted.rows
      .filter((r) => r.revocable)
      .map(({ clientId, refreshToken }) => ({ clientId, refreshToken })),
  };
}
