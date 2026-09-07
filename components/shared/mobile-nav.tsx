"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Mail,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/actions/auth.actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/lib/auth/session";
import type { NavLink } from "@/components/shared/nav-sidebar";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  weekly: CalendarDays,
  adhoc: Zap,
  profile: UserRound,
  email: Mail,
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
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3 lg:max-w-4xl xl:max-w-5xl">
          <Link href="/employee/dashboard" className="flex min-w-0 flex-1 items-center gap-3">
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
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Account options"
              >
                {initialsOf(user.fullName)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-xs text-muted-foreground">Signed in as</p>
                <p className="truncate text-sm font-medium">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <form action={logoutAction}>
                <DropdownMenuItem asChild variant="destructive">
                  <button type="submit" className="w-full">
                    <LogOut />
                    Log out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 p-4 pb-24 lg:max-w-4xl xl:max-w-5xl">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t bg-card">
        <div className="mx-auto flex w-full max-w-2xl lg:max-w-4xl xl:max-w-5xl">
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
