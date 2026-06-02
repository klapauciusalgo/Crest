import { createHmac } from "crypto";
import { getAddress, verifyMessage, type Address, type Hex } from "viem";
import { buildProfileFromUser, syncUserProfile } from "@/lib/auth/profile";
import { getSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { getSupabaseServerClient, getSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EthereumWalletPayload = {
  message?: string;
  signature?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as EthereumWalletPayload;
  const serviceClient = getSupabaseServerClient();
  const supabase = getSupabaseAuthServerClient();

  if (!serviceClient || !supabase) {
    return Response.json({ error: "Supabase auth is not configured." }, { status: 503 });
  }

  if (!payload.message || !payload.signature) {
    return Response.json({ error: "Wallet message and signature are required." }, { status: 400 });
  }

  const validation = await validateSiwePayload(request, payload.message, payload.signature);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 401 });
  }

  const email = getWalletEmail(validation.address);
  const password = getWalletPassword(validation.address);
  const userMetadata = {
    address: validation.address,
    provider: "ethereum",
    wallet_address: validation.address
  };

  const created = await serviceClient.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: userMetadata
  });

  if (created.error && !created.error.message.toLowerCase().includes("already")) {
    return Response.json({ error: created.error.message }, { status: 500 });
  }

  if (created.data.user) {
    await serviceClient.auth.admin.updateUserById(created.data.user.id, {
      password,
      user_metadata: userMetadata
    });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.user) {
    return Response.json({ error: error?.message || "Wallet session could not be created." }, { status: 401 });
  }

  const profile = await syncUserProfile(data.user).catch(() => buildProfileFromUser(data.user));

  return Response.json({ profile });
}

async function validateSiwePayload(request: Request, message: string, signature: string) {
  const parsed = parseSiweMessage(message);
  if (!parsed.address) return { ok: false as const, error: "SIWE message is missing an Ethereum address." };
  if (!parsed.domain) return { ok: false as const, error: "SIWE message is missing a domain." };
  if (!parsed.uri) return { ok: false as const, error: "SIWE message is missing a URI." };
  if (!parsed.nonce || parsed.nonce.length < 8) return { ok: false as const, error: "SIWE message nonce is invalid." };
  if (!parsed.issuedAt) return { ok: false as const, error: "SIWE message is missing issuedAt." };

  const requestHost = new URL(request.url).host;
  const uriHost = new URL(parsed.uri).host;
  if (parsed.domain !== requestHost || uriHost !== requestHost) {
    return { ok: false as const, error: "SIWE domain does not match this Crest deployment." };
  }

  const issuedAt = new Date(parsed.issuedAt).getTime();
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 10 * 60 * 1000) {
    return { ok: false as const, error: "SIWE message has expired." };
  }

  const address = getAddress(parsed.address);
  const verified = await verifyMessage({
    address,
    message,
    signature: signature as Hex
  });

  if (!verified) return { ok: false as const, error: "Wallet signature could not be verified." };

  return { ok: true as const, address };
}

function parseSiweMessage(message: string) {
  const lines = message.split(/\r?\n/);
  const fields = new Map<string, string>();
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index > 0) {
      fields.set(line.slice(0, index), line.slice(index + 1).trim());
    }
  }

  return {
    address: lines[1]?.trim(),
    domain: lines[0]?.replace(" wants you to sign in with your Ethereum account:", "").trim(),
    issuedAt: fields.get("Issued At"),
    nonce: fields.get("Nonce"),
    uri: fields.get("URI")
  };
}

function getWalletEmail(address: Address) {
  return `wallet-${address.toLowerCase().replace("0x", "")}@wallet.crest.local`;
}

function getWalletPassword(address: Address) {
  const config = getSupabaseServerConfig();
  const secret = config?.key;

  if (!secret) {
    throw new Error("Supabase server key is required for wallet auth.");
  }

  return createHmac("sha256", secret).update(`crest-wallet:${address.toLowerCase()}`).digest("hex");
}
