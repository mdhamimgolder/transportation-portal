"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary. Catches render/data errors below the root layout
 * (most commonly a Neon cold-start or connection blip that survived the retry
 * in lib/db/retry.ts) and offers a retry instead of the raw Next.js error page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] render error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card">
        <div className="h-1 bg-[#70bccc]" />
        <div className="space-y-4 px-8 py-8">
          <p className="text-h2">Something went wrong</p>
          <p className="text-sm text-muted-foreground">
            This page could not be loaded. It is usually a temporary database
            hiccup — retrying almost always works.
          </p>
          <p className="font-mono text-micro wrap-break-word text-muted-foreground">
            {error.message}
            {error.digest ? ` (${error.digest})` : ""}
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg bg-[#70bccc] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5aa9b8]"
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5"
            >
              Back to my dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
