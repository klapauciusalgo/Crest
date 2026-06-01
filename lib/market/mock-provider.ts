import {
  chainColors,
  enrichAssetsWithSignals,
  getMockAssets,
  type ChainKey,
  type SectorKey,
  type Timeframe
} from "@/lib/mock-data";
import type { MarketAssetSnapshot, MarketBreadthSnapshot, MarketDataProvider, MarketSnapshot } from "@/lib/market/types";

const pageUniverse = [100, 200, 300] as const;

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
    cmcId: index + 1,
    rank: index + 1,
    source: "mock",
    coverageStatus: "covered",
    updatedAt
  }));

  return {
    timeframe,
    assets,
    breadth: getMarketBreadth(assets, timeframe, updatedAt),
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

function getMarketBreadth(rows: MarketAssetSnapshot[], timeframe: Timeframe, updatedAt: string): MarketBreadthSnapshot[] {
  return pageUniverse.map((range) => {
    const syntheticRows = Array.from({ length: range }, (_, index) => {
      const base = rows[index % rows.length];
      const bandDrift = range === 100 ? 2.4 : range === 200 ? 0 : -2.8;
      const rsi = clamp(base.rsi14 + Math.sin((index + 1) * 1.47) * 6 + bandDrift, 0, 100);
      const maDistance = base.maDistancePct + Math.cos((index + 1) * 0.91) * 3 + bandDrift * 0.35;

      if (maDistance > 0 && rsi > 55) return "Bullish";
      if (maDistance < 0 && rsi < 50) return "Bearish";
      return "Neutral";
    });
    const averageRsi = average(
      Array.from({ length: range }, (_, index) => {
        const base = rows[index % rows.length];
        const bandDrift = range === 100 ? 2.4 : range === 200 ? 0 : -2.8;
        return clamp(base.rsi14 + Math.sin((index + 1) * 1.47) * 6 + bandDrift, 0, 100);
      })
    );
    const bullishCount = syntheticRows.filter((value) => value === "Bullish").length;
    const bearishCount = syntheticRows.filter((value) => value === "Bearish").length;

    return {
      timeframe,
      universe: `Top ${range}` as MarketBreadthSnapshot["universe"],
      averageRsi,
      bullishCount,
      bearishCount,
      neutralCount: range - bullishCount - bearishCount,
      coverageCount: rows.length,
      updatedAt
    };
  });
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

function average(values: number[]) {
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export const supportedMockChains = Object.keys(chainColors) as ChainKey[];
export const supportedMockSectors: SectorKey[] = ["Layer 1", "DeFi", "AI", "CEX", "DEX", "Perps", "Meme", "Yield", "Infra"];
