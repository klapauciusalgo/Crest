create schema if not exists private;

create extension if not exists pgcrypto with schema extensions;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.enforce_pinned_asset_limit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.pinned_assets
    where user_id = new.user_id
  ) >= 5 then
    raise exception 'Pinned asset limit exceeded';
  end if;

  return new;
end;
$$;

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  display_name text,
  x_user_id text,
  wallet_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.market_assets (
  id uuid primary key default gen_random_uuid(),
  cmc_id integer not null unique,
  symbol text not null,
  name text not null,
  slug text,
  rank integer not null check (rank > 0),
  chain text not null,
  sectors text[] not null default '{}',
  source text not null default 'coinmarketcap' check (source in ('mock', 'coinmarketcap', 'binance', 'hybrid')),
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_metadata_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint market_assets_symbol_not_blank check (btrim(symbol) <> ''),
  constraint market_assets_name_not_blank check (btrim(name) <> ''),
  constraint market_assets_chain_not_blank check (btrim(chain) <> '')
);

create table public.asset_exchange_pairs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.market_assets(id) on delete cascade,
  exchange text not null,
  base_symbol text not null,
  quote_symbol text not null default 'USDT',
  market_symbol text not null,
  status text not null default 'covered' check (status in ('covered', 'missing_pair', 'fetch_failed', 'partial')),
  priority integer not null default 100,
  last_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, exchange, market_symbol),
  constraint asset_exchange_pairs_exchange_not_blank check (btrim(exchange) <> ''),
  constraint asset_exchange_pairs_market_symbol_not_blank check (btrim(market_symbol) <> '')
);

create table public.ohlcv_candles (
  asset_id uuid not null references public.market_assets(id) on delete cascade,
  timeframe text not null check (timeframe in ('30m', '4h')),
  open_time timestamptz not null,
  close_time timestamptz not null,
  open numeric(24, 10) not null check (open >= 0),
  high numeric(24, 10) not null check (high >= 0),
  low numeric(24, 10) not null check (low >= 0),
  close numeric(24, 10) not null check (close >= 0),
  volume numeric(30, 10) not null check (volume >= 0),
  source text not null check (source in ('mock', 'coinmarketcap', 'binance', 'hybrid')),
  ingested_at timestamptz not null default now(),
  primary key (asset_id, timeframe, open_time, source),
  constraint ohlcv_candles_valid_range check (high >= low and high >= open and high >= close and low <= open and low <= close),
  constraint ohlcv_candles_valid_time check (close_time > open_time)
);

create table public.market_snapshots (
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
  primary key (asset_id, timeframe)
);

create table public.market_breadth_snapshots (
  timeframe text not null check (timeframe in ('30m', '4h')),
  universe_top integer not null check (universe_top in (100, 200, 300)),
  average_rsi numeric(7, 4) not null check (average_rsi >= 0 and average_rsi <= 100),
  bullish_count integer not null check (bullish_count >= 0),
  bearish_count integer not null check (bearish_count >= 0),
  neutral_count integer not null check (neutral_count >= 0),
  coverage_count integer not null check (coverage_count >= 0),
  computed_at timestamptz not null default now(),
  primary key (timeframe, universe_top)
);

create table public.market_group_snapshots (
  timeframe text not null check (timeframe in ('30m', '4h')),
  group_type text not null check (group_type in ('chain', 'sector')),
  group_key text not null,
  average_price_change numeric(12, 4) not null,
  average_volume_change numeric(12, 4) not null,
  gainers_count integer not null check (gainers_count >= 0),
  losers_count integer not null check (losers_count >= 0),
  asset_count integer not null check (asset_count >= 0),
  leading_symbol text,
  computed_at timestamptz not null default now(),
  primary key (timeframe, group_type, group_key),
  constraint market_group_snapshots_group_key_not_blank check (btrim(group_key) <> '')
);

create table public.data_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  timeframe text not null check (timeframe in ('30m', '4h')),
  source text not null check (source in ('mock', 'coinmarketcap', 'binance', 'hybrid')),
  status text not null check (status in ('running', 'succeeded', 'failed', 'partial')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  covered_count integer not null default 0 check (covered_count >= 0),
  total_count integer not null default 0 check (total_count >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  constraint data_refresh_runs_completed_after_start check (completed_at is null or completed_at >= started_at)
);

create table public.filter_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  state jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  constraint filter_presets_name_not_blank check (btrim(name) <> '')
);

create table public.pinned_assets (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.market_assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, asset_id)
);

create table public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  last_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (thread_id, user_id) references public.ai_threads(id, user_id) on delete cascade
);

