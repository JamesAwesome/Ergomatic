import express from 'express'

export interface AppDeps {
  checkDb: () => Promise<boolean>
}

export function createApp({ checkDb }: AppDeps) {
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

  return app
}
