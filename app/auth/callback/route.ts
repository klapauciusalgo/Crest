import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { syncUserProfile } from "@/lib/auth/profile";
import { getSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const provider = requestUrl.searchParams.get("provider");
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));
  const redirectUrl = new URL(next, requestUrl.origin);

  if (!code) {
    redirectUrl.searchParams.set("auth_error", "missing_code");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = getSupabaseAuthServerClient();

  if (!supabase) {
    redirectUrl.searchParams.set("auth_error", "auth_not_configured");
    return NextResponse.redirect(redirectUrl);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirectUrl.searchParams.set("auth_error", "exchange_failed");
    return NextResponse.redirect(redirectUrl);
  }

  const { data } = await supabase.auth.getUser();
  if (data.user) {
    if (provider === "google" && !isAllowedGmailUser(data.user)) {
      await supabase.auth.signOut();
      redirectUrl.searchParams.set("auth_error", "google_email_not_allowed");
      return NextResponse.redirect(redirectUrl);
    }

    try {
      await syncUserProfile(data.user);
    } catch {
      redirectUrl.searchParams.set("profile", "deferred");
    }
  }

  redirectUrl.searchParams.set("auth", "signed_in");
  return NextResponse.redirect(redirectUrl);
}

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function isAllowedGmailUser(user: User) {
  const email = user.email?.toLowerCase();
  if (!email?.endsWith("@gmail.com")) return false;

  const metadata = user.user_metadata || {};
  const emailVerified = metadata.email_verified;
  return Boolean(user.email_confirmed_at || emailVerified === true || emailVerified === "true");
}
