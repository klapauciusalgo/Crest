import type { SupabaseClient } from "@supabase/supabase-js";
import type { Regime4h, Timeframe, TradeRecommendation30m } from "@/lib/mock-data";
import { getMockMarketSnapshot } from "@/lib/market/mock-provider";
import {
  getBtcGatedRecommendation30mFromValues,
  getRecommendation30mFromValues,
  getRegime4hFromValues,
  deriveIndicatorValues
} from "@/lib/market/indicators";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AssetCoverageStatus,
  MarketAssetDetail,
  MarketAssetSnapshot,
  MarketCandlePoint,
  MarketDataSource,
  MarketSnapshotHistoryPoint,
  MarketUniverseAsset,
  OhlcvCandle
} from "@/lib/market/types";

type DetailAssetRecord = {
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
};

type SnapshotRecord = {
  price: string | number;
  price_change_24h: string | number;
  volume_change_24h: string | number;
  rsi_14: string | number;
  ma_111: string | number;
  ma_distance_pct: string | number;
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
  candle_close_at: string;
  computed_at: string;
};

type CandleRecord = {
  timeframe: string;
  open_time: string;
  close_time: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
  source: string;
};

export class MarketAssetDetailNotFoundError extends Error {
  constructor(symbol: string) {
    super(`No market detail found for ${symbol}.`);
    this.name = "MarketAssetDetailNotFoundError";
  }
}

export async function getMarketAssetDetail(symbol: string, timeframe: Timeframe): Promise<MarketAssetDetail> {
  const normalizedSymbol = symbol.trim().replace(/^\$/, "").toUpperCase();
  const client = getSupabaseServerClient();

  if (client) {
    try {
      return await readSupabaseAssetDetail(client, normalizedSymbol, timeframe);
    } catch (error) {
      if (error instanceof MarketAssetDetailNotFoundError) throw error;
      console.warn("[crest] Falling back to mock asset detail.", getSafeErrorMessage(error));
    }
  }

  return getMockAssetDetail(normalizedSymbol, timeframe);
}

async function readSupabaseAssetDetail(client: SupabaseClient, symbol: string, timeframe: Timeframe): Promise<MarketAssetDetail> {
  const asset = await readAsset(client, symbol);
  if (!asset) throw new MarketAssetDetailNotFoundError(symbol);

  const [latestRow, historyRows, candleRows] = await Promise.all([
    readLatestSnapshot(client, asset.id, timeframe),
    readHistoryRows(client, asset.id, timeframe),
    readCandles(client, asset.id, timeframe)
  ]);

  if (!latestRow) throw new MarketAssetDetailNotFoundError(symbol);

  const latestSnapshot = mapAssetSnapshot(asset, latestRow, timeframe);
  const persistedHistory = dedupeHistoryPoints(historyRows.map((row) => mapHistoryPoint(row, timeframe)));
  const candles = candleRows.map(mapCandlePoint).sort((first, second) => first.time - second.time);
  const derivedHistory =
    persistedHistory.length >= 20 ? [] : deriveHistoryFromCandles(candles, latestSnapshot, timeframe, 20);
  const history = dedupeHistoryPoints([...persistedHistory, ...derivedHistory])
    .sort((first, second) => new Date(second.candleCloseAt).getTime() - new Date(first.candleCloseAt).getTime())
    .slice(0, 20);

  return {
    asset: mapUniverseAsset(asset),
    latestSnapshot,
    history,
    historySource: getHistorySource(persistedHistory.length, derivedHistory.length),
    candles,
    freshness: {
      timeframe,
      source: latestSnapshot.source,
      updatedAt: latestSnapshot.updatedAt,
      stalenessSeconds: Math.max(0, Math.floor((Date.now() - new Date(latestSnapshot.updatedAt).getTime()) / 1000)),
      isStale: isStale(timeframe, latestSnapshot.updatedAt),
      coverage: {
        covered: latestSnapshot.coverageStatus === "covered" ? 1 : 0,
        total: 1
      }
    }
  };
}

