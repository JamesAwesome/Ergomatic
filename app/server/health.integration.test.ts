import { describe, it, expect } from 'vitest'
import type { AddressInfo } from 'node:net'
import { createApp } from './app.js'

describe('health over real HTTP', () => {
  it('serves /api/health on a live socket', async () => {
    const server = createApp().listen(0)
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    } finally {
      server.close()
    }
  })
})
