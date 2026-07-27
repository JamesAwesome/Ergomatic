import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('shows the Ergomatic heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /ergomatic/i })).toBeInTheDocument()
  })
})
