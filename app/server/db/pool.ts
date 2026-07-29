import pg from "pg";

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 3000 });
  pool.on("error", (err) => {
    console.error("pg pool idle client error:", err.message);
  });
  return pool;
}

export async function checkDb(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
