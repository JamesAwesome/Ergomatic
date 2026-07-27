import path from 'node:path'
import { createApp } from './app.js'
import { checkDb, createPool } from './db.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const pool = createPool(connectionString)
const port = Number(process.env.PORT ?? 8080)
const clientDir = path.resolve(process.cwd(), 'dist/client')
createApp({ checkDb: () => checkDb(pool), clientDir }).listen(port, () => {
  console.log(`ergomatic api listening on :${port}`)
})
