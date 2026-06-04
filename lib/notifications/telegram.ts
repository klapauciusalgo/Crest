import { readServerEnv } from "@/lib/supabase/server";

export type TelegramDeliveryResult =
  | {
      status: "skipped";
      reason: "missing_config" | "empty_messages";
    }
  | {
      status: "sent";
      messageCount: number;
      targetCount: number;
    }
  | {
      status: "failed";
      messageCount: number;
      targetCount: number;
      error: string;
    };

type TelegramTarget = {
  chatId: string;
  messageThreadId?: number;
};

type TelegramConfig = {
  botToken: string;
  targets: TelegramTarget[];
};

export async function sendTelegramMessages(messages: string[]): Promise<TelegramDeliveryResult> {
  const nonEmptyMessages = messages.map((message) => message.trim()).filter(Boolean);
  if (nonEmptyMessages.length === 0) {
    return {
      status: "skipped",
      reason: "empty_messages"
    };
  }

  const config = getTelegramConfig();
  if (!config) {
    return {
      status: "skipped",
      reason: "missing_config"
    };
  }

  let sentCount = 0;

  try {
    for (const target of config.targets) {
      for (const text of nonEmptyMessages) {
        await sendTelegramMessage(config.botToken, target, text);
        sentCount += 1;
      }
    }

    return {
      status: "sent",
      messageCount: sentCount,
      targetCount: config.targets.length
    };
  } catch (error) {
    return {
      status: "failed",
      messageCount: sentCount,
      targetCount: config.targets.length,
      error: getSafeErrorMessage(error)
    };
  }
}

export function isTelegramConfigured() {
  return Boolean(getTelegramConfig());
}

export function getTelegramTargetCount() {
  return getTelegramConfig()?.targets.length ?? 0;
}

function getTelegramConfig(): TelegramConfig | null {
  const botToken = readServerEnv("TELEGRAM_BOT_TOKEN");
  const chatId = readServerEnv("TELEGRAM_CHAT_ID");
  const messageThreadId = readServerEnv("TELEGRAM_MESSAGE_THREAD_ID");
  const additionalTargets = readServerEnv("TELEGRAM_ADDITIONAL_TARGETS");

  if (!botToken) return null;

  const targets = parseAdditionalTelegramTargets(additionalTargets);
  if (chatId) {
    targets.push({
      chatId,
      messageThreadId: parseTelegramThreadId(messageThreadId)
    });
  }

  const dedupedTargets = dedupeTelegramTargets(targets);
  if (dedupedTargets.length === 0) return null;

  return { botToken, targets: dedupedTargets };
}

async function sendTelegramMessage(botToken: string, target: TelegramTarget, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: target.chatId,
      text,
      disable_web_page_preview: true,
      ...(typeof target.messageThreadId === "number" ? { message_thread_id: target.messageThreadId } : {})
    }),
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description || `Telegram send failed with HTTP ${response.status}.`);
  }
}

function parseAdditionalTelegramTargets(value: string | undefined): TelegramTarget[] {
  if (!value?.trim()) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    const targets: TelegramTarget[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;

      const source = item as Record<string, unknown>;
      const chatId = source.chatId ?? source.chat_id;
      const messageThreadId = source.messageThreadId ?? source.message_thread_id;

      if (typeof chatId !== "string" && typeof chatId !== "number") continue;

      targets.push({
        chatId: String(chatId),
        messageThreadId: parseTelegramThreadId(messageThreadId)
      });
    }

    return targets;
  } catch {
    return [];
  }
}

function parseTelegramThreadId(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function dedupeTelegramTargets(targets: TelegramTarget[]) {
  const deduped = new Map<string, TelegramTarget>();

  for (const target of targets) {
    if (!target.chatId.trim()) continue;
    const normalized: TelegramTarget = {
      chatId: target.chatId.trim(),
      messageThreadId: target.messageThreadId
    };
    deduped.set(`${normalized.chatId}:${normalized.messageThreadId ?? ""}`, normalized);
  }

  return [...deduped.values()];
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown Telegram delivery error.";
  }
}
