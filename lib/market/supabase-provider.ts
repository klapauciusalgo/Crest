import type { SupabaseClient } from "@supabase/supabase-js";
import type { Timeframe } from "@/lib/mock-data";
import { buildTimeframeBreadth, withBreadthSemantics } from "@/lib/market/breadth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapVenueAvailability, type ExchangePairRecord } from "@/lib/market/venue-mapping";
import type {
  AssetCoverageStatus,
  MarketAssetSnapshot,
  MarketBreadthSnapshot,
  MarketDataProvider,
  MarketDataSource,
  MarketSnapshot
} from "@/lib/market/types";

type SupabaseProviderMode = "auto" | "mock" | "supabase";

type MarketAssetRecord = {
  id: string;
  cmc_id: number | null;
  source_asset_id: string;
  symbol: string;
  name: string;
  rank: number;
  chain: string;
  sectors: string[] | null;
  source: string;
  metadata: Record<string, unknown> | null;
  asset_exchange_pairs?: ExchangePairRecord[] | null;
};

type MarketSnapshotRecord = {
  timeframe: string;
  price: string | number;
  price_change_24h: string | number;
  volume_change_24h: string | number;
  rsi_14: string | number;
  ma_111: string | number;
  ma_distance_pct: string | number;
  btc_correlation_score: string | number | null;
  regime_4h: string;
  recommendation_30m: string;
  price_4h: string | number;
  ma_111_4h: string | number;
  ma_distance_4h_pct: string | number;
  rsi_4h: string | number;
  rsi_30m: string | number;
  signal_reason: string | null;
  coverage_status: string;
  source: string;
  computed_at: string;
  market_assets: MarketAssetRecord | MarketAssetRecord[] | null;
};

type MarketBreadthRecord = {
  timeframe: string;
  universe_top: number;
  average_rsi: string | number;
  bullish_count: number;
  bearish_count: number;
  neutral_count: number;
  coverage_count: number;
  computed_at: string;
};

export class SupabaseSnapshotUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseSnapshotUnavailableError";
  }
}

export function createSupabaseMarketProvider(fallbackProvider: MarketDataProvider): MarketDataProvider {
  return {
    async getSnapshot(timeframe) {
      const mode = getSupabaseProviderMode();

      if (mode === "mock") {
        return fallbackProvider.getSnapshot(timeframe);
      }

      const client = getSupabaseServerClient();
      if (!client) {
        if (mode === "supabase") {
          throw new SupabaseSnapshotUnavailableError("Supabase is forced but SUPABASE_URL and key env vars are missing.");
        }
        return fallbackProvider.getSnapshot(timeframe);
      }

      try {
        const snapshot = await readSupabaseMarketSnapshot(client, timeframe);
        if (snapshot.assets.length === 0) {
          throw new SupabaseSnapshotUnavailableError(`No Supabase market snapshots exist for ${timeframe}.`);
        }
        return snapshot;
      } catch (error) {
        if (mode === "supabase") throw error;
        console.warn("[crest] Falling back to mock market snapshot.", getSafeErrorMessage(error));
        return fallbackProvider.getSnapshot(timeframe);
      }
    }
  };
}

export async function readSupabaseMarketSnapshot(client: SupabaseClient, timeframe: Timeframe): Promise<MarketSnapshot> {
  const [assetRows, breadthRows] = await Promise.all([
    readAssetSnapshots(client, timeframe),
    readBreadthSnapshots(client, timeframe)
  ]);
  const assets = assetRows.map(mapAssetSnapshot).sort((first, second) => first.rank - second.rank);
  const storedBreadth = breadthRows
    .map(mapBreadthSnapshot)
    .sort((first, second) => getUniverseSize(first.universe) - getUniverseSize(second.universe));
  const breadth =
    assets.length > 0
      ? buildTimeframeBreadth(assets, timeframe, getLatestUpdatedAt(assets.map((asset) => asset.updatedAt)))
      : storedBreadth;
  const updatedAt = getLatestUpdatedAt([
    ...assets.map((asset) => asset.updatedAt),
    ...breadth.map((item) => item.updatedAt)
  ]);
  const covered = assets.filter((asset) => asset.coverageStatus === "covered").length;

  return {
    timeframe,
    assets,
    breadth,
    freshness: {
      timeframe,
      source: getSnapshotSource(assets),
      updatedAt,
      stalenessSeconds: Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000)),
      isStale: isSnapshotStale(timeframe, updatedAt),
      coverage: {
        covered,
        total: assets.length
      }
    }
  };
}

async function readAssetSnapshots(client: SupabaseClient, timeframe: Timeframe) {
  const { data, error } = await client
    .from("market_snapshots")
    .select(
      `
        timeframe,
        price,
        price_change_24h,
        volume_change_24h,
        rsi_14,
        ma_111,
        ma_distance_pct,
        btc_correlation_score,
        regime_4h,
        recommendation_30m,
        price_4h,
        ma_111_4h,
        ma_distance_4h_pct,
        rsi_4h,
        rsi_30m,
        signal_reason,
        coverage_status,
        source,
        computed_at,
        market_assets (
          id,
          cmc_id,
          source_asset_id,
          symbol,
          name,
          rank,
          chain,
          sectors,
          source,
          metadata,
          asset_exchange_pairs (
            exchange,
            market_type,
            base_symbol,
            quote_symbol,
            market_symbol,
            status,
            last_checked_at
          )
        )
      `
    )
    .eq("timeframe", timeframe)
    .eq("source", "binance")
    .limit(300);

  if (error) throw error;
  return (data || []) as MarketSnapshotRecord[];
}

