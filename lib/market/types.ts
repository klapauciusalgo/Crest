import type { ChainKey, Regime4h, SectorKey, Timeframe, TradeRecommendation30m } from "@/lib/mock-data";

export type AssetCoverageStatus = "covered" | "missing_pair" | "fetch_failed" | "partial";
export type MarketDataSource = "mock" | "coinmarketcap" | "binance" | "hybrid";

export type MarketUniverseAsset = {
  id: string;
  sourceAssetId: string;
  cmcId?: number | null;
  symbol: string;
  name: string;
  rank: number;
  rankBasis: "cmc_market_cap" | "binance_quote_volume_24h" | "mock";
  quoteVolume24h: number;
  tradeCount24h: number;
  blacklistStatus: "allowed" | "excluded" | "unknown";
  chain: ChainKey | string;
  sectors: Array<SectorKey | string>;
  source: MarketDataSource;
};

export type OhlcvCandle = {
  symbol: string;
  timeframe: Timeframe;
  openTime: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: MarketDataSource;
};

export type IndicatorSnapshot = {
  symbol: string;
  timeframe: Timeframe;
  price: number;
  priceChange24h: number;
  volumeChange24h: number;
  rsi14: number;
  ma111: number;
  maDistancePct: number;
  regime4h: Regime4h;
  recommendation30m: TradeRecommendation30m;
  coverageStatus: AssetCoverageStatus;
  source: MarketDataSource;
  updatedAt: string;
};

export type MarketAssetSnapshot = MarketUniverseAsset &
  IndicatorSnapshot & {
    price4h: number;
    ma1114h: number;
    maDistance4hPct: number;
    rsi4h: number;
    rsi30m: number;
    signalReason: string;
  };

export type MarketBreadthSnapshot = {
  timeframe: Timeframe;
  universe: "Top 100" | "Top 200" | "Top 300";
  metricKind: "regime" | "setup";
  averageRsi: number;
  positiveLabel: string;
  negativeLabel: string;
  neutralLabel: string;
  positiveCount: number;
  negativeCount: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  coverageCount: number;
  updatedAt: string;
};

export type DataFreshness = {
  timeframe: Timeframe;
  source: MarketDataSource;
  updatedAt: string;
  stalenessSeconds: number;
  isStale: boolean;
  coverage: {
    covered: number;
    total: number;
  };
};

export type MarketSnapshot = {
  timeframe: Timeframe;
  assets: MarketAssetSnapshot[];
  breadth: MarketBreadthSnapshot[];
  freshness: DataFreshness;
};

export type MarketSnapshotHistoryPoint = Pick<
  IndicatorSnapshot,
  | "timeframe"
  | "price"
  | "priceChange24h"
  | "volumeChange24h"
  | "rsi14"
  | "ma111"
  | "maDistancePct"
  | "regime4h"
  | "recommendation30m"
  | "coverageStatus"
  | "source"
> & {
  price4h: number;
  ma1114h: number;
  maDistance4hPct: number;
  rsi4h: number;
  rsi30m: number;
  signalReason: string;
  candleCloseAt: string;
  computedAt: string;
};

export type MarketCandlePoint = {
  timeframe: Timeframe;
  time: number;
  openTime: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: MarketDataSource;
};

export type MarketAssetDetail = {
  asset: MarketUniverseAsset;
  latestSnapshot: MarketAssetSnapshot;
  history: MarketSnapshotHistoryPoint[];
  historySource: "persisted" | "mixed" | "derived_from_ohlc" | "mock";
  candles: MarketCandlePoint[];
  freshness: DataFreshness;
};

export type MarketDataProvider = {
  getSnapshot(timeframe: Timeframe): Promise<MarketSnapshot>;
};
