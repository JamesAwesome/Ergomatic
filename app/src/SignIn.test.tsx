import { render, screen } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import SignIn from './SignIn'

afterEach(() => {
  window.history.replaceState(null, '', '/')
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
})
