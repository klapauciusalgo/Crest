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
  LogOut,
  Pin,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Wallet
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import type { CrestAuthProfile } from "@/lib/auth/profile";
import { formatCompactDollar, formatPct, formatPrice } from "@/lib/formatters";
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
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ViewMode = "terminal" | "admin";
type AuthMode = "visitor" | "user" | "admin";
type AuthStatus = "checking" | "signed-out" | "working" | "signed-in" | "error";
type AuthAction = "x" | "wallet" | null;
type SortKey = keyof Pick<
  AssetSignalRow,
  | "symbol"
  | "price"
  | "priceChange24h"
  | "rsi14"
  | "volumeChange24h"
  | "quoteVolume24h"
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
type MarketApiBreadth = {
  universe: MarketBreadthSummary["range"];
  averageRsi: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
};
type MarketFreshness = {
  timeframe: Timeframe;
  source: string;
  updatedAt: string;
  isStale: boolean;
  coverage: {
    covered: number;
    total: number;
  };
};
type MarketApiResponse = {
  data: AssetSignalRow[];
  breadth?: MarketApiBreadth[];
  freshness?: MarketFreshness;
};
type MarketLoadStatus = "loading" | "live" | "fallback";
type AiContextSnapshot = {
  timeframe: Timeframe;
  dataStatus: {
    source: string;
    loadStatus: MarketLoadStatus;
    lastUpdated: string | null;
    coverage: string;
    rankBasis: string;
  };
  activePreset: string;
  filterState: {
    chains: ChainKey[];
    searchQuery: string;
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
  { key: "volumeChange24h", label: "Vol Chg." },
  { key: "quoteVolume24h", label: "24h Vol" },
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
  const [authMode, setAuthMode] = useState<AuthMode>("visitor");
  const [authProfile, setAuthProfile] = useState<CrestAuthProfile | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authAction, setAuthAction] = useState<AuthAction>(null);
  const [authMessage, setAuthMessage] = useState("Checking Supabase session.");
  const [view, setView] = useState<ViewMode>(initialView);
  const [timeframe, setTimeframe] = useState<Timeframe>("4h");
  const [selectedChains, setSelectedChains] = useState<ChainKey[]>(allChains);
  const [rsiRange, setRsiRange] = useState<[number, number]>([0, 100]);
  const [maRange, setMaRange] = useState<[number, number]>([-100, 100]);
  const [sortKey, setSortKey] = useState<SortKey>("quoteVolume24h");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");
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
  const [remoteAssets, setRemoteAssets] = useState<Partial<Record<Timeframe, AssetSignalRow[]>>>({});
  const [remoteBreadth, setRemoteBreadth] = useState<Partial<Record<Timeframe, MarketBreadthSummary[]>>>({});
  const [freshness, setFreshness] = useState<Partial<Record<Timeframe, MarketFreshness>>>({});
  const [marketStatus, setMarketStatus] = useState<Record<Timeframe, MarketLoadStatus>>({
    "30m": "loading",
    "4h": "loading"
  });
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([
    { name: "BSC oversold", chains: ["BSC"], rsi: [0, 35], ma: [-20, 0] },
    { name: "MA111 support", chains: allChains, rsi: [20, 55], ma: [-5, 1] }
  ]);
  const [activePreset, setActivePreset] = useState("Custom");

  const assets4h = useMemo(() => getMockAssets("4h"), []);
  const assets30m = useMemo(() => getMockAssets("30m"), []);
  const activeTimeframeAssets = timeframe === "4h" ? assets4h : assets30m;
  const mockSourceAssets = useMemo(
    () => enrichAssetsWithSignals(activeTimeframeAssets, assets4h, assets30m),
    [activeTimeframeAssets, assets4h, assets30m]
  );
  const sourceAssets = remoteAssets[timeframe] || mockSourceAssets;
  const activeFreshness = freshness[timeframe];
  const activeMarketStatus = marketStatus[timeframe];
  const marketStatusLabel = getMarketStatusLabel(activeMarketStatus, activeFreshness);
  const filteredAssets = useMemo(() => {
    const rows = sourceAssets.filter(
      (asset) =>
        selectedChains.includes(asset.chain) &&
        matchesAssetSearch(asset, searchQuery) &&
        asset.rsi14 >= rsiRange[0] &&
        asset.rsi14 <= rsiRange[1] &&
        asset.maDistancePct >= maRange[0] &&
        asset.maDistancePct <= maRange[1]
    );

    return sortRows(rows, sortKey, sortDirection);
  }, [maRange, rsiRange, searchQuery, selectedChains, sortDirection, sortKey, sourceAssets]);

  const chainSummaries = useMemo(() => getChainSummaries(sourceAssets), [sourceAssets]);
  const sectorSummaries = useMemo(() => getSectorSummaries(sourceAssets), [sourceAssets]);
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const paginatedAssets = useMemo(() => {
    const pageStart = (currentPage - 1) * pageSize;
    return filteredAssets.slice(pageStart, pageStart + pageSize);
  }, [currentPage, filteredAssets]);
  const visibleTickers = useMemo(() => paginatedAssets.map((asset) => asset.symbol), [paginatedAssets]);
  const signalSummary = useMemo(() => getSignalSummary(filteredAssets), [filteredAssets]);
  const marketBreadth = useMemo(
    () => remoteBreadth[timeframe] || getMarketBreadth(sourceAssets),
    [remoteBreadth, sourceAssets, timeframe]
  );
  const syncProfileFromUser = useCallback(
    async (user: User, message = "Session ready.") => {
      try {
        const response = await fetch("/api/auth/profile", {
          cache: "no-store",
          method: "POST"
        });

        if (!response.ok) {
          throw new Error(`Profile sync returned ${response.status}`);
        }

        const payload = (await response.json()) as { profile: CrestAuthProfile };
        setAuthProfile(payload.profile);
        setAuthMode(payload.profile.role === "admin" ? "admin" : "user");
        setAuthStatus("signed-in");
        setAuthAction(null);
        setAuthMessage(message);

        if (initialView === "admin" && payload.profile.role !== "admin") {
          setView("terminal");
        }
      } catch (error) {
        const fallback = buildClientProfileFallback(user);
        setAuthProfile(fallback);
        setAuthMode("user");
        setAuthStatus("signed-in");
        setAuthAction(null);
        setAuthMessage(`Signed in, but profile persistence is pending: ${getClientErrorMessage(error)}`);
      }
    },
    [initialView]
  );
  const aiContext = useMemo<AiContextSnapshot>(
    () => ({
      timeframe,
      dataStatus: {
        source: activeFreshness?.source || (activeMarketStatus === "fallback" ? "mock" : "loading"),
        loadStatus: activeMarketStatus,
        lastUpdated: activeFreshness?.updatedAt || null,
        coverage: activeFreshness ? `${activeFreshness.coverage.covered}/${activeFreshness.coverage.total}` : "0/0",
        rankBasis: sourceAssets[0]?.rankBasis || "mock"
      },
      activePreset,
      filterState: {
        chains: selectedChains,
        searchQuery,
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
      activeFreshness,
      activeMarketStatus,
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
      searchQuery,
      sectorDetailStatus,
      sectorDetails,
      sectorSummaries,
      selectedChainMap,
      selectedChains,
      selectedSectorMap,
      signalSummary,
      sourceAssets,
      sortDirection,
      sortKey,
      totalPages,
      timeframe
    ]
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let isMounted = true;
    const authError = getAuthErrorFromLocation();

    if (authError) {
      setAuthStatus("error");
      setAuthMessage(authError);
      window.history.replaceState(null, "", window.location.pathname);
    }

    fetch("/api/auth/profile", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Profile check returned ${response.status}`);
        return response.json() as Promise<{ profile: CrestAuthProfile }>;
      })
      .then((payload) => {
        if (!isMounted) return;
        setAuthProfile(payload.profile);
        setAuthMode(payload.profile.role === "admin" ? "admin" : "user");
        setAuthStatus("signed-in");
        setAuthMessage("Session restored.");

        if (initialView === "admin" && payload.profile.role !== "admin") {
          setView("terminal");
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setAuthMode("visitor");
        setAuthProfile(null);
        if (!authError) {
          setAuthStatus("signed-out");
          setAuthMessage("");
        }
      });

    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === "SIGNED_OUT" || !session?.user) {
        setAuthMode("visitor");
        setAuthProfile(null);
        setAuthStatus("signed-out");
        setAuthAction(null);
        setAuthMessage("Signed out.");
        setView("terminal");
        return;
      }

      void syncProfileFromUser(session.user, event === "SIGNED_IN" ? "Session ready." : "Session refreshed.");
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [syncProfileFromUser]);

  useEffect(() => {
    const controller = new AbortController();

    setMarketStatus((current) => ({
      ...current,
      [timeframe]: "loading"
    }));

    fetch(`/api/market/assets?timeframe=${timeframe}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Market API returned ${response.status}`);
        }
        return response.json() as Promise<MarketApiResponse>;
      })
      .then((payload) => {
        setRemoteAssets((current) => ({
          ...current,
          [timeframe]: payload.data.map(normalizeApiAsset)
        }));
        setRemoteBreadth((current) => ({
          ...current,
          [timeframe]: mapApiBreadth(payload.breadth || [])
        }));
        if (payload.freshness) {
          setFreshness((current) => ({
            ...current,
            [timeframe]: payload.freshness
          }));
        }
        setMarketStatus((current) => ({
          ...current,
          [timeframe]: "live"
        }));
      })
      .catch((error: Error) => {
        if (error.name === "AbortError") {
          return;
        }

        console.warn("[crest] Dashboard fell back to mock data.", error.message);
        setMarketStatus((current) => ({
          ...current,
          [timeframe]: "fallback"
        }));
      });

    return () => controller.abort();
  }, [timeframe]);

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
  }, [timeframe, selectedChains, searchQuery, rsiRange, maRange, sortKey, sortDirection]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (view === "admin" && authMode !== "admin") {
      setView("terminal");
    }
  }, [authMode, view]);

  const isSignedOut = authMode === "visitor";

  async function signInWithX() {
    setAuthStatus("working");
    setAuthAction("x");
    setAuthMessage("Opening X OAuth.");
    window.location.assign("/auth/sign-in/x");
  }

  async function signInWithWallet() {
    setAuthStatus("working");
    setAuthAction("wallet");
    setAuthMessage("Waiting for wallet signature.");

    try {
      const walletWindow = window as Window & {
        ethereum?: {
          request: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
        };
      };
      const statement = "Sign in to Crest to connect market filters, pinned assets, and AI context to this session.";
      const ethereum = walletWindow.ethereum;

      if (!ethereum?.request) {
        throw new Error("No Ethereum wallet was detected in this browser.");
      }

      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];

      if (!address) {
        throw new Error("No wallet account was selected.");
      }

      const chainIdHex = (await ethereum.request({ method: "eth_chainId" })) as string;
      const chainId = Number.parseInt(chainIdHex, 16);
      const message = createEthereumSignInMessage({
        address,
        chainId: Number.isFinite(chainId) ? chainId : 1,
        statement
      });
      const signature = (await ethereum.request({
        method: "personal_sign",
        params: [stringToHex(message), address]
      })) as string;
      const response = await fetch("/api/auth/wallet/ethereum", {
        body: JSON.stringify({ message, signature }),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `Wallet auth returned ${response.status}`);
      }

      const payload = (await response.json()) as { profile: CrestAuthProfile };
      setAuthProfile(payload.profile);
      setAuthMode(payload.profile.role === "admin" ? "admin" : "user");
      setAuthStatus("signed-in");
      setAuthAction(null);
      setAuthMessage("Wallet session ready.");
    } catch (error) {
      setAuthStatus("error");
      setAuthAction(null);
      setAuthMessage(getClientErrorMessage(error));
    }
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    setAuthStatus("working");
    setAuthAction(null);
    setAuthMessage("Signing out.");

    if (supabase) {
      await supabase.auth.signOut();
    }

    await fetch("/api/auth/sign-out", {
      cache: "no-store",
      method: "POST"
    }).catch(() => null);

    setAuthMode("visitor");
    setAuthProfile(null);
    setAuthStatus("signed-out");
    setAuthMessage("Signed out.");
    setView("terminal");
  }

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
    setActivePreset("Custom");
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
    return (
      <AuthEntry
        authAction={authAction}
        authMessage={authMessage}
        authStatus={authStatus}
        onSignInWithWallet={signInWithWallet}
        onSignInWithX={signInWithX}
      />
    );
  }

  return (
    <main className="terminal-shell">
      <Header
        authMode={authMode}
        authProfile={authProfile}
        timeframe={timeframe}
        view={view}
        onSignOut={signOut}
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
            <span className={`live-dot ${activeMarketStatus}`}>{marketStatusLabel}</span>
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
                  setActivePreset("Custom");
                }}
              >
                All
              </button>
              <button
                onClick={() => {
                  setSelectedChains([]);
                  setActivePreset("Custom");
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
                  style={{ "--chain-color": getChainColor(chain) } as CSSProperties}
                >
                  <span />
                  {formatChainLabel(chain)}
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
            <RangeControl min={-100} max={100} value={maRange} onChange={setMaRange} suffix="%" />
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
                  <h2>Top assets by volume transaction</h2>
                </div>
                <label className="market-search">
                  <Search size={14} />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search ticker or coin"
                    aria-label="Search ticker or coin"
                  />
                </label>
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
                  <Metric label="Filter" value={activePreset} />
                  <Metric label="Updated" value={getLastUpdateLabel(activeFreshness)} />
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

function AuthEntry({
  authAction,
  authMessage,
  authStatus,
  onSignInWithWallet,
  onSignInWithX
}: {
  authAction: AuthAction;
  authMessage: string;
  authStatus: AuthStatus;
  onSignInWithWallet: () => void;
  onSignInWithX: () => void;
}) {
  const isBusy = authStatus === "checking" || authStatus === "working";

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
          <p>Sign in as an analyst to connect live market context, saved workspace state, and future AI sessions.</p>
          <div className="entry-status" aria-label="Prototype status">
            <span>Live Binance</span>
            <span>30m / 4h</span>
            <span>Supabase Auth</span>
          </div>
        </div>
        <div className="auth-actions">
          <p className="micro-label">Access</p>
          <button disabled={isBusy} onClick={onSignInWithX}>
            <CircleUserRound size={16} />
            <span>
              {authAction === "x" ? "Opening X OAuth" : "Continue with X"}
              <small>Supabase Twitter OAuth</small>
            </span>
          </button>
          <button disabled={isBusy} onClick={onSignInWithWallet}>
            <Wallet size={16} />
            <span>
              {authAction === "wallet" ? "Waiting for signature" : "Connect wallet"}
              <small>Ethereum SIWE via Supabase</small>
            </span>
          </button>
          {authMessage && <div className={`auth-message ${authStatus}`}>{authMessage}</div>}
        </div>
        <div className="entry-footer">
          <span>Production auth</span>
          <span>Vercel preview</span>
          <span>Supabase session</span>
        </div>
      </section>
    </main>
  );
}

function Header({
  authMode,
  authProfile,
  timeframe,
  view,
  onSignOut,
  onTimeframe,
  onView
}: {
  authMode: AuthMode;
  authProfile: CrestAuthProfile | null;
  timeframe: Timeframe;
  view: ViewMode;
  onSignOut: () => void;
  onTimeframe: (timeframe: Timeframe) => void;
  onView: (view: ViewMode) => void;
}) {
  const sessionLabel = authMode === "admin" ? "Admin" : authProfile?.displayName || "Analyst";

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
        {authMode === "admin" && (
          <button className={view === "admin" ? "active" : ""} onClick={() => onView("admin")}>
            <Settings size={14} />
            AI config
          </button>
        )}
      </nav>
      <div className="timeframe-toggle" aria-label="Timeframe">
        {(["30m", "4h"] as Timeframe[]).map((item) => (
          <button className={timeframe === item ? "active" : ""} key={item} onClick={() => onTimeframe(item)}>
            {item}
          </button>
        ))}
      </div>
      <button className="auth-chip" onClick={onSignOut}>
        <span className={`session-dot ${authMode}`} />
        {sessionLabel}
        <LogOut size={13} />
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
  const color = isChainMode ? getChainColor(selectedChain) : sectorColors[selectedSector];

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
                style={{ "--chain-color": getChainColor(summary.chain), "--volume-width": `${volumeWidth}%` } as CSSProperties}
              >
                <span className="chain-signal-main">
                  <strong>{formatChainLabel(summary.chain)}</strong>
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
            <strong>{isChainMode ? formatChainLabel(selectedChain) : selectedSector} projects</strong>
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
                      {project.name} / {formatChainLabel(project.chain)}
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
        <span>Volume breadth</span>
        <strong>{timeframe}</strong>
      </div>
      <div className="breadth-cards">
        {summaries.map((summary) => (
          <article className="breadth-card" key={summary.range}>
            <div className="breadth-card-head">
              <strong>{summary.range} Vol</strong>
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
          <colgroup>
            <col className="col-pin" />
            <col className="col-asset" />
            <col className="col-price" />
            <col className="col-change" />
            <col className="col-rsi" />
            <col className="col-change" />
            <col className="col-volume" />
            <col className="col-chain" />
            <col className="col-price" />
            <col className="col-change" />
            <col className="col-signal" />
          </colgroup>
          <thead>
            <tr>
              <th aria-label="Pinned assets" />
              {visibleColumns.map((column) => (
                <th
                  aria-sort={getAriaSort(sortKey === column.key ? sortDirection : "none")}
                  className={`${column.align === "left" ? "left" : ""} ${sortKey === column.key ? "sorted" : ""}`}
                  key={column.key}
                >
                  <button
                    aria-label={`Sort by ${column.label}`}
                    onClick={() => onSort(column.key)}
                  >
                    <span className="column-label">{column.label}</span>
                    <span className={`sort-indicator ${sortKey === column.key ? sortDirection : "none"}`} aria-hidden="true">
                      {sortGlyphAscii(sortKey === column.key ? sortDirection : "none")}
                    </span>
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
                  <td>{formatCompactDollar(asset.quoteVolume24h || 0)}</td>
                  <td>
                    <span className="chain-badge" style={{ "--chain-color": getChainColor(asset.chain) } as CSSProperties}>
                      {formatChainLabel(asset.chain)}
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
        search_query: context.filterState.searchQuery,
        rsi_range: context.filterState.rsiRange,
        ma_distance_range: context.filterState.maDistanceRange
      },
      sort: context.sort,
      pagination: context.pagination,
      data_status: context.dataStatus,
      rank_basis: context.dataStatus.rankBasis,
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

function normalizeApiAsset(asset: AssetSignalRow): AssetSignalRow {
  return {
    ...asset,
    chain: normalizeChain(asset.chain),
    sectors: asset.sectors.map(normalizeSector),
    rankBasis: asset.rankBasis || "mock",
    quoteVolume24h: asset.quoteVolume24h || 0,
    tradeCount24h: asset.tradeCount24h || 0,
    blacklistStatus: asset.blacklistStatus || "unknown"
  };
}

function buildClientProfileFallback(user: User): CrestAuthProfile {
  const metadata = user.user_metadata || {};
  const displayName =
    getStringMetadata(metadata.name) ||
    getStringMetadata(metadata.full_name) ||
    getStringMetadata(metadata.user_name) ||
    getStringMetadata(metadata.preferred_username) ||
    user.email ||
    "Crest analyst";

  return {
    id: user.id,
    role: "user",
    displayName,
    provider: typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : "supabase",
    xUserId: null,
    walletAddress: getStringMetadata(metadata.wallet_address) || getStringMetadata(metadata.address) || null
  };
}

function getStringMetadata(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getClientErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown authentication error.";
}

function getAuthErrorFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("auth_error");

  if (value === "x_provider_disabled") {
    return "X/Twitter OAuth is not enabled in Supabase Auth yet. Enable the Twitter provider in Supabase, then retry.";
  }

  if (value === "x_oauth_unavailable") {
    return "X OAuth could not be started from Supabase.";
  }

  if (value === "exchange_failed") {
    return "Supabase could not exchange the OAuth callback code.";
  }

  if (value === "auth_not_configured") {
    return "Supabase Auth is not configured for this deployment.";
  }

  if (value === "missing_code") {
    return "The OAuth callback did not include a login code.";
  }

  return null;
}

function createEthereumSignInMessage({
  address,
  chainId,
  statement
}: {
  address: string;
  chainId: number;
  statement: string;
}) {
  const origin = window.location.origin;
  const domain = window.location.host;

  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    statement,
    "",
    `URI: ${origin}/`,
    "Version: 1",
    `Chain ID: ${chainId}`,
    `Nonce: ${createSiweNonce()}`,
    `Issued At: ${new Date().toISOString()}`
  ].join("\n");
}

function createSiweNonce() {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const values = new Uint8Array(17);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function stringToHex(value: string) {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeChain(value: string): ChainKey {
  return value || "Unclassified";
}

function normalizeSector(value: string): SectorKey {
  return Object.keys(sectorColors).includes(value) ? (value as SectorKey) : "Infra";
}

function matchesAssetSearch(asset: AssetSignalRow, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return asset.symbol.toLowerCase().includes(normalized) || asset.name.toLowerCase().includes(normalized);
}

function formatChainLabel(chain: ChainKey | string) {
  return chain === "Unclassified" ? "Other" : chain;
}

function getChainColor(chain: ChainKey | string) {
  return chainColors[chain] || chainColors.Unclassified;
}

function getLastUpdateLabel(freshness?: MarketFreshness) {
  if (!freshness?.updatedAt) return "Loading";
  return `${freshness.source === "binance" ? "Binance" : freshness.source} ${formatLastUpdate(freshness.updatedAt)}`;
}

function mapApiBreadth(rows: MarketApiBreadth[]): MarketBreadthSummary[] {
  return rows.map((row) => {
    const total = row.bullishCount + row.bearishCount + row.neutralCount || 1;

    return {
      range: row.universe,
      averageRsi: row.averageRsi,
      bullishCount: row.bullishCount,
      bearishCount: row.bearishCount,
      neutralCount: row.neutralCount,
      bullishPct: Math.round((row.bullishCount / total) * 100),
      bearishPct: Math.round((row.bearishCount / total) * 100)
    };
  });
}

function getMarketStatusLabel(status: MarketLoadStatus, freshness?: MarketFreshness) {
  if (status === "loading") return "Loading market";
  if (status === "fallback") return "Mock fallback";

  const sourceLabel = freshness?.source === "binance" || freshness?.source === "hybrid" ? "Binance" : freshness?.source || "market";
  const label = `Live ${sourceLabel}`;
  const updated = freshness?.updatedAt ? formatLastUpdate(freshness.updatedAt) : "";
  const coverage = freshness ? `${freshness.coverage.covered}/${freshness.coverage.total}` : "";
  return [label, coverage, updated].filter(Boolean).join(" · ");
}

function formatLastUpdate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta"
  }).format(new Date(value));
}

function getMarketBreadth(rows: AssetSignalRow[]): MarketBreadthSummary[] {
  if (rows.length === 0) {
    return ([100, 200, 300] as const).map((range) => ({
      range: `Top ${range}` as MarketBreadthSummary["range"],
      averageRsi: 0,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      bullishPct: 0,
      bearishPct: 0
    }));
  }

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
          : Number(first || 0) - Number(second || 0);
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
  if (direction === "asc") return "↑";
  if (direction === "desc") return "↓";
  return "";
}

function getAriaSort(direction: SortDirection) {
  if (direction === "asc") return "ascending";
  if (direction === "desc") return "descending";
  return "none";
}
