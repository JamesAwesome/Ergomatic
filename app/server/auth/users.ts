import { eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { users } from '../db/schema.js'

export function createUserStore(db: Db) {
  return {
    async findByGoogleSub(googleSub: string) {
      const rows = await db.select().from(users).where(eq(users.googleSub, googleSub))
      return rows[0] ?? null
    },
    async createUser(input: { googleSub: string; email: string; name: string }) {
      const [row] = await db.insert(users).values(input).returning()
      return row
    },
    async updateProfile(id: string, email: string, name: string) {
      await db.update(users).set({ email, name }).where(eq(users.id, id))
    },
  }
}

export type UserStore = ReturnType<typeof createUserStore>
