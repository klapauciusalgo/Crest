import { buildProfileFromUser, syncUserProfile } from "@/lib/auth/profile";
import { getSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type EthereumWalletPayload = {
  message?: string;
  signature?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as EthereumWalletPayload;
  const supabase = getSupabaseAuthServerClient();

  if (!supabase) {
    return Response.json({ error: "Supabase auth is not configured." }, { status: 503 });
  }

  if (!payload.message || !payload.signature) {
    return Response.json({ error: "Wallet message and signature are required." }, { status: 400 });
  }

  const { data, error } = await supabase.auth.signInWithWeb3({
    chain: "ethereum",
    message: payload.message,
    signature: payload.signature as `0x${string}`
  });

  if (error || !data.user) {
    return Response.json({ error: error?.message || "Wallet signature could not be verified." }, { status: 401 });
  }

  const profile = await syncUserProfile(data.user).catch(() => buildProfileFromUser(data.user));

  return Response.json({ profile });
}
