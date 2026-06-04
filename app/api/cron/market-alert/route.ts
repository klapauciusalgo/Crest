import { sendLatestThirtyMinuteMarketAlert } from "@/lib/notifications/market-alert";
import { readServerEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = readServerEnv("CRON_SECRET");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notification = await sendLatestThirtyMinuteMarketAlert();

  return Response.json({
    ok: notification.status !== "failed",
    trigger: "telegram-market-alert",
    notification
  });
}
