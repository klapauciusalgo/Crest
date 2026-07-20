import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketUniverseAsset } from "@/lib/market/types";
import type { VenueDiscoveryResult, VenueDiscoveryScope, VenueListingInput } from "@/lib/market/venue-discovery";
import { getSupabaseServerClient, getSupabaseServerConfig } from "@/lib/supabase/server";

type AssetIdMap = Map<string, string>;

type ExistingPairRecord = {
  id: string;
  asset_id: string;
  exchange: string;
  market_type: string;
  market_symbol: string;
};

export type VenueAvailabilityWriteResult = {
  listings: number;
  missingListings: number;
  binanceAssets: number;
  hyperliquidSpotAssets: number;
  hyperliquidPerpAssets: number;
  checkedAt: string;
  warnings: string[];
};

export async function writeVenueAvailabilityToSupabase(
  assets: Pick<MarketUniverseAsset, "sourceAssetId" | "symbol">[],
  discovery: VenueDiscoveryResult
): Promise<VenueAvailabilityWriteResult> {
  const config = getSupabaseServerConfig();
  const client = getSupabaseServerClient();

  if (!client || !config) throw new Error("Supabase env is missing.");
  if (config.keySource !== "service_role") throw new Error("Venue writes require SUPABASE_SERVICE_ROLE_KEY.");

  const assetIdMap = await readAssetIds(client, assets);
  const rows = buildPairRows(discovery.listings, assetIdMap, discovery.checkedAt);
  const missingListings = await markMissingListings(client, assetIdMap, rows, discovery.successfulScopes, discovery.checkedAt);

  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await client
      .from("asset_exchange_pairs")
      .upsert(rows.slice(index, index + 500), { onConflict: "asset_id,exchange,market_symbol" });
    if (error) throw error;
  }

  return {
    listings: rows.length,
    missingListings,
    binanceAssets: countAssets(discovery.listings, "binance", "spot"),
    hyperliquidSpotAssets: countAssets(discovery.listings, "hyperliquid", "spot"),
    hyperliquidPerpAssets: countAssets(discovery.listings, "hyperliquid", "perp"),
    checkedAt: discovery.checkedAt,
    warnings: discovery.warnings
  };
}

async function readAssetIds(
  client: SupabaseClient,
  assets: Pick<MarketUniverseAsset, "sourceAssetId" | "symbol">[]
): Promise<AssetIdMap> {
  const sourceIds = assets.map((asset) => asset.sourceAssetId || asset.symbol);
  const { data, error } = await client
    .from("market_assets")
    .select("id, source_asset_id, symbol")
    .eq("source", "binance")
    .in("source_asset_id", sourceIds);
  if (error) throw error;

  return new Map(
    (data || []).map((row: { id: string; source_asset_id?: string; symbol: string }) => [
      (row.source_asset_id || row.symbol).toUpperCase(),
      row.id
    ])
  );
}

function buildPairRows(listings: VenueListingInput[], assetIdMap: AssetIdMap, checkedAt: string) {
  return listings.flatMap((listing) => {
    const assetId = assetIdMap.get(listing.assetSymbol.toUpperCase());
    if (!assetId) return [];

    return [
      {
        asset_id: assetId,
        exchange: listing.exchange,
        market_type: listing.marketType,
        base_symbol: listing.baseSymbol,
        quote_symbol: listing.quoteSymbol,
        market_symbol: listing.marketSymbol,
        status: "covered",
        priority: getListingPriority(listing),
        last_checked_at: checkedAt,
        metadata: {
          match_method: listing.matchMethod,
          provider_market_id: listing.providerMarketId || listing.marketSymbol,
          is_canonical: listing.isCanonical ?? null
        },
        updated_at: checkedAt
      }
    ];
  });
}

async function markMissingListings(
  client: SupabaseClient,
  assetIdMap: AssetIdMap,
  currentRows: ReturnType<typeof buildPairRows>,
  successfulScopes: VenueDiscoveryScope[],
  checkedAt: string
) {
  const assetIds = Array.from(assetIdMap.values());
  if (assetIds.length === 0) return 0;

  let missingCount = 0;
  for (const scope of successfulScopes) {
    const { data, error } = await client
      .from("asset_exchange_pairs")
      .select("id, asset_id, exchange, market_type, market_symbol")
      .in("asset_id", assetIds)
      .eq("exchange", scope.exchange)
      .eq("market_type", scope.marketType)
      .eq("status", "covered");
    if (error) throw error;

    const currentKeys = new Set(
      currentRows
        .filter((row) => row.exchange === scope.exchange && row.market_type === scope.marketType)
        .map((row) => pairKey(row.asset_id, row.market_symbol))
    );
    const missingIds = ((data || []) as ExistingPairRecord[])
      .filter((row) => !currentKeys.has(pairKey(row.asset_id, row.market_symbol)))
      .map((row) => row.id);

    for (let index = 0; index < missingIds.length; index += 500) {
      const chunk = missingIds.slice(index, index + 500);
      const { error: updateError } = await client
        .from("asset_exchange_pairs")
        .update({ status: "missing_pair", last_checked_at: checkedAt, updated_at: checkedAt })
        .in("id", chunk);
      if (updateError) throw updateError;
    }

    missingCount += missingIds.length;
  }

  return missingCount;
}

function countAssets(listings: VenueListingInput[], exchange: VenueListingInput["exchange"], marketType: VenueListingInput["marketType"]) {
  return new Set(
    listings
      .filter((listing) => listing.exchange === exchange && listing.marketType === marketType)
      .map((listing) => listing.assetSymbol)
  ).size;
}

function pairKey(assetId: string, marketSymbol: string) {
  return `${assetId}:${marketSymbol}`;
}

function getListingPriority(listing: VenueListingInput) {
  if (listing.exchange === "binance") return 10;
  return listing.marketType === "spot" ? 20 : 30;
}
