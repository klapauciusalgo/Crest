import {
  calculateBtcCorrelationScore,
  getBtcGatedRecommendation30mFromValues,
  getRegime4hFromValues,
  deriveIndicatorValues,
  round
} from "@/lib/market/indicators";
import { resolveAssetMetadata } from "@/lib/market/asset-metadata";
import { buildTimeframeBreadth } from "@/lib/market/breadth";
import { getMockMarketSnapshot } from "@/lib/market/mock-provider";
import type { Timeframe } from "@/lib/mock-data";
import type { MarketAssetSnapshot, MarketSnapshot, OhlcvCandle } from "@/lib/market/types";

type CandleMap = Map<string, OhlcvCandle[]>;
type BinanceExchangeSymbol = {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed: boolean;
};
type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent?: string;
  quoteVolume: string;
  count: number;
  closeTime: number;
};
type BinanceUniverseAsset = {
  symbol: string;
  marketSymbol: string;
  rank: number;
  quoteVolume24h: number;
  tradeCount24h: number;
  lastPrice: number;
  priceChange24h: number;
  updatedAt: string;
};

export type BinanceMarketSnapshotBundle = {
  candles: OhlcvCandle[];
  snapshots: MarketSnapshot[];
};

const binanceBaseUrls = ["https://data-api.binance.vision", "https://api.binance.com"];
const binanceUniverseSize = 300;
const candleFetchConcurrency = 32;
const excludedBaseAssets = new Set(
  [
    "USDT",
    "USDC",
    "FDUSD",
    "TUSD",
    "DAI",
    "USDP",
    "BUSD",
    "USDE",
    "SUSDE",
    "USD1",
    "RLUSD",
    "PYUSD",
    "XUSD",
    "EURI",
    "EUR",
    "AEUR",
    "PAXG",
    "XAUT",
    "WBETH",
    "WBTC",
    "AAPL",
    "AAPLX",
    "AMZN",
    "AMZNX",
    "COIN",
    "COINX",
    "CRCL",
    "CRCLX",
    "GOOGL",
    "GOOGLX",
    "META",
    "METAX",
    "MSFT",
    "MSFTX",
    "MSTR",
    "MSTRX",
    "NVDA",
    "NVDAX",
    "QQQ",
    "QQQX",
    "SPY",
    "SPYX",
    "TSLA",
    "TSLAX"
  ].map((symbol) => symbol.toUpperCase())
);

export async function buildBinanceMarketSnapshotBundle(): Promise<BinanceMarketSnapshotBundle> {
  const mock30m = getMockMarketSnapshot("30m");
  const universe = await fetchBinanceVolumeUniverse();
  const candles = await fetchUniverseCandles(universe);
  const candles4hBySymbol = groupCandles(candles.filter((candle) => candle.timeframe === "4h"));
  const candles30mBySymbol = groupCandles(candles.filter((candle) => candle.timeframe === "30m"));
  const assets4h = buildAssetsForTimeframe(universe, mock30m.assets, candles4hBySymbol, candles30mBySymbol, "4h");
  const assets30m = buildAssetsForTimeframe(universe, mock30m.assets, candles4hBySymbol, candles30mBySymbol, "30m");
  const updatedAt = new Date().toISOString();

  return {
    candles,
    snapshots: [
      {
        timeframe: "30m",
        assets: assets30m,
        breadth: buildTimeframeBreadth(assets30m, "30m", updatedAt),
        freshness: buildFreshness(assets30m, "30m", updatedAt)
      },
      {
        timeframe: "4h",
        assets: assets4h,
        breadth: buildTimeframeBreadth(assets4h, "4h", updatedAt),
        freshness: buildFreshness(assets4h, "4h", updatedAt)
      }
    ]
  };
}

async function fetchBinanceVolumeUniverse() {
  const [exchangeInfo, tickers] = await Promise.all([fetchExchangeInfo(), fetchTickerRows()]);
  const tickersBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));

  return exchangeInfo
    .filter(
      (item) =>
        item.status === "TRADING" &&
        item.quoteAsset === "USDT" &&
        item.isSpotTradingAllowed &&
        !isExcludedBaseAsset(item.baseAsset)
    )
    .map((item) => {
      const ticker = tickersBySymbol.get(item.symbol);
      if (!ticker) return null;

      return {
        symbol: item.baseAsset,
        marketSymbol: item.symbol,
        rank: 0,
        quoteVolume24h: Number(ticker.quoteVolume) || 0,
        tradeCount24h: Number(ticker.count) || 0,
        lastPrice: Number(ticker.lastPrice) || 0,
        priceChange24h: Number(ticker.priceChangePercent) || 0,
        updatedAt: new Date(Number(ticker.closeTime) || Date.now()).toISOString()
      };
    })
    .filter((item): item is BinanceUniverseAsset => item !== null && item.quoteVolume24h > 0 && item.lastPrice > 0)
    .sort((first, second) => second.quoteVolume24h - first.quoteVolume24h)
    .slice(0, binanceUniverseSize)
    .map((item, index) => ({
      ...item,
      rank: index + 1
    }));
}

