import { cookies } from "next/headers";
import { connection } from "next/server";
import { SESSION_COOKIE, authDisabled, readAuthConfig, verify, type Session } from "./auth";

/** The signed-in user, or null. With AUTH_DISABLED=true there is no sign-in, so a local placeholder identity is returned. */
export async function getSession(): Promise<Session | null> {
  await connection(); // read env and cookies per request, never at build time
  if (authDisabled(process.env)) return { sub: "local", name: "Local development", email: "", exp: Number.MAX_SAFE_INTEGER };
  const config = readAuthConfig(process.env);
  if (!config) return null;
  return verify<Session>((await cookies()).get(SESSION_COOKIE)?.value, config.secret);
}
