revoke all on table public.user_profiles from anon, authenticated;
revoke all on table public.market_assets from anon, authenticated;
revoke all on table public.asset_exchange_pairs from anon, authenticated;
revoke all on table public.ohlcv_candles from anon, authenticated;
revoke all on table public.market_snapshots from anon, authenticated;
revoke all on table public.market_breadth_snapshots from anon, authenticated;
revoke all on table public.market_group_snapshots from anon, authenticated;
revoke all on table public.data_refresh_runs from anon, authenticated;
revoke all on table public.filter_presets from anon, authenticated;
revoke all on table public.pinned_assets from anon, authenticated;
revoke all on table public.ai_threads from anon, authenticated;
revoke all on table public.ai_messages from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on table public.market_assets to anon, authenticated;
grant select on table public.asset_exchange_pairs to anon, authenticated;
grant select on table public.market_snapshots to anon, authenticated;
grant select on table public.market_breadth_snapshots to anon, authenticated;
grant select on table public.market_group_snapshots to anon, authenticated;

grant select on table public.data_refresh_runs to authenticated;
grant select, insert, update on table public.user_profiles to authenticated;
grant select, insert, update, delete on table public.filter_presets to authenticated;
grant select, insert, delete on table public.pinned_assets to authenticated;
grant select, insert, update, delete on table public.ai_threads to authenticated;
grant select, insert on table public.ai_messages to authenticated;

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
