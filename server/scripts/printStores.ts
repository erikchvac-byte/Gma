import { storeIds } from '../scrapers/index.js'

// Emits the registered store ids as a JSON array for the Actions `prepare` job to
// feed into the scrape matrix (ADR-034 Goal D). Single source of truth = the
// scrapers registry, so adding a store stays a one-line diff.
console.log(JSON.stringify(storeIds))
