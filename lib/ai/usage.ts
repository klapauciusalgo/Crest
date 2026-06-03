import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiUsageQuota } from "@/lib/ai/types";
import { getRequiredServiceClient } from "@/lib/auth/server";

const wibOffsetMs = 7 * 60 * 60 * 1000;

export async function getWeeklyQuota({
  client = getRequiredServiceClient(),
  limit,
  userId
}: {
  client?: SupabaseClient;
  limit: number;
  userId: string;
}): Promise<AiUsageQuota> {
  const weekStart = getWibWeekStart(new Date());
  const { count, error } = await client
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("week_start", weekStart.toISOString());

  if (error) throw error;

  const used = count || 0;
  const resetAt = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetAt: resetAt.toISOString(),
    weekStart: weekStart.toISOString()
  };
}

export async function recordAiUsage({
  client = getRequiredServiceClient(),
  providerConfigId,
  prompt,
  threadId,
  userId
}: {
  client?: SupabaseClient;
  providerConfigId: string;
  prompt: string;
  threadId: string | null;
  userId: string;
}) {
  const weekStart = getWibWeekStart(new Date()).toISOString();
  const { error } = await client.from("ai_usage_events").insert({
    user_id: userId,
    week_start: weekStart,
    prompt,
    provider_config_id: providerConfigId,
    thread_id: threadId
  });

  if (error) throw error;
}

function getWibWeekStart(date: Date) {
  const local = new Date(date.getTime() + wibOffsetMs);
  const day = local.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const startLocal = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday, 0, 0, 0, 0)
  );

  return new Date(startLocal.getTime() - wibOffsetMs);
}
