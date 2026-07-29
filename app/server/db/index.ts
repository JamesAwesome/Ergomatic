import { drizzle } from "drizzle-orm/node-postgres";
import { createPool } from "./pool.js";
import * as schema from "./schema.js";

export function createDb(connectionString: string) {
  const pool = createPool(connectionString);
  const db = drizzle(pool, { schema });
  return { pool, db };
}

export type Db = ReturnType<typeof createDb>["db"];
