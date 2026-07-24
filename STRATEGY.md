# gmas list — Strategy Thesis

> Top of the stack. This doc names WHY the product exists and WHAT wins.
> `GMAS_LIST_BRIEF.md` sits underneath as the brand / UX / legal design contract; `ADR.md` sits under that as engineering reasoning.
> Where a lower doc is silent on priority, this doc rules. Where this doc touches brand, UX, or legal, the brief still wins on those.
> Written 2026-07-24.

## The thesis in one sentence

gmas list wins when honest, computed cross-store facts that no one can copy are put in front of the people who can act on them. The moat and the reach are two halves of one machine — not two projects competing for attention.

## The two halves

**The moat (supply).** The defensible asset is the derivation engine: honest cross-store relational facts — same-SKU price disparity, price-vs-its-own-history — gated so they cannot lie. Raw menus are a commodity anyone can scrape; the honesty gates and the computed facts are what can't be cloned in a weekend. The data source underneath is pluggable and deliberately not worth buying (ADR-095, closed).

**The reach (demand).** The promise a person actually shows up for: an honest, no-gimmick read on whether a deal is really a deal — surfaced where they will find it. Today that means local / regional discovery for the 21 WA stores, primarily through search and AI-search crawlers. A moat with no one standing behind it is a science project.

## The flywheel

The two halves feed each other, in one loop:

> engine computes honest facts → those facts are the crawler / SEO surface → the surface earns reach → reach brings users → users justify richer engine surfaces and eventually monetization → more reason to keep the engine running.

The corpus already found this: proprietary-data value and AI-search pickup are the same work. The right reach is not generic traffic — it is surfacing the derived facts, the one kind of reach only this engine can earn.

## The priority ruling (the reason this doc exists)

Reach and the engine are co-equal. Neither is "polish on top of" the other.

Right now, reach is the binding constraint. The engine is ahead of its audience — there is more computed value in the file than there are people to see it (18 users / 28 days; the site spent months with zero indexed pages). The scarce resource is people, not facts.

This overrides the default that has held in practice, where the engine took the sequential dev spine and AI-search shipped in the gaps. From here, AI-search / crawler visibility is a first-class track, not a side quest.

## How that translates to hours

The two halves are asymmetric in how they grow:

- **The engine compounds passively.** Every night the cron runs, history accrues and the moat deepens — with or without a founder hour. The one non-negotiable is keeping the pipeline healthy.
- **Reach compounds only when acted on.** No hour, no new indexing, no new user. Nothing happens on its own.

Therefore the marginal founder hour goes to reach until traffic justifies otherwise — precisely because the engine keeps building itself and reach does not.

## What this does not change

- The brief still governs brand, UX, and legal (WAC 314-55-155, age gate, no cannabis imagery, no out-of-state targeting).
- Honesty gates stay load-bearing — never surface a fact the data cannot honestly support.
- The data-buy question stays closed (ADR-095). Do not re-litigate.
