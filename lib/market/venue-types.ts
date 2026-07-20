export type TradingVenue = "binance" | "hyperliquid";
export type TradingMarketType = "spot" | "perp";

export type TradingVenueMarket = {
  marketType: TradingMarketType;
  marketSymbol: string;
  baseSymbol: string;
  quoteSymbol: string;
};

export type TradingVenueAvailability = {
  venue: TradingVenue;
  markets: TradingVenueMarket[];
  lastCheckedAt: string;
  isStale: boolean;
};
