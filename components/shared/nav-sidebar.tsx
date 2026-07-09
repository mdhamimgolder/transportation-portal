"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Car,
  ClipboardCheck,
  FileDown,
  History,
  LayoutDashboard,
  Map,
  ScrollText,
  Settings,
  UserCheck,
  UserRound,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/shared/logout-button";
import type { SessionUser } from "@/lib/auth/session";

export type NavLink = {
  href: string;
  label: string;
  badge?: number;
  icon?: string;
};

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  weekly: CalendarDays,
  adhoc: Zap,
  profile: UserRound,
  "weekly-requests": ClipboardCheck,
  approvals: UserCheck,
  history: History,
  route: Map,
  export: FileDown,
  vehicles: Car,
  users: Users,
  reports: BarChart3,
  audit: ScrollText,
  settings: Settings,
};

function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function NavSidebar({
  user,
  title,
  links,
}: {
  user: SessionUser;
  title: string;
  links: NavLink[];
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-ink text-ink-foreground">
      <div className="flex items-center gap-3 px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/commure-logo.jpeg"
          alt=""
          className="size-7 shrink-0 rounded-md object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-medium leading-tight">
            Transportation
          </p>
          <p className="truncate font-mono text-[11px] tracking-wide text-ink-foreground/50 uppercase">
            {title}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-ink-foreground/40 uppercase">
          Menu
        </p>
        {links.map((link) => {
          const Icon = link.icon ? ICONS[link.icon] : undefined;
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-ink-foreground/10 text-ink-foreground"
                  : "text-ink-foreground/60 hover:bg-ink-foreground/5 hover:text-ink-foreground"
              )}
            >
              {Icon ? <Icon className="size-4 shrink-0" /> : null}
              <span className="flex-1 truncate">{link.label}</span>
              {link.badge ? (
                <span
                  className={cn(
                    "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-semibold",
                    active
                      ? "bg-amber text-amber-foreground"
                      : "bg-amber/90 text-amber-foreground"
                  )}
                >
                  {link.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-foreground/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-foreground/10 text-xs font-semibold text-ink-foreground">
            {initialsOf(user.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="truncate text-xs text-ink-foreground/50">{user.email}</p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
