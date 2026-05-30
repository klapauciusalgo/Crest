"use client";

import {
  Activity,
  Bot,
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  Command,
  Database,
  Lock,
  Pin,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Wallet
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { formatPct, formatPrice } from "@/lib/formatters";
import {
  AssetRow,
  ChainKey,
  ChainProjectDetail,
  ProviderConfig,
  Timeframe,
  aiPresetResponses,
  chainColors,
  getChainProjectDetails,
  getChainSummaries,
  getMockAssets,
  providerConfigs
} from "@/lib/mock-data";

type ViewMode = "terminal" | "admin";
type AuthMode = "visitor" | "user" | "admin";
type SortKey = keyof Pick<
  AssetRow,
  "symbol" | "price" | "priceChange24h" | "rsi14" | "volumeChange24h" | "chain" | "ma111" | "maDistancePct"
>;
type SortDirection = "none" | "asc" | "desc";
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

const columns: Array<{ key: SortKey; label: string; align?: "right" | "left" }> = [
  { key: "symbol", label: "Asset", align: "left" },
  { key: "price", label: "Price" },
  { key: "priceChange24h", label: "24h" },
  { key: "rsi14", label: "RSI(14)" },
  { key: "volumeChange24h", label: "Volume" },
  { key: "chain", label: "Chain" },
  { key: "ma111", label: "MA111" },
  { key: "maDistancePct", label: "MA Dist." }
];

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
  const [selectedChainMap, setSelectedChainMap] = useState<ChainKey>("BASE");
  const [chainDetailStatus, setChainDetailStatus] = useState<"idle" | "loading" | "ready">("idle");
  const [chainDetails, setChainDetails] = useState<ChainProjectDetail[]>([]);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([
    { name: "BSC oversold", chains: ["BSC"], rsi: [0, 35], ma: [-20, 0] },
    { name: "MA111 support", chains: allChains, rsi: [20, 55], ma: [-5, 1] }
  ]);
  const [activePreset, setActivePreset] = useState("Manual");

  const sourceAssets = useMemo(() => getMockAssets(timeframe), [timeframe]);
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
  const visibleTickers = useMemo(() => filteredAssets.map((asset) => asset.symbol), [filteredAssets]);

  useEffect(() => {
    setChainDetailStatus("loading");
    const timer = window.setTimeout(() => {
      setChainDetails(getChainProjectDetails(selectedChainMap, sourceAssets));
      setChainDetailStatus("ready");
    }, 240);

    return () => window.clearTimeout(timer);
  }, [selectedChainMap, sourceAssets]);

  useEffect(() => {
    if (!aiResponse) {
      setHighlightedTickers([]);
      return;
    }

    const tickers = Array.from(aiResponse.matchAll(/\$([A-Z0-9]+)/g)).map((match) => match[1]);
    setHighlightedTickers(tickers.filter((ticker) => visibleTickers.includes(ticker)));
  }, [aiResponse, visibleTickers]);

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

          <ChainIntelligence
            summaries={chainSummaries}
            selectedChain={selectedChainMap}
            selectedChains={selectedChains}
            details={chainDetails}
            status={chainDetailStatus}
            onSelect={(chain) => {
              setSelectedChainMap(chain);
              setSelectedChains([chain]);
              setActivePreset(`${chain} drilldown`);
            }}
          />

          <div className="rail-section">
            <div className="section-title">
              <SlidersHorizontal size={14} />
              Chains
            </div>
            <div className="chain-actions">
              <button onClick={() => setSelectedChains(allChains)}>All</button>
              <button onClick={() => setSelectedChains([])}>None</button>
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
              <div className="workspace-toolbar">
                <div>
                  <p className="micro-label">Market Grid</p>
                  <h2>Top assets by current filtered context</h2>
                </div>
                <div className="toolbar-stats">
                  <Metric label="Pinned" value={`${pinned.length}/5`} />
                  <Metric label="Preset" value={activePreset} />
                  <Metric label="Rows" value={String(filteredAssets.length)} />
                </div>
              </div>

              <AssetGrid
                rows={filteredAssets}
                sortKey={sortKey}
                sortDirection={sortDirection}
                pinned={pinned}
                highlightedTickers={highlightedTickers}
                onSort={cycleSort}
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
        rows={filteredAssets}
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
          <button onClick={() => onAuth("admin")}>
            <Lock size={16} />
            <span>
              Enter admin mock
              <small>Provider controls</small>
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

function ChainIntelligence({
  summaries,
  selectedChain,
  selectedChains,
  details,
  status,
  onSelect
}: {
  summaries: ReturnType<typeof getChainSummaries>;
  selectedChain: ChainKey;
  selectedChains: ChainKey[];
  details: ChainProjectDetail[];
  status: "idle" | "loading" | "ready";
  onSelect: (chain: ChainKey) => void;
}) {
  const rankedSummaries = [...summaries].sort((first, second) => second.avgPriceChange - first.avgPriceChange);
  const activeSummary = summaries.find((summary) => summary.chain === selectedChain);
  const maxVolume = Math.max(...summaries.map((summary) => summary.avgVolumeChange), 1);

  return (
    <div className="rail-section chain-intel">
      <div className="chain-intel-head">
        <div className="section-title">
          <Activity size={14} />
          Chain intelligence
        </div>
        <span className={`fetch-state ${status}`}>{status === "loading" ? "Fetching" : "Ready"}</span>
      </div>

      <div className="chain-map" aria-label="Chain strength map">
        {rankedSummaries.map((summary) => {
          const isActive = summary.chain === selectedChain;
          const volumeWidth = Math.max(10, Math.min(100, (summary.avgVolumeChange / maxVolume) * 100));
          const bias = summary.avgPriceChange >= 0 ? "positive" : "negative";

          return (
            <button
              className={`chain-signal ${isActive ? "active" : ""} ${selectedChains.includes(summary.chain) ? "in-view" : ""}`}
              key={summary.chain}
              onClick={() => onSelect(summary.chain)}
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

      <div className="chain-detail" style={{ "--chain-color": chainColors[selectedChain] } as CSSProperties}>
        <div className="chain-detail-head">
          <div>
            <strong>{selectedChain} projects</strong>
            <span>Fetched chain context</span>
          </div>
          <b>
            {activeSummary ? `${activeSummary.gainers}/${activeSummary.assetCount}` : "0/0"}
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
            : details.map((project) => (
                <article className="chain-project-row" key={project.symbol}>
                  <div>
                    <strong>${project.symbol}</strong>
                    <span>{project.name}</span>
                  </div>
                  <div>
                    <span className="project-tag">{project.category}</span>
                    <span className={`signal-tag ${project.signal.toLowerCase()}`}>{project.signal}</span>
                  </div>
                  <div className="project-metrics">
                    <span className={project.priceChange24h >= 0 ? "positive" : "negative"}>{formatPct(project.priceChange24h)}</span>
                    <span>RSI {project.rsi14.toFixed(1)}</span>
                    <span className={project.maDistancePct >= 0 ? "positive" : "negative"}>{formatPct(project.maDistancePct)}</span>
                  </div>
                  <p>{project.note}</p>
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

function AssetGrid({
  rows,
  sortKey,
  sortDirection,
  pinned,
  highlightedTickers,
  onSort,
  onPin
}: {
  rows: AssetRow[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  pinned: string[];
  highlightedTickers: string[];
  onSort: (key: SortKey) => void;
  onPin: (symbol: string) => void;
}) {
  return (
    <div className="grid-shell">
      <table className="asset-grid">
        <thead>
          <tr>
            <th aria-label="Pinned assets" />
            {columns.map((column) => (
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
              </tr>
            );
          })}
        </tbody>
      </table>
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
  onToggle,
  onPreset
}: {
  open: boolean;
  response: string;
  pinned: string[];
  rows: AssetRow[];
  onToggle: () => void;
  onPreset: (kind: keyof typeof aiPresetResponses) => void;
}) {
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
          <div className="ai-presets">
            <button onClick={() => onPreset("oversold")}>Oversold opportunities</button>
            <button onClick={() => onPreset("chains")}>Chain strength ranking</button>
            <button onClick={() => onPreset("volume")}>Volume anomalies</button>
            <button onClick={() => onPreset("ma")}>MA111 breakdown watch</button>
          </div>
          <pre className="ai-response">
            {response || "Select a preset prompt to stream a mock analyst response."}
            {response && <span className="cursor">_</span>}
          </pre>
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

function sortRows(rows: AssetRow[], key: SortKey, direction: SortDirection) {
  if (direction === "none") {
    return rows;
  }

  return [...rows].sort((a, b) => {
    const first = a[key];
    const second = b[key];
    const result = typeof first === "string" ? String(first).localeCompare(String(second)) : Number(first) - Number(second);
    return direction === "asc" ? result : -result;
  });
}

function sortGlyphAscii(direction: SortDirection) {
  if (direction === "asc") return "^";
  if (direction === "desc") return "v";
  return "";
}
