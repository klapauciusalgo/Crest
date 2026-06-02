import {
  chainColors,
  enrichAssetsWithSignals,
  getMockAssets,
  type ChainKey,
  type SectorKey,
  type Timeframe
} from "@/lib/mock-data";
import { buildTimeframeBreadth } from "@/lib/market/breadth";
import type { MarketAssetSnapshot, MarketDataProvider, MarketSnapshot } from "@/lib/market/types";

export function createMockMarketProvider(): MarketDataProvider {
  return {
    async getSnapshot(timeframe) {
      return getMockMarketSnapshot(timeframe);
    }
  };
}

export function getMockMarketSnapshot(timeframe: Timeframe): MarketSnapshot {
  const assets4h = getMockAssets("4h");
  const assets30m = getMockAssets("30m");
  const activeAssets = timeframe === "4h" ? assets4h : assets30m;
  const enriched = enrichAssetsWithSignals(activeAssets, assets4h, assets30m);
  const updatedAt = getMockUpdatedAt(timeframe);
  const assets: MarketAssetSnapshot[] = enriched.map((asset, index) => ({
    ...asset,
    timeframe,
    id: `mock-${asset.symbol.toLowerCase()}`,
    sourceAssetId: asset.symbol,
    cmcId: index + 1,
    rank: index + 1,
    rankBasis: "mock",
    quoteVolume24h: 0,
    tradeCount24h: 0,
    blacklistStatus: "allowed",
    source: "mock",
    coverageStatus: "covered",
    updatedAt
  }));

  return {
    timeframe,
    assets,
    breadth: buildTimeframeBreadth(assets, timeframe, updatedAt),
    freshness: {
      timeframe,
      source: "mock",
      updatedAt,
      stalenessSeconds: Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000)),
      isStale: false,
      coverage: {
        covered: assets.length,
        total: assets.length
      }
    }
  };
}

function getMockUpdatedAt(timeframe: Timeframe) {
  const now = new Date();
  const intervalMinutes = timeframe === "30m" ? 30 : 240;
  const roundedMinutes = Math.floor(now.getUTCMinutes() / intervalMinutes) * intervalMinutes;
  const updatedAt = new Date(now);
  updatedAt.setUTCMinutes(roundedMinutes, 0, 0);
  if (timeframe === "4h") {
    updatedAt.setUTCHours(Math.floor(now.getUTCHours() / 4) * 4, 2, 0, 0);
  }
  return updatedAt.toISOString();
}

export const supportedMockChains = Object.keys(chainColors) as ChainKey[];
export const supportedMockSectors: SectorKey[] = ["Layer 1", "DeFi", "AI", "CEX", "DEX", "Perps", "Meme", "Yield", "Infra"];
