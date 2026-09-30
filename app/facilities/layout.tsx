import { requireRole } from "@/lib/rbac/guards";
import { Role, ROLE_LABELS } from "@/lib/constants/enums";
import { NavSidebar } from "@/components/shared/nav-sidebar";
import type { NavLink } from "@/components/shared/nav-sidebar";

export default async function FacilitiesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireRole([Role.FACILITIES]);

  const links: NavLink[] = [
    { href: "/facilities/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/facilities/route-planning", label: "Pick Schedule", icon: "route" },
    {
      href: "/facilities/automated-route-planner",
      label: "Auto Route Planner",
      icon: "automation",
    },
    {
      href: "/facilities/route-setting",
      label: "Route Setting",
      icon: "settings",
    },
    {
      href: "/facilities/pickup-point-coordinates",
      label: "Pick-up Points",
      icon: "pickup",
    },
    { href: "/facilities/adhoc", label: "Ad-hoc Transport", icon: "adhoc" },
    { href: "/facilities/vehicles", label: "Vehicles & Drivers", icon: "vehicles" },
    { href: "/facilities/user-info", label: "User Info", icon: "users" },
    {
      href: "/facilities/allocation-history",
      label: "Allocation History",
      icon: "history",
    },
    { href: "/facilities/email-log", label: "Email Log", icon: "email" },
    { href: "/facilities/profile", label: "Profile", icon: "profile" },
  ];

  return (
    <div data-role={Role.FACILITIES} className="flex min-h-screen flex-col lg:flex-row">
      <NavSidebar
        user={user}
        title={ROLE_LABELS[Role.FACILITIES]}
        links={links}
        activeAccentClassName="bg-[rgba(112,188,204,0.15)] text-[#70bccc]"
        activeDotClassName="bg-[#70bccc]"
        avatarClassName="bg-[#0f3038]"
        avatarTextClassName="text-[#70bccc]"
      />
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
