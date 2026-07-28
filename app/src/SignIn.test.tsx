import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach } from 'vitest'
import SignIn from './SignIn'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.resetModules()
  vi.doUnmock('./platform')
  vi.doUnmock('./native/signin')
})

describe('SignIn', () => {
  it('shows the heading, tagline, and a Google sign-in link with no notice', () => {
    render(<SignIn />)
    expect(screen.getByRole('heading', { name: /ergomatic/i })).toBeInTheDocument()
    expect(screen.getByText(/rowing workout tracker/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /continue with google/i })
    expect(link).toHaveAttribute('href', '/api/auth/signin')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a denied notice with the rejected email from ?denied=', () => {
    window.history.replaceState(null, '', '/?denied=b%40y.com')
    render(<SignIn />)
    const notice = screen.getByRole('alert')
    expect(notice).toHaveTextContent('b@y.com')
    expect(notice).toHaveTextContent(/isn't invited/i)
  })

  it('shows a retry notice from ?error=signin_failed', () => {
    window.history.replaceState(null, '', '/?error=signin_failed')
    render(<SignIn />)
    expect(screen.getByRole('alert')).toHaveTextContent(/didn't work/i)
  })

  it('renders a native sign-in button (not a link) when isNative()', async () => {
    vi.doMock('./platform', () => ({ isNative: () => true }))
    const { default: NativeSignIn } = await import('./SignIn')
    render(<NativeSignIn />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /continue with google/i })).not.toBeInTheDocument()
  })

  it('native sign-in success: initializes, signs in, and calls onSignedIn', async () => {
    const onSignedIn = vi.fn()
    const initNativeAuth = vi.fn(async () => {})
    const nativeSignIn = vi.fn(async () => true)
    vi.doMock('./platform', () => ({ isNative: () => true }))
    vi.doMock('./native/signin', () => ({ initNativeAuth, nativeSignIn }))
    const { default: NativeSignIn } = await import('./SignIn')
    render(<NativeSignIn onSignedIn={onSignedIn} />)
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }))
    expect(initNativeAuth).toHaveBeenCalled()
    expect(nativeSignIn).toHaveBeenCalled()
    expect(onSignedIn).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('native sign-in failure: shows the thrown Error message in the notice area', async () => {
    const onSignedIn = vi.fn()
    const initNativeAuth = vi.fn(async () => {})
    const nativeSignIn = vi.fn(async () => {
      throw new Error("b@y.com isn't invited to this Ergomatic.")
    })
    vi.doMock('./platform', () => ({ isNative: () => true }))
    vi.doMock('./native/signin', () => ({ initNativeAuth, nativeSignIn }))
    const { default: NativeSignIn } = await import('./SignIn')
    render(<NativeSignIn onSignedIn={onSignedIn} />)
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/isn't invited/i)
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('native sign-in failure: falls back to a generic message for non-Error throws', async () => {
    const initNativeAuth = vi.fn(async () => {})
    const nativeSignIn = vi.fn(async () => {
      throw 'nope'
    })
    vi.doMock('./platform', () => ({ isNative: () => true }))
    vi.doMock('./native/signin', () => ({ initNativeAuth, nativeSignIn }))
    const { default: NativeSignIn } = await import('./SignIn')
    render(<NativeSignIn />)
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/didn't work/i)
  })
})
