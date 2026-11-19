import { NextResponse, type NextRequest } from "next/server";
import { TXN_COOKIE, TXN_TTL_S, authorizeUrl, callbackUrl, newTxn, readAuthConfig, sign } from "../../../../lib/auth";

// Starts the Entra ID sign-in: keeps state, nonce and the PKCE verifier in a short-lived signed cookie, then redirects to Microsoft.
export function GET(req: NextRequest) {
  const config = readAuthConfig(process.env);
  if (!config) return NextResponse.redirect(new URL("/?error=not_configured", req.nextUrl.origin));
  const txn = newTxn(req.nextUrl.searchParams.get("returnTo") ?? "/app");
  const res = NextResponse.redirect(authorizeUrl(config, txn, callbackUrl(req.nextUrl.origin, config)));
  res.cookies.set(TXN_COOKIE, sign(txn, config.secret), {
    httpOnly: true,
    secure: (config.baseUrl ?? req.nextUrl.origin).startsWith("https:"),
    sameSite: "lax",
    path: "/api/auth",
    maxAge: TXN_TTL_S,
  });
  return res;
}
