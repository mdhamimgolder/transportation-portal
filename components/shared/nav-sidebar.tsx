"use client";

import { useEffect, useState } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
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
  collapsed = false,
}: {
  links: NavLink[];
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-3 py-2">
      <p
        className={cn(
          "px-3 pb-1.5 text-[11px] font-semibold tracking-wider whitespace-nowrap text-ink-foreground/40 uppercase",
          collapsed && "hidden group-hover/sidebar:block"
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
            title={collapsed ? link.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-ink-foreground/10 text-ink-foreground"
                : "text-ink-foreground/60 hover:bg-ink-foreground/5 hover:text-ink-foreground"
            )}
          >
            <span className="relative shrink-0">
              {Icon ? <Icon className="size-4" /> : null}
              {collapsed && link.badge ? (
                <span className="absolute -top-1 -right-1 size-2 rounded-full bg-amber group-hover/sidebar:hidden" />
              ) : null}
            </span>
            <span
              className={cn(
                "flex-1 truncate whitespace-nowrap",
                collapsed && "hidden group-hover/sidebar:inline"
              )}
            >
              {link.label}
            </span>
            {link.badge ? (
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-semibold",
                  active
                    ? "bg-amber text-amber-foreground"
                    : "bg-amber/90 text-amber-foreground",
                  collapsed && "hidden group-hover/sidebar:flex"
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
  collapsed = false,
}: {
  user: SessionUser;
  align?: "start" | "end";
  collapsed?: boolean;
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
          <div
            className={cn(
              "min-w-0 flex-1",
              collapsed && "hidden group-hover/sidebar:block"
            )}
          >
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
  collapsed = false,
}: {
  title: string;
  collapsed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-5",
        collapsed ? "justify-center px-2" : "px-5"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/commure-logo.jpeg"
        alt=""
        className="size-7 shrink-0 rounded-md object-cover"
      />
      <div
        className={cn("min-w-0", collapsed && "hidden group-hover/sidebar:block")}
      >
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

const SIDEBAR_COLLAPSE_STORAGE_KEY = "nav-sidebar-collapsed";

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
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const homeHref = links[0]?.href ?? "/";

  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === "1");
    setHydrated(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

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

      {/* Desktop sidebar -- shown at the lg breakpoint and up */}
      <aside
        className={cn(
          "group/sidebar sticky top-0 hidden h-screen shrink-0 lg:block",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <div
          className={cn(
            "flex h-full w-64 flex-col bg-ink text-ink-foreground",
            hydrated && "transition-[width] duration-200 ease-out",
            collapsed &&
              "absolute inset-y-0 left-0 z-40 w-16 overflow-hidden group-hover/sidebar:w-64 group-hover/sidebar:overflow-visible group-hover/sidebar:shadow-2xl"
          )}
        >
          <Link href={homeHref}>
            <BrandMark title={title} collapsed={collapsed} />
          </Link>

          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="mx-3 mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-foreground/60 transition-colors hover:bg-ink-foreground/5 hover:text-ink-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" />
            ) : (
              <PanelLeftClose className="size-4 shrink-0" />
            )}
            <span
              className={cn(
                "flex-1 truncate text-left whitespace-nowrap",
                collapsed && "hidden group-hover/sidebar:inline"
              )}
            >
              Collapse
            </span>
          </button>

          <NavLinkList links={links} collapsed={collapsed} />
          <div className="border-t border-ink-foreground/10 px-4 py-4">
            <UserMenu user={user} collapsed={collapsed} />
          </div>
        </div>
      </aside>
    </>
  );
}
