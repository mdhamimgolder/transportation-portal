import type { ReactNode } from "react";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="login-glow flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-lime/15 ring-1 ring-lime/30">
            <span className="text-2xl">🚐</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Transport Portal</h1>
          <p className="mt-1 text-sm text-muted">Smarter office transport, minus the spreadsheets.</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface/80 p-7 shadow-2xl backdrop-blur">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          {subtitle && <p className="mb-5 mt-1 text-sm text-muted">{subtitle}</p>}
          <div className={subtitle ? "" : "mt-5"}>{children}</div>
        </div>
      </div>
    </div>
  );
}
