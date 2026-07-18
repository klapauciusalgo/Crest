import type { Timeframe } from "@/lib/mock-data";
import type { MarketSnapshot } from "@/lib/market/types";

export type AiProviderStatus = "active" | "disabled";
export type AiProviderType = "openai_compatible";
export type AiTestStatus = "ok" | "failed" | null;

export type AiProviderConfig = {
  id: string;
  providerName: string;
  providerType: AiProviderType;
  baseUrl: string;
  model: string;
  apiKeyHint: string | null;
  status: AiProviderStatus;
  maxTokens: number;
  temperature: number;
  lastTestedAt: string | null;
  lastTestStatus: AiTestStatus;
  lastTestError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiProviderConfigWithSecret = AiProviderConfig & {
  encryptedApiKey: string;
};

export type AiSettings = {
  weeklyPromptLimit: number;
  resetTimezone: "Asia/Jakarta";
  systemPrompt: string;
  updatedAt: string | null;
};

export type AiUsageQuota = {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
  weekStart: string;
};

export type AiContextRequest = {
  timeframe: Timeframe;
  activePreset?: string;
  filters?: {
    chains?: string[];
    searchQuery?: string;
    rsiRange?: [number, number];
    maDistanceRange?: [number, number];
  };
  sort?: {
    key?: string;
    direction?: string;
  };
  pinnedAssets?: string[];
};

export type AiMarketContext = {
  timeframe: Timeframe;
  btcRegime4h: string;
  dataStatus: {
    source: string;
    lastUpdated: string;
    isStale: boolean;
    coverage: {
      covered: number;
      total: number;
    };
  };
  activePreset: string;
  filterState: NonNullable<AiContextRequest["filters"]>;
  sort: NonNullable<AiContextRequest["sort"]>;
  marketBreadth: MarketSnapshot["breadth"];
  multiTimeframeRules: {
    regime4h: {
      bullish: string;
      bearish: string;
      neutral: string;
    };
    recommendation30m: {
      globalGate: string;
      longBuy: string;
      shortSell: string;
      wait: string;
    };
  };
  signalSummary: {
    bullish: number;
    bearish: number;
    neutral: number;
    longBuy: number;
    shortSell: number;
    wait: number;
  };
  chainSummary: Array<{
    chain: string;
    assets: number;
    averageRsi: number;
    averagePriceChange24h: number;
    averageVolumeChange24h: number;
    gainers: number;
    losers: number;
  }>;
  sectorSummary: Array<{
    sector: string;
    assets: number;
    leader: string | null;
    averageRsi: number;
    averagePriceChange24h: number;
    averageVolumeChange24h: number;
    gainers: number;
    losers: number;
  }>;
  assets: Array<{
    rank: number;
    symbol: string;
    name: string;
    chain: string;
    sectors: string[];
    price: number;
    priceChange24h: number;
    rsi14: number;
    rsi4h: number;
    rsi30m: number;
    ma111: number;
    maDistancePct: number;
    regime4h: string;
    recommendation30m: string;
    volumeChange24h: number;
    quoteVolume24h: number;
    signalReason: string;
    updatedAt: string;
  }>;
  pinnedAssets: string[];
};

export type AiChatRequest = AiContextRequest & {
  message: string;
  threadId?: string;
};

export type AiChatResponse = {
  answer: string;
  context: AiMarketContext;
  provider: {
    id: string;
    providerName: string;
    model: string;
  };
  quota: AiUsageQuota;
  threadId: string | null;
};