create index market_assets_rank_idx on public.market_assets (rank);
create index market_assets_chain_idx on public.market_assets (chain);
create index market_assets_sectors_idx on public.market_assets using gin (sectors);
create index asset_exchange_pairs_asset_priority_idx on public.asset_exchange_pairs (asset_id, priority);
create index ohlcv_candles_timeframe_close_idx on public.ohlcv_candles (timeframe, close_time desc);
create index market_snapshots_timeframe_regime_idx on public.market_snapshots (timeframe, regime_4h);
create index market_snapshots_timeframe_recommendation_idx on public.market_snapshots (timeframe, recommendation_30m);
create index market_group_snapshots_lookup_idx on public.market_group_snapshots (timeframe, group_type);
create index data_refresh_runs_timeframe_started_idx on public.data_refresh_runs (timeframe, started_at desc);
create index pinned_assets_user_created_idx on public.pinned_assets (user_id, created_at desc);
create index ai_threads_user_updated_idx on public.ai_threads (user_id, updated_at desc);
create index ai_messages_thread_created_idx on public.ai_messages (thread_id, created_at);

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row execute function private.set_updated_at();

create trigger set_market_assets_updated_at
before update on public.market_assets
for each row execute function private.set_updated_at();

create trigger set_asset_exchange_pairs_updated_at
before update on public.asset_exchange_pairs
for each row execute function private.set_updated_at();

create trigger set_filter_presets_updated_at
before update on public.filter_presets
for each row execute function private.set_updated_at();

create trigger set_ai_threads_updated_at
before update on public.ai_threads
for each row execute function private.set_updated_at();

create trigger enforce_pinned_asset_limit
before insert on public.pinned_assets
for each row execute function private.enforce_pinned_asset_limit();

alter table public.user_profiles enable row level security;
alter table public.market_assets enable row level security;
alter table public.asset_exchange_pairs enable row level security;
alter table public.ohlcv_candles enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.market_breadth_snapshots enable row level security;
alter table public.market_group_snapshots enable row level security;
alter table public.data_refresh_runs enable row level security;
alter table public.filter_presets enable row level security;
alter table public.pinned_assets enable row level security;
alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.market_assets to anon, authenticated;
grant select on public.asset_exchange_pairs to anon, authenticated;
grant select on public.market_snapshots to anon, authenticated;
grant select on public.market_breadth_snapshots to anon, authenticated;
grant select on public.market_group_snapshots to anon, authenticated;
grant select on public.data_refresh_runs to authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant select, insert, update, delete on public.filter_presets to authenticated;
grant select, insert, delete on public.pinned_assets to authenticated;
grant select, insert, update, delete on public.ai_threads to authenticated;
grant select, insert on public.ai_messages to authenticated;
grant all on table public.user_profiles to service_role;
grant all on table public.market_assets to service_role;
grant all on table public.asset_exchange_pairs to service_role;
grant all on table public.ohlcv_candles to service_role;
grant all on table public.market_snapshots to service_role;
grant all on table public.market_breadth_snapshots to service_role;
grant all on table public.market_group_snapshots to service_role;
grant all on table public.data_refresh_runs to service_role;
grant all on table public.filter_presets to service_role;
grant all on table public.pinned_assets to service_role;
grant all on table public.ai_threads to service_role;
grant all on table public.ai_messages to service_role;

create policy "Market assets are readable"
on public.market_assets
for select
to anon, authenticated
using (true);

create policy "Exchange coverage is readable"
on public.asset_exchange_pairs
for select
to anon, authenticated
using (true);

create policy "Market snapshots are readable"
on public.market_snapshots
for select
to anon, authenticated
using (true);

create policy "Market breadth is readable"
on public.market_breadth_snapshots
for select
to anon, authenticated
using (true);

create policy "Market group summaries are readable"
on public.market_group_snapshots
for select
to anon, authenticated
using (true);

create policy "Authenticated users can read refresh runs"
on public.data_refresh_runs
for select
to authenticated
using (true);

create policy "Users can read their own profile"
on public.user_profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can insert their own profile"
on public.user_profiles
for insert
to authenticated
with check ((select auth.uid()) = id and role = 'user');

create policy "Users can update their own profile"
on public.user_profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id and role = 'user');

create policy "Users can read their own filter presets"
on public.filter_presets
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own filter presets"
on public.filter_presets
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own filter presets"
on public.filter_presets
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own filter presets"
on public.filter_presets
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own pinned assets"
on public.pinned_assets
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own pinned assets"
on public.pinned_assets
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own pinned assets"
on public.pinned_assets
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own AI threads"
on public.ai_threads
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own AI threads"
on public.ai_threads
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own AI threads"
on public.ai_threads
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own AI threads"
on public.ai_threads
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own AI messages"
on public.ai_messages
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own AI messages"
on public.ai_messages
for insert
to authenticated
with check ((select auth.uid()) = user_id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.market_snapshots;
    exception when duplicate_object then
      null;
    end;

    begin
      alter publication supabase_realtime add table public.market_breadth_snapshots;
    exception when duplicate_object then
      null;
    end;

    begin
      alter publication supabase_realtime add table public.market_group_snapshots;
    exception when duplicate_object then
      null;
    end;

    begin
      alter publication supabase_realtime add table public.data_refresh_runs;
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;
