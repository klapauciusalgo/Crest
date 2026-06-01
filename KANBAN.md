# Crest Development Kanban

## Done

- [x] Product requirements reviewed from Markdown source docs.
- [x] Canonical product name updated to Crest.
- [x] Development plan shifted to Vercel and Supabase.
- [x] Prototype-first strategy added to the roadmap.
- [x] GitHub repository synced at `klapauciusalgo/Crest`.
- [x] Next.js app scaffolded with Vercel-ready structure.
- [x] Clickable mock Crest terminal built.
- [x] Mock AI drawer streaming interaction built.
- [x] Mock admin AI provider config built.
- [x] First Vercel deployment created.
- [x] Signed-out first page simplified to entry-only auth panel.
- [x] Signed-out entry screen upgraded with animated terminal signal layer.
- [x] Terminal chain heatmap redesigned into chain intelligence panel.
- [x] Chain click interaction fetches mock project details.
- [x] Chain intelligence adjusted to preserve all-chain default and multi-chain filters.
- [x] Sector intelligence added with mock category/project detail fetch.
- [x] Requirement docs updated for sector intelligence and provider category sources.
- [x] Multi-chain selector moved above intelligence panel so it is always reachable.
- [x] AI drawer now receives full market context snapshot for future SSE requests.
- [x] Chain detail panel repositioned so selected-chain details are visible with multi-chain controls at normal zoom.
- [x] Backend Phase 1 started with typed market data contracts.
- [x] Mock market provider exposed through Next.js API routes.
- [x] Indicator helper module added for RSI, MA111, 4h regime, and 30m setup signals.
- [x] Market freshness and breadth API contracts added.
- [x] Supabase local project config initialized.
- [x] Supabase market snapshot schema migration drafted with RLS policies.
- [x] User-owned tables drafted for presets, pinned assets, AI threads, and AI context history.

## In Progress

- [ ] Connect Vercel project to the GitHub repository integration.
- [ ] Backend Phase 3: Supabase client wiring and snapshot repository layer.

## Next

- [ ] Wire terminal UI to the API data source behind a feature flag.
- [ ] Supabase project linkage and environment variable plan.
- [ ] Apply and verify migration against a linked Supabase project or local Docker stack.
- [ ] Market data provider adapter.
- [ ] CoinMarketCap metadata/ranking adapter.
- [ ] Exchange OHLCV adapter for 30m and 4h candles.
- [ ] AI provider abstraction and mock-to-live SSE route.

## Backlog

- [ ] X OAuth through Supabase Auth.
- [ ] SIWE wallet authentication.
- [ ] Persisted saved filter presets.
- [ ] Persisted pinned assets.
- [ ] Admin AI provider encryption.
- [ ] Provider fallback chain.
- [ ] Production observability.
