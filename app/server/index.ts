import path from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createApp } from './app.js'
import { createDb } from './db/index.js'
import { checkDb } from './db/pool.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const { pool, db } = createDb(connectionString)
// cwd-relative: app/ in dev, /app in the container
await migrate(db, { migrationsFolder: 'drizzle' })
console.log('migrations up to date')

const port = Number(process.env.PORT ?? 8080)
createApp({
  checkDb: () => checkDb(pool),
  clientDir: path.resolve(process.cwd(), 'dist/client'),
}).listen(port, () => {
  console.log(`ergomatic api listening on :${port}`)
})
