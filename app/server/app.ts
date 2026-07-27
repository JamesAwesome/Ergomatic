import express from 'express'
import fs from 'node:fs'
import path from 'node:path'

export interface AppDeps {
  checkDb: () => Promise<boolean>
  clientDir?: string
}

export function createApp({ checkDb, clientDir }: AppDeps) {
  const app = express()
  app.use(express.json())

  app.get('/api/health', async (_req, res) => {
    let db: boolean
    try {
      db = await checkDb()
    } catch {
      db = false
    }
    if (db) {
      res.json({ ok: true, db: true })
    } else {
      res.status(503).json({ ok: false, db: false })
    }
  })

  if (clientDir) {
    const index = path.join(clientDir, 'index.html')
    app.use(express.static(clientDir))
    // SPA fallback for any non-API GET (Express 5: regex route, not '*')
    app.get(/^\/(?!api\/).*/, (_req, res, next) => {
      if (fs.existsSync(index)) {
        res.sendFile(index)
      } else {
        next()
      }
    })
  }

  return app
}
