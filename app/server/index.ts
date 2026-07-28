import path from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createApp } from './app.js'
import { parseAllowlist } from './auth/allowlist.js'
import { createGoogleProvider, type OAuthProvider } from './auth/google.js'
import { createNativeVerifier } from './auth/nativeVerify.js'
import { createSessionStore } from './auth/sessions.js'
import { createUserStore } from './auth/users.js'
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

const siteUrl = process.env.SITE_URL ?? 'http://localhost:5173'
const clientId = process.env.GOOGLE_CLIENT_ID ?? ''
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? ''

let oauth: OAuthProvider | null = null
if (clientId && clientSecret) {
  oauth = await createGoogleProvider({
    clientId,
    clientSecret,
    redirectUri: new URL('/api/auth/callback', siteUrl).href,
  })
} else {
  console.warn(
    'WARNING: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not fully set — sign-in is DISABLED (auth routes will 503)',
  )
}
const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID ?? ''
const nativeVerifier = iosClientId ? createNativeVerifier(iosClientId) : null
if (!nativeVerifier) {
  console.warn('WARNING: GOOGLE_IOS_CLIENT_ID not set — native (iOS) sign-in is DISABLED')
}

const allowlist = parseAllowlist(process.env.ALLOWED_EMAILS)
if (allowlist.size === 0) {
  console.warn('WARNING: ALLOWED_EMAILS is empty — nobody can create an account')
}

const port = Number(process.env.PORT ?? 8080)
createApp({
  checkDb: () => checkDb(pool),
  sessions: createSessionStore(db),
  users: createUserStore(db),
  oauth,
  nativeVerifier,
  allowlist,
  siteUrl,
  clientDir: path.resolve(process.cwd(), 'dist/client'),
}).listen(port, () => {
  console.log(`ergomatic api listening on :${port}`)
})
