import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the age gate and hides content on first visit', () => {
    render(<App />)
    expect(screen.getByText('I am 21 or older')).toBeInTheDocument()
    expect(screen.queryByText("Gma's Helper")).not.toBeInTheDocument()
  })

  it('renders content once age is confirmed', () => {
    localStorage.setItem('gma_age_confirmed', 'true')
    render(<App />)
    expect(screen.getByText("Gma's Helper")).toBeInTheDocument()
  })
})
