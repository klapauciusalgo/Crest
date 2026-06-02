import type { User } from "@supabase/supabase-js";
import { getSupabaseServerClient, getSupabaseServerConfig } from "@/lib/supabase/server";

export type CrestUserRole = "user" | "admin";

export type CrestAuthProfile = {
  id: string;
  role: CrestUserRole;
  displayName: string;
  provider: string;
  xUserId: string | null;
  walletAddress: string | null;
};

type UserProfileRecord = {
  id: string;
  role: CrestUserRole;
  display_name: string | null;
  x_user_id: string | null;
  wallet_address: string | null;
};

export function buildProfileFromUser(user: User, role: CrestUserRole = "user"): CrestAuthProfile {
  const provider = getPrimaryProvider(user);
  const displayName = getDisplayName(user);

  return {
    id: user.id,
    role,
    displayName,
    provider,
    xUserId: getXUserId(user),
    walletAddress: getWalletAddress(user)
  };
}

export async function syncUserProfile(user: User): Promise<CrestAuthProfile> {
  const fallback = buildProfileFromUser(user);
  const config = getSupabaseServerConfig();
  const client = getSupabaseServerClient();

  if (!client || config?.keySource !== "service_role") {
    return fallback;
  }

  const existing = await client
    .from("user_profiles")
    .select("id, role, display_name, x_user_id, wallet_address")
    .eq("id", user.id)
    .maybeSingle<UserProfileRecord>();

  if (existing.error) throw existing.error;

  const role = existing.data?.role || "user";
  const nextProfile = buildProfileFromUser(user, role);

  const { data, error } = await client
    .from("user_profiles")
    .upsert(
      {
        id: user.id,
        role,
        display_name: nextProfile.displayName,
        x_user_id: nextProfile.xUserId,
        wallet_address: nextProfile.walletAddress
      },
      { onConflict: "id" }
    )
    .select("id, role, display_name, x_user_id, wallet_address")
    .single<UserProfileRecord>();

  if (error) throw error;

  return {
    ...nextProfile,
    role: data.role,
    displayName: data.display_name || nextProfile.displayName,
    xUserId: data.x_user_id,
    walletAddress: data.wallet_address
  };
}

function getPrimaryProvider(user: User) {
  const metadataProvider = user.user_metadata?.provider;
  if (metadataProvider === "ethereum" || metadataProvider === "web3") return metadataProvider;

  const provider = user.app_metadata?.provider;
  if (typeof provider === "string") return provider;
  return user.identities?.[0]?.provider || "supabase";
}

function getDisplayName(user: User) {
  const metadata = user.user_metadata || {};
  const candidates = [
    metadata.name,
    metadata.full_name,
    metadata.user_name,
    metadata.preferred_username,
    metadata.screen_name,
    user.email,
    getWalletAddress(user)
  ];
  return candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0) || "Crest analyst";
}

function getXUserId(user: User) {
  const direct = user.user_metadata?.provider_id || user.user_metadata?.sub;
  if (typeof direct === "string" && isXProvider(getPrimaryProvider(user))) return direct;

  const identity = user.identities?.find((item) => isXProvider(item.provider));
  const identityData = identity?.identity_data as Record<string, unknown> | undefined;
  const id = identityData?.provider_id || identityData?.sub || identity?.id;
  return typeof id === "string" ? id : null;
}

function isXProvider(provider: string) {
  return provider === "x" || provider === "twitter";
}

function getWalletAddress(user: User) {
  const metadata = user.user_metadata || {};
  const direct = metadata.wallet_address || metadata.address || metadata.public_key;
  if (typeof direct === "string") return direct;

  for (const identity of user.identities || []) {
    const identityData = identity.identity_data as Record<string, unknown> | undefined;
    const value = identityData?.address || identityData?.wallet_address || identityData?.public_key || identityData?.sub;
    if (typeof value === "string" && looksLikeWalletIdentity(identity.provider, value)) {
      return value;
    }
  }

  return null;
}

function looksLikeWalletIdentity(provider: string, value: string) {
  return provider === "web3" || provider === "ethereum" || provider === "solana" || value.startsWith("0x");
}