async function readBreadthSnapshots(client: SupabaseClient, timeframe: Timeframe) {
  const { data, error } = await client
    .from("market_breadth_snapshots")
    .select("timeframe, universe_top, average_rsi, bullish_count, bearish_count, neutral_count, coverage_count, computed_at")
    .eq("timeframe", timeframe)
    .in("universe_top", [100, 200, 300]);

  if (error) throw error;
  return (data || []) as MarketBreadthRecord[];
}

function mapAssetSnapshot(row: MarketSnapshotRecord): MarketAssetSnapshot {
  const asset = getRelatedAsset(row.market_assets);

  return {
    id: asset.id,
    sourceAssetId: asset.source_asset_id || asset.symbol,
    cmcId: asset.cmc_id,
    symbol: asset.symbol,
    name: asset.name,
    rank: asset.rank,
    rankBasis: toRankBasis(asset.metadata?.rank_basis),
    quoteVolume24h: toNumber(asset.metadata?.quote_volume_24h || 0),
    tradeCount24h: toNumber(asset.metadata?.trade_count_24h || 0),
    blacklistStatus: toBlacklistStatus(asset.metadata?.blacklist_status),
    chain: asset.chain,
    sectors: asset.sectors || [],
    venueAvailability: mapVenueAvailability(asset.asset_exchange_pairs),
    source: toMarketDataSource(row.source || asset.source),
    timeframe: toTimeframe(row.timeframe),
    price: toNumber(row.price),
    priceChange24h: toNumber(row.price_change_24h),
    volumeChange24h: toNumber(row.volume_change_24h),
    rsi14: toNumber(row.rsi_14),
    ma111: toNumber(row.ma_111),
    maDistancePct: toNumber(row.ma_distance_pct),
    btcCorrelationScore: toNullableNumber(row.btc_correlation_score),
    regime4h: row.regime_4h === "Bullish" || row.regime_4h === "Bearish" ? row.regime_4h : "Neutral",
    recommendation30m:
      row.recommendation_30m === "Long/Buy" || row.recommendation_30m === "Short/Sell" ? row.recommendation_30m : "Wait",
    price4h: toNumber(row.price_4h),
    ma1114h: toNumber(row.ma_111_4h),
    maDistance4hPct: toNumber(row.ma_distance_4h_pct),
    rsi4h: toNumber(row.rsi_4h),
    rsi30m: toNumber(row.rsi_30m),
    signalReason: row.signal_reason || "",
    coverageStatus: toCoverageStatus(row.coverage_status),
    updatedAt: row.computed_at
  };
}

function mapBreadthSnapshot(row: MarketBreadthRecord): MarketBreadthSnapshot {
  const universe = row.universe_top === 100 || row.universe_top === 200 ? row.universe_top : 300;

  return withBreadthSemantics({
    timeframe: toTimeframe(row.timeframe),
    universe: `Top ${universe}`,
    averageRsi: toNumber(row.average_rsi),
    bullishCount: row.bullish_count,
    bearishCount: row.bearish_count,
    neutralCount: row.neutral_count,
    coverageCount: row.coverage_count,
    updatedAt: row.computed_at
  });
}

function getRelatedAsset(value: MarketAssetRecord | MarketAssetRecord[] | null): MarketAssetRecord {
  const asset = Array.isArray(value) ? value[0] : value;
  if (!asset) {
    throw new SupabaseSnapshotUnavailableError("Market snapshot row is missing its related market asset.");
  }
  return asset;
}

function getSupabaseProviderMode(): SupabaseProviderMode {
  const value = process.env.CREST_MARKET_DATA_SOURCE;
  if (value === "mock" || value === "supabase") return value;
  return "auto";
}

function getSnapshotSource(assets: MarketAssetSnapshot[]): MarketDataSource {
  if (assets.length === 0) return "mock";
  const uniqueSources = new Set(assets.map((asset) => asset.source));
  return uniqueSources.size === 1 ? assets[0].source : "hybrid";
}

function getLatestUpdatedAt(values: string[]) {
  const latest = values
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((first, second) => second - first)[0];

  return new Date(latest || 0).toISOString();
}

function isSnapshotStale(timeframe: Timeframe, updatedAt: string) {
  const thresholdSeconds = timeframe === "30m" ? 45 * 60 : 5 * 60 * 60;
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000) > thresholdSeconds;
}

function getUniverseSize(universe: MarketBreadthSnapshot["universe"]) {
  return Number(universe.replace("Top ", ""));
}

function toNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTimeframe(value: string): Timeframe {
  return value === "30m" ? "30m" : "4h";
}

function toMarketDataSource(value: string): MarketDataSource {
  if (value === "coinmarketcap" || value === "binance" || value === "hybrid") return value;
  return "mock";
}

function toRankBasis(value: unknown): MarketAssetSnapshot["rankBasis"] {
  if (value === "binance_quote_volume_24h" || value === "cmc_market_cap") return value;
  return "mock";
}

function toBlacklistStatus(value: unknown): MarketAssetSnapshot["blacklistStatus"] {
  if (value === "allowed" || value === "excluded") return value;
  return "unknown";
}

function toCoverageStatus(value: string): AssetCoverageStatus {
  if (value === "missing_pair" || value === "fetch_failed" || value === "partial") return value;
  return "covered";
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown Supabase snapshot error.";
  }
}
