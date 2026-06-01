import type { Timeframe } from "@/lib/mock-data";
import { buildBinanceMarketSnapshotBundle } from "@/lib/market/binance-provider";
import { writeMarketSnapshotToSupabase, writeOhlcvCandlesToSupabase } from "@/lib/market/supabase-writer";

export type BinanceIngestionResult = {
  candles: number;
  results: Awaited<ReturnType<typeof writeMarketSnapshotToSupabase>>[];
  timeframes: Timeframe[];
};

export async function runBinanceIngestion(timeframes: Timeframe[] = ["30m", "4h"]): Promise<BinanceIngestionResult> {
  const uniqueTimeframes = Array.from(new Set(timeframes));
  const bundle = await buildBinanceMarketSnapshotBundle();
  const snapshots = bundle.snapshots.filter((snapshot) => uniqueTimeframes.includes(snapshot.timeframe));
  const candles = bundle.candles.filter((candle) => uniqueTimeframes.includes(candle.timeframe));
  const results = await Promise.all(snapshots.map((snapshot) => writeMarketSnapshotToSupabase(snapshot)));
  const candleCount = await writeOhlcvCandlesToSupabase(candles);

  return {
    candles: candleCount,
    results,
    timeframes: uniqueTimeframes
  };
}

export function getCronMarketTimeframes(now = new Date()): Timeframe[] {
  const timeframes: Timeframe[] = ["30m"];
  const isFourHourBoundary = now.getUTCMinutes() < 30 && now.getUTCHours() % 4 === 0;

  if (isFourHourBoundary) {
    timeframes.push("4h");
  }

  return timeframes;
}
