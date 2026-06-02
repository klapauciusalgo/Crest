import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServerConfig } from "@/lib/supabase/server";
import type { MarketAssetSnapshot, MarketSnapshot, OhlcvCandle } from "@/lib/market/types";

type AssetIdMap = Map<string, string>;

export type MarketSnapshotWriteResult = {
  assets: number;
  breadth: number;
  candles?: number;
  groupSnapshots: number;
  timeframe: MarketSnapshot["timeframe"];
};

export async function writeMarketSnapshotToSupabase(snapshot: MarketSnapshot): Promise<MarketSnapshotWriteResult> {
  const config = getSupabaseServerConfig();
  const client = getSupabaseServerClient();

  if (!client || !config) {
    throw new Error("Supabase env is missing.");
  }

  if (config.keySource !== "service_role") {
    throw new Error("Supabase writes require SUPABASE_SERVICE_ROLE_KEY.");
  }

  const assetIdMap = await upsertAssets(client, snapshot.assets);
  await deleteExistingMarketSnapshots(client, snapshot);
  await upsertMarketSnapshots(client, snapshot, assetIdMap);
  await upsertBreadth(client, snapshot);
  const groupSnapshotCount = await upsertGroupSnapshots(client, snapshot);
  await recordRefreshRun(client, snapshot, "succeeded", null);

  return {
    assets: snapshot.assets.length,
    breadth: snapshot.breadth.length,
    groupSnapshots: groupSnapshotCount,
    timeframe: snapshot.timeframe
  };
}

