import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { noStore, originCheck } from './auth/middleware.js'
import { createAuthRouter } from './auth/routes.js'
import type { OAuthProvider } from './auth/google.js'
import type { SessionStore } from './auth/sessions.js'
import type { UserStore } from './auth/users.js'

export interface AppDeps {
  checkDb: () => Promise<boolean>
  sessions: SessionStore
  users: UserStore
  oauth: OAuthProvider | null
  allowlist: Set<string>
  siteUrl: string
  clientDir?: string
}

export function createApp(deps: AppDeps) {
  const app = express()
  app.use(express.json())
  app.use('/api', noStore)
  app.use(originCheck(deps.siteUrl))

  app.get('/api/health', async (_req, res) => {
    let db: boolean
    try {
      db = await deps.checkDb()
    } catch {
      db = false
    }
    const version = process.env.APP_VERSION ?? 'dev'
    if (db) {
      res.json({ ok: true, db: true, version })
    } else {
      res.status(503).json({ ok: false, db: false, version })
    }
  })

  app.use(createAuthRouter(deps))

  if (deps.clientDir) {
    const index = path.join(deps.clientDir, 'index.html')
    app.use(express.static(deps.clientDir))
    // SPA fallback for any non-API GET (excludes bare /api too)
    app.get(/^\/(?!api(\/|$)).*/, (_req, res, next) => {
      if (fs.existsSync(index)) {
        res.sendFile(index)
      } else {
        next()
      }
    })
  }

  return app
}
