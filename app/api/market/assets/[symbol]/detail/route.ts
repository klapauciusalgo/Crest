import { getMarketAssetDetail, MarketAssetDetailNotFoundError } from "@/lib/market/detail";
import { parseTimeframe } from "@/lib/market/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { symbol: string } }) {
  const url = new URL(request.url);
  const timeframe = parseTimeframe(url.searchParams.get("timeframe"));

  try {
    const detail = await getMarketAssetDetail(params.symbol, timeframe);
    return Response.json({ data: detail });
  } catch (error) {
    if (error instanceof MarketAssetDetailNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }

    return Response.json({ error: "Market asset detail is unavailable." }, { status: 500 });
  }
}