export async function writeOhlcvCandlesToSupabase(candles: OhlcvCandle[]): Promise<number> {
  const config = getSupabaseServerConfig();
  const client = getSupabaseServerClient();

  if (!client || !config) {
    throw new Error("Supabase env is missing.");
  }

  if (config.keySource !== "service_role") {
    throw new Error("Supabase writes require SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (candles.length === 0) return 0;

  const sourceAssetIds = Array.from(new Set(candles.map((candle) => candle.symbol)));
  const { data: assets, error: assetError } = await client
    .from("market_assets")
    .select("id, source_asset_id, symbol")
    .eq("source", "binance")
    .in("source_asset_id", sourceAssetIds);
  if (assetError) throw assetError;

  const assetIdsBySourceId = new Map(
    (assets || []).map((asset: { id: string; source_asset_id?: string; symbol: string }) => [asset.source_asset_id || asset.symbol, asset.id])
  );
  const rows = candles
    .map((candle) => {
      const assetId = assetIdsBySourceId.get(candle.symbol);
      if (!assetId) return null;

      return {
        asset_id: assetId,
        timeframe: candle.timeframe,
        open_time: candle.openTime,
        close_time: candle.closeTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        source: candle.source,
        ingested_at: new Date().toISOString()
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await client
      .from("ohlcv_candles")
      .upsert(rows.slice(index, index + 500), { onConflict: "asset_id,timeframe,open_time,source" });
    if (error) throw error;
  }

  return rows.length;
}

async function upsertAssets(client: SupabaseClient, assets: MarketAssetSnapshot[]): Promise<AssetIdMap> {
  const rows = assets.map((asset) => ({
    cmc_id: asset.cmcId || null,
    source_asset_id: asset.sourceAssetId,
    symbol: asset.symbol,
    name: asset.name,
    rank: asset.rank,
    chain: String(asset.chain),
    sectors: asset.sectors.map(String),
    source: asset.source,
    metadata: {
      seeded_from: "crest_market_provider",
      source_asset_id: asset.sourceAssetId,
      rank_basis: asset.rankBasis,
      quote_volume_24h: asset.quoteVolume24h,
      trade_count_24h: asset.tradeCount24h,
      blacklist_status: asset.blacklistStatus
    },
    is_active: true,
    last_metadata_sync_at: new Date().toISOString()
  }));

  const { data, error } = await client
    .from("market_assets")
    .upsert(rows, { onConflict: "source,source_asset_id" })
    .select("id, source_asset_id");
  if (error) throw error;

  return new Map((data || []).map((row: { source_asset_id: string; id: string }) => [row.source_asset_id, row.id]));
}

async function deleteExistingMarketSnapshots(client: SupabaseClient, snapshot: MarketSnapshot) {
  const { error } = await client
    .from("market_snapshots")
    .delete()
    .eq("timeframe", snapshot.timeframe)
    .eq("source", snapshot.freshness.source);

  if (error) throw error;
}

async function upsertMarketSnapshots(client: SupabaseClient, snapshot: MarketSnapshot, assetIdMap: AssetIdMap) {
  const computedAt = new Date().toISOString();
  const rows = snapshot.assets.map((asset) => {
    const assetId = assetIdMap.get(asset.sourceAssetId);
    if (!assetId) throw new Error(`Missing Supabase asset id for ${asset.symbol}.`);

    return {
      asset_id: assetId,
      timeframe: snapshot.timeframe,
      price: asset.price,
      price_change_24h: asset.priceChange24h,
      volume_change_24h: asset.volumeChange24h,
      rsi_14: asset.rsi14,
      ma_111: asset.ma111,
      ma_distance_pct: asset.maDistancePct,
      regime_4h: asset.regime4h,
      recommendation_30m: asset.recommendation30m,
      price_4h: asset.price4h,
      ma_111_4h: asset.ma1114h,
      ma_distance_4h_pct: asset.maDistance4hPct,
      rsi_4h: asset.rsi4h,
      rsi_30m: asset.rsi30m,
      signal_reason: asset.signalReason,
      coverage_status: asset.coverageStatus,
      source: asset.source,
      candle_close_at: asset.updatedAt,
      computed_at: computedAt
    };
  });

  const { error } = await client.from("market_snapshots").upsert(rows, { onConflict: "asset_id,timeframe" });
  if (error) throw error;
}

async function upsertBreadth(client: SupabaseClient, snapshot: MarketSnapshot) {
  const computedAt = new Date().toISOString();
  const rows = snapshot.breadth.map((item) => ({
    timeframe: snapshot.timeframe,
    universe_top: Number(item.universe.replace("Top ", "")),
    average_rsi: item.averageRsi,
    bullish_count: item.positiveCount,
    bearish_count: item.negativeCount,
    neutral_count: item.neutralCount,
    coverage_count: item.coverageCount,
    computed_at: computedAt
  }));

  const { error } = await client.from("market_breadth_snapshots").upsert(rows, { onConflict: "timeframe,universe_top" });
  if (error) throw error;
}

async function upsertGroupSnapshots(client: SupabaseClient, snapshot: MarketSnapshot) {
  const computedAt = new Date().toISOString();
  const chainRows = buildGroupRows(snapshot, "chain", computedAt);
  const sectorRows = buildGroupRows(snapshot, "sector", computedAt);
  const rows = [...chainRows, ...sectorRows];

  const { error } = await client
    .from("market_group_snapshots")
    .upsert(rows, { onConflict: "timeframe,group_type,group_key" });
  if (error) throw error;

  return rows.length;
}

function buildGroupRows(snapshot: MarketSnapshot, groupType: "chain" | "sector", computedAt: string) {
  const groups = new Map<string, MarketAssetSnapshot[]>();

  for (const asset of snapshot.assets) {
    const keys = groupType === "chain" ? [String(asset.chain)] : asset.sectors.map(String);
    for (const key of keys) {
      const group = groups.get(key) || [];
      group.push(asset);
      groups.set(key, group);
    }
  }

  return Array.from(groups.entries()).map(([key, assets]) => {
    const leadingAsset = [...assets].sort((first, second) => second.priceChange24h - first.priceChange24h)[0];

    return {
      timeframe: snapshot.timeframe,
      group_type: groupType,
      group_key: key,
      average_price_change: average(assets.map((asset) => asset.priceChange24h)),
      average_volume_change: average(assets.map((asset) => asset.volumeChange24h)),
      gainers_count: assets.filter((asset) => asset.priceChange24h >= 0).length,
      losers_count: assets.filter((asset) => asset.priceChange24h < 0).length,
      asset_count: assets.length,
      leading_symbol: leadingAsset?.symbol || null,
      computed_at: computedAt
    };
  });
}

async function recordRefreshRun(client: SupabaseClient, snapshot: MarketSnapshot, status: "succeeded" | "failed", errorMessage: string | null) {
  const { error } = await client.from("data_refresh_runs").insert({
    timeframe: snapshot.timeframe,
    source: snapshot.freshness.source,
    status,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    covered_count: snapshot.freshness.coverage.covered,
    total_count: snapshot.freshness.coverage.total,
    error_message: errorMessage,
    metadata: {
      assets: snapshot.assets.length,
      breadth: snapshot.breadth.length,
      rank_basis: snapshot.assets[0]?.rankBasis || null
    }
  });

  if (error) throw error;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}
