import { LoadingSpinner } from "@/components/shared/loading-spinner";

/**
 * Route-level loading fallback. Server components in this app hit Neon for
 * every page, so a visible placeholder matters more than usual when the
 * compute is cold-starting (see lib/db/retry.ts).
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Sidebar placeholder — matches the shell used by every role layout. */}
      <div className="hidden w-64 shrink-0 bg-sidebar lg:block" />
      <main className="min-w-0 flex-1 bg-background px-4 py-6 lg:px-10 lg:py-8">
        {/* True viewport center: the sidebar placeholder would otherwise push
            the spinner right of the display middle. */}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
          <LoadingSpinner />
        </div>
      </main>
    </div>
  );
}
