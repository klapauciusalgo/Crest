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

  return NextResponse.redirect(data.url);
}
