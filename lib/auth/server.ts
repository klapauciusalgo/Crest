import type { User } from "@supabase/supabase-js";
import { buildProfileFromUser, syncUserProfile, type CrestAuthProfile } from "@/lib/auth/profile";
import { getSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { getSupabaseServerClient, getSupabaseServerConfig } from "@/lib/supabase/server";

export type AuthenticatedServerUser = {
  profile: CrestAuthProfile;
  user: User;
};

export async function getAuthenticatedServerUser(): Promise<AuthenticatedServerUser | null> {
  const authClient = getSupabaseAuthServerClient();
  if (!authClient) return null;

  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) return null;

  const profile = await syncUserProfile(data.user).catch(() => buildProfileFromUser(data.user));
  return {
    profile,
    user: data.user
  };
}

export async function requireAdminServerUser(): Promise<AuthenticatedServerUser | Response> {
  const session = await getAuthenticatedServerUser();
  if (!session) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (session.profile.role !== "admin") {
    return Response.json({ error: "Admin access required." }, { status: 403 });
  }

  return session;
}

export function getRequiredServiceClient() {
  const config = getSupabaseServerConfig();
  const client = getSupabaseServerClient();

  if (!client || config?.keySource !== "service_role") {
    throw new Error("Supabase service-role access is required for this operation.");
  }

  return client;
}
