import {
  getRecommendation30mFromValues,
  getRegime4hFromValues,
  deriveIndicatorValues,
  round
} from "@/lib/market/indicators";
import { getMockMarketSnapshot } from "@/lib/market/mock-provider";
import type { Timeframe } from "@/lib/mock-data";
import type { MarketAssetSnapshot, MarketSnapshot, OhlcvCandle } from "@/lib/market/types";

type CandleMap = Map<string, OhlcvCandle[]>;

export type BinanceMarketSnapshotBundle = {
  candles: OhlcvCandle[];
  snapshots: MarketSnapshot[];
};

const binanceSymbolOverrides: Record<string, string> = {
  MATIC: "POLUSDT"
};
const binanceBaseUrls = ["https://data-api.binance.vision", "https://api.binance.com"];

export async function buildBinanceMarketSnapshotBundle(): Promise<BinanceMarketSnapshotBundle> {
  const mock4h = getMockMarketSnapshot("4h");
  const mock30m = getMockMarketSnapshot("30m");
  const candles = await fetchUniverseCandles(mock4h.assets);
  const candles4hBySymbol = groupCandles(candles.filter((candle) => candle.timeframe === "4h"));
  const candles30mBySymbol = groupCandles(candles.filter((candle) => candle.timeframe === "30m"));
  const assets4h = buildAssetsForTimeframe(mock4h.assets, mock30m.assets, candles4hBySymbol, candles30mBySymbol, "4h");
  const assets30m = buildAssetsForTimeframe(mock4h.assets, mock30m.assets, candles4hBySymbol, candles30mBySymbol, "30m");
  const updatedAt = new Date().toISOString();

  return {
    candles,
    snapshots: [
      {
        timeframe: "30m",
        assets: assets30m,
        breadth: buildBreadth(assets30m, "30m", updatedAt),
        freshness: buildFreshness(assets30m, "30m", updatedAt)
      },
      {
        timeframe: "4h",
        assets: assets4h,
        breadth: buildBreadth(assets4h, "4h", updatedAt),
        freshness: buildFreshness(assets4h, "4h", updatedAt)
      }
    ]
  };
}

async function fetchUniverseCandles(assets: MarketAssetSnapshot[]) {
  const candleSets = await Promise.all(
    assets.map(async (asset) => {
      const [thirtyMinute, fourHour] = await Promise.all([
        fetchBinanceCandles(asset.symbol, "30m"),
        fetchBinanceCandles(asset.symbol, "4h")
      ]);

      return [...thirtyMinute, ...fourHour];
    })
  );

  return candleSets.flat();
}

async function fetchBinanceCandles(symbol: string, timeframe: Timeframe): Promise<OhlcvCandle[]> {
  const marketSymbol = binanceSymbolOverrides[symbol] || `${symbol}USDT`;
  const rows = await fetchKlineRows(marketSymbol, timeframe);
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 6)
    .map((row) => ({
      symbol,
      timeframe,
      openTime: new Date(Number(row[0])).toISOString(),
      closeTime: new Date(Number(row[6])).toISOString(),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      source: "binance"
    }));
}

async function fetchKlineRows(marketSymbol: string, timeframe: Timeframe): Promise<unknown[]> {
  for (const baseUrl of binanceBaseUrls) {
    try {
      const url = new URL("/api/v3/klines", baseUrl);
      url.searchParams.set("symbol", marketSymbol);
      url.searchParams.set("interval", timeframe);
      url.searchParams.set("limit", "160");

      const response = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) continue;

      const rows = (await response.json()) as unknown;
      if (Array.isArray(rows)) return rows;
    } catch {
      continue;
    }
  }

  return [];
}

