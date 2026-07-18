"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  Command,
  Database,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Maximize2,
  Minimize2,
  Pin,
  Save,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  TestTube2,
  Wallet
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CrestAuthProfile } from "@/lib/auth/profile";
import { formatCompactDollar, formatPct, formatPrice } from "@/lib/formatters";
import type { AiChatResponse, AiMarketContext, AiProviderConfig, AiSettings, AiUsageQuota } from "@/lib/ai/types";
import {
  AssetSignalRow,
  ChainKey,
  ChainProjectDetail,
  SectorKey,
  Timeframe,
  chainColors,
  enrichAssetsWithSignals,
  getChainProjectDetails,
  getChainSummaries,
  getMockAssets,
  getSectorProjectDetails,
  getSectorSummaries,
  sectorColors
} from "@/lib/mock-data";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ViewMode = "terminal" | "admin";
type AuthMode = "visitor" | "user" | "admin";
type AuthStatus = "checking" | "signed-out" | "working" | "signed-in" | "error";
type AuthAction = "google" | "wallet" | null;
type EthereumProvider = {
  isBitKeep?: boolean;
  isBitget?: boolean;
  isCoinbaseWallet?: boolean;
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
  isRabby?: boolean;
  providers?: EthereumProvider[];
  request: (payload: { method: string; params?: unknown[] }) => Promise<unknown>;
};
type DetectedWallet = {
  icon?: string;
  id: string;
  name: string;
  provider: EthereumProvider;
  rdns?: string;
};
type Eip6963ProviderDetail = {
  info: {
    icon?: string;
    name: string;
    rdns: string;
    uuid: string;
  };
  provider: EthereumProvider;
};
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
  | "btcCorrelationScore"
  | "regime4h"
  | "recommendation30m"
