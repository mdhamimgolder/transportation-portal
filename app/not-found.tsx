import Link from "next/link";
import { ROLE_HOME, type Role } from "@/lib/constants/enums";
import { getSession } from "@/lib/auth/session";

/**
 * Global 404. Sends a signed-in user back to their own dashboard rather than the
 * marketing-less root, so a mistyped URL costs one click to recover.
 */
export default async function NotFound() {
  const session = await getSession();
  const homeHref = session ? ROLE_HOME[session.role as Role] : "/login";

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-card">
        <div className="h-1 bg-[#70bccc]" />
        <div className="space-y-4 px-8 py-8">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            404 — not found
          </p>
          <p className="font-display text-xl">This page does not exist</p>
          <p className="text-sm text-muted-foreground">
            The link may be outdated, or the page may have been moved. Use the
            button below to get back to your dashboard.
          </p>
          <div className="pt-1">
            <Link
              href={homeHref}
              className="inline-block rounded-lg bg-[#70bccc] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5aa9b8]"
            >
              {session ? "Back to my dashboard" : "Go to sign in"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
