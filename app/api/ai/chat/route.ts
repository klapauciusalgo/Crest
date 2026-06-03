import { buildAiMarketContext, buildAiMessages } from "@/lib/ai/context";
import { getActiveAiProvider, getAiSettings } from "@/lib/ai/config";
import { persistAiExchange } from "@/lib/ai/history";
import { requestOpenAiCompatibleChat } from "@/lib/ai/provider";
import type { AiChatRequest } from "@/lib/ai/types";
import { getWeeklyQuota, recordAiUsage } from "@/lib/ai/usage";
import { getAuthenticatedServerUser, getRequiredServiceClient } from "@/lib/auth/server";
import { parseTimeframe } from "@/lib/market/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getAuthenticatedServerUser();
  if (!session) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as AiChatRequest;
    const message = payload.message?.trim();

    if (!message) {
      return Response.json({ error: "Prompt is required." }, { status: 400 });
    }

    const client = getRequiredServiceClient();
    const [settings, provider] = await Promise.all([getAiSettings(client), getActiveAiProvider(client)]);

    if (!provider) {
      return Response.json({ error: "No active AI provider is configured." }, { status: 503 });
    }

    const initialQuota = await getWeeklyQuota({
      client,
      limit: settings.weeklyPromptLimit,
      userId: session.user.id
    });

    if (initialQuota.remaining <= 0) {
      return Response.json({ error: "Weekly AI prompt credit exhausted.", quota: initialQuota }, { status: 429 });
    }

    const context = await buildAiMarketContext({
      ...payload,
      timeframe: parseTimeframe(payload.timeframe)
    });
    const messages = buildAiMessages({ context, message, settings });
    const answer = await requestOpenAiCompatibleChat(provider, messages);
    const threadId = await persistAiExchange({
      answer,
      client,
      context,
      message,
      threadId: payload.threadId,
      userId: session.user.id
    });

    await recordAiUsage({
      client,
      providerConfigId: provider.id,
      prompt: message,
      threadId,
      userId: session.user.id
    });

    const quota = await getWeeklyQuota({
      client,
      limit: settings.weeklyPromptLimit,
      userId: session.user.id
    });

    return Response.json({
      answer,
      context,
      provider: {
        id: provider.id,
        providerName: provider.providerName,
        model: provider.model
      },
      quota,
      threadId
    });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown AI chat error.";
}