async function fetchExchangeInfo() {
  const payload = await fetchBinanceJson("/api/v3/exchangeInfo", { permissions: "SPOT", symbolStatus: "TRADING" });
  const rows = payload && typeof payload === "object" && "symbols" in payload ? (payload.symbols as unknown) : [];
  return Array.isArray(rows) ? (rows as BinanceExchangeSymbol[]) : [];
}

async function fetchTickerRows() {
  const payload = await fetchBinanceJson("/api/v3/ticker/24hr", { type: "MINI", symbolStatus: "TRADING" });
  return Array.isArray(payload) ? (payload as BinanceTicker[]) : [];
}

async function fetchUniverseCandles(assets: BinanceUniverseAsset[]) {
  const candleSets = await mapWithConcurrency(assets, candleFetchConcurrency, async (asset) => {
      const [thirtyMinute, fourHour] = await Promise.all([
        fetchBinanceCandles(asset.symbol, asset.marketSymbol, "30m"),
        fetchBinanceCandles(asset.symbol, asset.marketSymbol, "4h")
      ]);

      return [...thirtyMinute, ...fourHour];
    });

  return candleSets.flat();
}

async function fetchBinanceCandles(symbol: string, marketSymbol: string, timeframe: Timeframe): Promise<OhlcvCandle[]> {
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
  const rows = await fetchBinanceJson("/api/v3/klines", { symbol: marketSymbol, interval: timeframe, limit: "160" });
  return Array.isArray(rows) ? rows : [];
}

function buildAssetsForTimeframe(
  universeAssets: BinanceUniverseAsset[],
  mock30mAssets: MarketAssetSnapshot[],
  candles4hBySymbol: CandleMap,
  candles30mBySymbol: CandleMap,
  timeframe: Timeframe
) {
  const mock30mBySymbol = new Map(mock30mAssets.map((asset) => [asset.symbol, asset]));
  const btcRegime4h = getBtcRegime4h(candles4hBySymbol);
  const correlationScores = buildBtcCorrelationScores(timeframe === "4h" ? candles4hBySymbol : candles30mBySymbol);

  return universeAssets.map((universeAsset) => {
    const knownAsset = mock30mBySymbol.get(universeAsset.symbol);
    const fallbackAsset = buildFallbackAsset(universeAsset, knownAsset);
    const candles4h = candles4hBySymbol.get(universeAsset.symbol) || [];
    const candles30m = candles30mBySymbol.get(universeAsset.symbol) || [];
    const has4h = candles4h.length >= 111;
    const has30m = candles30m.length >= 111;
    const indicator4h = has4h ? deriveIndicatorValues(candles4h, "4h") : fallbackAsset;
    const indicator30m = has30m ? deriveIndicatorValues(candles30m, "30m") : fallbackAsset;
    const activeIndicator = timeframe === "4h" ? indicator4h : indicator30m;
    const regime4h = getRegime4hFromValues(indicator4h.price, indicator4h.ma111, indicator4h.rsi14);
    const recommendation30m = getBtcGatedRecommendation30mFromValues(indicator30m.rsi14, btcRegime4h);
    const coverageStatus = has4h && has30m ? "covered" : has4h || has30m ? "partial" : "fetch_failed";
    const latestActiveCandle = (timeframe === "4h" ? candles4h : candles30m).at(-1);

    return {
      ...fallbackAsset,
      timeframe,
      price: activeIndicator.price,
      btcCorrelationScore: correlationScores.get(universeAsset.symbol) ?? null,
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
      signalReason: getSignalReason(indicator4h, indicator30m, regime4h, recommendation30m, coverageStatus, btcRegime4h),
      source: "binance",
      coverageStatus,
      updatedAt: latestActiveCandle?.closeTime || universeAsset.updatedAt
    } satisfies MarketAssetSnapshot;
  });
}

