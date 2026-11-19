import { NextResponse, type NextRequest } from "next/server";
import { requestOrigin, SESSION_COOKIE, logoutUrl, readAuthConfig } from "../../../../lib/auth";

// POST only, so another site cannot sign users out with an <img> tag.
export function POST(req: NextRequest) {
  const config = readAuthConfig(process.env);
  const origin = config?.baseUrl ?? requestOrigin(req);
  const res = NextResponse.redirect(config ? logoutUrl(config, `${origin}/`) : new URL("/", origin), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
