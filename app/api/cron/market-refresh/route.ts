import { getCronMarketTimeframes, runBinanceIngestion } from "@/lib/market/binance-ingestion";
import { sendLatestThirtyMinuteMarketAlert, type MarketAlertResult } from "@/lib/notifications/market-alert";
import { readServerEnv } from "@/lib/supabase/server";
import type { Timeframe } from "@/lib/mock-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = readServerEnv("CRON_SECRET");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const timeframes = parseRequestedTimeframes(url.searchParams.get("timeframes")) || getCronMarketTimeframes();
  const result = await runBinanceIngestion(timeframes);
  const notification = await maybeSendTelegramNotification(timeframes, url.searchParams.get("notify"));

  return Response.json({
    ok: true,
    trigger: "vercel-cron",
    notification,
    ...result
  });
}

function parseRequestedTimeframes(value: string | null): Timeframe[] | null {
  if (value === "all") return ["30m", "4h"];
  if (value === "30m") return ["30m"];
  if (value === "4h") return ["4h"];
  return null;
}

async function maybeSendTelegramNotification(timeframes: Timeframe[], notifyParam: string | null): Promise<MarketAlertResult> {
  if (notifyParam === "false" || !timeframes.includes("30m")) {
    return {
      status: "skipped",
      reason: "no_30m_refresh"
    };
  }

  return sendLatestThirtyMinuteMarketAlert();
}
