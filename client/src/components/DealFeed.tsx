import { useDeals } from '../hooks/useDeals'
import { sortDeals } from '../utils/sortDeals'
import { formatLastUpdated } from '../utils/formatTime'

export default function DealFeed() {
  const { data, isLoading, error } = useDeals()

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading deals" className="px-4">
        <div className="animate-pulse space-y-3">
          <div className="h-16 rounded-lg bg-gray-200" />
          <div className="h-16 rounded-lg bg-gray-200" />
          <div className="h-16 rounded-lg bg-gray-200" />
        </div>
      </div>
    )
  }

  if (error !== null || data === null) {
    return (
      <p role="alert" className="px-4 text-gray-700">
        Couldn&apos;t load deals. Please try again later.
      </p>
    )
  }

  const rows = sortDeals(data.dispensaries, new Date())
  const lastUpdated = formatLastUpdated(data.meta.lastScraperRun)

  return (
    <section aria-label="Deal feed" className="px-4">
      {rows.length === 0 ? (
        <p className="text-gray-700">No active deals right now</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ dispensary, deal }, index) => (
            <li
              key={`${dispensary.id}-${index}`}
              className="rounded-lg border border-gray-200 bg-white p-3"
            >
              <span className="font-semibold">{dispensary.name}</span>
              <span> — {deal.description} — </span>
              <span>{deal.discountPct}% off</span>
            </li>
          ))}
        </ul>
      )}
      {lastUpdated !== '' && (
        <footer className="mt-4 text-sm text-gray-500">Last updated {lastUpdated}</footer>
      )}
    </section>
  )
}
