import { buildBinanceMarketSnapshotBundle } from "@/lib/market/binance-provider";
import { writeMarketSnapshotToSupabase, writeOhlcvCandlesToSupabase } from "@/lib/market/supabase-writer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const ingestSecret = process.env.CREST_INGEST_SECRET;

  if (!ingestSecret || authHeader !== `Bearer ${ingestSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bundle = await buildBinanceMarketSnapshotBundle();
  const snapshotResults = await Promise.all(bundle.snapshots.map((snapshot) => writeMarketSnapshotToSupabase(snapshot)));
  const candleCount = await writeOhlcvCandlesToSupabase(bundle.candles);

  return Response.json({
    ok: true,
    candles: candleCount,
    results: snapshotResults
  });
}
