import { createMockMarketProvider } from "@/lib/market/mock-provider";
import { createSupabaseMarketProvider } from "@/lib/market/supabase-provider";
import type { MarketDataProvider } from "@/lib/market/types";

let provider: MarketDataProvider | null = null;

export function getMarketDataProvider() {
  if (!provider) {
    provider = createSupabaseMarketProvider(createMockMarketProvider());
  }

  return provider;
}