async function readAsset(client: SupabaseClient, symbol: string) {
  const { data, error } = await client
    .from("market_assets")
    .select("id, cmc_id, source_asset_id, symbol, name, rank, chain, sectors, source, metadata")
    .eq("source", "binance")
    .or(`symbol.eq.${symbol},source_asset_id.eq.${symbol}`)
    .maybeSingle<DetailAssetRecord>();

  if (error) throw error;
  return data;
}

async function readLatestSnapshot(client: SupabaseClient, assetId: string, timeframe: Timeframe) {
  const { data, error } = await client
    .from("market_snapshots")
    .select(getSnapshotSelect())
    .eq("asset_id", assetId)
    .eq("timeframe", timeframe)
    .eq("source", "binance")
    .maybeSingle<SnapshotRecord>();

  if (error) throw error;
  return data;
}

async function readHistoryRows(client: SupabaseClient, assetId: string, timeframe: Timeframe) {
  const { data, error } = await client
    .from("market_snapshot_history")
    .select(getSnapshotSelect())
    .eq("asset_id", assetId)
    .eq("timeframe", timeframe)
    .eq("source", "binance")
    .order("computed_at", { ascending: false })
    .limit(60);

  if (error) throw error;
  return (data || []) as unknown as SnapshotRecord[];
}

async function readCandles(client: SupabaseClient, assetId: string, timeframe: Timeframe) {
  const { data, error } = await client
    .from("ohlcv_candles")
    .select("timeframe, open_time, close_time, open, high, low, close, volume, source")
    .eq("asset_id", assetId)
    .eq("timeframe", timeframe)
    .eq("source", "binance")
    .order("open_time", { ascending: false })
    .limit(160);

  if (error) throw error;
  return (data || []) as CandleRecord[];
}

function getSnapshotSelect() {
  return `
    price,
    price_change_24h,
    volume_change_24h,
    rsi_14,
    ma_111,
    ma_distance_pct,
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
    candle_close_at,
    computed_at
  `;
}

function getMockAssetDetail(symbol: string, timeframe: Timeframe): MarketAssetDetail {
  const snapshot = getMockMarketSnapshot(timeframe);
  const latestSnapshot = snapshot.assets.find((asset) => asset.symbol === symbol);
  if (!latestSnapshot) throw new MarketAssetDetailNotFoundError(symbol);

  const candles = buildMockCandles(latestSnapshot, timeframe);
  const history = deriveHistoryFromCandles(candles, latestSnapshot, timeframe, 20);

  return {
    asset: latestSnapshot,
    latestSnapshot,
    history,
    historySource: "mock",
    candles,
    freshness: snapshot.freshness
  };
}

function mapUniverseAsset(asset: DetailAssetRecord): MarketUniverseAsset {
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
    source: toMarketDataSource(asset.source)
  };
}

function mapAssetSnapshot(asset: DetailAssetRecord, row: SnapshotRecord, timeframe: Timeframe): MarketAssetSnapshot {
  return {
    ...mapUniverseAsset(asset),
    timeframe,
    price: toNumber(row.price),
    priceChange24h: toNumber(row.price_change_24h),
    volumeChange24h: toNumber(row.volume_change_24h),
    rsi14: toNumber(row.rsi_14),
    ma111: toNumber(row.ma_111),
    maDistancePct: toNumber(row.ma_distance_pct),
    regime4h: toRegime(row.regime_4h),
    recommendation30m: toRecommendation(row.recommendation_30m),
    price4h: toNumber(row.price_4h),
    ma1114h: toNumber(row.ma_111_4h),
    maDistance4hPct: toNumber(row.ma_distance_4h_pct),
    rsi4h: toNumber(row.rsi_4h),
    rsi30m: toNumber(row.rsi_30m),
    signalReason: row.signal_reason || "",
    coverageStatus: toCoverageStatus(row.coverage_status),
    updatedAt: row.candle_close_at
  };
}

