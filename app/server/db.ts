import pg from 'pg'

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, connectionTimeoutMillis: 3000 })
}

export async function checkDb(pool: pg.Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}
