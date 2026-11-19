import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_S,
  TXN_COOKIE,
  callbackUrl,
  exchangeCode,
  readAuthConfig,
  sessionFromIdToken,
  sign,
  verify,
  type Session,
  type Txn,
} from "../../../../lib/auth";

function fail(req: NextRequest, error: string) {
  const res = NextResponse.redirect(new URL(`/?error=${error}`, req.nextUrl.origin));
  res.cookies.delete({ name: TXN_COOKIE, path: "/api/auth" });
  return res;
}

export async function GET(req: NextRequest) {
  const config = readAuthConfig(process.env);
  if (!config) return fail(req, "not_configured");
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return fail(req, "denied");

  const txn = verify<Txn>(req.cookies.get(TXN_COOKIE)?.value, config.secret);
  const code = q.get("code");
  if (!txn || !code || q.get("state") !== txn.state) return fail(req, "invalid_state");

  let session: Session;
  try {
    const idToken = await exchangeCode(config, code, txn.verifier, callbackUrl(req.nextUrl.origin, config));
    session = sessionFromIdToken(idToken, config, txn.nonce);
  } catch (e) {
    console.error("Entra sign-in failed:", e instanceof Error ? e.message : e);
    return fail(req, "sign_in_failed");
  }

  const origin = config.baseUrl ?? req.nextUrl.origin;
  const res = NextResponse.redirect(new URL(txn.returnTo, origin));
  res.cookies.delete({ name: TXN_COOKIE, path: "/api/auth" });
  res.cookies.set(SESSION_COOKIE, sign(session, config.secret), {
    httpOnly: true,
    secure: origin.startsWith("https:"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
  return res;
}
