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
- [x] Supabase migrations applied to the remote project.
- [x] Client table grants hardened after remote privilege audit.
- [x] Supabase security advisor passes with no warning-level findings.
- [x] Backend Phase 3 added Supabase SDK server client wiring.
- [x] Market API provider can read Supabase snapshots with mock fallback.
- [x] Supabase environment contract documented without committing secrets.
- [x] Vercel project connected to GitHub repository.
- [x] Production Vercel runtime connected to Supabase with server-side secret.
- [x] Backend Phase 4 started with protected Supabase market seed endpoint.
- [x] Market snapshot writer can upsert assets, snapshots, breadth, and group summaries.
- [x] Binance OHLCV ingestion adapter added for 30m and 4h candles.
- [x] Protected Binance ingestion endpoint added for manual/cron refresh.
- [x] Supabase OHLCV candle persistence added.
- [x] Vercel Cron market refresh route added with Hobby-safe daily schedule.
- [x] Terminal UI wired to the live market API with mock fallback.
- [x] AI context now includes market data source, freshness, and coverage status.
- [x] Supabase Cron scheduled market refresh every 30 minutes.
- [x] Market universe changed from CMC market cap plan to Binance Top 300 by 24h USDT transaction volume.
- [x] Supabase asset identity migrated from CMC-only to source/source asset identity.
- [x] Terminal market grid search, updated-at status, clearer filter label, and polished chain fallback labels added.
- [x] Binance asset metadata resolver expanded for native chain and sector classification.
- [x] Market grid pagination added with 20-row pages.
- [x] Multi-timeframe regime and 30m setup columns added to terminal UI.
- [x] Market breadth cards added for Top 100, Top 200, and Top 300 with average RSI and regime distribution.
- [x] Market grid sorting UI stabilized with fixed column layout, reserved sort indicators, and browser verification.
- [x] Production deployment refreshed after latest terminal UI polish.

## In Progress

- [ ] Backend Phase 4 hardening: Binance Top 300 volume ingestion monitoring and edge-case verification.

## Next

- [ ] Add optional metadata enrichment for chain/sector classification.
- [ ] Monitor Supabase Cron run history after the next 30-minute boundary.
- [ ] AI provider abstraction and mock-to-live SSE route.
- [ ] Persist pinned assets and saved filter presets through Supabase user tables.
- [ ] Add Playwright smoke tests for the signed-out entry, terminal journey, filters, search, pagination, and AI drawer.

## Backlog

- [ ] X OAuth through Supabase Auth.
- [ ] SIWE wallet authentication.
- [ ] Admin AI provider encryption.
- [ ] Provider fallback chain.
- [ ] Admin role enforcement for `/admin/ai-config` and admin APIs.
- [ ] Supabase Realtime subscription/reconnect strategy for market snapshot updates.
- [ ] Production observability.
- [ ] CI workflow for typecheck, build, lint, and smoke tests.
- [ ] External metadata enrichment source for better chain/sector coverage beyond the curated resolver.
