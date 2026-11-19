import Link from "next/link";
import { getSession } from "../lib/session";
import { authDisabled, readAuthConfig } from "../lib/auth";

const ERRORS: Record<string, string> = {
  not_configured: "Sign-in is not configured on this server.",
  denied: "Sign-in was cancelled or denied.",
  invalid_state: "Your sign-in session expired. Please try again.",
  sign_in_failed: "Microsoft sign-in failed. Please try again or contact an administrator.",
};

const FEATURES = [
  ["WhatIfStreet", "Re-imagine a real street under a world-changing event."],
  ["Walkthrough", "Chain scenes into a continuous film with inherited look and feel."],
] as const;

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await getSession();
  const configured = authDisabled(process.env) || !!readAuthConfig(process.env);
  const message = error ? (ERRORS[error] ?? "Something went wrong signing in.") : !configured ? ERRORS.not_configured : null;

  return (
    <main className="mx-auto flex min-h-screen w-[min(1120px,calc(100%-32px))] flex-col justify-center py-16">
      <h1 className="text-[clamp(44px,9vw,110px)] font-bold uppercase leading-[0.92] tracking-[-0.04em] text-ink">
        Scene<span className="text-accent">Splice</span>
      </h1>
      <div className="my-6 h-[3px] w-24 rounded-full bg-accent" />
      <p className="max-w-[620px] text-sm leading-relaxed text-dim">
        Splice scenes through time: simulate architectural decay and branching what-if futures with ComfyUI.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {session ? (
          <>
            <Link href="/app" className="plaque-label rounded-full border-2 border-ink bg-accent px-6 py-2.5 text-xs text-on-accent">
              Open SceneSplice
            </Link>
            <span className="text-xs text-dim">Signed in as {session.name}</span>
          </>
        ) : (
          <a
            href="/api/auth/login"
            aria-disabled={!configured}
            className={`plaque-label inline-flex items-center gap-3 rounded-full border-2 border-ink bg-accent px-6 py-2.5 text-xs text-on-accent ${
              configured ? "" : "pointer-events-none opacity-50"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Microsoft
          </a>
        )}
      </div>
      {message && (
        <p role="alert" className="mt-4 text-xs text-oxide">
          {message}
        </p>
      )}

      <ul className="mt-14 grid gap-4 sm:grid-cols-2">
        {FEATURES.map(([title, body]) => (
          <li key={title} className="chrome rounded-2xl border-2 border-ink p-5">
            <h2 className="plaque-label text-[11px] text-ink">{title}</h2>
            <p className="mt-2 text-xs leading-relaxed text-dim">{body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
