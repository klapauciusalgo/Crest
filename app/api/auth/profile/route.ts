import { buildProfileFromUser, syncUserProfile } from "@/lib/auth/profile";
import { getSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleProfileSync();
}

export async function POST() {
  return handleProfileSync();
}

async function handleProfileSync() {
  const supabase = getSupabaseAuthServerClient();

  if (!supabase) {
    return Response.json({ error: "Supabase auth is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const profile = await syncUserProfile(data.user).catch(() => buildProfileFromUser(data.user));

  return Response.json({ profile });
}
