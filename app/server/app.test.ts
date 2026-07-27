import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from './app.js'

describe('GET /api/health', () => {
  it('returns 200 with db:true when the DB check passes', async () => {
    const res = await request(createApp({ checkDb: async () => true })).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, db: true })
  })

  it('returns 503 with db:false when the DB check fails', async () => {
    const res = await request(createApp({ checkDb: async () => false })).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ ok: false, db: false })
  })

  it('returns 503 when the DB check throws', async () => {
    const app = createApp({
      checkDb: async () => {
        throw new Error('boom')
      },
    })
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ ok: false, db: false })
  })
})
