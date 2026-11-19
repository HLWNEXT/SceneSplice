import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authDisabled, readAuthConfig, verify, type Session } from "./lib/auth";

// Everything except the landing page and the sign-in routes needs a valid session.
export function proxy(req: NextRequest) {
  if (authDisabled(process.env)) return NextResponse.next();
  const config = readAuthConfig(process.env);
  const session = config ? verify<Session>(req.cookies.get(SESSION_COOKIE)?.value, config.secret) : null;
  if (session) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/") || pathname.startsWith("/comfy/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = new URL("/api/auth/login", req.url);
  url.searchParams.set("returnTo", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*", "/comfy/:path*", "/api/((?!auth/).*)"],
};
