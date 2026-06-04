import { runBinanceIngestion } from "@/lib/market/binance-ingestion";
import { maybeSendThirtyMinuteMarketAlert } from "@/lib/notifications/market-alert";
import { readServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const ingestSecret = readServerEnv("CREST_INGEST_SECRET");

  if (!ingestSecret || authHeader !== `Bearer ${ingestSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const result = await runBinanceIngestion();
  const notification = await maybeSendThirtyMinuteMarketAlert(result.timeframes, url.searchParams.get("notify"));

  return Response.json({
    ok: true,
    notification,
    ...result
  });
}
