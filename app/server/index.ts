import { createApp } from './app.js'
import { checkDb, createPool } from './db.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const pool = createPool(connectionString)
const port = Number(process.env.PORT ?? 8080)
createApp({ checkDb: () => checkDb(pool) }).listen(port, () => {
  console.log(`ergomatic api listening on :${port}`)
})