function buildAssetsForTimeframe(
  mock4hAssets: MarketAssetSnapshot[],
  mock30mAssets: MarketAssetSnapshot[],
  candles4hBySymbol: CandleMap,
  candles30mBySymbol: CandleMap,
  timeframe: Timeframe
) {
  const mock4hBySymbol = new Map(mock4hAssets.map((asset) => [asset.symbol, asset]));
  const mock30mBySymbol = new Map(mock30mAssets.map((asset) => [asset.symbol, asset]));

  return mock4hAssets.map((asset4h) => {
    const asset30m = mock30mBySymbol.get(asset4h.symbol) || asset4h;
    const candles4h = candles4hBySymbol.get(asset4h.symbol) || [];
    const candles30m = candles30mBySymbol.get(asset4h.symbol) || [];
    const has4h = candles4h.length >= 111;
    const has30m = candles30m.length >= 111;
    const indicator4h = has4h ? deriveIndicatorValues(candles4h, "4h") : asset4h;
    const indicator30m = has30m ? deriveIndicatorValues(candles30m, "30m") : asset30m;
    const activeIndicator = timeframe === "4h" ? indicator4h : indicator30m;
    const regime4h = getRegime4hFromValues(indicator4h.price, indicator4h.ma111, indicator4h.rsi14);
    const recommendation30m = getRecommendation30mFromValues(indicator30m.rsi14, regime4h);
    const source = has4h || has30m ? "hybrid" : "mock";
    const coverageStatus = has4h && has30m ? "covered" : has4h || has30m ? "partial" : "missing_pair";
    const latestActiveCandle = (timeframe === "4h" ? candles4h : candles30m).at(-1);

    return {
      ...asset4h,
      timeframe,
      price: activeIndicator.price,
      priceChange24h: activeIndicator.priceChange24h,
      volumeChange24h: activeIndicator.volumeChange24h,
      rsi14: activeIndicator.rsi14,
      ma111: activeIndicator.ma111,
      maDistancePct: activeIndicator.maDistancePct,
      regime4h,
      recommendation30m,
      price4h: indicator4h.price,
      ma1114h: indicator4h.ma111,
      maDistance4hPct: indicator4h.maDistancePct,
      rsi4h: indicator4h.rsi14,
      rsi30m: indicator30m.rsi14,
      signalReason: getSignalReason(indicator4h, indicator30m, regime4h, recommendation30m, coverageStatus),
      source,
      coverageStatus,
      updatedAt: latestActiveCandle?.closeTime || new Date().toISOString()
    } satisfies MarketAssetSnapshot;
  });
}

function buildBreadth(rows: MarketAssetSnapshot[], timeframe: Timeframe, updatedAt: string) {
  const ranges = [100, 200, 300] as const;

  return ranges.map((range) => {
    const syntheticRows = Array.from({ length: range }, (_, index) => rows[index % rows.length]);
    const bullishCount = syntheticRows.filter((asset) => asset.regime4h === "Bullish").length;
    const bearishCount = syntheticRows.filter((asset) => asset.regime4h === "Bearish").length;

    return {
      timeframe,
      universe: `Top ${range}` as const,
      averageRsi: round(average(syntheticRows.map((asset) => asset.rsi14))),
      bullishCount,
      bearishCount,
      neutralCount: range - bullishCount - bearishCount,
      coverageCount: rows.filter((asset) => asset.coverageStatus === "covered").length,
      updatedAt
    };
  });
}

function buildFreshness(rows: MarketAssetSnapshot[], timeframe: Timeframe, updatedAt: string): MarketSnapshot["freshness"] {
  const covered = rows.filter((asset) => asset.coverageStatus === "covered").length;

  return {
    timeframe,
    source: "hybrid",
    updatedAt,
    stalenessSeconds: 0,
    isStale: false,
    coverage: {
      covered,
      total: rows.length
    }
  };
}

function groupCandles(candles: OhlcvCandle[]) {
  const grouped = new Map<string, OhlcvCandle[]>();
  for (const candle of candles) {
    const rows = grouped.get(candle.symbol) || [];
    rows.push(candle);
    grouped.set(candle.symbol, rows);
  }
  return grouped;
}

function getSignalReason(
  indicator4h: Pick<MarketAssetSnapshot, "price" | "ma111" | "rsi14">,
  indicator30m: Pick<MarketAssetSnapshot, "rsi14">,
  regime4h: MarketAssetSnapshot["regime4h"],
  recommendation30m: MarketAssetSnapshot["recommendation30m"],
  coverageStatus: MarketAssetSnapshot["coverageStatus"]
) {
  if (coverageStatus === "missing_pair") return "No Binance USDT pair found yet; retained in coverage as missing pair.";
  if (recommendation30m === "Long/Buy") return `4h bullish; Binance 30m RSI ${indicator30m.rsi14.toFixed(1)} is below 35.`;
  if (recommendation30m === "Short/Sell") return `4h bearish; Binance 30m RSI ${indicator30m.rsi14.toFixed(1)} is above 70.`;
  if (regime4h === "Bullish") return "4h bullish from Binance candles; waiting for 30m RSI below 35.";
  if (regime4h === "Bearish") return "4h bearish from Binance candles; waiting for 30m RSI above 70.";
  return `4h neutral from Binance candles; price ${indicator4h.price.toFixed(4)} vs MA111 ${indicator4h.ma111.toFixed(4)}.`;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
