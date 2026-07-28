import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, afterEach } from 'vitest'
import You from './You'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.doUnmock('./platform')
  vi.doUnmock('./native/signin')
})

describe('You', () => {
  const user = { id: 'u1', email: 'a@x.com', name: 'Ada Rower' }

  it('shows identity and initials', () => {
    render(<You user={user} onSignedOut={() => {}} />)
    expect(screen.getByText('Ada Rower')).toBeInTheDocument()
    expect(screen.getByText('a@x.com')).toBeInTheDocument()
    expect(screen.getByText('AR')).toBeInTheDocument()
  })

  it('signs out via POST and notifies', async () => {
    const onSignedOut = vi.fn()
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<You user={user} onSignedOut={onSignedOut} />)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/signout', { method: 'POST' })
    expect(onSignedOut).toHaveBeenCalled()
  })

  it('signs out via the native Keychain path when isNative()', async () => {
    const onSignedOut = vi.fn()
    const nativeSignOut = vi.fn(async () => {})
    vi.doMock('./platform', () => ({ isNative: () => true }))
    vi.doMock('./native/signin', () => ({ nativeSignOut }))
    const { default: NativeYou } = await import('./You')
    render(<NativeYou user={user} onSignedOut={onSignedOut} />)
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(nativeSignOut).toHaveBeenCalled()
    expect(onSignedOut).toHaveBeenCalled()
  })
})
