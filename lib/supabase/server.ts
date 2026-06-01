import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseKeySource = "service_role" | "server_anon" | "public_anon";

type SupabaseServerConfig = {
  key: string;
  keySource: SupabaseKeySource;
  url: string;
};

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey: string | null = null;

export function getSupabaseServerConfig(): SupabaseServerConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serverAnonKey = process.env.SUPABASE_ANON_KEY;
  const publicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
