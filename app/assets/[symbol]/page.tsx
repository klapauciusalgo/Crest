import { notFound } from "next/navigation";
import { AssetDetailPage } from "@/components/asset-detail-page";
import { getMarketAssetDetail, MarketAssetDetailNotFoundError } from "@/lib/market/detail";
import { parseTimeframe } from "@/lib/market/service";

export const dynamic = "force-dynamic";

export default async function AssetPage({
  params,
  searchParams
}: {
  params: { symbol: string };
  searchParams: { timeframe?: string };
}) {
  const timeframe = parseTimeframe(searchParams.timeframe || null);

  try {
    const detail = await getMarketAssetDetail(params.symbol, timeframe);
    return <AssetDetailPage initialDetail={detail} initialTimeframe={timeframe} />;
  } catch (error) {
    if (error instanceof MarketAssetDetailNotFoundError) {
      notFound();
    }

    throw error;
  }
}
