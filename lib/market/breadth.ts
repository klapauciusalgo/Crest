import type { Timeframe } from "@/lib/mock-data";
import type { MarketAssetSnapshot, MarketBreadthSnapshot } from "@/lib/market/types";

const breadthRanges = [100, 200, 300] as const;

export function buildTimeframeBreadth(
  rows: MarketAssetSnapshot[],
  timeframe: Timeframe,
  updatedAt: string
): MarketBreadthSnapshot[] {
  return breadthRanges.map((range) => {
    const universeRows = rows.slice(0, range);
    const metricKind = timeframe === "4h" ? "regime" : "setup";
    const positiveCount =
      metricKind === "regime"
        ? universeRows.filter((asset) => asset.regime4h === "Bullish").length
        : universeRows.filter((asset) => asset.recommendation30m === "Long/Buy").length;
    const negativeCount =
      metricKind === "regime"
        ? universeRows.filter((asset) => asset.regime4h === "Bearish").length
        : universeRows.filter((asset) => asset.recommendation30m === "Short/Sell").length;
    const neutralCount = universeRows.length - positiveCount - negativeCount;

    return {
      timeframe,
      universe: `Top ${range}`,
      metricKind,
      averageRsi: roundOne(average(universeRows.map((asset) => asset.rsi14))),
      positiveLabel: metricKind === "regime" ? "Bullish" : "Long/Buy",
      negativeLabel: metricKind === "regime" ? "Bearish" : "Short/Sell",
      neutralLabel: metricKind === "regime" ? "Neutral" : "Wait",
      positiveCount,
      negativeCount,
      neutralCount,
      bullishCount: positiveCount,
      bearishCount: negativeCount,
      coverageCount: universeRows.filter((asset) => asset.coverageStatus === "covered").length,
      updatedAt
    };
  });
}

export function withBreadthSemantics(snapshot: Omit<MarketBreadthSnapshot, "metricKind" | "positiveLabel" | "negativeLabel" | "neutralLabel" | "positiveCount" | "negativeCount">): MarketBreadthSnapshot {
  const metricKind = snapshot.timeframe === "4h" ? "regime" : "setup";

  return {
    ...snapshot,
    metricKind,
    positiveLabel: metricKind === "regime" ? "Bullish" : "Long/Buy",
    negativeLabel: metricKind === "regime" ? "Bearish" : "Short/Sell",
    neutralLabel: metricKind === "regime" ? "Neutral" : "Wait",
    positiveCount: snapshot.bullishCount,
    negativeCount: snapshot.bearishCount
  };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
