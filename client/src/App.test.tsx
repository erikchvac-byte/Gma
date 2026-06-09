import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders without throwing', () => {
    render(<App />)
    expect(screen.getByText("Gma's Helper")).toBeInTheDocument()
  })
})
