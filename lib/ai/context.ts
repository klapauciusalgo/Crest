import type { AiContextRequest, AiMarketContext, AiSettings } from "@/lib/ai/types";
import { getMarketSnapshot } from "@/lib/market/service";
import type { MarketAssetSnapshot } from "@/lib/market/types";

export async function buildAiMarketContext(input: AiContextRequest): Promise<AiMarketContext> {
  const snapshot = await getMarketSnapshot(input.timeframe);
  const assets = snapshot.assets.slice(0, 300);
  const btcRegime4h = getBtcRegime4h(assets);

  return {
    timeframe: input.timeframe,
    btcRegime4h,
    dataStatus: {
      source: snapshot.freshness.source,
      lastUpdated: snapshot.freshness.updatedAt,
      isStale: snapshot.freshness.isStale,
      coverage: snapshot.freshness.coverage
    },
    activePreset: input.activePreset || "Custom",
    filterState: {
      chains: input.filters?.chains || [],
      searchQuery: input.filters?.searchQuery || "",
      rsiRange: input.filters?.rsiRange || [0, 100],
      maDistanceRange: input.filters?.maDistanceRange || [-100, 100]
    },
    sort: {
      key: input.sort?.key || "quoteVolume24h",
      direction: input.sort?.direction || "desc"
    },
    marketBreadth: snapshot.breadth,
    multiTimeframeRules: {
      regime4h: {
        bullish: "price > MA111 and RSI > 55",
        bearish: "price < MA111 and RSI < 50",
        neutral: "all mixed or boundary conditions"
      },
      recommendation30m: {
        globalGate: `BTC 4h regime is ${btcRegime4h}`,
        longBuy: "BTC 4h Bullish and asset 30m RSI < 35",
        shortSell: "BTC 4h Bearish and asset 30m RSI > 70",
        wait: "BTC 4h Neutral, missing BTC data, or all other conditions"
      }
    },
    signalSummary: buildSignalSummary(assets),
    chainSummary: buildChainSummary(assets),
    sectorSummary: buildSectorSummary(assets),
    assets: assets.map((asset) => ({
      rank: asset.rank,
      symbol: asset.symbol,
      name: asset.name,
      chain: asset.chain,
      sectors: asset.sectors,
      price: asset.price,
      priceChange24h: asset.priceChange24h,
      rsi14: asset.rsi14,
      rsi4h: asset.rsi4h,
      rsi30m: asset.rsi30m,
      ma111: asset.ma111,
      maDistancePct: asset.maDistancePct,
      regime4h: asset.regime4h,
      recommendation30m: asset.recommendation30m,
      volumeChange24h: asset.volumeChange24h,
      quoteVolume24h: asset.quoteVolume24h,
      signalReason: asset.signalReason,
      updatedAt: asset.updatedAt
    })),
    pinnedAssets: input.pinnedAssets || []
  };
}

function getBtcRegime4h(assets: MarketAssetSnapshot[]) {
  return assets.find((asset) => asset.symbol === "BTC")?.regime4h || "Neutral";
}

export function buildAiMessages({
  context,
  message,
  settings
}: {
  context: AiMarketContext;
  message: string;
  settings: AiSettings;
}) {
  const rules = [
    "You are Crest AI, a precision cryptocurrency market analyst embedded inside a live data terminal.",
    "You are not a general assistant. Analyze only the supplied Crest market context.",
    `The only valid data cutoff is ${context.dataStatus.lastUpdated} for timeframe ${context.timeframe}.`,
    "If the user asks for data outside the supplied context, say: That data is not in the latest Crest snapshot.",
    "Always reference assets as $BTC, $ETH, $BNB style tickers.",
    "Keep responses concise, analyst-grade, and tied to regime/setup/breadth evidence.",
    "Max response length is 300 words unless the user explicitly requests deeper analysis."
  ];

  const customPrompt = settings.systemPrompt.trim();

  return [
    {
      role: "system" as const,
      content: [rules.join("\n"), customPrompt].filter(Boolean).join("\n\nAdmin system note:\n")
    },
    {
      role: "user" as const,
      content: [
        "Latest Crest context:",
        JSON.stringify(context),
        "",
        `User prompt: ${message}`
      ].join("\n")
    }
  ];
}

function buildSignalSummary(assets: MarketAssetSnapshot[]): AiMarketContext["signalSummary"] {
  return assets.reduce(
    (summary, asset) => {
      if (asset.regime4h === "Bullish") summary.bullish += 1;
      if (asset.regime4h === "Bearish") summary.bearish += 1;
      if (asset.regime4h === "Neutral") summary.neutral += 1;
      if (asset.recommendation30m === "Long/Buy") summary.longBuy += 1;
      if (asset.recommendation30m === "Short/Sell") summary.shortSell += 1;
      if (asset.recommendation30m === "Wait") summary.wait += 1;
      return summary;
    },
    { bullish: 0, bearish: 0, neutral: 0, longBuy: 0, shortSell: 0, wait: 0 }
  );
}

function buildChainSummary(assets: MarketAssetSnapshot[]): AiMarketContext["chainSummary"] {
  return groupAssets(assets, (asset) => [asset.chain]).map(([chain, rows]) => ({
    chain,
    assets: rows.length,
    averageRsi: average(rows.map((asset) => asset.rsi14)),
    averagePriceChange24h: average(rows.map((asset) => asset.priceChange24h)),
    averageVolumeChange24h: average(rows.map((asset) => asset.volumeChange24h)),
    gainers: rows.filter((asset) => asset.priceChange24h >= 0).length,
    losers: rows.filter((asset) => asset.priceChange24h < 0).length
  }));
}

function buildSectorSummary(assets: MarketAssetSnapshot[]): AiMarketContext["sectorSummary"] {
  return groupAssets(assets, (asset) => asset.sectors.length ? asset.sectors : ["Unclassified"]).map(([sector, rows]) => {
    const leader = [...rows].sort((first, second) => second.priceChange24h - first.priceChange24h)[0];

    return {
      sector,
      assets: rows.length,
      leader: leader?.symbol || null,
      averageRsi: average(rows.map((asset) => asset.rsi14)),
      averagePriceChange24h: average(rows.map((asset) => asset.priceChange24h)),
      averageVolumeChange24h: average(rows.map((asset) => asset.volumeChange24h)),
      gainers: rows.filter((asset) => asset.priceChange24h >= 0).length,
      losers: rows.filter((asset) => asset.priceChange24h < 0).length
    };
  });
}

function groupAssets(assets: MarketAssetSnapshot[], getKeys: (asset: MarketAssetSnapshot) => string[]) {
  const groups = new Map<string, MarketAssetSnapshot[]>();

  assets.forEach((asset) => {
    getKeys(asset).forEach((key) => {
      const current = groups.get(key) || [];
      current.push(asset);
      groups.set(key, current);
    });
  });

  return Array.from(groups.entries()).sort((first, second) => second[1].length - first[1].length);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}
