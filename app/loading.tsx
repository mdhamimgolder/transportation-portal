/**
 * Route-level loading skeleton. Server components in this app hit Neon for every
 * page, so a visible placeholder matters more than usual when the compute is
 * cold-starting (see lib/db/retry.ts).
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Sidebar placeholder — matches the shell used by every role layout. */}
      <div className="hidden w-64 shrink-0 bg-sidebar lg:block" />
      <main className="min-w-0 flex-1 bg-background px-4 py-6 lg:px-10 lg:py-8">
        <div className="mx-auto w-full max-w-7xl animate-pulse space-y-6">
          <div className="space-y-3">
            <div className="h-7 w-56 rounded-lg bg-black/5" />
            <div className="h-4 w-80 rounded-lg bg-black/5" />
          </div>
          <div className="h-28 rounded-2xl border border-border bg-card" />
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="h-9 rounded-lg bg-black/5" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
