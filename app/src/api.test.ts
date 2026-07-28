import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.doUnmock('./platform')
  vi.doUnmock('./native/session')
})

async function load(native: boolean, token: string | null) {
  vi.doMock('./platform', () => ({ isNative: () => native }))
  vi.doMock('./native/session', () => ({
    getStoredToken: async () => token,
    storeToken: async () => {},
    clearToken: async () => {},
  }))
  return await import('./api')
}

// vi.fn's overload infers the mock's `calls` tuple type from the
// implementation's own parameter list; a zero-arg implementation makes
// `calls[0][1]` a type error under strict mode. Typing the implementation
// against fetch's real signature (input, init?) fixes inference without
// changing any assertion or behavior below.
type FetchArgs = [input: RequestInfo | URL, init?: RequestInit]

describe('api()', () => {
  it('on web: relative path, no auth header', async () => {
    const fetchMock = vi.fn(async (..._args: FetchArgs) => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await load(false, null)
    await api('/api/me')
    expect(fetchMock).toHaveBeenCalledWith('/api/me', expect.objectContaining({}))
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
  })

  it('on native: prefixes the API base and attaches the bearer', async () => {
    const fetchMock = vi.fn(async (..._args: FetchArgs) => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await load(true, 'tok123')
    await api('/api/me')
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.test/api/me')
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok123')
  })

  it('on native with no stored token: prefixes the base but sends no auth header', async () => {
    const fetchMock = vi.fn(async (..._args: FetchArgs) => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = await load(true, null)
    await api('/api/me')
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.test/api/me')
    const init = fetchMock.mock.calls[0]![1] as RequestInit
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
  })
})
