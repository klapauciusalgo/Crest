alter table public.market_snapshots
add column btc_correlation_score numeric(7, 2) null
check (btc_correlation_score is null or (btc_correlation_score >= -100 and btc_correlation_score <= 100));

alter table public.market_snapshot_history
add column btc_correlation_score numeric(7, 2) null
check (btc_correlation_score is null or (btc_correlation_score >= -100 and btc_correlation_score <= 100));
