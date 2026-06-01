alter table public.market_assets
add column if not exists source_asset_id text;

update public.market_assets
set source_asset_id = coalesce(nullif(metadata ->> 'source_asset_id', ''), symbol)
where source_asset_id is null;

alter table public.market_assets
alter column source_asset_id set not null;

alter table public.market_assets
alter column cmc_id drop not null;

alter table public.market_assets
add constraint market_assets_source_asset_id_not_blank check (btrim(source_asset_id) <> '');

create unique index if not exists market_assets_source_asset_id_key
on public.market_assets (source, source_asset_id);

create index if not exists market_assets_rank_basis_idx
on public.market_assets ((metadata ->> 'rank_basis'));
