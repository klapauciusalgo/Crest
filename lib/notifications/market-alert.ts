import { buildTimeframeBreadth } from "@/lib/market/breadth";
import { readSupabaseMarketSnapshot } from "@/lib/market/supabase-provider";
import type { MarketAssetSnapshot, MarketBreadthSnapshot, MarketSnapshot } from "@/lib/market/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTelegramTargetCount, sendTelegramMessages, type TelegramDeliveryResult } from "@/lib/notifications/telegram";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Timeframe } from "@/lib/mock-data";

export type MarketAlertResult =
  | {
      status: "skipped";
      reason:
        | "no_30m_refresh"
        | "supabase_unavailable"
        | "empty_snapshot"
        | "missing_config"
        | "empty_messages"
        | "already_sent";
      targetCount?: number;
    }
  | {
      status: "sent";
      messageCount: number;
      targetCount: number;
      longCount: number;
      shortCount: number;
    }
  | {
      status: "failed";
      messageCount: number;
      targetCount: number;
      longCount: number;
      shortCount: number;
      error: string;
    };

const telegramMessageMaxLength = 3900;

export async function maybeSendThirtyMinuteMarketAlert(
  timeframes: Timeframe[],
  notifyParam: string | null
): Promise<MarketAlertResult> {
  if (notifyParam === "false" || !timeframes.includes("30m")) {
    return {
      status: "skipped",
      reason: "no_30m_refresh"
    };
  }

  return sendLatestThirtyMinuteMarketAlert();
}

export async function sendLatestThirtyMinuteMarketAlert(): Promise<MarketAlertResult> {
  try {
    const client = getSupabaseServerClient();
    if (!client) {
      return {
        status: "skipped",
        reason: "supabase_unavailable"
      };
    }

    const snapshot = await readSupabaseMarketSnapshot(client, "30m");
    if (snapshot.assets.length === 0) {
      return {
        status: "skipped",
        reason: "empty_snapshot"
      };
    }

    const telegramTargetCount = getTelegramTargetCount();
    if (telegramTargetCount === 0) {
      return {
        status: "skipped",
        reason: "missing_config",
        targetCount: telegramTargetCount
      };
    }

    const alertBucket = getThirtyMinuteAlertBucket(snapshot.freshness.updatedAt);
    if (await hasSentTelegramAlert(client, alertBucket, telegramTargetCount)) {
      return {
        status: "skipped",
        reason: "already_sent",
        targetCount: telegramTargetCount
      };
    }

    const built = buildMarketAlertMessages(snapshot);
    const delivery = await sendTelegramMessages(built.messages);
    await recordTelegramAlertRun(client, snapshot, delivery, built.longCount, built.shortCount, alertBucket);
    return mapDeliveryResult(delivery, built.longCount, built.shortCount);
  } catch (error) {
    return {
      status: "failed",
      messageCount: 0,
      targetCount: 0,
      longCount: 0,
      shortCount: 0,
      error: getSafeErrorMessage(error)
    };
  }
}

export function buildMarketAlertMessages(snapshot: MarketSnapshot) {
  const rows = [...snapshot.assets].sort((first, second) => first.rank - second.rank);
  const longRows = getLongRows(rows);
  const shortRows = getShortRows(rows);
  const breadth = snapshot.breadth.length
    ? snapshot.breadth
    : buildTimeframeBreadth(rows, "30m", snapshot.freshness.updatedAt);
  const text = [
    "Crest Market Alert",
    `Data: Binance ${formatWibDateTime(snapshot.freshness.updatedAt)}`,
    "Timeframe: 30m setup with latest 4h regime",
    `Coverage: ${snapshot.freshness.coverage.covered}/${snapshot.freshness.coverage.total || rows.length}`,
    "Universe: Top volume assets",
    "",
    `LONG/BUY + 4H BULLISH (${longRows.length})`,
    formatTickerList(longRows),
    "",
    `SHORT/SELL + 4H BEARISH (${shortRows.length})`,
    formatTickerList(shortRows),
    "",
    "30M BREADTH",
    formatBreadthLine(breadth, "Top 100"),
    formatBreadthLine(breadth, "Top 200"),
    formatBreadthLine(breadth, "Top 300")
  ].join("\n");

  return {
    messages: splitTelegramText(text),
    longCount: longRows.length,
    shortCount: shortRows.length
  };
}

async function hasSentTelegramAlert(client: SupabaseClient, alertBucket: string, targetCount: number) {
  const { data, error } = await client
    .from("data_refresh_runs")
    .select("metadata")
    .eq("timeframe", "30m")
    .eq("source", "binance")
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) {
    console.warn("[crest] Telegram alert duplicate check failed.", getSafeErrorMessage(error));
    return false;
  }

  return (data || []).some((row: { metadata?: Record<string, unknown> | null }) => {
    const metadata = row.metadata || {};
    return (
      metadata.kind === "telegram_market_alert" &&
      metadata.alert_bucket === alertBucket &&
      getRecordedTelegramTargetCount(metadata) >= targetCount
    );
  });
}

