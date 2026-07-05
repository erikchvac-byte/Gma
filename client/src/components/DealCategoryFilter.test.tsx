import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DealCategoryFilter from './DealCategoryFilter'
import { DEAL_ICON_SRC } from '../utils/dealIconAssets'

describe('DealCategoryFilter', () => {
  it('renders one icon button per passed category and nothing else', () => {
    render(
      <DealCategoryFilter categories={['vape', 'edible']} selected={null} onSelect={() => {}} />,
    )

    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Vapes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edibles' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Flower' })).not.toBeInTheDocument()
  })

  it("wears each family's canonical card art (DEAL_ICON_SRC) on its chip", () => {
    render(<DealCategoryFilter categories={['vape']} selected={null} onSelect={() => {}} />)
    const img = screen.getByRole('button', { name: 'Vapes' }).querySelector('img')
    expect(img).toHaveAttribute('src', DEAL_ICON_SRC.vape)
  })

  it('marks only the selected category pressed', () => {
    render(
      <DealCategoryFilter categories={['vape', 'edible']} selected="edible" onSelect={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Edibles' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Vapes' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('emits the category on click, and null when the pressed chip is re-clicked', () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <DealCategoryFilter categories={['vape']} selected={null} onSelect={onSelect} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Vapes' }))
    expect(onSelect).toHaveBeenCalledWith('vape')

    rerender(<DealCategoryFilter categories={['vape']} selected="vape" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vapes' }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('renders nothing at all when no categories are present', () => {
    const { container } = render(
      <DealCategoryFilter categories={[]} selected={null} onSelect={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
