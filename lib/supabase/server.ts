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
  const url = readServerEnv("SUPABASE_URL") || readServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  const serverAnonKey = readServerEnv("SUPABASE_ANON_KEY");
  const publicAnonKey = readServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
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
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store"
          })
      }
    });
    cachedConfigKey = configKey;
  }

  return cachedClient;
}

export function readServerEnv(name: string) {
  return process.env[name]?.replace(/^\uFEFF/, "").trim();
}
