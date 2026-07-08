"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/shared/logout-button";
import type { SessionUser } from "@/lib/auth/session";
import type { NavLink } from "@/components/shared/nav-sidebar";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  weekly: CalendarDays,
  adhoc: Zap,
  profile: UserRound,
};

export function MobileNav({
  user,
  links,
  children,
}: {
  user: SessionUser;
  links: NavLink[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/commure-logo.jpeg"
            alt=""
            className="size-8 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-medium leading-tight">
              Transportation
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user.fullName}
            </p>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 p-4 pb-24">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t bg-card">
        <div className="mx-auto flex w-full max-w-2xl">
          {links.map((link) => {
            const Icon = link.icon ? ICONS[link.icon] : undefined;
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {Icon ? (
                  <Icon className={cn("size-5", active && "text-teal")} />
                ) : null}
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
