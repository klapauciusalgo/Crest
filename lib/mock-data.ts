export type Timeframe = "30m" | "4h";

export type ChainKey = "ETH" | "BSC" | "SOL" | "BASE" | "ARB" | "AVAX" | "MATIC" | "TON";
export type SectorKey = "Layer 1" | "DeFi" | "AI" | "CEX" | "DEX" | "Perps" | "Meme" | "Yield" | "Infra";

export type AssetRow = {
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  rsi14: number;
  volumeChange24h: number;
  chain: ChainKey;
  sectors: SectorKey[];
  ma111: number;
  maDistancePct: number;
};

export type ChainProjectDetail = AssetRow & {
  category: SectorKey;
  signal: "Momentum" | "Oversold" | "Support" | "Divergence" | "Neutral";
  note: string;
};

export type ProviderConfig = {
  provider: string;
  model: string;
  status: "primary" | "fallback" | "disabled";
  maxTokens: number;
  temperature: number;
  dailyLimit: number;
};

export const chainColors: Record<ChainKey, string> = {
  ETH: "#627EEA",
  BSC: "#F0B90B",
  SOL: "#9945FF",
  BASE: "#0052FF",
  ARB: "#4FC1FF",
  AVAX: "#E84142",
  MATIC: "#8247E5",
  TON: "#0098EA"
};

export const sectorColors: Record<SectorKey, string> = {
  "Layer 1": "#8FA1FF",
  DeFi: "#1DB87E",
  AI: "#D778FF",
  CEX: "#F0B90B",
  DEX: "#4C9EFF",
  Perps: "#FF8C42",
  Meme: "#FF6B8A",
  Yield: "#3DD68C",
  Infra: "#8D93A6"
};

const baseAssets: AssetRow[] = [
  { symbol: "BTC", name: "Bitcoin", price: 67240.12, priceChange24h: 1.82, rsi14: 61.4, volumeChange24h: 12.6, chain: "ETH", sectors: ["Layer 1"], ma111: 64220, maDistancePct: 4.7 },
  { symbol: "ETH", name: "Ethereum", price: 3488.41, priceChange24h: -0.64, rsi14: 44.2, volumeChange24h: 7.8, chain: "ETH", sectors: ["Layer 1", "Infra"], ma111: 3540, maDistancePct: -1.46 },
  { symbol: "BNB", name: "BNB", price: 594.18, priceChange24h: -2.18, rsi14: 28.6, volumeChange24h: 18.9, chain: "BSC", sectors: ["Layer 1", "CEX"], ma111: 635.2, maDistancePct: -6.46 },
  { symbol: "SOL", name: "Solana", price: 151.67, priceChange24h: 3.14, rsi14: 68.8, volumeChange24h: 44.1, chain: "SOL", sectors: ["Layer 1"], ma111: 139.44, maDistancePct: 8.77 },
  { symbol: "ARB", name: "Arbitrum", price: 1.18, priceChange24h: -4.84, rsi14: 24.9, volumeChange24h: 56.2, chain: "ARB", sectors: ["Infra"], ma111: 1.29, maDistancePct: -8.53 },
  { symbol: "AVAX", name: "Avalanche", price: 32.44, priceChange24h: 2.28, rsi14: 57.2, volumeChange24h: 21.4, chain: "AVAX", sectors: ["Layer 1"], ma111: 30.11, maDistancePct: 7.74 },
  { symbol: "MATIC", name: "Polygon", price: 0.74, priceChange24h: -1.22, rsi14: 35.1, volumeChange24h: 9.7, chain: "MATIC", sectors: ["Infra"], ma111: 0.78, maDistancePct: -5.13 },
  { symbol: "TON", name: "Toncoin", price: 6.34, priceChange24h: 5.41, rsi14: 72.2, volumeChange24h: 33.5, chain: "TON", sectors: ["Layer 1"], ma111: 5.88, maDistancePct: 7.82 },
  { symbol: "OP", name: "Optimism", price: 2.06, priceChange24h: -0.31, rsi14: 49.8, volumeChange24h: 3.2, chain: "BASE", sectors: ["Infra"], ma111: 2.03, maDistancePct: 1.48 },
  { symbol: "AERO", name: "Aerodrome", price: 1.12, priceChange24h: 7.93, rsi14: 65.7, volumeChange24h: 62.4, chain: "BASE", sectors: ["DeFi", "DEX"], ma111: 0.96, maDistancePct: 16.67 },
  { symbol: "CAKE", name: "PancakeSwap", price: 2.84, priceChange24h: -3.72, rsi14: 31.2, volumeChange24h: 52.8, chain: "BSC", sectors: ["DeFi", "DEX"], ma111: 2.96, maDistancePct: -4.05 },
  { symbol: "JUP", name: "Jupiter", price: 0.91, priceChange24h: 2.62, rsi14: 58.3, volumeChange24h: 26.2, chain: "SOL", sectors: ["DeFi", "DEX"], ma111: 0.86, maDistancePct: 5.81 },
  { symbol: "PENDLE", name: "Pendle", price: 5.48, priceChange24h: 0.84, rsi14: 39.7, volumeChange24h: 14.8, chain: "ETH", sectors: ["DeFi", "Yield"], ma111: 5.72, maDistancePct: -4.2 },
  { symbol: "GMX", name: "GMX", price: 31.94, priceChange24h: -5.36, rsi14: 27.8, volumeChange24h: 41.7, chain: "ARB", sectors: ["DeFi", "Perps"], ma111: 34.82, maDistancePct: -8.27 },
  { symbol: "JOE", name: "Trader Joe", price: 0.48, priceChange24h: 1.16, rsi14: 54.3, volumeChange24h: 19.1, chain: "AVAX", sectors: ["DeFi", "DEX"], ma111: 0.45, maDistancePct: 6.67 },
  { symbol: "WIF", name: "dogwifhat", price: 2.41, priceChange24h: -6.11, rsi14: 22.4, volumeChange24h: 72.5, chain: "SOL", sectors: ["Meme"], ma111: 2.82, maDistancePct: -14.54 },
  { symbol: "FET", name: "Artificial Superintelligence", price: 1.42, priceChange24h: 4.16, rsi14: 63.9, volumeChange24h: 38.6, chain: "ETH", sectors: ["AI"], ma111: 1.28, maDistancePct: 10.94 },
  { symbol: "TAO", name: "Bittensor", price: 438.2, priceChange24h: 2.44, rsi14: 59.5, volumeChange24h: 24.3, chain: "ETH", sectors: ["AI"], ma111: 411.4, maDistancePct: 6.51 },
  { symbol: "UNI", name: "Uniswap", price: 9.32, priceChange24h: -0.92, rsi14: 45.8, volumeChange24h: 11.4, chain: "ETH", sectors: ["DeFi", "DEX"], ma111: 9.08, maDistancePct: 2.64 },
  { symbol: "OKB", name: "OKB", price: 51.84, priceChange24h: 1.36, rsi14: 52.1, volumeChange24h: 8.8, chain: "ETH", sectors: ["CEX"], ma111: 49.6, maDistancePct: 4.52 }
];

