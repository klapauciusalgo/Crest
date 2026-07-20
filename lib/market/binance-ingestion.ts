import type { Timeframe } from "@/lib/mock-data";
import { buildBinanceMarketSnapshotBundle } from "@/lib/market/binance-provider";
import { writeMarketSnapshotToSupabase, writeOhlcvCandlesToSupabase } from "@/lib/market/supabase-writer";
import { discoverTradingVenueAvailability } from "@/lib/market/venue-discovery";
import { writeVenueAvailabilityToSupabase, type VenueAvailabilityWriteResult } from "@/lib/market/venue-writer";

export type BinanceIngestionResult = {
  candles: number;
  results: Awaited<ReturnType<typeof writeMarketSnapshotToSupabase>>[];
  timeframes: Timeframe[];
  venueAvailability: VenueAvailabilityWriteResult | null;
  venueWarning: string | null;
};

export async function runBinanceIngestion(timeframes: Timeframe[] = ["30m", "4h"]): Promise<BinanceIngestionResult> {
  const uniqueTimeframes = Array.from(new Set(timeframes));
  const bundle = await buildBinanceMarketSnapshotBundle();
  const snapshots = bundle.snapshots.filter((snapshot) => uniqueTimeframes.includes(snapshot.timeframe));
  const candles = bundle.candles.filter((candle) => uniqueTimeframes.includes(candle.timeframe));
  const universeAssets = bundle.snapshots[0]?.assets || [];
  const venueDiscoveryPromise = discoverTradingVenueAvailability(universeAssets);
  const results = await Promise.all(snapshots.map((snapshot) => writeMarketSnapshotToSupabase(snapshot)));
  const candleCount = await writeOhlcvCandlesToSupabase(candles);
  let venueAvailability: VenueAvailabilityWriteResult | null = null;
  let venueWarning: string | null = null;

  try {
    const discovery = await venueDiscoveryPromise;
    venueAvailability = await writeVenueAvailabilityToSupabase(universeAssets, discovery);
  } catch (error) {
    venueWarning = getSafeErrorMessage(error);
    console.warn("[crest] Venue availability sync failed without blocking market ingestion.", venueWarning);
  }

  return {
    candles: candleCount,
    results,
    timeframes: uniqueTimeframes,
    venueAvailability,
    venueWarning
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

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown venue availability error";
}
