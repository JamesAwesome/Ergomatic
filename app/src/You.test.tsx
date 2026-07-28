import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect } from 'vitest'
import You from './You'

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
    vi.unstubAllGlobals()
  })
})
