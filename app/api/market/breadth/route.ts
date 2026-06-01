import { getMarketSnapshot, parseTimeframe } from "@/lib/market/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const timeframe = parseTimeframe(url.searchParams.get("timeframe"));
  const snapshot = await getMarketSnapshot(timeframe);

  return Response.json({
    data: snapshot.breadth,
    freshness: snapshot.freshness
  });
}