function mapHistoryPoint(row: SnapshotRecord, timeframe: Timeframe): MarketSnapshotHistoryPoint {
  return {
    timeframe,
    price: toNumber(row.price),
    priceChange24h: toNumber(row.price_change_24h),
    volumeChange24h: toNumber(row.volume_change_24h),
    rsi14: toNumber(row.rsi_14),
    ma111: toNumber(row.ma_111),
    maDistancePct: toNumber(row.ma_distance_pct),
    regime4h: toRegime(row.regime_4h),
    recommendation30m: toRecommendation(row.recommendation_30m),
    price4h: toNumber(row.price_4h),
    ma1114h: toNumber(row.ma_111_4h),
    maDistance4hPct: toNumber(row.ma_distance_4h_pct),
    rsi4h: toNumber(row.rsi_4h),
    rsi30m: toNumber(row.rsi_30m),
    signalReason: row.signal_reason || "",
    coverageStatus: toCoverageStatus(row.coverage_status),
    source: toMarketDataSource(row.source),
    candleCloseAt: row.candle_close_at,
    computedAt: row.computed_at
  };
}

function mapCandlePoint(row: CandleRecord): MarketCandlePoint {
  return {
    timeframe: toTimeframe(row.timeframe),
    time: Math.floor(new Date(row.open_time).getTime() / 1000),
    openTime: row.open_time,
    closeTime: row.close_time,
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    close: toNumber(row.close),
    volume: toNumber(row.volume),
    source: toMarketDataSource(row.source)
  };
}

