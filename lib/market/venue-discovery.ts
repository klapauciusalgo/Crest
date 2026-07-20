import type { MarketUniverseAsset } from "@/lib/market/types";
import type { TradingMarketType, TradingVenue } from "@/lib/market/venue-types";

type HyperliquidPerpAsset = {
  name?: string;
  isDelisted?: boolean;
};

type HyperliquidPerpMeta = {
  universe?: HyperliquidPerpAsset[];
};

type HyperliquidSpotToken = {
  index?: number;
  name?: string;
  fullName?: string | null;
  isCanonical?: boolean;
};

type HyperliquidSpotPair = {
  index?: number;
  name?: string;
  tokens?: number[];
  isCanonical?: boolean;
};

type HyperliquidSpotMeta = {
  tokens?: HyperliquidSpotToken[];
  universe?: HyperliquidSpotPair[];
};

export type VenueListingInput = {
  assetSymbol: string;
  exchange: TradingVenue;
  marketType: TradingMarketType;
  baseSymbol: string;
  quoteSymbol: string;
  marketSymbol: string;
  matchMethod: "source" | "exact_symbol" | "curated_alias";
  providerMarketId?: string;
  isCanonical?: boolean;
};

export type VenueDiscoveryScope = {
  exchange: TradingVenue;
  marketType: TradingMarketType;
};

export type VenueDiscoveryResult = {
  listings: VenueListingInput[];
  successfulScopes: VenueDiscoveryScope[];
  warnings: string[];
  checkedAt: string;
};

const hyperliquidInfoUrl = "https://api.hyperliquid.xyz/info";

const hyperliquidPerpAliases = new Map<string, string>([
  ["KPEPE", "PEPE"],
  ["KSHIB", "SHIB"],
  ["KBONK", "BONK"],
  ["KLUNC", "LUNC"],
  ["KFLOKI", "FLOKI"],
  ["KDOGS", "DOGS"],
  ["KNEIRO", "NEIRO"]
]);

const hyperliquidSpotAliases = new Map<string, string>([
  ["UBTC", "BTC"],
  ["UETH", "ETH"],
  ["USOL", "SOL"],
  ["UFART", "FARTCOIN"],
  ["UPUMP", "PUMP"],
  ["UBONK", "BONK"],
  ["UMOG", "MOG"],
  ["UENA", "ENA"],
  ["UWLD", "WLD"],
  ["UAVAX", "AVAX"],
  ["UDOGE", "DOGE"],
  ["UZEC", "ZEC"],
  ["UVIRT", "VIRTUAL"],
  ["WXRP", "XRP"],
  ["WMNT", "MNT"]
]);

export async function discoverTradingVenueAvailability(
  assets: Pick<MarketUniverseAsset, "symbol">[]
): Promise<VenueDiscoveryResult> {
  const checkedAt = new Date().toISOString();
  const assetSymbols = new Set(assets.map((asset) => normalizeSymbol(asset.symbol)));
  const listings = assets.map<VenueListingInput>((asset) => ({
    assetSymbol: normalizeSymbol(asset.symbol),
    exchange: "binance",
    marketType: "spot",
    baseSymbol: normalizeSymbol(asset.symbol),
    quoteSymbol: "USDT",
    marketSymbol: `${normalizeSymbol(asset.symbol)}USDT`,
    matchMethod: "source"
  }));
  const successfulScopes: VenueDiscoveryScope[] = [{ exchange: "binance", marketType: "spot" }];
  const warnings: string[] = [];

  const [perpResult, spotResult] = await Promise.allSettled([
    fetchHyperliquidInfo<HyperliquidPerpMeta>("meta"),
    fetchHyperliquidInfo<HyperliquidSpotMeta>("spotMeta")
  ]);

  if (perpResult.status === "fulfilled") {
    listings.push(...mapHyperliquidPerpetualListings(perpResult.value, assetSymbols));
    successfulScopes.push({ exchange: "hyperliquid", marketType: "perp" });
  } else {
    warnings.push(`Hyperliquid perpetual metadata unavailable: ${getSafeErrorMessage(perpResult.reason)}`);
  }

  if (spotResult.status === "fulfilled") {
    listings.push(...mapHyperliquidSpotListings(spotResult.value, assetSymbols));
    successfulScopes.push({ exchange: "hyperliquid", marketType: "spot" });
  } else {
    warnings.push(`Hyperliquid spot metadata unavailable: ${getSafeErrorMessage(spotResult.reason)}`);
  }

  return {
    listings: dedupeListings(listings),
    successfulScopes,
    warnings,
    checkedAt
  };
}

