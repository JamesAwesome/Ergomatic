import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from './index.js'
import type pg from 'pg'

describe('migrations', () => {
  let container: StartedPostgreSqlContainer
  let pool: pg.Pool
  let db: Db

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.4').start()
    ;({ pool, db } = createDb(container.getConnectionUri()))
    await migrate(db, { migrationsFolder: 'drizzle' })
  })

  afterAll(async () => {
    await pool.end().catch(() => {})
    await container.stop().catch(() => {})
  })

  it('creates users and sessions tables', async () => {
    const tables = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    )
    const names = tables.rows.map((r) => r.table_name)
    expect(names).toContain('users')
    expect(names).toContain('sessions')
  })

  it('is idempotent (second migrate is a no-op)', async () => {
    await migrate(db, { migrationsFolder: 'drizzle' })
  })
})
