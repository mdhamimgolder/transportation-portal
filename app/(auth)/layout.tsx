export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-ink px-12 py-10 text-ink-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/commure-logo.jpeg" alt="" className="size-6 rounded" />
          <span className="font-display text-sm font-medium tracking-wide uppercase">
            Transportation Portal
          </span>
        </div>

        <div className="relative flex flex-1 items-center justify-center">
          <div className="route-loop-orbit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/commure-logo.jpeg"
              alt=""
              className="size-72 rounded-3xl"
            />
          </div>
        </div>

        <div className="max-w-sm">
          <p className="font-display text-2xl leading-snug text-[#aef2ff]">
            Every route, one schedule.
          </p>
          <p className="mt-2 text-sm text-ink-foreground/60">
            Weekly schedules, ad-hoc pickups, and vehicle assignments for the
            whole fleet, in one place.
          </p>
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col items-center justify-center bg-paper px-6 py-12 lg:w-1/2">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/commure-logo.jpeg"
            alt=""
            className="size-9 rounded-lg"
          />
          <span className="font-display text-lg font-medium tracking-tight">
            Transportation Portal
          </span>
        </div>
        <div className="w-full max-w-sm">{children}</div>
        <p className="mt-8 font-mono text-xs tracking-wide text-muted-foreground uppercase">
          Internal transport management
        </p>
      </div>
    </div>
  );
}