export function getMockAssets(timeframe: Timeframe): AssetRow[] {
  const factor = timeframe === "30m" ? 0.58 : 1;
  return baseAssets.map((asset, index) => ({
    ...asset,
    priceChange24h: round(asset.priceChange24h * factor + ((index % 3) - 1) * 0.34),
    volumeChange24h: round(asset.volumeChange24h * (timeframe === "30m" ? 1.18 : 1)),
    rsi14: clamp(round(asset.rsi14 + (timeframe === "30m" ? ((index % 4) - 1.5) * 2.1 : 0)), 0, 100),
    maDistancePct: round(asset.maDistancePct * (timeframe === "30m" ? 0.74 : 1))
  }));
}

export function getChainSummaries(assets: AssetRow[]) {
  const chains = Array.from(new Set(assets.map((asset) => asset.chain)));
  return chains.map((chain) => {
    const rows = assets.filter((asset) => asset.chain === chain);
    const avgPrice = average(rows.map((asset) => asset.priceChange24h));
    const avgVolume = average(rows.map((asset) => asset.volumeChange24h));
    return {
      chain,
      avgPriceChange: round(avgPrice),
      avgVolumeChange: round(avgVolume),
      gainers: rows.filter((asset) => asset.priceChange24h >= 0).length,
      losers: rows.filter((asset) => asset.priceChange24h < 0).length,
      assetCount: rows.length
    };
  });
}

export function getSectorSummaries(assets: AssetRow[]) {
  const sectors = Array.from(new Set(assets.flatMap((asset) => asset.sectors)));
  return sectors.map((sector) => {
    const rows = assets.filter((asset) => asset.sectors.includes(sector));
    const avgPrice = average(rows.map((asset) => asset.priceChange24h));
    const avgVolume = average(rows.map((asset) => asset.volumeChange24h));
    const leader = [...rows].sort((first, second) => second.priceChange24h - first.priceChange24h)[0];
    return {
      sector,
      avgPriceChange: round(avgPrice),
      avgVolumeChange: round(avgVolume),
      gainers: rows.filter((asset) => asset.priceChange24h >= 0).length,
      losers: rows.filter((asset) => asset.priceChange24h < 0).length,
      assetCount: rows.length,
      leader: leader?.symbol || "-"
    };
  });
}

const projectCategories: Record<string, ChainProjectDetail["category"]> = {
  AERO: "DEX",
  ARB: "Infra",
  AVAX: "Layer 1",
  BNB: "Layer 1",
  BTC: "Layer 1",
  CAKE: "DEX",
  ETH: "Layer 1",
  FET: "AI",
  GMX: "Perps",
  JOE: "DEX",
  JUP: "DEX",
  MATIC: "Infra",
  OKB: "CEX",
  OP: "Infra",
  PENDLE: "Yield",
  SOL: "Layer 1",
  TAO: "AI",
  TON: "Layer 1",
  UNI: "DEX",
  WIF: "Meme"
};