function dedupeHistoryPoints(points: MarketSnapshotHistoryPoint[]) {
  const seen = new Set<string>();

  return [...points]
    .sort((first, second) => {
      const candleDelta = new Date(second.candleCloseAt).getTime() - new Date(first.candleCloseAt).getTime();
      if (candleDelta !== 0) return candleDelta;
      return new Date(second.computedAt).getTime() - new Date(first.computedAt).getTime();
    })
    .filter((point) => {
      const key = `${point.timeframe}:${point.candleCloseAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function deriveHistoryFromCandles(
  candles: MarketCandlePoint[],
  latestSnapshot: MarketAssetSnapshot,
  timeframe: Timeframe,
  limit: number
): MarketSnapshotHistoryPoint[] {
  const sorted = candles.sort((first, second) => first.time - second.time);
  const candidates = sorted.slice(-Math.max(limit + 111, limit));
  const latestBtcRegime4h = getLatestBtcRegime4h(latestSnapshot);

  return candidates
    .map((candle, index) => {
      const window = candidates.slice(0, index + 1).map(toOhlcvCandle);
      if (window.length < 111) return null;
      const indicator = deriveIndicatorValues(window, timeframe);
      const regime4h =
        timeframe === "4h" ? getRegime4hFromValues(indicator.price, indicator.ma111, indicator.rsi14) : latestSnapshot.regime4h;
      const recommendation30m =
        timeframe === "30m"
          ? getBtcGatedRecommendation30mFromValues(indicator.rsi14, latestBtcRegime4h)
          : getRecommendation30mFromValues(latestSnapshot.rsi30m, regime4h);

      return {
        timeframe,
        price: indicator.price,
        priceChange24h: indicator.priceChange24h,
        volumeChange24h: indicator.volumeChange24h,
        rsi14: indicator.rsi14,
        ma111: indicator.ma111,
        maDistancePct: indicator.maDistancePct,
        regime4h,
        recommendation30m,
        price4h: timeframe === "4h" ? indicator.price : latestSnapshot.price4h,
        ma1114h: timeframe === "4h" ? indicator.ma111 : latestSnapshot.ma1114h,
        maDistance4hPct: timeframe === "4h" ? indicator.maDistancePct : latestSnapshot.maDistance4hPct,
        rsi4h: timeframe === "4h" ? indicator.rsi14 : latestSnapshot.rsi4h,
        rsi30m: timeframe === "30m" ? indicator.rsi14 : latestSnapshot.rsi30m,
        signalReason: getDerivedSignalReason(timeframe, regime4h, recommendation30m, indicator.rsi14),
        coverageStatus: latestSnapshot.coverageStatus,
        source: candle.source,
        candleCloseAt: candle.closeTime,
        computedAt: candle.closeTime
      } satisfies MarketSnapshotHistoryPoint;
    })
    .filter((point): point is MarketSnapshotHistoryPoint => Boolean(point))
    .slice(-limit)
    .reverse();
}

function buildMockCandles(asset: MarketAssetSnapshot, timeframe: Timeframe): MarketCandlePoint[] {
  const intervalMs = timeframe === "30m" ? 30 * 60 * 1000 : 4 * 60 * 60 * 1000;
  const end = new Date(asset.updatedAt).getTime();
  const seed = asset.symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  let close = asset.price * 0.92;

  return Array.from({ length: 160 }, (_, index) => {
    const time = end - (159 - index) * intervalMs;
    const drift = Math.sin((index + seed) * 0.17) * 0.012 + Math.cos((index + seed) * 0.07) * 0.006;
    const open = close;
    close = Math.max(0.000001, open * (1 + drift));
    const wick = Math.abs(Math.sin((index + seed) * 0.31)) * 0.018;
    const high = Math.max(open, close) * (1 + wick);
    const low = Math.min(open, close) * (1 - wick);

    return {
      timeframe,
      time: Math.floor(time / 1000),
      openTime: new Date(time).toISOString(),
      closeTime: new Date(time + intervalMs).toISOString(),
      open: roundPrice(open),
      high: roundPrice(high),
      low: roundPrice(low),
      close: roundPrice(close),
      volume: Math.round((asset.quoteVolume24h || 1000000) * (0.6 + Math.abs(Math.sin(index * 0.4))) * 100) / 100,
      source: "mock"
    };
  });
}

function toOhlcvCandle(point: MarketCandlePoint): OhlcvCandle {
  return {
    symbol: "",
    timeframe: point.timeframe,
    openTime: point.openTime,
    closeTime: point.closeTime,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
    volume: point.volume,
    source: point.source
  };
}

function getDerivedSignalReason(
  timeframe: Timeframe,
  regime4h: Regime4h,
  recommendation30m: TradeRecommendation30m,
  rsi14: number
) {
  if (timeframe === "30m" && recommendation30m === "Long/Buy") return `Derived 30m setup: BTC 4h bullish and RSI ${rsi14.toFixed(1)} below 35.`;
  if (timeframe === "30m" && recommendation30m === "Short/Sell") return `Derived 30m setup: BTC 4h bearish and RSI ${rsi14.toFixed(1)} above 70.`;
  return `Derived ${timeframe} history point with ${regime4h.toLowerCase()} regime context.`;
}

function getLatestBtcRegime4h(latestSnapshot: MarketAssetSnapshot): Regime4h {
  if (latestSnapshot.signalReason.includes("BTC 4h bullish")) return "Bullish";
  if (latestSnapshot.signalReason.includes("BTC 4h bearish")) return "Bearish";
  return "Neutral";
}

function getHistorySource(persistedCount: number, derivedCount: number): MarketAssetDetail["historySource"] {
  if (persistedCount >= 20) return "persisted";
  if (persistedCount > 0 && derivedCount > 0) return "mixed";
  return "derived_from_ohlc";
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function toTimeframe(value: string): Timeframe {
  return value === "30m" ? "30m" : "4h";
}

function toRegime(value: string): Regime4h {
  return value === "Bullish" || value === "Bearish" ? value : "Neutral";
}

function toRecommendation(value: string): TradeRecommendation30m {
  return value === "Long/Buy" || value === "Short/Sell" ? value : "Wait";
}

function toCoverageStatus(value: string): AssetCoverageStatus {
  if (value === "covered" || value === "missing_pair" || value === "fetch_failed" || value === "partial") return value;
  return "fetch_failed";
}

function toMarketDataSource(value: unknown): MarketDataSource {
  return value === "coinmarketcap" || value === "binance" || value === "hybrid" ? value : "mock";
}

function toRankBasis(value: unknown): MarketUniverseAsset["rankBasis"] {
  if (value === "cmc_market_cap" || value === "binance_quote_volume_24h") return value;
  return "mock";
}

function toBlacklistStatus(value: unknown): MarketUniverseAsset["blacklistStatus"] {
  if (value === "allowed" || value === "excluded") return value;
  return "unknown";
}

function isStale(timeframe: Timeframe, value: string) {
  const thresholdSeconds = timeframe === "30m" ? 45 * 60 : 5 * 60 * 60;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000)) > thresholdSeconds;
}

function roundPrice(value: number) {
  if (value >= 100) return Math.round(value * 100) / 100;
  if (value >= 1) return Math.round(value * 10000) / 10000;
  return Math.round(value * 1000000) / 1000000;
}

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown market detail error.";
}
