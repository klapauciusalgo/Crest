"use client";

import {
  Activity,
  BarChart3,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleUserRound,
  Command,
  Database,
  Pin,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Wallet
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { formatPct, formatPrice } from "@/lib/formatters";
import {
  AssetSignalRow,
  ChainKey,
  ChainProjectDetail,
  ProviderConfig,
  SectorKey,
  Timeframe,
  aiPresetResponses,
  chainColors,
  enrichAssetsWithSignals,
  getChainProjectDetails,
  getChainSummaries,
  getMockAssets,
  getSectorProjectDetails,
  getSectorSummaries,
  providerConfigs,
  sectorColors
} from "@/lib/mock-data";

type ViewMode = "terminal" | "admin";
type AuthMode = "visitor" | "user" | "admin";
type SortKey = keyof Pick<
  AssetSignalRow,
  | "symbol"
  | "price"
  | "priceChange24h"
  | "rsi14"
  | "volumeChange24h"
  | "chain"
  | "ma111"
  | "maDistancePct"
  | "regime4h"
  | "recommendation30m"
>;
type SortDirection = "none" | "asc" | "desc";
type IntelligenceMode = "chain" | "sector";
type GridColumn = { key: SortKey; label: string; align?: "right" | "left" };
type MarketBreadthSummary = {
  range: "Top 100" | "Top 200" | "Top 300";
  averageRsi: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  bullishPct: number;
  bearishPct: number;
};
type AiContextSnapshot = {
  timeframe: Timeframe;
  activePreset: string;
  filterState: {
    chains: ChainKey[];
    rsiRange: [number, number];
    maDistanceRange: [number, number];
  };
  sort: {
    key: SortKey;
    direction: SortDirection;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  visibleAssets: AssetSignalRow[];
  marketBreadth: MarketBreadthSummary[];
  chainSummary: ReturnType<typeof getChainSummaries>;
  sectorSummary: ReturnType<typeof getSectorSummaries>;
  signalSummary: {
    bullish: number;
    bearish: number;
    neutral: number;
    longBuy: number;
    shortSell: number;
    wait: number;
  };
  inspectedChain: {
    chain: ChainKey;
    status: "idle" | "loading" | "ready";
    projects: ChainProjectDetail[];
  };
  inspectedSector: {
    sector: SectorKey;
    status: "idle" | "loading" | "ready";
    projects: ChainProjectDetail[];
  };
  pinnedAssets: string[];
};
type SavedPreset = {
  name: string;
  chains: ChainKey[];
  rsi: [number, number];
  ma: [number, number];
};

const allChains = Object.keys(chainColors) as ChainKey[];
const entrySignals = [
  ["$BTC", "+1.48", "RSI 61.4"],
  ["$SOL", "+2.80", "VOL 44.1"],
  ["$ARB", "-4.84", "MA -8.5"],
  ["$AERO", "+7.59", "BASE"],
  ["$BNB", "-1.84", "RSI 28.6"],
  ["$TON", "+5.41", "HOT"]
];

const baseColumns: GridColumn[] = [
  { key: "symbol", label: "Asset", align: "left" },
  { key: "price", label: "Price" },
  { key: "priceChange24h", label: "24h" },
  { key: "rsi14", label: "RSI(14)" },
  { key: "volumeChange24h", label: "Volume" },
  { key: "chain", label: "Chain" },
  { key: "ma111", label: "MA111" },
  { key: "maDistancePct", label: "MA Dist." }
];

const multiTimeframeRules = {
  regime_4h: {
    bullish: "price > MA111 and RSI > 55",
    bearish: "price < MA111 and RSI < 50",
    neutral: "all mixed or boundary conditions"
  },
  recommendation_30m: {
    long_buy: "4h Bullish and 30m RSI < 35",
    short_sell: "4h Bearish and 30m RSI > 70",
    wait: "all other conditions"
  }
};
const pageSize = 20;

export function CrestTerminal({ initialView }: { initialView: ViewMode }) {
  const [authMode, setAuthMode] = useState<AuthMode>(initialView === "admin" ? "admin" : "visitor");
  const [view, setView] = useState<ViewMode>(initialView);
  const [timeframe, setTimeframe] = useState<Timeframe>("4h");
  const [selectedChains, setSelectedChains] = useState<ChainKey[]>(allChains);
  const [rsiRange, setRsiRange] = useState<[number, number]>([0, 100]);
  const [maRange, setMaRange] = useState<[number, number]>([-20, 20]);
  const [sortKey, setSortKey] = useState<SortKey>("priceChange24h");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [pinned, setPinned] = useState<string[]>(["BTC", "ETH"]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [highlightedTickers, setHighlightedTickers] = useState<string[]>([]);
  const [intelligenceMode, setIntelligenceMode] = useState<IntelligenceMode>("chain");
  const [selectedChainMap, setSelectedChainMap] = useState<ChainKey>("BASE");
  const [selectedSectorMap, setSelectedSectorMap] = useState<SectorKey>("DeFi");
  const [chainDetailStatus, setChainDetailStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [sectorDetailStatus, setSectorDetailStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [chainDetails, setChainDetails] = useState<ChainProjectDetail[]>([]);
  const [sectorDetails, setSectorDetails] = useState<ChainProjectDetail[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([
    { name: "BSC oversold", chains: ["BSC"], rsi: [0, 35], ma: [-20, 0] },
    { name: "MA111 support", chains: allChains, rsi: [20, 55], ma: [-5, 1] }
  ]);
  const [activePreset, setActivePreset] = useState("Manual");

  const assets4h = useMemo(() => getMockAssets("4h"), []);
  const assets30m = useMemo(() => getMockAssets("30m"), []);
  const activeTimeframeAssets = timeframe === "4h" ? assets4h : assets30m;
  const sourceAssets = useMemo(
    () => enrichAssetsWithSignals(activeTimeframeAssets, assets4h, assets30m),
    [activeTimeframeAssets, assets4h, assets30m]
  );
  const filteredAssets = useMemo(() => {
    const rows = sourceAssets.filter(
      (asset) =>
        selectedChains.includes(asset.chain) &&
        asset.rsi14 >= rsiRange[0] &&
        asset.rsi14 <= rsiRange[1] &&
        asset.maDistancePct >= maRange[0] &&
        asset.maDistancePct <= maRange[1]
    );

    return sortRows(rows, sortKey, sortDirection);
  }, [maRange, rsiRange, selectedChains, sortDirection, sortKey, sourceAssets]);

  const chainSummaries = useMemo(() => getChainSummaries(sourceAssets), [sourceAssets]);
  const sectorSummaries = useMemo(() => getSectorSummaries(sourceAssets), [sourceAssets]);
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const paginatedAssets = useMemo(() => {
    const pageStart = (currentPage - 1) * pageSize;
    return filteredAssets.slice(pageStart, pageStart + pageSize);
  }, [currentPage, filteredAssets]);
  const visibleTickers = useMemo(() => paginatedAssets.map((asset) => asset.symbol), [paginatedAssets]);
  const signalSummary = useMemo(() => getSignalSummary(filteredAssets), [filteredAssets]);
  const marketBreadth = useMemo(() => getMarketBreadth(sourceAssets), [sourceAssets]);
  const aiContext = useMemo<AiContextSnapshot>(
    () => ({
      timeframe,
      activePreset,
      filterState: {
        chains: selectedChains,
        rsiRange,
        maDistanceRange: maRange
      },
      sort: {
        key: sortKey,
        direction: sortDirection
      },
      pagination: {
        page: currentPage,
        pageSize,
        totalRows: filteredAssets.length,
        totalPages
      },
      visibleAssets: paginatedAssets,
      marketBreadth,
      chainSummary: chainSummaries,
      sectorSummary: sectorSummaries,
      signalSummary,
      inspectedChain: {
        chain: selectedChainMap,
        status: chainDetailStatus,
        projects: chainDetails
      },
      inspectedSector: {
        sector: selectedSectorMap,
        status: sectorDetailStatus,
        projects: sectorDetails
      },
      pinnedAssets: pinned.map((symbol) => `$${symbol}`)
    }),
    [
      activePreset,
      chainDetailStatus,
      chainDetails,
      chainSummaries,
      currentPage,
      filteredAssets,
      maRange,
      marketBreadth,
      paginatedAssets,
      pinned,
      rsiRange,
      sectorDetailStatus,
      sectorDetails,
      sectorSummaries,
      selectedChainMap,
      selectedChains,
      selectedSectorMap,
      signalSummary,
      sortDirection,
      sortKey,
      totalPages,
      timeframe
    ]
  );

  useEffect(() => {
    setChainDetailStatus("loading");
    const timer = window.setTimeout(() => {
      setChainDetails(getChainProjectDetails(selectedChainMap, sourceAssets));
      setChainDetailStatus("ready");
    }, 240);

    return () => window.clearTimeout(timer);
  }, [selectedChainMap, sourceAssets]);

  useEffect(() => {
    setSectorDetailStatus("loading");
    const timer = window.setTimeout(() => {
      setSectorDetails(getSectorProjectDetails(selectedSectorMap, sourceAssets));
      setSectorDetailStatus("ready");
    }, 240);

    return () => window.clearTimeout(timer);
  }, [selectedSectorMap, sourceAssets]);

  useEffect(() => {
    if (!aiResponse) {
      setHighlightedTickers([]);
      return;
    }

    const tickers = Array.from(aiResponse.matchAll(/\$([A-Z0-9]+)/g)).map((match) => match[1]);
    setHighlightedTickers(tickers.filter((ticker) => visibleTickers.includes(ticker)));
  }, [aiResponse, visibleTickers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [timeframe, selectedChains, rsiRange, maRange, sortKey, sortDirection]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const isSignedOut = authMode === "visitor";

  function cycleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
      return;
    }

    setSortDirection((current) => {
      if (current === "none") return "asc";
      if (current === "asc") return "desc";
      return "none";
    });
  }

  function toggleChain(chain: ChainKey) {
    setActivePreset("Manual");
    setSelectedChains((current) =>
      current.includes(chain) ? current.filter((item) => item !== chain) : [...current, chain]
    );
  }

  function togglePin(symbol: string) {
    setPinned((current) => {
      if (current.includes(symbol)) {
        return current.filter((item) => item !== symbol);
      }

      if (current.length >= 5) {
        return current;
      }

      return [...current, symbol];
    });
  }

  function loadPreset(preset: SavedPreset) {
    setSelectedChains(preset.chains);
    setRsiRange(preset.rsi);
    setMaRange(preset.ma);
    setActivePreset(preset.name);
  }

  function savePreset() {
    const nextName = `View ${savedPresets.length + 1}`;
    setSavedPresets((current) => [
      ...current,
      { name: nextName, chains: selectedChains, rsi: rsiRange, ma: maRange }
    ]);
    setActivePreset(nextName);
  }

  function runAiPreset(kind: keyof typeof aiPresetResponses) {
    setAiOpen(true);
    setAiResponse("");
    const response = aiPresetResponses[kind];
    let index = 0;
    const timer = window.setInterval(() => {
      index += 4;
      setAiResponse(response.slice(0, index));
      if (index >= response.length) {
        window.clearInterval(timer);
      }
    }, 18);
  }

  if (isSignedOut) {
    return <AuthEntry onAuth={setAuthMode} />;
  }

  return (
    <main className="terminal-shell">
      <Header
        authMode={authMode}
        timeframe={timeframe}
        view={view}
        onAuth={setAuthMode}
        onTimeframe={setTimeframe}
        onView={setView}
      />

      <section className="terminal-body">
        <aside className="left-rail" aria-label="Market filters">
          <div className="rail-section rail-head">
            <div>
              <p className="micro-label">Filtered View</p>
              <strong>{filteredAssets.length} assets</strong>
            </div>
            <span className="live-dot">Live mock</span>
          </div>

          <div className="rail-section chain-filter-section">
            <div className="section-title">
              <SlidersHorizontal size={14} />
              Chains
            </div>
            <div className="chain-actions">
              <button
                onClick={() => {
                  setSelectedChains(allChains);
                  setActivePreset("Manual");
                }}
              >
                All
              </button>
              <button
                onClick={() => {
                  setSelectedChains([]);
                  setActivePreset("Manual");
                }}
              >
                None
              </button>
            </div>
            <div className="chain-filter-list">
              {allChains.map((chain) => (
                <button
                  className={`chain-filter ${selectedChains.includes(chain) ? "active" : ""}`}
                  key={chain}
                  onClick={() => toggleChain(chain)}
                  style={{ "--chain-color": chainColors[chain] } as CSSProperties}
                >
                  <span />
                  {chain}
                </button>
              ))}
            </div>
          </div>

          <MarketIntelligence
            mode={intelligenceMode}
            onMode={setIntelligenceMode}
            chainSummaries={chainSummaries}
            selectedChain={selectedChainMap}
            selectedChains={selectedChains}
            chainDetails={chainDetails}
            chainStatus={chainDetailStatus}
            sectorSummaries={sectorSummaries}
            selectedSector={selectedSectorMap}
            sectorDetails={sectorDetails}
            sectorStatus={sectorDetailStatus}
            onChainSelect={(chain) => {
              setSelectedChainMap(chain);
            }}
            onSectorSelect={(sector) => {
              setSelectedSectorMap(sector);
            }}
          />

          <div className="rail-section">
            <div className="section-title">RSI range</div>
            <RangeControl min={0} max={100} value={rsiRange} onChange={setRsiRange} />
            <div className="preset-row">
              <button onClick={() => setRsiRange([0, 35])}>Oversold</button>
              <button onClick={() => setRsiRange([35, 70])}>Neutral</button>
              <button onClick={() => setRsiRange([70, 100])}>Hot</button>
            </div>
          </div>

          <div className="rail-section">
            <div className="section-title">MA111 distance</div>
            <RangeControl min={-20} max={20} value={maRange} onChange={setMaRange} suffix="%" />
          </div>

          <div className="rail-section">
            <div className="section-title">Saved presets</div>
            <div className="preset-list">
              {savedPresets.map((preset) => (
                <button
                  className={activePreset === preset.name ? "active" : ""}
                  key={preset.name}
                  onClick={() => loadPreset(preset)}
                >
                  {preset.name}
                  <ChevronDown size={13} />
                </button>
              ))}
            </div>
            <button className="save-preset" onClick={savePreset}>
              Save current view
            </button>
          </div>
        </aside>

        <section className="workspace">
          {view === "terminal" && (
            <>
              <MarketBreadthStrip summaries={marketBreadth} timeframe={timeframe} />

              <div className="workspace-toolbar">
                <div>
                  <p className="micro-label">Market Grid</p>
                  <h2>Top assets by current filtered context</h2>
                </div>
                <div className="toolbar-stats">
                  <Metric label="Pinned" value={`${pinned.length}/5`} />
                  <Metric
                    label={timeframe === "4h" ? "Regime" : "Setups"}
                    value={
                      timeframe === "4h"
                        ? `${signalSummary.bullish}B / ${signalSummary.bearish}S`
                        : `${signalSummary.longBuy + signalSummary.shortSell} active`
                    }
                  />
                  <Metric label="Preset" value={activePreset} />
                  <Metric label="Rows" value={String(filteredAssets.length)} />
                </div>
              </div>

              <AssetGrid
                rows={paginatedAssets}
                timeframe={timeframe}
                currentPage={currentPage}
                pageSize={pageSize}
                sortKey={sortKey}
                sortDirection={sortDirection}
                totalPages={totalPages}
                totalRows={filteredAssets.length}
                pinned={pinned}
                highlightedTickers={highlightedTickers}
                onSort={cycleSort}
                onPage={setCurrentPage}
                onPin={togglePin}
              />
            </>
          )}

          {view === "admin" && <AdminPanel />}
        </section>
      </section>

      <AiDrawer
        open={aiOpen}
        response={aiResponse}
        pinned={pinned}
        rows={paginatedAssets}
        context={aiContext}
        onToggle={() => setAiOpen((current) => !current)}
        onPreset={runAiPreset}
      />
    </main>
  );
}

function AuthEntry({ onAuth }: { onAuth: (mode: AuthMode) => void }) {
  return (
    <main className="entry-shell">
      <div className="entry-tape" aria-hidden="true">
        <div>
          <span>$BTC +1.48</span>
          <span>$ETH -0.64</span>
          <span>$SOL +2.80</span>
          <span>$ARB -4.84</span>
          <span>$AERO +7.59</span>
          <span>$TON +5.41</span>
          <span>$GMX -5.36</span>
          <span>$AVAX +2.62</span>
        </div>
        <div>
          <span>$BTC +1.48</span>
          <span>$ETH -0.64</span>
          <span>$SOL +2.80</span>
          <span>$ARB -4.84</span>
          <span>$AERO +7.59</span>
          <span>$TON +5.41</span>
          <span>$GMX -5.36</span>
          <span>$AVAX +2.62</span>
        </div>
      </div>
      <section className="auth-screen auth-entry" aria-label="Crest entry">
        <div className="entry-signal-field" aria-hidden="true">
          {entrySignals.map((signal, index) => (
            <div className="signal-row" key={`${signal[0]}-${index}`} style={{ "--signal-index": index } as CSSProperties}>
              <span>{signal[0]}</span>
              <span>{signal[1]}%</span>
              <span>{signal[2]}</span>
            </div>
          ))}
        </div>
        <div className="entry-copy">
          <div className="entry-brand">
            <span className="brand-mark">C</span>
            <span>Crest Terminal</span>
          </div>
          <div className="entry-kernel" aria-hidden="true">
            <span />
            <span>Context engine armed</span>
          </div>
          <h1>Market structure, chain strength, and AI context in one dense workspace.</h1>
          <p>Enter as a mock analyst to test the complete product journey before production auth and live data are connected.</p>
          <div className="entry-status" aria-label="Prototype status">
            <span>Mock data</span>
            <span>30m / 4h</span>
            <span>AI drawer ready</span>
          </div>
        </div>
        <div className="auth-actions">
          <p className="micro-label">Access</p>
          <button onClick={() => onAuth("user")}>
            <CircleUserRound size={16} />
            <span>
              Continue with X mock
              <small>OAuth route simulation</small>
            </span>
          </button>
          <button onClick={() => onAuth("user")}>
            <Wallet size={16} />
            <span>
              Connect wallet mock
              <small>SIWE journey preview</small>
            </span>
          </button>
        </div>
        <div className="entry-footer">
          <span>Prototype build</span>
          <span>Vercel preview</span>
          <span>Supabase pending</span>
        </div>
      </section>
    </main>
  );
}

function Header({
  authMode,
  timeframe,
  view,
  onAuth,
  onTimeframe,
  onView
}: {
  authMode: AuthMode;
  timeframe: Timeframe;
  view: ViewMode;
  onAuth: (mode: AuthMode) => void;
  onTimeframe: (timeframe: Timeframe) => void;
  onView: (view: ViewMode) => void;
}) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => onView("terminal")} aria-label="Open terminal">
        <span className="brand-mark">C</span>
        <span>Crest</span>
      </button>
      <nav className="topbar-nav" aria-label="Primary views">
        <button className={view === "terminal" ? "active" : ""} onClick={() => onView("terminal")}>
          <Command size={14} />
          Terminal
        </button>
        <button className={view === "admin" ? "active" : ""} onClick={() => onView("admin")}>
          <Settings size={14} />
          AI config
        </button>
      </nav>
      <div className="timeframe-toggle" aria-label="Timeframe">
        {(["30m", "4h"] as Timeframe[]).map((item) => (
          <button className={timeframe === item ? "active" : ""} key={item} onClick={() => onTimeframe(item)}>
            {item}
          </button>
        ))}
      </div>
      <button className="auth-chip" onClick={() => onAuth(authMode === "visitor" ? "user" : "visitor")}>
        <span className={`session-dot ${authMode}`} />
        {authMode === "visitor" ? "Signed out" : authMode === "admin" ? "Admin mock" : "Analyst mock"}
      </button>
    </header>
  );
}

function MarketIntelligence({
  mode,
  onMode,
  chainSummaries,
  selectedChain,
  selectedChains,
  chainDetails,
  chainStatus,
  sectorSummaries,
  selectedSector,
  sectorDetails,
  sectorStatus,
  onChainSelect,
  onSectorSelect
}: {
  mode: IntelligenceMode;
  onMode: (mode: IntelligenceMode) => void;
  chainSummaries: ReturnType<typeof getChainSummaries>;
  selectedChain: ChainKey;
  selectedChains: ChainKey[];
  chainDetails: ChainProjectDetail[];
  chainStatus: "idle" | "loading" | "ready";
  sectorSummaries: ReturnType<typeof getSectorSummaries>;
  selectedSector: SectorKey;
  sectorDetails: ChainProjectDetail[];
  sectorStatus: "idle" | "loading" | "ready";
  onChainSelect: (chain: ChainKey) => void;
  onSectorSelect: (sector: SectorKey) => void;
}) {
  const rankedChainSummaries = [...chainSummaries].sort((first, second) => second.avgPriceChange - first.avgPriceChange);
  const rankedSectorSummaries = [...sectorSummaries].sort((first, second) => second.avgPriceChange - first.avgPriceChange);
  const activeChainSummary = chainSummaries.find((summary) => summary.chain === selectedChain);
  const activeSectorSummary = sectorSummaries.find((summary) => summary.sector === selectedSector);
  const maxChainVolume = Math.max(...chainSummaries.map((summary) => summary.avgVolumeChange), 1);
  const maxSectorVolume = Math.max(...sectorSummaries.map((summary) => summary.avgVolumeChange), 1);
  const isChainMode = mode === "chain";
  const status = isChainMode ? chainStatus : sectorStatus;
  const color = isChainMode ? chainColors[selectedChain] : sectorColors[selectedSector];

  return (
    <div className="rail-section chain-intel">
      <div className="chain-intel-head">
        <div className="section-title">
          {isChainMode ? <Activity size={14} /> : <BarChart3 size={14} />}
          {isChainMode ? "Chain intelligence" : "Sector intelligence"}
        </div>
        <span className={`fetch-state ${status}`}>{status === "loading" ? "Fetching" : "Ready"}</span>
      </div>

      <div className="intel-tabs" aria-label="Intelligence view">
        <button className={isChainMode ? "active" : ""} onClick={() => onMode("chain")}>
          Chain
        </button>
        <button className={!isChainMode ? "active" : ""} onClick={() => onMode("sector")}>
          Sector
        </button>
      </div>

      {isChainMode ? (
        <div className="chain-map" aria-label="Chain strength map">
          {rankedChainSummaries.map((summary) => {
            const isActive = summary.chain === selectedChain;
            const volumeWidth = Math.max(10, Math.min(100, (summary.avgVolumeChange / maxChainVolume) * 100));
            const bias = summary.avgPriceChange >= 0 ? "positive" : "negative";

            return (
              <button
                className={`chain-signal ${isActive ? "active" : ""} ${selectedChains.includes(summary.chain) ? "in-view" : ""}`}
                key={summary.chain}
                onClick={() => onChainSelect(summary.chain)}
                style={{ "--chain-color": chainColors[summary.chain], "--volume-width": `${volumeWidth}%` } as CSSProperties}
              >
                <span className="chain-signal-main">
                  <strong>{summary.chain}</strong>
                  <span className={bias}>{formatPct(summary.avgPriceChange)}</span>
                </span>
                <span className="chain-signal-bar" aria-hidden="true">
                  <i />
                </span>
                <span className="chain-signal-meta">
                  <span>{summary.assetCount} assets</span>
                  <span>{summary.gainers} up</span>
                  <span>{summary.losers} down</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="chain-map sector-map" aria-label="Sector strength map">
          {rankedSectorSummaries.map((summary) => {
            const isActive = summary.sector === selectedSector;
            const volumeWidth = Math.max(10, Math.min(100, (summary.avgVolumeChange / maxSectorVolume) * 100));
          const bias = summary.avgPriceChange >= 0 ? "positive" : "negative";

          return (
            <button
              className={`chain-signal ${isActive ? "active" : ""} in-view`}
              key={summary.sector}
              onClick={() => onSectorSelect(summary.sector)}
              style={{ "--chain-color": sectorColors[summary.sector], "--volume-width": `${volumeWidth}%` } as CSSProperties}
            >
              <span className="chain-signal-main">
                <strong>{summary.sector}</strong>
                <span className={bias}>{formatPct(summary.avgPriceChange)}</span>
              </span>
              <span className="chain-signal-bar" aria-hidden="true">
                <i />
              </span>
              <span className="chain-signal-meta">
                <span>{summary.assetCount} assets</span>
                <span>${summary.leader}</span>
                <span>{summary.gainers} up</span>
              </span>
            </button>
          );
        })}
        </div>
      )}

      <div className="chain-detail" style={{ "--chain-color": color } as CSSProperties}>
        <div className="chain-detail-head">
          <div>
            <strong>{isChainMode ? selectedChain : selectedSector} projects</strong>
            <span>{isChainMode ? "Fetched chain context" : "Fetched sector context"}</span>
          </div>
          <b>
            {isChainMode
              ? activeChainSummary
                ? `${activeChainSummary.gainers}/${activeChainSummary.assetCount}`
                : "0/0"
              : activeSectorSummary
                ? `${activeSectorSummary.gainers}/${activeSectorSummary.assetCount}`
                : "0/0"}
          </b>
        </div>

        <div className="chain-project-list">
          {status === "loading"
            ? Array.from({ length: 3 }).map((_, index) => (
                <div className="chain-project-row loading" key={index}>
                  <span />
                  <span />
                  <span />
                </div>
              ))
            : (isChainMode ? chainDetails : sectorDetails).map((project) => (
                <article className="chain-project-row" key={project.symbol}>
                  <div>
                    <strong>${project.symbol}</strong>
                    <span>
                      {project.name} / {project.chain}
                    </span>
                  </div>
                  <div>
                    <span className="project-tag">{project.category}</span>
                    <span className={`regime-pill ${project.regime4h.toLowerCase()}`}>{project.regime4h}</span>
                    <span className={`setup-pill ${setupClass(project.recommendation30m)}`}>{project.recommendation30m}</span>
                  </div>
                  <div className="project-metrics">
                    <span className={project.priceChange24h >= 0 ? "positive" : "negative"}>{formatPct(project.priceChange24h)}</span>
                    <span>RSI {project.rsi14.toFixed(1)}</span>
                    <span>30m {project.rsi30m.toFixed(1)}</span>
                    <span className={project.maDistancePct >= 0 ? "positive" : "negative"}>{formatPct(project.maDistancePct)}</span>
                  </div>
                  <p>{project.signalReason}</p>
                </article>
              ))}
        </div>
      </div>
    </div>
  );
}

function RangeControl({
  min,
  max,
  value,
  suffix = "",
  onChange
}: {
  min: number;
  max: number;
  value: [number, number];
  suffix?: string;
  onChange: (value: [number, number]) => void;
}) {
  return (
    <div className="range-control">
      <div className="range-values">
        <span>
          {value[0]}
          {suffix}
        </span>
        <span>
          {value[1]}
          {suffix}
        </span>
      </div>
      <input
        min={min}
        max={max}
        suppressHydrationWarning
        type="range"
        value={value[0]}
        onChange={(event) => onChange([Math.min(Number(event.target.value), value[1]), value[1]])}
      />
      <input
        min={min}
        max={max}
        suppressHydrationWarning
        type="range"
        value={value[1]}
        onChange={(event) => onChange([value[0], Math.max(Number(event.target.value), value[0])])}
      />
    </div>
  );
}

function MarketBreadthStrip({ summaries, timeframe }: { summaries: MarketBreadthSummary[]; timeframe: Timeframe }) {
  return (
    <section className="market-breadth-strip" aria-label="Top universe market breadth">
      <div className="breadth-label">
        <span>Universe breadth</span>
        <strong>{timeframe}</strong>
      </div>
      <div className="breadth-cards">
        {summaries.map((summary) => (
          <article className="breadth-card" key={summary.range}>
            <div className="breadth-card-head">
              <strong>{summary.range}</strong>
              <span>Avg RSI {summary.averageRsi.toFixed(1)}</span>
            </div>
            <div className="breadth-bar" aria-hidden="true">
              <span className="bull" style={{ "--breadth-width": `${summary.bullishPct}%` } as CSSProperties} />
              <span className="bear" style={{ "--breadth-width": `${summary.bearishPct}%` } as CSSProperties} />
            </div>
            <div className="breadth-card-meta">
              <span className="positive">{summary.bullishCount}B</span>
              <span className="negative">{summary.bearishCount}S</span>
              <span>{summary.neutralCount}N</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AssetGrid({
  rows,
  timeframe,
  currentPage,
  pageSize,
  sortKey,
  sortDirection,
  totalPages,
  totalRows,
  pinned,
  highlightedTickers,
  onSort,
  onPage,
  onPin
}: {
  rows: AssetSignalRow[];
  timeframe: Timeframe;
  currentPage: number;
  pageSize: number;
  sortKey: SortKey;
  sortDirection: SortDirection;
  totalPages: number;
  totalRows: number;
  pinned: string[];
  highlightedTickers: string[];
  onSort: (key: SortKey) => void;
  onPage: (page: number) => void;
  onPin: (symbol: string) => void;
}) {
  const visibleColumns: GridColumn[] = [
    ...baseColumns,
    timeframe === "4h" ? { key: "regime4h", label: "Regime" } : { key: "recommendation30m", label: "Setup" }
  ];
  const firstRow = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRow = Math.min(currentPage * pageSize, totalRows);

  return (
    <div className="grid-shell">
      <div className="asset-table-wrap">
        <table className="asset-grid">
          <thead>
            <tr>
              <th aria-label="Pinned assets" />
              {visibleColumns.map((column) => (
                <th className={column.align === "left" ? "left" : ""} key={column.key}>
                  <button onClick={() => onSort(column.key)}>
                    {column.label}
                    <span>{sortKey === column.key ? sortGlyphAscii(sortDirection) : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((asset) => {
              const isPinned = pinned.includes(asset.symbol);
              const isHighlighted = highlightedTickers.includes(asset.symbol);
              return (
                <tr className={`${isPinned ? "pinned" : ""} ${isHighlighted ? "highlight" : ""}`} key={asset.symbol}>
                  <td>
                    <button className={`pin-button ${isPinned ? "active" : ""}`} onClick={() => onPin(asset.symbol)}>
                      <Pin size={13} />
                    </button>
                  </td>
                  <td className="asset-cell">
                    <strong>${asset.symbol}</strong>
                    <span>{asset.name}</span>
                  </td>
                  <td>{formatPrice(asset.price)}</td>
                  <td className={asset.priceChange24h >= 0 ? "positive" : "negative"}>{formatPct(asset.priceChange24h)}</td>
                  <td>
                    <RsiGauge value={asset.rsi14} />
                  </td>
                  <td className={asset.volumeChange24h >= 0 ? "positive" : "negative"}>{formatPct(asset.volumeChange24h)}</td>
                  <td>
                    <span className="chain-badge" style={{ "--chain-color": chainColors[asset.chain] } as CSSProperties}>
                      {asset.chain}
                    </span>
                  </td>
                  <td>{formatPrice(asset.ma111)}</td>
                  <td className={asset.maDistancePct >= 0 ? "positive" : "negative"}>{formatPct(asset.maDistancePct)}</td>
                  <td title={asset.signalReason}>
                    <span className="signal-cell">
                      {timeframe === "4h" ? (
                        <span className={`regime-pill ${asset.regime4h.toLowerCase()}`}>{asset.regime4h}</span>
                      ) : (
                        <span className={`setup-pill ${setupClass(asset.recommendation30m)}`}>{asset.recommendation30m}</span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid-pagination" aria-label="Asset pagination">
        <span>
          Rows {firstRow}-{lastRow} of {totalRows}
        </span>
        <div>
          <button disabled={currentPage <= 1} onClick={() => onPage(Math.max(1, currentPage - 1))} aria-label="Previous page">
            <ChevronLeft size={14} />
            Prev
          </button>
          <strong>
            Page {currentPage} / {totalPages}
          </strong>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => onPage(Math.min(totalPages, currentPage + 1))}
            aria-label="Next page"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function RsiGauge({ value }: { value: number }) {
  const filled = Math.round((value / 100) * 7);
  const zone = value < 30 ? "oversold" : value > 70 ? "overbought" : "neutral";
  return (
    <span className={`rsi-gauge ${zone}`}>
      <span aria-hidden="true">
        {Array.from({ length: 7 }).map((_, index) => (
          <i className={index < filled ? "filled" : ""} key={index} />
        ))}
      </span>
      <b>{value.toFixed(1)}</b>
    </span>
  );
}

function AiDrawer({
  open,
  response,
  pinned,
  rows,
  context,
  onToggle,
  onPreset
}: {
  open: boolean;
  response: string;
  pinned: string[];
  rows: AssetSignalRow[];
  context: AiContextSnapshot;
  onToggle: () => void;
  onPreset: (kind: keyof typeof aiPresetResponses) => void;
}) {
  const contextJson = JSON.stringify(
    {
      timeframe: context.timeframe,
      active_preset: context.activePreset,
      filter_state: {
        chains: context.filterState.chains,
        rsi_range: context.filterState.rsiRange,
        ma_distance_range: context.filterState.maDistanceRange
      },
      sort: context.sort,
      pagination: context.pagination,
      multi_timeframe_rules: multiTimeframeRules,
      market_breadth: context.marketBreadth,
      signal_summary: context.signalSummary,
      visible_assets: context.visibleAssets,
      chain_summary: context.chainSummary,
      sector_summary: context.sectorSummary,
      inspected_chain: context.inspectedChain,
      inspected_sector: context.inspectedSector,
      pinned_assets: context.pinnedAssets
    },
    null,
    2
  );

  return (
    <section className={`ai-drawer ${open ? "open" : ""}`}>
      <button className="ai-collapsed" onClick={onToggle}>
        <Bot size={15} />
        Ask about current data
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {open && (
        <div className="ai-panel">
          <div className="ai-context">
            <span>{rows.length} visible rows</span>
            <span>{pinned.map((symbol) => `$${symbol}`).join(" ") || "No pins"}</span>
          </div>
          <div className="ai-context-packet">
            <span>Context packet</span>
            <span>{context.signalSummary.bullish} bullish / {context.signalSummary.bearish} bearish / {context.signalSummary.neutral} neutral</span>
            <span>
              {context.signalSummary.longBuy + context.signalSummary.shortSell} setups / {context.visibleAssets.length} rows
            </span>
          </div>
          <div className="ai-presets">
            <button onClick={() => onPreset("oversold")}>Oversold opportunities</button>
            <button onClick={() => onPreset("chains")}>Chain strength ranking</button>
            <button onClick={() => onPreset("volume")}>Volume anomalies</button>
            <button onClick={() => onPreset("ma")}>MA111 breakdown watch</button>
            <button onClick={() => onPreset("setup")}>4h regime / 30m trigger</button>
          </div>
          <div className="ai-output-grid">
            <pre className="ai-response">
              {response || "Select a preset prompt to stream a mock analyst response."}
              {response && <span className="cursor">_</span>}
            </pre>
            <details className="ai-context-preview">
              <summary>Injected data</summary>
              <pre>{contextJson}</pre>
            </details>
          </div>
          <div className="ai-input">
            <span>&gt;</span>
            <input placeholder="e.g. which BSC tokens are oversold?" />
          </div>
        </div>
      )}
    </section>
  );
}

function AdminPanel() {
  const [configs, setConfigs] = useState(providerConfigs);

  return (
    <section className="admin-panel">
      <div className="workspace-toolbar">
        <div>
          <p className="micro-label">Admin</p>
          <h2>AI provider configuration</h2>
        </div>
        <div className="toolbar-stats">
          <Metric label="Primary" value={configs.find((config) => config.status === "primary")?.provider || "None"} />
          <Metric label="Enabled" value={String(configs.filter((config) => config.status !== "disabled").length)} />
        </div>
      </div>

      <div className="provider-grid">
        {configs.map((config, index) => (
          <article className="provider-row" key={config.provider}>
            <div>
              <span className={`provider-status ${config.status}`} />
              <strong>{config.provider}</strong>
              <span>{config.model}</span>
            </div>
            <label>
              Max tokens
              <input
                value={config.maxTokens}
                type="number"
                onChange={(event) =>
                  setConfigs((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, maxTokens: Number(event.target.value) } : item
                    )
                  )
                }
              />
            </label>
            <label>
              Temp
              <input
                value={config.temperature}
                step="0.05"
                type="number"
                onChange={(event) =>
                  setConfigs((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, temperature: Number(event.target.value) } : item
                    )
                  )
                }
              />
            </label>
            <label>
              Daily limit
              <input
                value={config.dailyLimit}
                type="number"
                onChange={(event) =>
                  setConfigs((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, dailyLimit: Number(event.target.value) } : item
                    )
                  )
                }
              />
            </label>
            <select
              value={config.status}
              onChange={(event) =>
                setConfigs((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, status: event.target.value as ProviderConfig["status"] } : item
                  )
                )
              }
            >
              <option value="primary">Primary</option>
              <option value="fallback">Fallback</option>
              <option value="disabled">Disabled</option>
            </select>
          </article>
        ))}
      </div>

      <div className="admin-footer">
        <div>
          <Database size={15} />
          Mock save state, Supabase persistence pending.
        </div>
        <button>
          <Sparkles size={15} />
          Save mock config
        </button>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getMarketBreadth(rows: AssetSignalRow[]): MarketBreadthSummary[] {
  return ([100, 200, 300] as const).map((range) => {
    const syntheticRows = Array.from({ length: range }, (_, index) => {
      const base = rows[index % rows.length];
      const bandDrift = range === 100 ? 2.4 : range === 200 ? 0 : -2.8;
      const rsi = clamp(base.rsi14 + Math.sin((index + 1) * 1.47) * 6 + bandDrift, 0, 100);
      const maDistance = base.maDistancePct + Math.cos((index + 1) * 0.91) * 3 + bandDrift * 0.35;

      if (maDistance > 0 && rsi > 55) return "Bullish";
      if (maDistance < 0 && rsi < 50) return "Bearish";
      return "Neutral";
    });
    const averageRsi = average(
      Array.from({ length: range }, (_, index) => {
        const base = rows[index % rows.length];
        const bandDrift = range === 100 ? 2.4 : range === 200 ? 0 : -2.8;
        return clamp(base.rsi14 + Math.sin((index + 1) * 1.47) * 6 + bandDrift, 0, 100);
      })
    );
    const bullishCount = syntheticRows.filter((value) => value === "Bullish").length;
    const bearishCount = syntheticRows.filter((value) => value === "Bearish").length;
    const neutralCount = range - bullishCount - bearishCount;

    return {
      range: `Top ${range}` as MarketBreadthSummary["range"],
      averageRsi,
      bullishCount,
      bearishCount,
      neutralCount,
      bullishPct: Math.round((bullishCount / range) * 100),
      bearishPct: Math.round((bearishCount / range) * 100)
    };
  });
}

function getSignalSummary(rows: AssetSignalRow[]): AiContextSnapshot["signalSummary"] {
  return rows.reduce(
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

function sortRows(rows: AssetSignalRow[], key: SortKey, direction: SortDirection) {
  if (direction === "none") {
    return rows;
  }

  return [...rows].sort((a, b) => {
    const first = a[key];
    const second = b[key];
    const result =
      key === "regime4h" || key === "recommendation30m"
        ? getSortValue(first, key) - getSortValue(second, key)
        : typeof first === "string"
          ? String(first).localeCompare(String(second))
          : Number(first) - Number(second);
    return direction === "asc" ? result : -result;
  });
}

function getSortValue(value: AssetSignalRow[SortKey], key: SortKey) {
  if (key === "regime4h") {
    return { Bullish: 3, Neutral: 2, Bearish: 1 }[String(value)] || 0;
  }

  if (key === "recommendation30m") {
    return { "Long/Buy": 3, "Short/Sell": 2, Wait: 1 }[String(value)] || 0;
  }

  return Number(value);
}

function setupClass(value: AssetSignalRow["recommendation30m"]) {
  if (value === "Long/Buy") return "long";
  if (value === "Short/Sell") return "short";
  return "wait";
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sortGlyphAscii(direction: SortDirection) {
  if (direction === "asc") return "^";
  if (direction === "desc") return "v";
  return "";
}