function buildBtcCorrelationScores(candlesBySymbol: CandleMap) {
  const btcCandles = candlesBySymbol.get("BTC") || [];
  const scores = new Map<string, number | null>();
  if (btcCandles.length < 2) return scores;

  for (const [symbol, candles] of candlesBySymbol.entries()) {
    scores.set(symbol, symbol === "BTC" ? 100 : calculateBtcCorrelationScore(candles, btcCandles));
  }

  return scores;
}

function getBtcRegime4h(candles4hBySymbol: CandleMap): MarketAssetSnapshot["regime4h"] {
  const btcCandles4h = candles4hBySymbol.get("BTC") || [];
  if (btcCandles4h.length < 111) return "Neutral";

  const btcIndicator4h = deriveIndicatorValues(btcCandles4h, "4h");
  return getRegime4hFromValues(btcIndicator4h.price, btcIndicator4h.ma111, btcIndicator4h.rsi14);
}

function buildFreshness(rows: MarketAssetSnapshot[], timeframe: Timeframe, updatedAt: string): MarketSnapshot["freshness"] {
  const covered = rows.filter((asset) => asset.coverageStatus === "covered").length;

  return {
    timeframe,
    source: "binance",
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
  coverageStatus: MarketAssetSnapshot["coverageStatus"],
  btcRegime4h: MarketAssetSnapshot["regime4h"]
) {
  if (coverageStatus === "fetch_failed") return "Binance pair is in the volume universe, but candle fetch did not return enough history yet.";
  if (coverageStatus === "partial") return "Binance candle coverage is partial; setup uses available data with BTC 4h regime as the global gate.";
  if (recommendation30m === "Long/Buy") return `BTC 4h bullish; Binance 30m RSI ${indicator30m.rsi14.toFixed(1)} is below 30.`;
  if (recommendation30m === "Short/Sell") return `BTC 4h bearish; Binance 30m RSI ${indicator30m.rsi14.toFixed(1)} is above 70.`;
  if (btcRegime4h === "Bullish") return "BTC 4h bullish; waiting for 30m RSI below 30.";
  if (btcRegime4h === "Bearish") return "BTC 4h bearish; waiting for 30m RSI above 70.";
  return `BTC 4h neutral; directional 30m setups paused. Asset 4h regime is ${regime4h.toLowerCase()} with price ${indicator4h.price.toFixed(4)} vs MA111 ${indicator4h.ma111.toFixed(4)}.`;
}

async function fetchBinanceJson(path: string, params: Record<string, string>) {
  for (const baseUrl of binanceBaseUrls) {
    try {
      const url = new URL(path, baseUrl);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }

      const response = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(12000) });
      if (!response.ok) continue;
      return (await response.json()) as unknown;
    } catch {
      continue;
    }
  }

  return null;
}

function buildFallbackAsset(universeAsset: BinanceUniverseAsset, knownAsset?: MarketAssetSnapshot): MarketAssetSnapshot {
  const metadata = resolveAssetMetadata(universeAsset.symbol);

  return {
    id: `binance-${universeAsset.symbol.toLowerCase()}`,
    sourceAssetId: universeAsset.symbol,
    cmcId: null,
    symbol: universeAsset.symbol,
    name: metadata.name || knownAsset?.name || universeAsset.symbol,
    rank: universeAsset.rank,
    rankBasis: "binance_quote_volume_24h",
    quoteVolume24h: round(universeAsset.quoteVolume24h),
    tradeCount24h: universeAsset.tradeCount24h,
    blacklistStatus: "allowed",
    chain: metadata.chain,
    sectors: metadata.sectors,
    source: "binance",
    timeframe: "30m",
    price: universeAsset.lastPrice,
    btcCorrelationScore: null,
    priceChange24h: round(universeAsset.priceChange24h),
    volumeChange24h: 0,
    rsi14: 50,
    ma111: universeAsset.lastPrice,
    maDistancePct: 0,
    regime4h: "Neutral",
    recommendation30m: "Wait",
    price4h: universeAsset.lastPrice,
    ma1114h: universeAsset.lastPrice,
    maDistance4hPct: 0,
    rsi4h: 50,
    rsi30m: 50,
    signalReason: "Waiting for Binance candle coverage.",
    coverageStatus: "fetch_failed",
    updatedAt: universeAsset.updatedAt
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function isExcludedBaseAsset(baseAsset: string) {
  const normalized = baseAsset.toUpperCase();
  return excludedBaseAssets.has(normalized);
}
