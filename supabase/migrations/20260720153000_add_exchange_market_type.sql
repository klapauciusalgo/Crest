alter table public.asset_exchange_pairs
add column if not exists market_type text not null default 'spot';

alter table public.asset_exchange_pairs
drop constraint if exists asset_exchange_pairs_market_type_check;

alter table public.asset_exchange_pairs
add constraint asset_exchange_pairs_market_type_check
check (market_type in ('spot', 'perp'));

create index if not exists asset_exchange_pairs_availability_idx
on public.asset_exchange_pairs (asset_id, exchange, market_type, status);
