import { getSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = getSupabaseAuthServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  return Response.json({ ok: true });
}