export function mapHyperliquidPerpetualListings(
  payload: HyperliquidPerpMeta,
  assetSymbols: Set<string>
): VenueListingInput[] {
  return (payload.universe || []).flatMap((market) => {
    const nativeSymbol = normalizeSymbol(market.name || "");
    if (!nativeSymbol || market.isDelisted) return [];

    const matched = matchVenueSymbol(nativeSymbol, assetSymbols, hyperliquidPerpAliases);
    if (!matched) return [];

    return [
      {
        assetSymbol: matched.assetSymbol,
        exchange: "hyperliquid",
        marketType: "perp",
        baseSymbol: nativeSymbol,
        quoteSymbol: "USDC",
        marketSymbol: market.name || nativeSymbol,
        matchMethod: matched.matchMethod,
        providerMarketId: market.name || nativeSymbol
      }
    ];
  });
}

export function mapHyperliquidSpotListings(
  payload: HyperliquidSpotMeta,
  assetSymbols: Set<string>
): VenueListingInput[] {
  const tokensByIndex = new Map(
    (payload.tokens || [])
      .filter((token): token is HyperliquidSpotToken & { index: number } => Number.isInteger(token.index))
      .map((token) => [token.index, token])
  );

  return (payload.universe || []).flatMap((pair) => {
    if (!Array.isArray(pair.tokens) || pair.tokens.length < 2) return [];

    const baseToken = tokensByIndex.get(pair.tokens[0]);
    const quoteToken = tokensByIndex.get(pair.tokens[1]);
    const nativeBase = normalizeSymbol(baseToken?.name || "");
    const nativeQuote = normalizeSymbol(quoteToken?.name || "");
    if (!nativeBase || !nativeQuote) return [];

    const matched = matchVenueSymbol(nativeBase, assetSymbols, hyperliquidSpotAliases);
    if (!matched) return [];

    return [
      {
        assetSymbol: matched.assetSymbol,
        exchange: "hyperliquid",
        marketType: "spot",
        baseSymbol: nativeBase,
        quoteSymbol: nativeQuote,
        marketSymbol: `${nativeBase}/${nativeQuote}`,
        matchMethod: matched.matchMethod,
        providerMarketId: pair.name || (Number.isInteger(pair.index) ? `@${pair.index}` : undefined),
        isCanonical: Boolean(pair.isCanonical && baseToken?.isCanonical && quoteToken?.isCanonical)
      }
    ];
  });
}

function matchVenueSymbol(nativeSymbol: string, assetSymbols: Set<string>, aliases: Map<string, string>) {
  if (assetSymbols.has(nativeSymbol)) {
    return { assetSymbol: nativeSymbol, matchMethod: "exact_symbol" as const };
  }

  const alias = aliases.get(nativeSymbol);
  if (alias && assetSymbols.has(alias)) {
    return { assetSymbol: alias, matchMethod: "curated_alias" as const };
  }

  return null;
}

async function fetchHyperliquidInfo<T>(type: "meta" | "spotMeta"): Promise<T> {
  const response = await fetch(hyperliquidInfoUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type }),
    cache: "no-store",
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function dedupeListings(listings: VenueListingInput[]) {
  const keyed = new Map<string, VenueListingInput>();
  for (const listing of listings) {
    keyed.set(
      [listing.assetSymbol, listing.exchange, listing.marketType, listing.marketSymbol].join(":"),
      listing
    );
  }
  return Array.from(keyed.values());
}

function normalizeSymbol(value: string) {
  return value.trim().toUpperCase();
}

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown provider error";
}
