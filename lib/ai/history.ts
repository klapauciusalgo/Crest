import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiMarketContext } from "@/lib/ai/types";
import { getRequiredServiceClient } from "@/lib/auth/server";

export async function persistAiExchange({
  answer,
  client = getRequiredServiceClient(),
  context,
  message,
  threadId,
  userId
}: {
  answer: string;
  client?: SupabaseClient;
  context: AiMarketContext;
  message: string;
  threadId?: string;
  userId: string;
}) {
  const resolvedThreadId = threadId || (await createAiThread(client, userId, message, context));

  const { error: userMessageError } = await client.from("ai_messages").insert({
    thread_id: resolvedThreadId,
    user_id: userId,
    role: "user",
    content: message,
    context_snapshot: context
  });

  if (userMessageError) throw userMessageError;

  const { error: assistantMessageError } = await client.from("ai_messages").insert({
    thread_id: resolvedThreadId,
    user_id: userId,
    role: "assistant",
    content: answer,
    context_snapshot: context
  });

  if (assistantMessageError) throw assistantMessageError;

  await client
    .from("ai_threads")
    .update({
      last_context: context,
      title: message.slice(0, 80)
    })
    .eq("id", resolvedThreadId)
    .eq("user_id", userId);

  return resolvedThreadId;
}

async function createAiThread(client: SupabaseClient, userId: string, title: string, context: AiMarketContext) {
  const { data, error } = await client
    .from("ai_threads")
    .insert({
      user_id: userId,
      title: title.slice(0, 80),
      last_context: context
    })
    .select("id")
    .single<{ id: string }>();

  if (error) throw error;
  return data.id;
}
