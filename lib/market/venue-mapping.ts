import type { TradingMarketType, TradingVenue, TradingVenueAvailability } from "@/lib/market/venue-types";

export type ExchangePairRecord = {
  exchange: string;
  market_type?: string | null;
  base_symbol: string;
  quote_symbol: string;
  market_symbol: string;
  status: string;
  last_checked_at: string | null;
};

const staleAfterMs = 24 * 60 * 60 * 1000;

export function mapVenueAvailability(rows: ExchangePairRecord[] | null | undefined): TradingVenueAvailability[] {
  const groups = new Map<TradingVenue, ExchangePairRecord[]>();

  for (const row of rows || []) {
    const venue = toTradingVenue(row.exchange);
    if (!venue || row.status !== "covered") continue;
    const current = groups.get(venue) || [];
    current.push(row);
    groups.set(venue, current);
  }

  return Array.from(groups.entries())
    .map(([venue, listings]) => {
      const lastCheckedAt = getLatestCheckedAt(listings);
      return {
        venue,
        markets: listings
          .map((row) => ({
            marketType: toMarketType(row.market_type),
            marketSymbol: row.market_symbol,
            baseSymbol: row.base_symbol,
            quoteSymbol: row.quote_symbol
          }))
          .sort(compareMarkets),
        lastCheckedAt,
        isStale: !lastCheckedAt || Date.now() - new Date(lastCheckedAt).getTime() > staleAfterMs
      };
    })
    .sort((first, second) => venuePriority(first.venue) - venuePriority(second.venue));
}

function getLatestCheckedAt(rows: ExchangePairRecord[]) {
  return rows.reduce((latest, row) => {
    if (!row.last_checked_at) return latest;
    if (!latest || new Date(row.last_checked_at).getTime() > new Date(latest).getTime()) return row.last_checked_at;
    return latest;
  }, "");
}

function compareMarkets(first: TradingVenueAvailability["markets"][number], second: TradingVenueAvailability["markets"][number]) {
  if (first.marketType !== second.marketType) return first.marketType === "spot" ? -1 : 1;
  return first.marketSymbol.localeCompare(second.marketSymbol);
}

function toTradingVenue(value: string): TradingVenue | null {
  if (value === "binance" || value === "hyperliquid") return value;
  return null;
}

function toMarketType(value: string | null | undefined): TradingMarketType {
  return value === "perp" ? "perp" : "spot";
}

function venuePriority(venue: TradingVenue) {
  return venue === "binance" ? 0 : 1;
}
