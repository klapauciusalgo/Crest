import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, getSecretHint } from "@/lib/ai/crypto";
import type { AiProviderConfig, AiProviderConfigWithSecret, AiProviderStatus, AiSettings } from "@/lib/ai/types";
import { getRequiredServiceClient } from "@/lib/auth/server";

type AiProviderConfigRecord = {
  id: string;
  provider_name: string;
  provider_type: string;
  base_url: string;
  model: string;
  encrypted_api_key: string;
  api_key_hint: string | null;
  status: string;
  max_tokens: number;
  temperature: string | number;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  created_at: string;
  updated_at: string;
};

type AiSettingsRecord = {
  weekly_prompt_limit: number;
  reset_timezone: string;
  system_prompt: string | null;
  updated_at: string | null;
};

export type AiProviderInput = {
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  status: AiProviderStatus;
  maxTokens: number;
  temperature: number;
};

export async function getAiAdminConfig() {
  const client = getRequiredServiceClient();
  const [providers, settings] = await Promise.all([listAiProviders(client), getAiSettings(client)]);
  return { providers, settings };
}

export async function listAiProviders(client: SupabaseClient = getRequiredServiceClient()) {
  const { data, error } = await client
    .from("ai_provider_configs")
    .select(
      "id, provider_name, provider_type, base_url, model, encrypted_api_key, api_key_hint, status, max_tokens, temperature, last_tested_at, last_test_status, last_test_error, created_at, updated_at"
    )
    .order("status", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return ((data || []) as AiProviderConfigRecord[]).map(mapProviderRecord);
}

export async function getActiveAiProvider(client: SupabaseClient = getRequiredServiceClient()) {
  const { data, error } = await client
    .from("ai_provider_configs")
    .select(
      "id, provider_name, provider_type, base_url, model, encrypted_api_key, api_key_hint, status, max_tokens, temperature, last_tested_at, last_test_status, last_test_error, created_at, updated_at"
    )
    .eq("status", "active")
    .limit(1)
    .maybeSingle<AiProviderConfigRecord>();

  if (error) throw error;
  return data ? mapProviderRecord(data) : null;
}

export async function getAiProviderById(id: string, client: SupabaseClient = getRequiredServiceClient()) {
  const { data, error } = await client
    .from("ai_provider_configs")
    .select(
      "id, provider_name, provider_type, base_url, model, encrypted_api_key, api_key_hint, status, max_tokens, temperature, last_tested_at, last_test_status, last_test_error, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle<AiProviderConfigRecord>();

  if (error) throw error;
  return data ? mapProviderRecord(data) : null;
}

export async function upsertAiProvider(input: AiProviderInput, id?: string) {
  const client = getRequiredServiceClient();
  const row = buildProviderRow(input);

  if (input.status === "active") {
    await client.from("ai_provider_configs").update({ status: "disabled" }).eq("status", "active");
  }

  const query = id
    ? client.from("ai_provider_configs").update(row).eq("id", id)
    : client.from("ai_provider_configs").insert(row);

  const { data, error } = await query
    .select(
      "id, provider_name, provider_type, base_url, model, encrypted_api_key, api_key_hint, status, max_tokens, temperature, last_tested_at, last_test_status, last_test_error, created_at, updated_at"
    )
    .single<AiProviderConfigRecord>();

  if (error) throw error;
  return mapProviderRecord(data);
}

export async function updateAiProviderTestResult(id: string, status: "ok" | "failed", errorMessage: string | null) {
  const client = getRequiredServiceClient();
  const { error } = await client
    .from("ai_provider_configs")
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_status: status,
      last_test_error: errorMessage
    })
    .eq("id", id);

  if (error) throw error;
}

export async function getAiSettings(client: SupabaseClient = getRequiredServiceClient()): Promise<AiSettings> {
  const { data, error } = await client
    .from("ai_settings")
    .select("weekly_prompt_limit, reset_timezone, system_prompt, updated_at")
    .eq("id", true)
    .maybeSingle<AiSettingsRecord>();

  if (error) throw error;

  return {
    weeklyPromptLimit: data?.weekly_prompt_limit ?? 5,
    resetTimezone: "Asia/Jakarta",
    systemPrompt: data?.system_prompt || "",
    updatedAt: data?.updated_at || null
  };
}

export async function updateAiSettings(input: { weeklyPromptLimit: number; systemPrompt?: string }) {
  const client = getRequiredServiceClient();
  const weeklyPromptLimit = Math.max(0, Math.min(1000, Math.floor(input.weeklyPromptLimit)));
  const { data, error } = await client
    .from("ai_settings")
    .upsert(
      {
        id: true,
        weekly_prompt_limit: weeklyPromptLimit,
        reset_timezone: "Asia/Jakarta",
        system_prompt: input.systemPrompt || ""
      },
      { onConflict: "id" }
    )
    .select("weekly_prompt_limit, reset_timezone, system_prompt, updated_at")
    .single<AiSettingsRecord>();

  if (error) throw error;
  return {
    weeklyPromptLimit: data.weekly_prompt_limit,
    resetTimezone: "Asia/Jakarta" as const,
    systemPrompt: data.system_prompt || "",
    updatedAt: data.updated_at
  };
}

function buildProviderRow(input: AiProviderInput) {
  const row: Record<string, unknown> = {
    provider_name: input.providerName.trim(),
    provider_type: "openai_compatible",
    base_url: normalizeBaseUrl(input.baseUrl),
    model: input.model.trim(),
    status: input.status,
    max_tokens: Math.max(64, Math.min(8192, Math.floor(input.maxTokens))),
    temperature: Math.max(0, Math.min(2, Number(input.temperature)))
  };

  if (input.apiKey?.trim()) {
    row.encrypted_api_key = encryptSecret(input.apiKey.trim());
    row.api_key_hint = getSecretHint(input.apiKey);
  }

  return row;
}

function mapProviderRecord(record: AiProviderConfigRecord): AiProviderConfigWithSecret {
  return {
    id: record.id,
    providerName: record.provider_name,
    providerType: "openai_compatible",
    baseUrl: record.base_url,
    model: record.model,
    encryptedApiKey: record.encrypted_api_key,
    apiKeyHint: record.api_key_hint,
    status: record.status === "active" ? "active" : "disabled",
    maxTokens: record.max_tokens,
    temperature: Number(record.temperature),
    lastTestedAt: record.last_tested_at,
    lastTestStatus: record.last_test_status === "ok" || record.last_test_status === "failed" ? record.last_test_status : null,
    lastTestError: record.last_test_error,
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

export function maskProviderConfig(config: AiProviderConfigWithSecret): AiProviderConfig {
  const { encryptedApiKey: _encryptedApiKey, ...safeConfig } = config;
  return safeConfig;
}

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}
