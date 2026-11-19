// Microsoft Entra ID (Azure AD) single sign-on: OpenID Connect authorization-code flow with PKCE.
// Pure logic only (no Next imports) so it runs in the proxy, route handlers and tests.
// The session is a stateless HMAC-signed cookie, so no database or auth library is needed.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "scenesplice_session";
export const TXN_COOKIE = "scenesplice_auth";
export const SESSION_TTL_S = 8 * 60 * 60;
export const TXN_TTL_S = 10 * 60;

export type AuthConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  secret: string;
  /** Public origin override (e.g. behind a tunnel or reverse proxy). Falls back to the request origin. */
  baseUrl?: string;
};

export type Session = { sub: string; name: string; email: string; exp: number };
export type Txn = { state: string; nonce: string; verifier: string; returnTo: string; exp: number };

type Env = Record<string, string | undefined>;

/** Sign-in can be switched off for local development with AUTH_DISABLED=true. Anything else fails closed. */
export function authDisabled(env: Env): boolean {
  return env.AUTH_DISABLED === "true";
}

/** Null when a required variable is missing. */
export function readAuthConfig(env: Env): AuthConfig | null {
  const tenantId = env.AZURE_AD_TENANT_ID?.trim();
  const clientId = env.AZURE_AD_CLIENT_ID?.trim();
  const clientSecret = env.AZURE_AD_CLIENT_SECRET?.trim();
  const secret = env.AUTH_SECRET?.trim();
  if (!tenantId || !clientId || !clientSecret || !secret || secret.length < 32) return null;
  return { tenantId, clientId, clientSecret, secret, baseUrl: env.AUTH_URL?.trim().replace(/\/+$/, "") || undefined };
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function mac(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function sign(payload: object, secret: string): string {
  const body = b64u(JSON.stringify(payload));
  return `${body}.${mac(secret, body)}`;
}

/** The payload if the signature is valid and it has not expired, otherwise null. */
export function verify<T extends { exp: number }>(token: string | undefined, secret: string, now = Date.now()): T | null {
  if (!token) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = Buffer.from(mac(secret, body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    return typeof payload.exp === "number" && payload.exp * 1000 > now ? payload : null;
  } catch {
    return null;
  }
}

/** Only same-site relative paths, so the login flow cannot be used as an open redirect. */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("/api/auth")) return "/app";
  return raw;
}

export function newTxn(returnTo: string, now = Date.now()): Txn {
  return {
    state: b64u(randomBytes(16)),
    nonce: b64u(randomBytes(16)),
    verifier: b64u(randomBytes(32)),
    returnTo: safeReturnTo(returnTo),
    exp: Math.floor(now / 1000) + TXN_TTL_S,
  };
}

export const challengeFor = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

const authority = (c: AuthConfig) => `https://login.microsoftonline.com/${c.tenantId}`;
export const callbackUrl = (origin: string, c: AuthConfig) => `${c.baseUrl ?? origin}/api/auth/callback`;

export function authorizeUrl(c: AuthConfig, txn: Txn, redirectUri: string): string {
  const q = new URLSearchParams({
    client_id: c.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid profile email",
    state: txn.state,
    nonce: txn.nonce,
    code_challenge: challengeFor(txn.verifier),
    code_challenge_method: "S256",
  });
  return `${authority(c)}/oauth2/v2.0/authorize?${q}`;
}

export const logoutUrl = (c: AuthConfig, postLogoutRedirect: string) =>
  `${authority(c)}/oauth2/v2.0/logout?${new URLSearchParams({ post_logout_redirect_uri: postLogoutRedirect })}`;

/** Exchanges the authorization code. The ID token comes straight from Microsoft over TLS, so its claims are checked rather than its signature. */
export async function exchangeCode(
  c: AuthConfig,
  code: string,
  verifier: string,
  redirectUri: string,
  f: typeof fetch = fetch,
): Promise<string> {
  const res = await f(`${authority(c)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; error_description?: string };
  if (!res.ok || !json.id_token) throw new Error(json.error_description?.split("\r")[0] ?? `Token request failed (${res.status})`);
  return json.id_token;
}

/** Validates the ID token's claims and returns the session identity. Throws on any mismatch. */
export function sessionFromIdToken(idToken: string, c: AuthConfig, nonce: string, now = Date.now()): Session {
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    throw new Error("Malformed ID token");
  }
  if (claims.iss !== `${authority(c)}/v2.0`) throw new Error("Wrong issuer");
  if (claims.tid !== c.tenantId) throw new Error("Wrong tenant");
  if (claims.aud !== c.clientId) throw new Error("Wrong audience");
  if (claims.nonce !== nonce) throw new Error("Nonce mismatch");
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) throw new Error("ID token expired");
  const email = String(claims.preferred_username ?? claims.email ?? "");
  return {
    sub: String(claims.oid ?? claims.sub ?? ""),
    name: String(claims.name ?? email),
    email,
    exp: Math.floor(now / 1000) + SESSION_TTL_S,
  };
}

/** The origin the browser used (Host header), since the framework's parsed URL can report a different loopback name in dev. */
export function requestOrigin(req: { headers: Headers; nextUrl: { origin: string; protocol: string } }): string {
  const host = req.headers.get("host");
  if (!host) return req.nextUrl.origin;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}
