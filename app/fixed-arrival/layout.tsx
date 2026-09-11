import { requireRole } from "@/lib/rbac/guards";
import { Role, ROLE_LABELS } from "@/lib/constants/enums";
import { NavSidebar } from "@/components/shared/nav-sidebar";
import type { NavLink } from "@/components/shared/nav-sidebar";

const links: NavLink[] = [
  { href: "/fixed-arrival/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/fixed-arrival/my-schedule", label: "My Schedule", icon: "weekly" },
  { href: "/fixed-arrival/profile", label: "Profile", icon: "profile" },
];

export default async function FixedArrivalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireRole([Role.FIXED_ARRIVAL]);

  return (
    <div data-role={Role.FIXED_ARRIVAL} className="flex min-h-screen flex-col lg:flex-row">
      <NavSidebar
        user={user}
        title={ROLE_LABELS[Role.FIXED_ARRIVAL]}
        links={links}
        forceExpanded
        hideMenuLabel
        activeAccentClassName="bg-[rgba(245,158,11,0.15)] text-[#f59e0b]"
        activeDotClassName="bg-[#f59e0b]"
        avatarClassName="bg-[#78350f]"
        avatarTextClassName="text-[#f59e0b]"
      />
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