const projectNotes: Record<string, string> = {
  AERO: "Base beta leader with elevated turnover and a wide MA111 premium.",
  ARB: "Weak structure, high volume, and below MA111. Watch for capitulation or reclaim.",
  AVAX: "Positive trend above MA111 with moderate volume confirmation.",
  BNB: "Oversold relative to MA111 with enough volume to stay on reversal watch.",
  BTC: "Benchmark risk asset holding above MA111 while liquidity stays constructive.",
  CAKE: "DEX token near support with high volume, suitable for oversold scans.",
  ETH: "Large-cap anchor hovering near MA111, useful as a risk baseline.",
  FET: "AI sector leader with constructive trend and rising turnover.",
  GMX: "Perps venue showing oversold pressure and elevated volume on Arbitrum.",
  JOE: "Avalanche exchange token with steady trend support.",
  JUP: "Solana exchange flow remains positive without overbought extension.",
  MATIC: "Infrastructure name below MA111, still inside a controlled pullback.",
  OKB: "CEX-linked asset holding above MA111 with stable trend participation.",
  OP: "L2 beta name staying close to MA111 with neutral RSI.",
  PENDLE: "Yield asset near support with muted momentum.",
  SOL: "High beta leader with strong trend posture and active volume.",
  TAO: "AI infrastructure proxy with positive momentum and clean MA111 posture.",
  TON: "Momentum leader with hot RSI, needs confirmation before chasing.",
  UNI: "Ethereum DEX benchmark sitting above MA111 with neutral momentum.",
  WIF: "High-volume meme risk, deeply extended below MA111."
};

export function getChainProjectDetails(chain: ChainKey, assets: AssetRow[]): ChainProjectDetail[] {
  return assets
    .filter((asset) => asset.chain === chain)
    .map((asset) => ({
      ...asset,
      category: projectCategories[asset.symbol] || "Infra",
      signal: getSignal(asset),
      note: projectNotes[asset.symbol] || "Tracked project inside the active chain context."
    }))
    .sort((first, second) => second.volumeChange24h - first.volumeChange24h);
}

export function getSectorProjectDetails(sector: SectorKey, assets: AssetRow[]): ChainProjectDetail[] {
  return assets
    .filter((asset) => asset.sectors.includes(sector))
    .map((asset) => ({
      ...asset,
      category: sector,
      signal: getSignal(asset),
      note: projectNotes[asset.symbol] || "Tracked project inside the active sector context."
    }))
    .sort((first, second) => second.priceChange24h - first.priceChange24h);
}

export const aiPresetResponses: Record<string, string> = {
  oversold:
    "$WIF, $ARB, $GMX, and $BNB are the cleanest oversold names in the current filtered view. $ARB and $GMX have the weakest MA111 posture, while $BNB is below MA111 with a moderate volume lift.\n\n> **Next:** \"which of these have volume spike above 20%?\"",
  chains:
    "$BASE leads the current chain set by average price change, with $SOL close behind on stronger volume. $ARB is the weakest group and has more losers than gainers.\n\n> **Next:** \"show the weakest ARB assets below MA111\"",
  volume:
    "$WIF, $AERO, $ARB, and $CAKE show volume divergence. Volume is elevated while price action is either muted or negative, which makes them worth monitoring for continuation or exhaustion.\n\n> **Next:** \"rank these by RSI from lowest to highest\"",
  ma:
    "$CAKE, $PENDLE, and $ETH are near MA111 support. $CAKE is closest to the -5.00% breakdown band and has the strongest volume confirmation.\n\n> **Next:** \"which MA111 support names have RSI below 40?\""
};

export const providerConfigs: ProviderConfig[] = [
  { provider: "OpenRouter", model: "anthropic/claude-sonnet", status: "primary", maxTokens: 900, temperature: 0.2, dailyLimit: 60 },
  { provider: "OpenAI", model: "gpt-4.1-mini", status: "fallback", maxTokens: 800, temperature: 0.2, dailyLimit: 40 },
  { provider: "Groq", model: "llama-3.3-70b-versatile", status: "fallback", maxTokens: 700, temperature: 0.15, dailyLimit: 30 },
  { provider: "Ollama", model: "qwen2.5:14b", status: "disabled", maxTokens: 600, temperature: 0.1, dailyLimit: 20 }
];

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSignal(asset: AssetRow): ChainProjectDetail["signal"] {
  if (asset.rsi14 < 32) return "Oversold";
  if (asset.priceChange24h > 2.5 && asset.volumeChange24h > 20) return "Momentum";
  if (asset.maDistancePct > -5 && asset.maDistancePct < 2) return "Support";
  if (asset.priceChange24h < 0 && asset.volumeChange24h > 35) return "Divergence";
  return "Neutral";
}
