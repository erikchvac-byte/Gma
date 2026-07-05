// Rotation pools for sale-tag families with multiple art pieces (Erik's art —
// GmasINCOlist/Store sale tags — resized, not redrawn, same ADR-067 pipeline as
// deal-icons/). The matcher (dealIcons.ts) still emits a single family name
// ('edible', 'bud'); a pool only varies which PICTURE that name resolves to:
// matching deals, in feed reading order, each draw a different image — no
// repeats until the whole pool has appeared, then a freshly shuffled cycle
// begins. Families without a pool keep their single dedicated art.
import edible01 from '../assets/deal-icons/edibles/edible-01.webp'
import edible02 from '../assets/deal-icons/edibles/edible-02.webp'
import edible03 from '../assets/deal-icons/edibles/edible-03.webp'
import edible04 from '../assets/deal-icons/edibles/edible-04.webp'
import edible05 from '../assets/deal-icons/edibles/edible-05.webp'
import edible06 from '../assets/deal-icons/edibles/edible-06.webp'
import edible07 from '../assets/deal-icons/edibles/edible-07.webp'
import edible08 from '../assets/deal-icons/edibles/edible-08.webp'
import edible09 from '../assets/deal-icons/edibles/edible-09.webp'
import edible10 from '../assets/deal-icons/edibles/edible-10.webp'
import edible11 from '../assets/deal-icons/edibles/edible-11.webp'
import bud01 from '../assets/deal-icons/buds/bud-01.webp'
import bud02 from '../assets/deal-icons/buds/bud-02.webp'
import bud03 from '../assets/deal-icons/buds/bud-03.webp'
import bud04 from '../assets/deal-icons/buds/bud-04.webp'
import vape01 from '../assets/deal-icons/vapes/vape-01.webp'
import vape02 from '../assets/deal-icons/vapes/vape-02.webp'
import vape03 from '../assets/deal-icons/vapes/vape-03.webp'
import shatter01 from '../assets/deal-icons/shatter/shatter-01.webp'
import shatter02 from '../assets/deal-icons/shatter/shatter-02.webp'

export const ROTATING_ICON_POOLS = {
  edible: [
    edible01,
    edible02,
    edible03,
    edible04,
    edible05,
    edible06,
    edible07,
    edible08,
    edible09,
    edible10,
    edible11,
  ],
  bud: [bud01, bud02, bud03, bud04],
  vape: [vape01, vape02, vape03],
  shatter: [shatter01, shatter02],
} as const satisfies Record<string, readonly string[]>

// The DealIconNames that rotate. `keyof` keeps this in lockstep with the pools
// object — adding a pool automatically widens the type.
export type RotatingIconName = keyof typeof ROTATING_ICON_POOLS
export const ROTATING_ICON_NAMES = Object.keys(ROTATING_ICON_POOLS) as RotatingIconName[]

// Per-card src assignments, one array per rotating family, consumed in block
// reading order (DealFeed slices these out of the feed-wide sequences).
export type RotatingIconSrcs = Partial<Record<RotatingIconName, string[]>>

// Deterministic PRNG. DealFeed re-renders every second (useNow), so assignments
// must be reproducible within a mount: the feed holds one seed for its lifetime
// and rebuilds the identical sequences each render. Math.random() directly in
// render would reshuffle every icon once a second.
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The first `count` entries of a pool's rotation: concatenated Fisher-Yates
// shuffles of the whole pool, so every aligned pool-sized window is repeat-free
// and each cycle's order is independent. Generation is prefix-stable — a given
// rng seed yields the same leading entries no matter how large `count` grows
// (each chunk consumes a fixed number of rng draws), so a feed that gains deals
// never re-deals the icons already on screen.
export function buildIconSequence(
  pool: readonly string[],
  count: number,
  rng: () => number = Math.random,
): string[] {
  const out: string[] = []
  if (pool.length === 0) return out
  while (out.length < count) {
    const chunk = [...pool]
    for (let i = chunk.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[chunk[i], chunk[j]] = [chunk[j], chunk[i]]
    }
    out.push(...chunk)
  }
  return out.slice(0, count)
}