>;
type SortDirection = "none" | "asc" | "desc";
type IntelligenceMode = "chain" | "sector";
type GridColumn = { key: SortKey; label: string; align?: "right" | "left" };
type MarketBreadthSummary = {
  range: "Top 100" | "Top 200" | "Top 300";
  metricKind: "regime" | "setup";
  averageRsi: number;
  positiveLabel: string;
  negativeLabel: string;
  neutralLabel: string;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  positivePct: number;
  negativePct: number;
};
type MarketApiBreadth = {
  timeframe?: Timeframe;
  universe: MarketBreadthSummary["range"];
  metricKind?: MarketBreadthSummary["metricKind"];
  averageRsi: number;
  positiveLabel?: string;
  negativeLabel?: string;
  neutralLabel?: string;
  positiveCount?: number;
  negativeCount?: number;
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
type AiRunStatus = "idle" | "working" | "error";
type AiAdminStatus = "loading" | "ready" | "saving" | "testing" | "error";
type AiProviderForm = {
  id?: string;
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  status: "active" | "disabled";
  maxTokens: number;
  temperature: number;
};
type AiContextSnapshot = {
  timeframe: Timeframe;
  btcRegime4h: string;
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
  { key: "maDistancePct", label: "MA Dist." },
  { key: "btcCorrelationScore", label: "BTC Corr." }
];

function getGridColumns(timeframe: Timeframe): GridColumn[] {
  return [
    ...baseColumns,
    timeframe === "4h"
      ? { key: "regime4h", label: "Regime" }
      : { key: "recommendation30m", label: "Setup" }
  ];
}

const multiTimeframeRules = {
  regime_4h: {
    bullish: "price > MA111 and RSI > 55",
    bearish: "price < MA111 and RSI < 50",
    neutral: "all mixed or boundary conditions"
  },
  recommendation_30m: {
    global_gate: "BTC 4h regime controls directional setup side",
    long_buy: "BTC 4h Bullish and asset 30m RSI < 35",
    short_sell: "BTC 4h Bearish and asset 30m RSI > 70",
    wait: "BTC 4h Neutral, missing BTC data, or all other conditions"
  }
};
const pageSize = 20;

export function CrestTerminal({ initialView }: { initialView: ViewMode }) {
  const [authMode, setAuthMode] = useState<AuthMode>("visitor");
  const [authProfile, setAuthProfile] = useState<CrestAuthProfile | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authAction, setAuthAction] = useState<AuthAction>(null);
  const [authMessage, setAuthMessage] = useState("Checking wallet session.");
  const [detectedWallets, setDetectedWallets] = useState<DetectedWallet[]>([]);
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
    () => remoteBreadth[timeframe] || getMarketBreadth(sourceAssets, timeframe),
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
      btcRegime4h: getBtcRegime4h(sourceAssets),
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

  useEffect(() => {
    let isMounted = true;

    const cleanup = detectEthereumWallets((wallets) => {
      if (isMounted) {
        setDetectedWallets(wallets);
      }
    });

    return () => {
      isMounted = false;
      cleanup();
    };
  }, []);

  const isSignedOut = authMode === "visitor";

  async function signInWithWallet(walletId?: string) {
    setAuthStatus("working");
    setAuthAction("wallet");
    setAuthMessage("Waiting for wallet signature.");

    try {
      const statement = "Sign in to Crest to connect market filters, pinned assets, and AI context to this session.";
      const wallet = getWalletForConnection(detectedWallets, walletId);

      if (!wallet?.provider?.request) {
        throw new Error("No Ethereum wallet was detected in this browser.");
      }

      const ethereum = wallet.provider;
      setAuthMessage(`Waiting for ${wallet.name} signature.`);

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
      setAuthMessage(`${wallet.name} session ready.`);
    } catch (error) {
      setAuthStatus("error");
      setAuthAction(null);
      setAuthMessage(getClientErrorMessage(error));
    }
  }

  function signInWithGoogle() {
    setAuthStatus("working");
    setAuthAction("google");
    setAuthMessage("Redirecting to Google.");
    window.location.href = "/auth/sign-in/google";
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

  function applySort(key: SortKey, direction: SortDirection) {
    setSortKey(key);
    setSortDirection(direction);
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

  if (isSignedOut && authStatus === "checking") {
    return <AuthRestoring />;
  }

  if (isSignedOut) {
    return (
      <AuthEntry
        authAction={authAction}
        authMessage={authMessage}
        authStatus={authStatus}
        detectedWallets={detectedWallets}
        onSignInWithGoogle={signInWithGoogle}
        onSignInWithWallet={signInWithWallet}
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
                <MobileSortControls
                  timeframe={timeframe}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSortChange={applySort}
                />
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
        onResponse={setAiResponse}
      />
    </main>
  );
}

function AuthRestoring() {
  return (
    <main className="entry-shell">
      <section className="auth-restoring" aria-live="polite" aria-label="Restoring Crest session">
        <div className="entry-brand">
          <span className="brand-mark">C</span>
          <span>Crest Terminal</span>
        </div>
        <div className="entry-kernel" aria-hidden="true">
          <span />
          <span>Restoring session</span>
        </div>
        <div className="restore-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}

function AuthEntry({
  authAction,
  authMessage,
  authStatus,
  detectedWallets,
  onSignInWithGoogle,
  onSignInWithWallet
}: {
  authAction: AuthAction;
  authMessage: string;
  authStatus: AuthStatus;
  detectedWallets: DetectedWallet[];
  onSignInWithGoogle: () => void;
  onSignInWithWallet: (walletId?: string) => void;
}) {
  const isBusy = authStatus === "checking" || authStatus === "working";
  const hasWallets = detectedWallets.length > 0;

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
          <h1>Market structure, chain strength, and AI context for disciplined crypto analysis.</h1>
          <p>
            Sign in with Gmail or connect a wallet to access a live analytical workspace built for regime tracking,
            liquidity rotation, and context-aware market review.
          </p>
          <div className="entry-status" aria-label="Prototype status">
            <span>Live Binance</span>
            <span>30m / 4h regimes</span>
            <span>Gmail or wallet session</span>
          </div>
        </div>
        <div className="auth-actions">
          <p className="micro-label">Access</p>
          <button disabled={isBusy} onClick={onSignInWithGoogle}>
            <Mail size={16} />
            <span>
              {authAction === "google" ? "Redirecting to Google" : "Continue with Gmail"}
            </span>
          </button>
          <button disabled={isBusy} onClick={() => onSignInWithWallet()}>
            <Wallet size={16} />
            <span>
              {authAction === "wallet" ? "Waiting for signature" : "Connect wallet"}
              <small>{hasWallets ? `${detectedWallets.length} wallet${detectedWallets.length > 1 ? "s" : ""} detected` : "MetaMask, OKX, Bitget, and EIP-1193 wallets"}</small>
            </span>
          </button>
          {hasWallets && (
            <div className="wallet-picker" aria-label="Detected wallets">
              {detectedWallets.map((wallet) => (
                <button
                  className="wallet-option"
                  disabled={isBusy}
                  key={wallet.id}
                  onClick={() => onSignInWithWallet(wallet.id)}
                  type="button"
                >
                  {wallet.icon ? <img alt="" src={wallet.icon} /> : <span>{wallet.name.slice(0, 1)}</span>}
                  <strong>{wallet.name}</strong>
                </button>
              ))}
            </div>
          )}
          {authMessage && <div className={`auth-message ${authStatus}`}>{authMessage}</div>}
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
      <button className="auth-chip" onClick={onSignOut} aria-label="Sign out">
        <span className={`session-dot ${authMode}`} />
        <span className="auth-label">{sessionLabel}</span>
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
              <span className="bull" style={{ "--breadth-width": `${summary.positivePct}%` } as CSSProperties} />
              <span className="bear" style={{ "--breadth-width": `${summary.negativePct}%` } as CSSProperties} />
            </div>
            <div className="breadth-card-meta">
              <span className="positive">{formatBreadthMetric(summary.positiveCount, summary.positiveLabel)}</span>
              <span className="negative">{formatBreadthMetric(summary.negativeCount, summary.negativeLabel)}</span>
              <span>{formatBreadthMetric(summary.neutralCount, summary.neutralLabel)}</span>
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
  const visibleColumns = getGridColumns(timeframe);
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
            <col className="col-correlation" />
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
                  <td className="pin-cell" data-label="Pin">
                    <button
                      aria-label={`${isPinned ? "Unpin" : "Pin"} ${asset.symbol}`}
                      className={`pin-button ${isPinned ? "active" : ""}`}
                      onClick={() => onPin(asset.symbol)}
                    >
                      <Pin size={13} />
                    </button>
                  </td>
                  <td className="asset-cell" data-label="Asset">
                    <Link className="asset-link" href={`/assets/${asset.symbol}?timeframe=${timeframe}`}>
                      <strong>${asset.symbol}</strong>
                      <span>{asset.name}</span>
                    </Link>
                  </td>
                  <td data-label="Price">{formatPrice(asset.price)}</td>
                  <td data-label="24h" className={asset.priceChange24h >= 0 ? "positive" : "negative"}>{formatPct(asset.priceChange24h)}</td>
                  <td data-label="RSI">
                    <RsiGauge value={asset.rsi14} />
                  </td>
                  <td data-label="Vol chg." className={asset.volumeChange24h >= 0 ? "positive" : "negative"}>{formatPct(asset.volumeChange24h)}</td>
                  <td data-label="24h Vol">{formatCompactDollar(asset.quoteVolume24h || 0)}</td>
                  <td data-label="Chain">
                    <span className="chain-badge" style={{ "--chain-color": getChainColor(asset.chain) } as CSSProperties}>
                      {formatChainLabel(asset.chain)}
                    </span>
                  </td>
                  <td data-label="MA111">{formatPrice(asset.ma111)}</td>
                  <td data-label="MA dist." className={asset.maDistancePct >= 0 ? "positive" : "negative"}>{formatPct(asset.maDistancePct)}</td>
                  <td data-label="BTC corr." className={getCorrelationClass(asset.btcCorrelationScore)}>
                    {formatCorrelationScore(asset.btcCorrelationScore)}
                  </td>
                  <td data-label={timeframe === "4h" ? "Regime" : "Setup"} title={asset.signalReason}>
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

function MobileSortControls({
  timeframe,
  sortKey,
  sortDirection,
  onSortChange
}: {
  timeframe: Timeframe;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortChange: (key: SortKey, direction: SortDirection) => void;
}) {
  const columns = getGridColumns(timeframe);
  const activeDirection = sortDirection === "none" ? getDefaultSortDirection(sortKey) : sortDirection;

  return (
    <section className="mobile-sort-panel" aria-label="Mobile asset sorting">
      <label className="mobile-sort-select">
        <span>Sort</span>
        <select
          aria-label="Sort assets by"
          value={sortKey}
          onChange={(event) => {
            const nextKey = event.target.value as SortKey;
            onSortChange(nextKey, getDefaultSortDirection(nextKey));
          }}
        >
          {columns.map((column) => (
            <option key={column.key} value={column.key}>
              {column.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mobile-sort-direction" aria-label="Sort direction" role="group">
        <button
          className={activeDirection === "desc" ? "active" : ""}
          onClick={() => onSortChange(sortKey, "desc")}
          type="button"
        >
          {isTextSortKey(sortKey) ? "Z to A" : "High to low"}
        </button>
        <button
          className={activeDirection === "asc" ? "active" : ""}
          onClick={() => onSortChange(sortKey, "asc")}
          type="button"
        >
          {isTextSortKey(sortKey) ? "A to Z" : "Low to high"}
        </button>
      </div>
    </section>
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
  onResponse
}: {
  open: boolean;
  response: string;
  pinned: string[];
  rows: AssetSignalRow[];
  context: AiContextSnapshot;
  onToggle: () => void;
  onResponse: (value: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<AiRunStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [quota, setQuota] = useState<AiUsageQuota | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>();
  const [serverContext, setServerContext] = useState<AiMarketContext | null>(null);
  const [responseExpanded, setResponseExpanded] = useState(false);
  const responseRef = useRef<HTMLPreElement | null>(null);
  const contextJson = JSON.stringify(
    serverContext || {
      note: "Server-side context will be rebuilt from the latest full market snapshot when a prompt is sent.",
      request_focus: {
        timeframe: context.timeframe,
        active_preset: context.activePreset,
        filter_state: {
          chains: context.filterState.chains,
          search_query: context.filterState.searchQuery,
          rsi_range: context.filterState.rsiRange,
          ma_distance_range: context.filterState.maDistanceRange
        },
        sort: context.sort,
        data_status: context.dataStatus,
        btc_regime_4h: context.btcRegime4h,
        rank_basis: context.dataStatus.rankBasis,
        btc_correlation: {
          benchmark: "BTC",
          scale: "-100 to +100",
          method: "Pearson close-to-close log returns",
          windowReturns: 60,
          minimumPairedReturns: 30
        },
        multi_timeframe_rules: multiTimeframeRules,
        visible_rows_focus: context.visibleAssets.length,
        pinned_assets: context.pinnedAssets
      }
    },
    null,
    2
  );
  const contextScopeLabel = serverContext
    ? `${serverContext.assets.length} latest ${context.timeframe} context rows`
    : `Latest full ${context.timeframe} snapshot on submit`;
  const contextUpdatedAt = serverContext?.dataStatus.lastUpdated || context.dataStatus.lastUpdated;
  const presets = [
    "Which assets have actionable 30m setups?",
    "Rank chain strength by latest breadth.",
    "Find volume anomalies with weak price follow-through.",
    "Which assets are closest to MA111 breakdown?",
    "Summarize 4h regime risk in the latest snapshot."
  ];

  useEffect(() => {
    if (status === "working") {
      responseRef.current?.scrollTo({ top: responseRef.current.scrollHeight });
    }
  }, [response, status]);

  async function submitPrompt(message: string) {
    const cleanMessage = message.trim();
    if (!cleanMessage || status === "working") return;

    setStatus("working");
    setErrorMessage("");
    setResponseExpanded(true);
    onResponse("");

    try {
      const apiResponse = await fetch("/api/ai/chat", {
        body: JSON.stringify({
          message: cleanMessage,
          timeframe: context.timeframe,
          activePreset: context.activePreset,
          filters: {
            chains: context.filterState.chains,
            searchQuery: context.filterState.searchQuery,
            rsiRange: context.filterState.rsiRange,
            maDistanceRange: context.filterState.maDistanceRange
          },
          sort: context.sort,
          pinnedAssets: pinned.map((symbol) => `$${symbol}`),
          threadId
        }),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = (await apiResponse.json().catch(() => ({}))) as Partial<AiChatResponse> & {
        error?: string;
        quota?: AiUsageQuota;
      };

      if (!apiResponse.ok) {
        if (payload.quota) setQuota(payload.quota);
        throw new Error(payload.error || `AI route returned ${apiResponse.status}`);
      }

      if (!payload.answer || !payload.context || !payload.provider) {
        throw new Error("AI response was incomplete.");
      }

      setQuota(payload.quota || null);
      setServerContext(payload.context);
      setThreadId(payload.threadId || threadId);
      setPrompt("");
      streamText(payload.answer);
    } catch (error) {
      setStatus("error");
      setErrorMessage(getClientErrorMessage(error));
    }
  }

  function streamText(value: string) {
    let index = 0;
    const timer = window.setInterval(() => {
      index += 8;
      onResponse(value.slice(0, index));
      if (index >= value.length) {
        window.clearInterval(timer);
        setStatus("idle");
      }
    }, 14);
  }

  return (
    <section className={`ai-drawer ${open ? "open" : ""} ${responseExpanded ? "expanded" : ""}`}>
      <button className="ai-collapsed" onClick={onToggle}>
        <Bot size={15} />
        Ask about current data
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {open && (
        <div className="ai-panel">
          <div className="ai-context">
            <span>{contextScopeLabel}</span>
            <span>{contextUpdatedAt ? `Data ${formatLastUpdate(contextUpdatedAt)}` : "Data pending"}</span>
            <span>{quota ? `${quota.remaining}/${quota.limit} prompts left` : "Credit sync pending"}</span>
          </div>
          <div className="ai-context-packet">
            <span>{pinned.map((symbol) => `$${symbol}`).join(" ") || "No pins"}</span>
            <span>
              {context.signalSummary.longBuy + context.signalSummary.shortSell} filtered setups / {rows.length} visible
            </span>
            <button
              aria-label={responseExpanded ? "Compact AI answer" : "Expand AI answer"}
              className="ai-expand-toggle"
              disabled={!response && status !== "working"}
              onClick={() => setResponseExpanded((current) => !current)}
              type="button"
            >
              {responseExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>
          <div className="ai-presets">
            {presets.map((item) => (
              <button disabled={status === "working"} key={item} onClick={() => submitPrompt(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="ai-output-grid">
            <pre className="ai-response" ref={responseRef}>
              {status === "working" && !response ? "Reading latest Crest snapshot and provider config..." : response || "Ask about the latest full market snapshot. The server will rebuild context from stored 30m or 4h data before answering."}
              {(response || status === "working") && <span className="cursor">_</span>}
              {status === "error" && <span className="ai-error-line">{"\n"}{errorMessage}</span>}
            </pre>
            <details className="ai-context-preview">
              <summary>Injected data</summary>
              <pre>{contextJson}</pre>
            </details>
          </div>
          <form
            className="ai-input"
            onSubmit={(event) => {
              event.preventDefault();
              submitPrompt(prompt);
            }}
          >
            <span>&gt;</span>
            <input
              disabled={status === "working"}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. which assets are actionable in the latest 30m data?"
              value={prompt}
            />
            <button disabled={status === "working" || !prompt.trim()} type="submit">
              {status === "working" ? <Loader2 size={14} /> : <Send size={14} />}
              Ask
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function AdminPanel() {
  const [status, setStatus] = useState<AiAdminStatus>("loading");
  const [message, setMessage] = useState("");
  const [providers, setProviders] = useState<AiProviderConfig[]>([]);
  const providerEditorRef = useRef<HTMLElement | null>(null);
  const [settings, setSettings] = useState<AiSettings>({
    weeklyPromptLimit: 5,
    resetTimezone: "Asia/Jakarta",
    systemPrompt: "",
    updatedAt: null
  });
  const [form, setForm] = useState<AiProviderForm>(createEmptyProviderForm());

  useEffect(() => {
    let isMounted = true;

    fetch("/api/admin/ai-config", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          providers?: AiProviderConfig[];
          settings?: AiSettings;
        };
        if (!response.ok || !payload.providers || !payload.settings) {
          throw new Error(payload.error || `Admin config returned ${response.status}`);
        }
        return payload as { providers: AiProviderConfig[]; settings: AiSettings };
      })
      .then((payload) => {
        if (!isMounted) return;
        setProviders(payload.providers);
        setSettings(payload.settings);
        setForm(providerToForm(payload.providers.find((provider) => provider.status === "active") || payload.providers[0]));
        setStatus("ready");
      })
      .catch((error) => {
        if (!isMounted) return;
        setStatus("error");
        setMessage(getClientErrorMessage(error));
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function saveProvider() {
    setStatus("saving");
    setMessage("");

    try {
      const providerForm = readProviderForm(form, providerEditorRef.current);

      if (!providerForm.providerName || !providerForm.baseUrl || !providerForm.model) {
        throw new Error("Provider, base URL, and model are required.");
      }

      if (!providerForm.id && !providerForm.apiKey) {
        throw new Error("API key is required before saving a new provider.");
      }

      setForm(providerForm);

      const response = await fetch("/api/admin/ai-config", {
        body: JSON.stringify({ provider: providerForm }),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = (await response.json().catch(() => ({}))) as { provider?: AiProviderConfig; error?: string };

      if (!response.ok || !payload.provider) {
        throw new Error(payload.error || `Save returned ${response.status}`);
      }

      setProviders((current) => upsertProviderList(current, payload.provider as AiProviderConfig));
      setForm(providerToForm(payload.provider));
      setStatus("ready");
      setMessage("Provider saved. API key is encrypted server-side.");
    } catch (error) {
      setStatus("error");
      setMessage(getClientErrorMessage(error));
    }
  }

  function updateProviderField<K extends keyof AiProviderForm>(key: K, value: AiProviderForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateProviderTextField(key: "providerName" | "baseUrl" | "model" | "apiKey", value: string) {
    updateProviderField(key, value);
  }

  function updateProviderNumberField(key: "maxTokens" | "temperature", value: string) {
    const parsed = Number(value.replace(",", "."));
    setForm((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : current[key] }));
  }

  function updateWeeklyPromptLimit(value: string) {
    const parsed = Number(value);
    setSettings((current) => ({
      ...current,
      weeklyPromptLimit: Number.isFinite(parsed) ? parsed : current.weeklyPromptLimit
    }));
  }

  function updateSystemPrompt(value: string) {
    setSettings((current) => ({ ...current, systemPrompt: value }));
  }

  async function saveSettings() {
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch("/api/admin/ai-config", {
        body: JSON.stringify({ settings }),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = (await response.json().catch(() => ({}))) as { settings?: AiSettings; error?: string };

      if (!response.ok || !payload.settings) {
        throw new Error(payload.error || `Settings save returned ${response.status}`);
      }

      setSettings(payload.settings);
      setStatus("ready");
      setMessage("Weekly credit policy saved.");
    } catch (error) {
      setStatus("error");
      setMessage(getClientErrorMessage(error));
    }
  }

  async function testProvider() {
    if (!form.id) {
      setStatus("error");
      setMessage("Save the provider before running a connection test.");
      return;
    }

    setStatus("testing");
    setMessage("Testing provider connection.");

    try {
      const response = await fetch(`/api/admin/ai-config/providers/${form.id}/test`, {
        cache: "no-store",
        method: "POST"
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; latencyMs?: number; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Test returned ${response.status}`);
      }

      setStatus("ready");
      setMessage(`Connection OK in ${payload.latencyMs}ms.`);
    } catch (error) {
      setStatus("error");
      setMessage(getClientErrorMessage(error));
    }
  }

  const activeProvider = providers.find((provider) => provider.status === "active");
  const enabledCount = providers.filter((provider) => provider.status === "active").length;
  const isBusy = status === "saving" || status === "testing" || status === "loading";

  return (
    <section className="admin-panel">
      <div className="workspace-toolbar">
        <div>
          <p className="micro-label">Admin</p>
          <h2>AI context control plane</h2>
        </div>
        <div className="toolbar-stats">
          <Metric label="Active" value={activeProvider?.providerName || "None"} />
          <Metric label="Providers" value={String(providers.length)} />
          <Metric label="Weekly credit" value={`${settings.weeklyPromptLimit}/user`} />
          <Metric label="Timezone" value="WIB" />
        </div>
      </div>

      <div className="ai-admin-grid">
        <aside className="provider-roster" aria-label="Configured AI providers">
          <div className="admin-section-head">
            <div>
              <p className="micro-label">Providers</p>
              <strong>{enabledCount} active route</strong>
            </div>
            <button onClick={() => setForm(createEmptyProviderForm())} type="button">
              New
            </button>
          </div>
          <div className="provider-roster-list">
            {providers.length === 0 && (
              <div className="provider-empty">
                <KeyRound size={15} />
                No provider stored yet.
              </div>
            )}
            {providers.map((provider) => (
              <button
                className={form.id === provider.id ? "active" : ""}
                key={provider.id}
                onClick={() => setForm(providerToForm(provider))}
                type="button"
              >
                <span className={`provider-status ${provider.status}`} />
                <strong>{provider.providerName}</strong>
                <small>{provider.model}</small>
                <em>{provider.lastTestStatus || "untested"}</em>
              </button>
            ))}
          </div>
        </aside>

        <section className="provider-editor" aria-label="AI provider editor" ref={providerEditorRef}>
          <div className="admin-section-head">
            <div>
              <p className="micro-label">Provider route</p>
              <strong>{form.id ? "Edit provider" : "New provider"}</strong>
            </div>
            <span className={`admin-state ${status}`}>
              {status === "testing" || status === "saving" || status === "loading" ? <Loader2 size={13} /> : status === "error" ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
              {status}
            </span>
          </div>
          {message && (
            <div className={`provider-feedback ${status}`} role={status === "error" ? "alert" : "status"}>
              {status === "error" ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              <span>{message}</span>
            </div>
          )}

          <div className="provider-form-grid">
            <label>
              Provider
              <input
                disabled={isBusy}
                name="providerName"
                onChange={(event) => updateProviderTextField("providerName", event.currentTarget.value)}
                onInput={(event) => updateProviderTextField("providerName", event.currentTarget.value)}
                placeholder="Ollama Cloud"
                value={form.providerName}
              />
            </label>
            <label>
              Status
              <select
                disabled={isBusy}
                onChange={(event) => updateProviderField("status", event.currentTarget.value as AiProviderForm["status"])}
                value={form.status}
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label className="wide">
              Base URL
              <input
                disabled={isBusy}
                name="baseUrl"
                onChange={(event) => updateProviderTextField("baseUrl", event.currentTarget.value)}
                onInput={(event) => updateProviderTextField("baseUrl", event.currentTarget.value)}
                placeholder="https://api.openai.com/v1"
                value={form.baseUrl}
              />
            </label>
            <label>
              Model
              <input
                disabled={isBusy}
                name="model"
                onChange={(event) => updateProviderTextField("model", event.currentTarget.value)}
                onInput={(event) => updateProviderTextField("model", event.currentTarget.value)}
                placeholder="gpt-4.1-mini"
                value={form.model}
              />
            </label>
            <label>
              API key
              <input
                disabled={isBusy}
                name="apiKey"
                onChange={(event) => updateProviderTextField("apiKey", event.currentTarget.value)}
                onInput={(event) => updateProviderTextField("apiKey", event.currentTarget.value)}
                placeholder={form.id ? "Leave blank to keep encrypted key" : "Required"}
                type="password"
                value={form.apiKey}
              />
            </label>
            <label>
              Max tokens
              <input
                disabled={isBusy}
                min={64}
                max={8192}
                name="maxTokens"
                onChange={(event) => updateProviderNumberField("maxTokens", event.currentTarget.value)}
                type="number"
                value={form.maxTokens}
              />
            </label>
            <label>
              Temperature
              <input
                disabled={isBusy}
                max={2}
                min={0}
                name="temperature"
                onChange={(event) => updateProviderNumberField("temperature", event.currentTarget.value)}
                step="0.05"
                type="number"
                value={form.temperature}
              />
            </label>
          </div>

          <div className="admin-action-row">
            <button disabled={isBusy} onClick={saveProvider} type="button">
              {status === "saving" ? <Loader2 size={14} /> : <Save size={14} />}
              Save provider
            </button>
            <button disabled={isBusy || !form.id} onClick={testProvider} type="button">
              {status === "testing" ? <Loader2 size={14} /> : <TestTube2 size={14} />}
              Test connection
            </button>
          </div>
        </section>

        <section className="credit-editor" aria-label="AI credit policy">
          <div className="admin-section-head">
            <div>
              <p className="micro-label">Usage policy</p>
              <strong>Weekly prompt credits</strong>
            </div>
            <span>Reset Monday 00:00 WIB</span>
          </div>
          <div className="provider-form-grid compact">
            <label>
              Prompts per user
              <input
                disabled={isBusy}
                max={1000}
                min={0}
                onChange={(event) => updateWeeklyPromptLimit(event.currentTarget.value)}
                type="number"
                value={settings.weeklyPromptLimit}
              />
            </label>
            <label className="wide">
              System note
              <textarea
                disabled={isBusy}
                onChange={(event) => updateSystemPrompt(event.currentTarget.value)}
                placeholder="Optional admin instruction appended to Crest AI behavior."
                value={settings.systemPrompt}
              />
            </label>
          </div>
          <div className="admin-action-row">
            <button disabled={isBusy} onClick={saveSettings} type="button">
              {status === "saving" ? <Loader2 size={14} /> : <Save size={14} />}
              Save credit policy
            </button>
          </div>
        </section>
      </div>

      <div className="admin-footer">
        <div>
          <Database size={15} />
          API keys are encrypted before storage. User prompts read the latest full snapshot for the active timeframe.
        </div>
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

function createEmptyProviderForm(): AiProviderForm {
  return {
    providerName: "Ollama Cloud",
    baseUrl: "",
    model: "",
    apiKey: "",
    status: "active",
    maxTokens: 1800,
    temperature: 0.2
  };
}

function providerToForm(provider?: AiProviderConfig): AiProviderForm {
  if (!provider) return createEmptyProviderForm();

  return {
    id: provider.id,
    providerName: provider.providerName,
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKey: "",
    status: provider.status,
    maxTokens: provider.maxTokens,
    temperature: provider.temperature
  };
}

function readProviderForm(current: AiProviderForm, root: HTMLElement | null): AiProviderForm {
  if (!root) return current;

  return {
    ...current,
    providerName: readInputValue(root, "providerName", current.providerName).trim(),
    baseUrl: readInputValue(root, "baseUrl", current.baseUrl).trim(),
    model: readInputValue(root, "model", current.model).trim(),
    apiKey: readInputValue(root, "apiKey", current.apiKey).trim(),
    maxTokens: Math.max(64, Math.min(8192, Math.floor(readNumericInputValue(root, "maxTokens", current.maxTokens)))),
    temperature: Math.max(0, Math.min(2, readNumericInputValue(root, "temperature", current.temperature)))
  };
}

function readInputValue(root: HTMLElement, name: string, fallback: string) {
  const input = root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
  return input?.value || fallback;
}

function readNumericInputValue(root: HTMLElement, name: string, fallback: number) {
  const value = readInputValue(root, name, String(fallback)).replace(",", ".");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function upsertProviderList(providers: AiProviderConfig[], provider: AiProviderConfig) {
  const nextProviders = provider.status === "active"
    ? providers.map((item) => ({ ...item, status: "disabled" as const }))
    : providers;
  const index = nextProviders.findIndex((item) => item.id === provider.id);

  if (index === -1) return [provider, ...nextProviders];

  return nextProviders.map((item) => (item.id === provider.id ? provider : item));
}

function normalizeApiAsset(asset: AssetSignalRow): AssetSignalRow {
  return {
    ...asset,
    chain: normalizeChain(asset.chain),
    sectors: asset.sectors.map(normalizeSector),
    btcCorrelationScore: normalizeCorrelationScore(asset.btcCorrelationScore),
    rankBasis: asset.rankBasis || "mock",
    quoteVolume24h: asset.quoteVolume24h || 0,
    tradeCount24h: asset.tradeCount24h || 0,
    blacklistStatus: asset.blacklistStatus || "unknown"
  };
}

function detectEthereumWallets(onUpdate: (wallets: DetectedWallet[]) => void) {
  const discovered = new Map<string, DetectedWallet>();

  function publish() {
    onUpdate(Array.from(discovered.values()).sort(sortDetectedWallets));
  }

  function addWallet(wallet: DetectedWallet) {
    if (!wallet.provider?.request) return;

    const existing = Array.from(discovered.values()).find((item) => item.provider === wallet.provider);
    if (existing) return;

    discovered.set(wallet.id, wallet);
    publish();
  }

  function handleEip6963(event: Event) {
    const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
    if (!detail?.provider?.request) return;

    addWallet({
      icon: detail.info.icon,
      id: detail.info.uuid || detail.info.rdns || detail.info.name,
      name: detail.info.name || getProviderDisplayName(detail.provider),
      provider: detail.provider,
      rdns: detail.info.rdns
    });
  }

  window.addEventListener("eip6963:announceProvider", handleEip6963);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  window.setTimeout(() => {
    getFallbackEthereumProviders().forEach((provider, index) => {
      addWallet({
        id: `${getProviderDisplayName(provider)}-${index}`,
        name: getProviderDisplayName(provider),
        provider
      });
    });
  }, 250);

  window.setTimeout(publish, 320);

  return () => window.removeEventListener("eip6963:announceProvider", handleEip6963);
}

function getFallbackEthereumProviders() {
  const walletWindow = window as Window & {
    bitgetEthereum?: EthereumProvider;
    bitkeep?: { ethereum?: EthereumProvider };
    ethereum?: EthereumProvider;
    okxwallet?: { ethereum?: EthereumProvider };
  };
  const providers: EthereumProvider[] = [];
  const ethereum = walletWindow.ethereum;

  if (ethereum?.providers?.length) {
    providers.push(...ethereum.providers);
  } else if (ethereum?.request) {
    providers.push(ethereum);
  }

  if (walletWindow.okxwallet?.ethereum?.request) providers.push(walletWindow.okxwallet.ethereum);
  if (walletWindow.bitkeep?.ethereum?.request) providers.push(walletWindow.bitkeep.ethereum);
  if (walletWindow.bitgetEthereum?.request) providers.push(walletWindow.bitgetEthereum);

  return providers.filter((provider, index, list) => list.findIndex((item) => item === provider) === index);
}

function getWalletForConnection(wallets: DetectedWallet[], walletId?: string) {
  if (walletId) return wallets.find((wallet) => wallet.id === walletId);
  return wallets.find((wallet) => /metamask/i.test(wallet.name)) || wallets[0];
}

function sortDetectedWallets(first: DetectedWallet, second: DetectedWallet) {
  return getWalletPriority(first.name) - getWalletPriority(second.name) || first.name.localeCompare(second.name);
}

function getWalletPriority(name: string) {
  if (/metamask/i.test(name)) return 0;
  if (/okx/i.test(name)) return 1;
  if (/bitget|bitkeep/i.test(name)) return 2;
  if (/rabby/i.test(name)) return 3;
  if (/coinbase/i.test(name)) return 4;
  return 9;
}

function getProviderDisplayName(provider: EthereumProvider) {
  if (provider.isMetaMask) return "MetaMask";
  if (provider.isOkxWallet || provider.isOKExWallet) return "OKX Wallet";
  if (provider.isBitget || provider.isBitKeep) return "Bitget Wallet";
  if (provider.isRabby) return "Rabby";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  return "Browser Wallet";
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

  if (value === "google_provider_disabled") {
    return "Google OAuth is not enabled in Supabase Auth yet. Enable the Google provider, then retry.";
  }

  if (value === "google_oauth_unavailable") {
    return "Google sign-in could not be started from Supabase.";
  }

  if (value === "google_email_not_allowed") {
    return "Google account access is not allowed for this Crest workspace yet.";
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

function formatBreadthMetric(count: number, label: string) {
  return `${count} ${label}`;
}

function formatCorrelationScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "--";
}

function getCorrelationClass(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (value >= 50) return "positive";
  if (value <= -50) return "negative";
  return "";
}

function normalizeCorrelationScore(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    const metricKind = row.metricKind || (row.timeframe === "30m" ? "setup" : "regime");
    const positiveLabel = row.positiveLabel || (metricKind === "regime" ? "Bullish" : "Long/Buy");
    const negativeLabel = row.negativeLabel || (metricKind === "regime" ? "Bearish" : "Short/Sell");
    const neutralLabel = row.neutralLabel || (metricKind === "regime" ? "Neutral" : "Wait");
    const positiveCount = row.positiveCount ?? row.bullishCount;
    const negativeCount = row.negativeCount ?? row.bearishCount;
    const total = positiveCount + negativeCount + row.neutralCount || 1;

    return {
      range: row.universe,
      metricKind,
      averageRsi: row.averageRsi,
      positiveLabel,
      negativeLabel,
      neutralLabel,
      positiveCount,
      negativeCount,
      neutralCount: row.neutralCount,
      positivePct: Math.round((positiveCount / total) * 100),
      negativePct: Math.round((negativeCount / total) * 100)
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

function getMarketBreadth(rows: AssetSignalRow[], timeframe: Timeframe): MarketBreadthSummary[] {
  const metricKind = timeframe === "4h" ? "regime" : "setup";
  const positiveLabel = metricKind === "regime" ? "Bullish" : "Long/Buy";
  const negativeLabel = metricKind === "regime" ? "Bearish" : "Short/Sell";
  const neutralLabel = metricKind === "regime" ? "Neutral" : "Wait";

  if (rows.length === 0) {
    return ([100, 200, 300] as const).map((range) => ({
      range: `Top ${range}` as MarketBreadthSummary["range"],
      metricKind,
      averageRsi: 0,
      positiveLabel,
      negativeLabel,
      neutralLabel,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      positivePct: 0,
      negativePct: 0
    }));
  }

  return ([100, 200, 300] as const).map((range) => {
    const universeRows = rows.slice(0, range);
    const positiveCount =
      metricKind === "regime"
        ? universeRows.filter((asset) => asset.regime4h === "Bullish").length
        : universeRows.filter((asset) => asset.recommendation30m === "Long/Buy").length;
    const negativeCount =
      metricKind === "regime"
        ? universeRows.filter((asset) => asset.regime4h === "Bearish").length
        : universeRows.filter((asset) => asset.recommendation30m === "Short/Sell").length;
    const neutralCount = universeRows.length - positiveCount - negativeCount;
    const total = universeRows.length || 1;

    return {
      range: `Top ${range}` as MarketBreadthSummary["range"],
      metricKind,
      averageRsi: average(universeRows.map((asset) => asset.rsi14)),
      positiveLabel,
      negativeLabel,
      neutralLabel,
      positiveCount,
      negativeCount,
      neutralCount,
      positivePct: Math.round((positiveCount / total) * 100),
      negativePct: Math.round((negativeCount / total) * 100)
    };
  });
}

function getBtcRegime4h(assets: AssetSignalRow[]) {
  return assets.find((asset) => asset.symbol === "BTC")?.regime4h || "Neutral";
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
    if (key === "btcCorrelationScore") {
      const firstScore = a.btcCorrelationScore;
      const secondScore = b.btcCorrelationScore;
      const firstMissing = typeof firstScore !== "number" || !Number.isFinite(firstScore);
      const secondMissing = typeof secondScore !== "number" || !Number.isFinite(secondScore);
      if (firstMissing || secondMissing) {
        if (firstMissing === secondMissing) return 0;
        return firstMissing ? 1 : -1;
      }
      return direction === "asc" ? firstScore - secondScore : secondScore - firstScore;
    }

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

function sortGlyphAscii(direction: SortDirection) {
  if (direction === "asc") return "↑";
  if (direction === "desc") return "↓";
  return "";
}

function getDefaultSortDirection(key: SortKey): SortDirection {
  return isTextSortKey(key) ? "asc" : "desc";
}

function isTextSortKey(key: SortKey) {
  return key === "symbol" || key === "chain" || key === "regime4h" || key === "recommendation30m";
}

function getAriaSort(direction: SortDirection) {
  if (direction === "asc") return "ascending";
  if (direction === "desc") return "descending";
  return "none";
}
