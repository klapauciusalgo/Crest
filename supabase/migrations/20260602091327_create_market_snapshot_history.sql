create table if not exists public.market_snapshot_history (
  asset_id uuid not null references public.market_assets(id) on delete cascade,
  timeframe text not null check (timeframe in ('30m', '4h')),
  price numeric(24, 10) not null check (price >= 0),
  price_change_24h numeric(12, 4) not null,
  volume_change_24h numeric(12, 4) not null,
  rsi_14 numeric(7, 4) not null check (rsi_14 >= 0 and rsi_14 <= 100),
  ma_111 numeric(24, 10) not null check (ma_111 >= 0),
  ma_distance_pct numeric(12, 4) not null,
  regime_4h text not null check (regime_4h in ('Bullish', 'Bearish', 'Neutral')),
  recommendation_30m text not null default 'Wait' check (recommendation_30m in ('Long/Buy', 'Short/Sell', 'Wait')),
  price_4h numeric(24, 10) not null check (price_4h >= 0),
  ma_111_4h numeric(24, 10) not null check (ma_111_4h >= 0),
  ma_distance_4h_pct numeric(12, 4) not null,
  rsi_4h numeric(7, 4) not null check (rsi_4h >= 0 and rsi_4h <= 100),
  rsi_30m numeric(7, 4) not null check (rsi_30m >= 0 and rsi_30m <= 100),
  signal_reason text not null default '',
  coverage_status text not null default 'covered' check (coverage_status in ('covered', 'missing_pair', 'fetch_failed', 'partial')),
  source text not null check (source in ('mock', 'coinmarketcap', 'binance', 'hybrid')),
  candle_close_at timestamptz not null,
  computed_at timestamptz not null default now(),
  primary key (asset_id, timeframe, candle_close_at, source)
);

create index if not exists market_snapshot_history_asset_timeframe_computed_idx
on public.market_snapshot_history (asset_id, timeframe, computed_at desc);

create index if not exists market_snapshot_history_asset_timeframe_candle_idx
on public.market_snapshot_history (asset_id, timeframe, candle_close_at desc);

alter table public.market_snapshot_history enable row level security;

grant select on public.market_snapshot_history to anon, authenticated;
grant all on table public.market_snapshot_history to service_role;

create policy "Market snapshot history is readable"
on public.market_snapshot_history
for select
to anon, authenticated
using (true);
