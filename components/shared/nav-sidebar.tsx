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
  MapPin,
  Menu,
  ScrollText,
  Settings,
  UserCheck,
  UserRound,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
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
  automation: Zap,
  history: History,
  route: Map,
  pickup: MapPin,
  export: FileDown,
  vehicles: Car,
  users: Users,
  reports: BarChart3,
  audit: ScrollText,
  settings: Settings,
};

function initialsOf(name: string): string {
  return getInitials(name);
}

function NavLinkList({
  links,
  onNavigate,
  expanded = true,
  hideMenuLabel = false,
  activeAccentClassName,
  activeDotClassName,
}: {
  links: NavLink[];
  onNavigate?: () => void;
  expanded?: boolean;
  hideMenuLabel?: boolean;
  activeAccentClassName?: string;
  activeDotClassName?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-3 py-2">
      <p
        className={cn(
          "px-3 pb-1.5 text-[11px] font-semibold tracking-wider whitespace-nowrap text-ink-foreground/40 uppercase",
          (!expanded || hideMenuLabel) && "hidden"
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
                ? (activeAccentClassName ?? "bg-ink-foreground/10 text-ink-foreground")
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
            {active && activeDotClassName ? (
              <span className={cn("size-1.5 shrink-0 rounded-full", activeDotClassName)} />
            ) : null}
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
  avatarClassName,
  avatarTextClassName,
}: {
  user: SessionUser;
  align?: "start" | "end";
  expanded?: boolean;
  avatarClassName?: string;
  avatarTextClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Account options"
        >
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              avatarClassName ?? "bg-ink-foreground/10",
              avatarTextClassName ?? "text-ink-foreground"
            )}
          >
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

function BrandMark({ expanded = true }: { expanded?: boolean }) {
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
      <p
        className={cn(
          "truncate font-display text-sm font-medium lowercase",
          !expanded && "hidden"
        )}
      >
        commure
      </p>
    </div>
  );
}

export function NavSidebar({
  user,
  title,
  links,
  forceExpanded = false,
  hideMenuLabel = false,
  activeAccentClassName,
  activeDotClassName,
  avatarClassName,
  avatarTextClassName,
}: {
  user: SessionUser;
  title: string;
  links: NavLink[];
  /** Keep the desktop sidebar permanently expanded -- no hover-driven collapse/expand. */
  forceExpanded?: boolean;
  /** Hide the "Menu" section label above the nav links. */
  hideMenuLabel?: boolean;
  /** Background + text classes for the active nav pill; falls back to the neutral default. */
  activeAccentClassName?: string;
  /** Classes for the solid dot shown next to the active link's label; omit to render no dot. */
  activeDotClassName?: string;
  /** Background classes for the account avatar circle; falls back to the neutral default. */
  avatarClassName?: string;
  /** Text classes for the account avatar initials; falls back to the neutral default. */
  avatarTextClassName?: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isExpanded = forceExpanded || hovered;
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
              <BrandMark />
            </Link>
            <NavLinkList
              links={links}
              onNavigate={() => setMobileOpen(false)}
              hideMenuLabel={hideMenuLabel}
              activeAccentClassName={activeAccentClassName}
              activeDotClassName={activeDotClassName}
            />
            <div className="border-t border-ink-foreground/10 px-4 py-4">
              <UserMenu
                user={user}
                avatarClassName={avatarClassName}
                avatarTextClassName={avatarTextClassName}
              />
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
          <p className="truncate font-display text-sm font-medium lowercase">
            commure
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

      {/* Desktop sidebar -- shown at the lg breakpoint and up. By default
          icon-only; hovering smoothly widens it in place (the content area
          shrinks to match, same as a normal flex sibling) and it eases back
          down the moment the pointer leaves -- no overlay, so nothing from
          the page behind it can show through. `forceExpanded` pins it open
          and ignores hover entirely, for roles that want a static sidebar. */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col bg-ink text-ink-foreground transition-[width] duration-200 ease-in-out lg:flex",
          isExpanded ? "w-64" : "w-16"
        )}
      >
        <Link href={homeHref}>
          <BrandMark expanded={isExpanded} />
        </Link>
        <NavLinkList
          links={links}
          expanded={isExpanded}
          hideMenuLabel={hideMenuLabel}
          activeAccentClassName={activeAccentClassName}
          activeDotClassName={activeDotClassName}
        />
        <div className="border-t border-ink-foreground/10 px-4 py-4">
          <UserMenu
            user={user}
            expanded={isExpanded}
            avatarClassName={avatarClassName}
            avatarTextClassName={avatarTextClassName}
          />
        </div>
      </aside>
    </>
  );
}
