import { eq, type InferInsertModel } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { users } from "../db/schema.js";

type Insert = InferInsertModel<typeof users>;

/** What it takes to create a user. Derived from the table so the store's
 *  input can never be NARROWER than the column (Wave A PR 1 widened
 *  `google_sub` to nullable and the old hand-written `{googleSub: string}`
 *  would have stayed narrow with no compile error — RF33's shape). The sub
 *  key is REQUIRED with `null` meaning "no Google identity": a plain `Pick`
 *  would make a nullable column optional, and an omitted key is exactly the
 *  silent producer the policy PR must not be able to write. */
export type NewUser = Pick<Insert, "email" | "name"> &
  Required<Pick<Insert, "googleSub">>;

export function createUserStore(db: Db) {
  return {
    async findByGoogleSub(googleSub: string) {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.googleSub, googleSub));
      return rows[0] ?? null;
    },
    async createUser(input: NewUser) {
      const [row] = await db.insert(users).values(input).returning();
      return row;
    },
    async updateProfile(id: string, email: string, name: string) {
      await db.update(users).set({ email, name }).where(eq(users.id, id));
    },
  };
}

export type UserStore = ReturnType<typeof createUserStore>;
