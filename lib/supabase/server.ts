import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseKeySource = "service_role" | "server_anon" | "public_anon";

export type SupabaseServerConfig = {
  key: string;
  keySource: SupabaseKeySource;
  url: string;
};

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey: string | null = null;

export function getSupabaseServerConfig(): SupabaseServerConfig | null {
  const url = readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const serverAnonKey = readEnv("SUPABASE_ANON_KEY");
  const publicAnonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const key = serviceRoleKey || serverAnonKey || publicAnonKey;

  if (!url || !key) return null;

  return {
    key,
    keySource: serviceRoleKey ? "service_role" : serverAnonKey ? "server_anon" : "public_anon",
    url
  };
}

export function getSupabaseServerClient(): SupabaseClient | null {
  const config = getSupabaseServerConfig();
  if (!config) return null;

  const configKey = `${config.url}:${config.keySource}:${config.key.slice(0, 8)}`;
  if (!cachedClient || cachedConfigKey !== configKey) {
    cachedClient = createClient(config.url, config.key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    cachedConfigKey = configKey;
  }

  return cachedClient;
}

function readEnv(name: string) {
  return process.env[name]?.replace(/^\uFEFF/, "").trim();
}
