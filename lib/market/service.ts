import type { Timeframe } from "@/lib/mock-data";
import { getMarketDataProvider } from "@/lib/market/provider";
import type { MarketSnapshot } from "@/lib/market/types";

export function parseTimeframe(value: string | null): Timeframe {
  return value === "30m" ? "30m" : "4h";
}

export async function getMarketSnapshot(timeframe: Timeframe): Promise<MarketSnapshot> {
  return getMarketDataProvider().getSnapshot(timeframe);
}
