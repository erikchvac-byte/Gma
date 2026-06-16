import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Skeleton, SkeletonFeed } from './Skeleton'

describe('Skeleton', () => {
  it('renders with correct width and height style', () => {
    const { container } = render(<Skeleton width={200} height={40} />)
    const el = container.querySelector('.gma-skeleton')
    expect(el).toHaveStyle({ width: '200px', height: '40px' })
  })

  it('converts numeric values to px', () => {
    const { container } = render(<Skeleton width={100} height={50} />)
    const el = container.querySelector('.gma-skeleton')
    expect(el).toHaveStyle({ width: '100px', height: '50px' })
  })

  it('accepts string values directly', () => {
    const { container } = render(<Skeleton width="50%" height="2rem" />)
    const el = container.querySelector('.gma-skeleton')
    expect(el).toHaveStyle({ width: '50%', height: '2rem' })
  })

  it('applies custom borderRadius when radius provided', () => {
    const { container } = render(<Skeleton radius={8} />)
    const el = container.querySelector('.gma-skeleton')
    expect(el).toHaveStyle({ borderRadius: '8px' })
  })

  it('renders aria-hidden="true"', () => {
    const { container } = render(<Skeleton />)
    expect(container.querySelector('.gma-skeleton')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('SkeletonFeed', () => {
  it('renders 3 skeleton rows by default', () => {
    const { container } = render(<SkeletonFeed />)
    expect(container.querySelectorAll('.gma-skeleton')).toHaveLength(3)
  })

  it('honors rows prop', () => {
    const { container } = render(<SkeletonFeed rows={5} />)
    expect(container.querySelectorAll('.gma-skeleton')).toHaveLength(5)
  })

  it('has role="status"', () => {
    render(<SkeletonFeed />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('has accessible label', () => {
    render(<SkeletonFeed />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading deals')
  })
})
