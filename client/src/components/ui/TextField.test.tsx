import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TextField } from './TextField'

describe('TextField', () => {
  it('renders with label', () => {
    render(<TextField label="Name" />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders error state with aria-invalid', () => {
    render(<TextField label="MPG" error="Required" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Required')).toHaveClass('gma-field__error')
  })

  it('renders hint text', () => {
    render(<TextField label="MPG" hint="Your combined MPG" />)
    expect(screen.getByText('Your combined MPG')).toHaveClass('gma-field__hint')
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid')
  })

  it('applies mono class', () => {
    render(<TextField mono />)
    expect(screen.getByRole('textbox')).toHaveClass('gma-input--mono')
  })

  it('no aria-describedby when neither hint nor error', () => {
    render(<TextField label="Name" />)
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-describedby')
  })

  it('error overrides hint — shows error, not hint', () => {
    render(<TextField label="MPG" hint="Your MPG" error="Required" />)
    expect(screen.getByText('Required')).toHaveClass('gma-field__error')
    expect(screen.queryByText('Your MPG')).not.toBeInTheDocument()
  })

  it('aria-describedby points to error id when error present', () => {
    render(<TextField label="MPG" error="Required" id="mpg" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('aria-describedby', 'mpg-err')
  })
})
