import crypto from "node:crypto";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
  const url = new URL(request.url); const state = crypto.randomUUID();
  const callback = process.env.GITHUB_CALLBACK_URL || `${url.origin}/api/auth/github/callback`;
  const auth = new URL("https://github.com/login/oauth/authorize");
  auth.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID || ""); auth.searchParams.set("redirect_uri", callback);
  auth.searchParams.set("scope", "read:user user:email public_repo"); auth.searchParams.set("state", state);
  const response = NextResponse.redirect(auth); response.cookies.set("oauth_state", state, { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV === "production", maxAge:600, path:"/" }); return response;
}
