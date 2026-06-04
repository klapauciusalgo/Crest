import { readServerEnv } from "@/lib/supabase/server";

export type TelegramDeliveryResult =
  | {
      status: "skipped";
      reason: "missing_config" | "empty_messages";
    }
  | {
      status: "sent";
      messageCount: number;
    }
  | {
      status: "failed";
      messageCount: number;
      error: string;
    };

type TelegramConfig = {
  botToken: string;
  chatId: string;
  messageThreadId?: number;
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
    for (const text of nonEmptyMessages) {
      await sendTelegramMessage(config, text);
      sentCount += 1;
    }

    return {
      status: "sent",
      messageCount: sentCount
    };
  } catch (error) {
    return {
      status: "failed",
      messageCount: sentCount,
      error: getSafeErrorMessage(error)
    };
  }
}

export function isTelegramConfigured() {
  return Boolean(getTelegramConfig());
}

function getTelegramConfig(): TelegramConfig | null {
  const botToken = readServerEnv("TELEGRAM_BOT_TOKEN");
  const chatId = readServerEnv("TELEGRAM_CHAT_ID");
  const messageThreadId = readServerEnv("TELEGRAM_MESSAGE_THREAD_ID");

  if (!botToken || !chatId) return null;

  const parsedThreadId = messageThreadId ? Number(messageThreadId) : undefined;

  return {
    botToken,
    chatId,
    messageThreadId: Number.isFinite(parsedThreadId) ? parsedThreadId : undefined
  };
}

async function sendTelegramMessage(config: TelegramConfig, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      disable_web_page_preview: true,
      ...(config.messageThreadId ? { message_thread_id: config.messageThreadId } : {})
    }),
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description || `Telegram send failed with HTTP ${response.status}.`);
  }
}

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown Telegram delivery error.";
  }
}
