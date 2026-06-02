import { NextResponse } from "next/server";
import type { Provider } from "@supabase/supabase-js";
import { getSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectUrl = new URL("/", requestUrl.origin);
  const supabase = getSupabaseAuthServerClient();

  if (!supabase) {
    redirectUrl.searchParams.set("auth_error", "auth_not_configured");
    return NextResponse.redirect(redirectUrl);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "x" as Provider,
    options: {
      redirectTo: `${requestUrl.origin}/auth/callback?next=/`
    }
  });

  if (error || !data.url) {
    redirectUrl.searchParams.set("auth_error", "x_oauth_unavailable");
    return NextResponse.redirect(redirectUrl);
  }

  const providerStatus = await checkProviderStatus(data.url);
  if (providerStatus === "disabled") {
    redirectUrl.searchParams.set("auth_error", "x_provider_disabled");
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(data.url);
}

async function checkProviderStatus(authorizeUrl: string) {
  try {
    const response = await fetch(authorizeUrl, {
      cache: "no-store",
      redirect: "manual"
    });

    if (response.status !== 400) return "ready";

    const body = (await response.json().catch(() => null)) as { msg?: string } | null;
    return body?.msg?.toLowerCase().includes("provider is not enabled") ? "disabled" : "ready";
  } catch {
    return "ready";
  }
}
