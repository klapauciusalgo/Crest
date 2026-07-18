"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Database,
  LineChart,
  Table2
} from "lucide-react";
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp
} from "lightweight-charts";
import type { Timeframe } from "@/lib/mock-data";
import type { MarketAssetDetail, MarketCandlePoint, MarketSnapshotHistoryPoint } from "@/lib/market/types";
import { formatPct, formatPrice } from "@/lib/formatters";

type CrosshairSnapshot = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function AssetDetailPage({
  initialDetail,
  initialTimeframe
}: {
  initialDetail: MarketAssetDetail;
  initialTimeframe: Timeframe;
}) {
  const detail = initialDetail;
  const timeframe = initialTimeframe;
  const latest = detail.latestSnapshot;
  const activeLabel = timeframe === "4h" ? latest.regime4h : latest.recommendation30m;
  const activeClass = timeframe === "4h" ? latest.regime4h.toLowerCase() : setupClass(latest.recommendation30m);

  return (
    <main className="asset-detail-shell">
      <header className="asset-detail-topbar">
        <Link className="detail-back" href="/">
          <ArrowLeft size={14} />
          Terminal
        </Link>
        <div className="asset-detail-brand">
          <span className="brand-mark">C</span>
          <span>Crest asset detail</span>
        </div>
        <div className="detail-timeframe-badge" aria-label="Detail timeframe">{timeframe}</div>
      </header>

      <section className="asset-detail-hero">
        <div className="asset-title-block">
          <div className="asset-kicker">
            <Database size={13} />
            <span>{detail.freshness.source}</span>
            <span>{detail.historySource.replaceAll("_", " ")}</span>
          </div>
          <h1>${detail.asset.symbol}</h1>
          <p>{detail.asset.name}</p>
          <div className="asset-tag-row">
            <span>{detail.asset.chain}</span>
            {detail.asset.sectors.slice(0, 4).map((sector) => (
              <span key={sector}>{sector}</span>
            ))}
          </div>
        </div>

        <div className="asset-stat-strip" aria-label="Latest market state">
          <DetailMetric label="Price" value={formatPrice(latest.price)} />
          <DetailMetric label="24h" value={formatPct(latest.priceChange24h)} tone={latest.priceChange24h >= 0 ? "positive" : "negative"} />
          <DetailMetric label="BTC Corr." value={formatCorrelationScore(latest.btcCorrelationScore)} tone={getCorrelationClass(latest.btcCorrelationScore)} />
          <DetailMetric label="RSI" value={latest.rsi14.toFixed(1)} />
          <DetailMetric label="MA111" value={formatPrice(latest.ma111)} />
          <DetailMetric label="MA dist." value={formatPct(latest.maDistancePct)} tone={latest.maDistancePct >= 0 ? "positive" : "negative"} />
          <DetailMetric label={timeframe === "4h" ? "Regime" : "Setup"} value={activeLabel} tone={activeClass} />
        </div>
      </section>

      <section className="asset-detail-workspace">
        <div className="detail-chart-panel">
          <div className="detail-section-head">
            <div>
              <p className="micro-label">OHLC chart</p>
              <h2>{detail.asset.symbol} {timeframe} candles</h2>
            </div>
            <span className="detail-status">
              <Clock size={12} />
              Updated {formatLocalTime(detail.freshness.updatedAt)}
            </span>
          </div>
          <AssetCandleChart candles={detail.candles} />
        </div>

        <aside className="detail-side-panel">
          <div className="detail-section-head compact">
            <div>
              <p className="micro-label">Signal context</p>
              <h2>Latest read</h2>
            </div>
            <LineChart size={15} />
          </div>
          <div className="signal-readout">
            <p>{latest.signalReason}</p>
            <dl>
              <div>
                <dt>Coverage</dt>
                <dd>{latest.coverageStatus}</dd>
              </div>
              <div>
                <dt>4h RSI</dt>
                <dd>{latest.rsi4h.toFixed(1)}</dd>
              </div>
              <div>
                <dt>30m RSI</dt>
                <dd>{latest.rsi30m.toFixed(1)}</dd>
              </div>
              <div>
                <dt>BTC Corr.</dt>
                <dd className={getCorrelationClass(latest.btcCorrelationScore)}>{formatCorrelationScore(latest.btcCorrelationScore)}</dd>
              </div>
              <div>
                <dt>Volume chg.</dt>
                <dd className={latest.volumeChange24h >= 0 ? "positive" : "negative"}>{formatPct(latest.volumeChange24h)}</dd>
              </div>
            </dl>
          </div>

          <section className="history-panel">
            <div className="detail-section-head">
              <div>
                <p className="micro-label">Snapshot history</p>
                <h2>Last {detail.history.length} {timeframe} records</h2>
              </div>
              <span className="detail-status">
                <Table2 size={12} />
                {detail.historySource.replaceAll("_", " ")}
              </span>
            </div>
            <HistoryTable rows={detail.history} timeframe={timeframe} />
          </section>
        </aside>
      </section>
    </main>
  );
}

function DetailMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="detail-metric">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function AssetCandleChart({ candles }: { candles: MarketCandlePoint[] }) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<CrosshairSnapshot | null>(null);
  const chartData = useMemo(
    () =>
      candles.map((candle) => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      })) satisfies CandlestickData<UTCTimestamp>[],
    [candles]
  );
  const volumeData = useMemo(
    () =>
      candles.map((candle) => ({
        time: candle.time as UTCTimestamp,
        value: candle.volume,
        color: candle.close >= candle.open ? "rgba(29, 184, 126, 0.32)" : "rgba(229, 72, 77, 0.32)"
      })) satisfies HistogramData<UTCTimestamp>[],
    [candles]
  );

  useEffect(() => {
    if (!chartRef.current || chartData.length === 0) return;

    const chart: IChartApi = createChart(chartRef.current, {
      autoSize: true,
      layout: {
        background: { color: "#101115" },
        textColor: "#777a88",
        fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace",
        fontSize: 11
      },
      grid: {
        vertLines: { color: "rgba(90, 92, 106, 0.18)" },
        horzLines: { color: "rgba(90, 92, 106, 0.18)" }
      },
      rightPriceScale: {
        borderColor: "#1e2028",
        scaleMargins: { top: 0.08, bottom: 0.22 }
      },
      timeScale: {
        borderColor: "#1e2028",
        timeVisible: true,
        secondsVisible: false
      },
      crosshair: {
        horzLine: { color: "#4c9eff", labelBackgroundColor: "#1a1c22" },
        vertLine: { color: "#4c9eff", labelBackgroundColor: "#1a1c22" }
      }
    });
    const candleSeries: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
      upColor: "#1db87e",
      downColor: "#e5484d",
      borderUpColor: "#1db87e",
      borderDownColor: "#e5484d",
      wickUpColor: "#1db87e",
      wickDownColor: "#e5484d"
    });
    const volumeSeries: ISeriesApi<"Histogram"> = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume"
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 }
    });
    candleSeries.setData(chartData);
    volumeSeries.setData(volumeData);
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((param) => {
      const point = param.seriesData.get(candleSeries) as CandlestickData<UTCTimestamp> | undefined;
      const volume = param.seriesData.get(volumeSeries) as HistogramData<UTCTimestamp> | undefined;
      if (!point || !param.time) {
        setHover(null);
        return;
      }
      setHover({
        time: formatTimestamp(Number(param.time) * 1000),
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: volume?.value || 0
      });
    });

    return () => {
      chart.remove();
    };
  }, [chartData, volumeData]);

  return (
    <div className="chart-shell">
      <div className="chart-toolbar">
        <BarChart3 size={13} />
        <span>{candles.length} candles</span>
      </div>
      <div className="chart-canvas" ref={chartRef} />
      <div className={`chart-tooltip ${hover ? "visible" : ""}`} ref={tooltipRef}>
        {hover ? (
          <>
            <span>{hover.time}</span>
            <strong>O {formatPrice(hover.open)} H {formatPrice(hover.high)} L {formatPrice(hover.low)} C {formatPrice(hover.close)}</strong>
            <span>Vol {formatCompactNumber(hover.volume)}</span>
          </>
        ) : (
          <span>Move cursor over the chart</span>
        )}
      </div>
    </div>
  );
}

function HistoryTable({ rows, timeframe }: { rows: MarketSnapshotHistoryPoint[]; timeframe: Timeframe }) {
  return (
    <div className="history-table-wrap">
      <table className="history-table">
        <thead>
          <tr>
            <th className="left">Time</th>
            <th>Price</th>
            <th>RSI</th>
            <th>{timeframe === "4h" ? "Regime" : "Setup"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.timeframe}-${row.candleCloseAt}-${row.computedAt}`}>
              <td className="left">
                <span className="history-time">
                  <Clock size={12} />
                  {formatLocalTime(row.candleCloseAt)}
                </span>
              </td>
              <td>
                <span className="history-primary">{formatPrice(row.price)}</span>
                <span className={row.priceChange24h >= 0 ? "history-sub positive" : "history-sub negative"}>{formatPct(row.priceChange24h)} 24h</span>
              </td>
              <td>
                <span className="history-primary">{row.rsi14.toFixed(1)}</span>
                <span className={row.maDistancePct >= 0 ? "history-sub positive" : "history-sub negative"}>
                  MA {formatPrice(row.ma111)} {formatPct(row.maDistancePct)}
                </span>
                <span className={`history-sub ${getCorrelationClass(row.btcCorrelationScore)}`}>
                  BTC Corr. {formatCorrelationScore(row.btcCorrelationScore)}
                </span>
              </td>
              <td>
                {timeframe === "4h" ? (
                  <span className={`regime-pill ${row.regime4h.toLowerCase()}`}>{row.regime4h}</span>
                ) : (
                  <span className={`setup-pill ${setupClass(row.recommendation30m)}`}>{row.recommendation30m}</span>
                )}
                <span className={row.volumeChange24h >= 0 ? "history-sub positive" : "history-sub negative"}>Vol {formatPct(row.volumeChange24h)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function setupClass(value: string) {
  if (value === "Long/Buy") return "long";
  if (value === "Short/Sell") return "short";
  return "wait";
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

function formatLocalTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta"
  }).format(new Date(value));
}

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Jakarta"
  }).format(new Date(value));
}

function formatCompactNumber(value: number) {
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}
