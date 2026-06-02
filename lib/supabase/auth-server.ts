import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readServerEnv } from "@/lib/supabase/server";

export function getSupabaseAuthServerClient(): SupabaseClient | null {
  const url = readServerEnv("SUPABASE_URL") || readServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serverAuthKey =
    readServerEnv("SUPABASE_ANON_KEY") ||
    readServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    readServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serverAuthKey) return null;

  const cookieStore = cookies();

  return createServerClient(url, serverAuthKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      }
    }
  });
}
