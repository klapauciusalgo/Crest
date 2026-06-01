import { runBinanceIngestion } from "@/lib/market/binance-ingestion";
import { readServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const ingestSecret = readServerEnv("CREST_INGEST_SECRET");

  if (!ingestSecret || authHeader !== `Bearer ${ingestSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runBinanceIngestion();

  return Response.json({
    ok: true,
    ...result
  });
}