function getRecordedTelegramTargetCount(metadata: Record<string, unknown>) {
  const value = metadata.target_count;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 1;
}

async function recordTelegramAlertRun(
  client: SupabaseClient,
  snapshot: MarketSnapshot,
  delivery: TelegramDeliveryResult,
  longCount: number,
  shortCount: number,
  alertBucket: string
) {
  if (delivery.status === "skipped") return;

  const now = new Date().toISOString();
  const { error } = await client.from("data_refresh_runs").insert({
    timeframe: "30m",
    source: "binance",
    status: delivery.status === "sent" ? "succeeded" : "failed",
    started_at: now,
    completed_at: now,
    covered_count: snapshot.freshness.coverage.covered,
    total_count: snapshot.freshness.coverage.total,
    error_message: delivery.status === "failed" ? delivery.error : null,
    metadata: {
      kind: "telegram_market_alert",
      alert_bucket: alertBucket,
      snapshot_updated_at: snapshot.freshness.updatedAt,
      long_count: longCount,
      short_count: shortCount,
      message_count: delivery.messageCount,
      target_count: delivery.targetCount
    }
  });

  if (error) {
    console.warn("[crest] Telegram alert audit write failed.", getSafeErrorMessage(error));
  }
}

function getThirtyMinuteAlertBucket(value: string) {
  const date = new Date(value);
  const timestamp = Number.isFinite(date.getTime()) ? date.getTime() : Date.now();
  const bucketMs = 30 * 60 * 1000;

  return new Date(Math.floor(timestamp / bucketMs) * bucketMs).toISOString();
}

function getLongRows(rows: MarketAssetSnapshot[]) {
  return rows
    .filter((asset) => asset.recommendation30m === "Long/Buy" && asset.regime4h === "Bullish")
    .sort(sortByVolumeThenRank);
}

function getShortRows(rows: MarketAssetSnapshot[]) {
  return rows
    .filter((asset) => asset.recommendation30m === "Short/Sell" && asset.regime4h === "Bearish")
    .sort(sortByVolumeThenRank);
}

function sortByVolumeThenRank(first: MarketAssetSnapshot, second: MarketAssetSnapshot) {
  return second.quoteVolume24h - first.quoteVolume24h || first.rank - second.rank;
}

function formatTickerList(rows: MarketAssetSnapshot[]) {
  if (rows.length === 0) return "None";

  const tickers = rows.map((asset) => `$${asset.symbol}`);
  const lines: string[] = [];
  for (let index = 0; index < tickers.length; index += 12) {
    lines.push(tickers.slice(index, index + 12).join(", "));
  }
  return lines.join("\n");
}

function formatBreadthLine(breadth: MarketBreadthSnapshot[], universe: MarketBreadthSnapshot["universe"]) {
  const item = breadth.find((snapshot) => snapshot.universe === universe);
  if (!item) {
    return `${universe} Vol: Avg RSI 0.0 | Long/Buy 0 | Short/Sell 0 | Wait 0`;
  }

  return `${universe} Vol: Avg RSI ${formatOne(item.averageRsi)} | Long/Buy ${item.positiveCount} | Short/Sell ${item.negativeCount} | Wait ${item.neutralCount}`;
}

function splitTelegramText(text: string) {
  if (text.length <= telegramMessageMaxLength) return [text];

  const chunks: string[] = [];
  const lines = text.split("\n");
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= telegramMessageMaxLength) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);
    current = line;
  }

  if (current) chunks.push(current);
  return chunks;
}

function formatWibDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "unknown WIB";

  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);

  return `${formatted.replace(",", "")} WIB`;
}

function formatOne(value: number) {
  return Number.isFinite(value) ? value.toFixed(1) : "0.0";
}

function mapDeliveryResult(delivery: TelegramDeliveryResult, longCount: number, shortCount: number): MarketAlertResult {
  if (delivery.status === "sent") {
    return {
      status: "sent",
      messageCount: delivery.messageCount,
      targetCount: delivery.targetCount,
      longCount,
      shortCount
    };
  }

  if (delivery.status === "failed") {
    return {
      status: "failed",
      messageCount: delivery.messageCount,
      targetCount: delivery.targetCount,
      longCount,
      shortCount,
      error: delivery.error
    };
  }

  return {
    status: "skipped",
    reason: delivery.reason
  };
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown market alert error.";
  }
}
