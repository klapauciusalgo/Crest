import { getMarketSnapshot } from "@/lib/market/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const [thirtyMinute, fourHour] = await Promise.all([getMarketSnapshot("30m"), getMarketSnapshot("4h")]);

  return Response.json({
    data: [thirtyMinute.freshness, fourHour.freshness]
  });
}
