import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'
import { baseDeps } from './testDeps.js'

describe('GET /api/health', () => {
  it('returns 200 with db:true when the DB check passes', async () => {
    const res = await request(createApp(baseDeps({ checkDb: async () => true }))).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, db: true, version: 'dev' })
  })

  it('reports APP_VERSION when set', async () => {
    process.env.APP_VERSION = 'v9.9.9-test'
    try {
      const res = await request(createApp(baseDeps({ checkDb: async () => true }))).get('/api/health')
      expect(res.body.version).toBe('v9.9.9-test')
    } finally {
      delete process.env.APP_VERSION
    }
  })

  it('returns 503 with db:false when the DB check fails', async () => {
    const res = await request(createApp(baseDeps({ checkDb: async () => false }))).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ ok: false, db: false, version: 'dev' })
  })

  it('returns 503 when the DB check throws', async () => {
    const app = createApp(
      baseDeps({
        checkDb: async () => {
          throw new Error('boom')
        },
      }),
    )
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ ok: false, db: false, version: 'dev' })
  })
})

describe('static client serving', () => {
  const clientDir = mkdtempSync(join(tmpdir(), 'erg-client-'))
  writeFileSync(join(clientDir, 'index.html'), '<!doctype html><h1>Ergomatic test shell</h1>')

  it('serves index.html at /', async () => {
    const res = await request(createApp(baseDeps({ checkDb: async () => true, clientDir }))).get('/')
    expect(res.status).toBe(200)
    expect(res.text).toContain('Ergomatic test shell')
  })

  it('falls back to index.html for client routes', async () => {
    const res = await request(
      createApp(baseDeps({ checkDb: async () => true, clientDir })),
    ).get('/plan/today')
    expect(res.status).toBe(200)
    expect(res.text).toContain('Ergomatic test shell')
  })

  it('does not shadow /api routes', async () => {
    const res = await request(
      createApp(baseDeps({ checkDb: async () => false, clientDir })),
    ).get('/api/health')
    expect(res.status).toBe(503)
  })

  it('404s at / when no clientDir is configured', async () => {
    const res = await request(createApp(baseDeps({ checkDb: async () => true }))).get('/')
    expect(res.status).toBe(404)
  })

  it('404s when clientDir has no index.html', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'erg-client-empty-'))
    const res = await request(
      createApp(baseDeps({ checkDb: async () => true, clientDir: emptyDir })),
    ).get('/')
    expect(res.status).toBe(404)
  })
})
