"use client";

import { useState } from "react";
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
  LogOut,
  Map,
  Menu,
  ScrollText,
  Settings,
  UserCheck,
  UserRound,
  Users,
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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

function NavLinkList({
  links,
  onNavigate,
  expanded = true,
}: {
  links: NavLink[];
  onNavigate?: () => void;
  expanded?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-3 py-2">
      <p
        className={cn(
          "px-3 pb-1.5 text-[11px] font-semibold tracking-wider whitespace-nowrap text-ink-foreground/40 uppercase",
          !expanded && "hidden"
        )}
      >
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
            onClick={onNavigate}
            title={!expanded ? link.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-ink-foreground/10 text-ink-foreground"
                : "text-ink-foreground/60 hover:bg-ink-foreground/5 hover:text-ink-foreground"
            )}
          >
            <span className="relative shrink-0">
              {Icon ? <Icon className="size-4" /> : null}
              {!expanded && link.badge ? (
                <span className="absolute -top-1 -right-1 size-2 rounded-full bg-amber" />
              ) : null}
            </span>
            <span
              className={cn(
                "flex-1 truncate whitespace-nowrap",
                !expanded && "hidden"
              )}
            >
              {link.label}
            </span>
            {link.badge && expanded ? (
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
  );
}

function UserMenu({
  user,
  align = "start",
  expanded = true,
}: {
  user: SessionUser;
  align?: "start" | "end";
  expanded?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Account options"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-foreground/10 text-xs font-semibold text-ink-foreground">
            {initialsOf(user.fullName)}
          </div>
          <div className={cn("min-w-0 flex-1", !expanded && "hidden")}>
            <p className="truncate text-sm font-medium text-ink-foreground">
              {user.fullName}
            </p>
            <p className="truncate text-xs text-ink-foreground/50">{user.email}</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
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
  );
}

function BrandMark({
  title,
  expanded = true,
}: {
  title: string;
  expanded?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-5",
        expanded ? "px-5" : "justify-center px-2"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/commure-logo.jpeg"
        alt=""
        className="size-7 shrink-0 rounded-md object-cover"
      />
      <div className={cn("min-w-0", !expanded && "hidden")}>
        <p className="truncate font-display text-sm font-medium leading-tight">
          Transportation
        </p>
        <p className="truncate font-mono text-[11px] tracking-wide text-ink-foreground/50 uppercase">
          {title}
        </p>
      </div>
    </div>
  );
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const homeHref = links[0]?.href ?? "/";

  return (
    <>
      {/* Mobile top bar -- shown below the lg breakpoint */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-ink px-3 py-2.5 text-ink-foreground lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="flex w-72 max-w-[85vw] flex-col gap-0 border-ink-foreground/10 bg-ink p-0 text-ink-foreground [&_svg]:text-ink-foreground/60"
          >
            <SheetTitle className="sr-only">{title} navigation</SheetTitle>
            <Link href={homeHref} onClick={() => setMobileOpen(false)}>
              <BrandMark title={title} />
            </Link>
            <NavLinkList links={links} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-ink-foreground/10 px-4 py-4">
              <UserMenu user={user} />
            </div>
          </SheetContent>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
        </Sheet>

        <Link href={homeHref} className="flex min-w-0 flex-1 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/commure-logo.jpeg"
            alt=""
            className="size-6 shrink-0 rounded-md object-cover"
          />
          <p className="truncate font-display text-sm font-medium">
            {title}
          </p>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-foreground/10 text-xs font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
      </header>

      {/* Desktop sidebar -- shown at the lg breakpoint and up. Always icon-only;
          hovering flies the full labeled menu out over the content (doesn't
          reflow it) and retracts instantly the moment the pointer leaves. */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="sticky top-0 hidden h-screen w-16 shrink-0 lg:block"
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 z-40 flex h-full flex-col bg-ink text-ink-foreground",
            hovered ? "w-64 overflow-visible shadow-2xl" : "w-16 overflow-hidden"
          )}
        >
          <Link href={homeHref}>
            <BrandMark title={title} expanded={hovered} />
          </Link>
          <NavLinkList links={links} expanded={hovered} />
          <div className="border-t border-ink-foreground/10 px-4 py-4">
            <UserMenu user={user} expanded={hovered} />
          </div>
        </div>
      </aside>
    </>
  );
}
