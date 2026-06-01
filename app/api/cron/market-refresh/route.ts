import { getCronMarketTimeframes, runBinanceIngestion } from "@/lib/market/binance-ingestion";
import { readServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = readServerEnv("CRON_SECRET");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const timeframes = getCronMarketTimeframes();
  const result = await runBinanceIngestion(timeframes);

  return Response.json({
    ok: true,
    trigger: "vercel-cron",
    ...result
  });
}
