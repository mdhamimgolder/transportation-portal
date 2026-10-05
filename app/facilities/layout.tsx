import { requireRole } from "@/lib/rbac/guards";
import { Role, ROLE_LABELS, PickupPointChangeStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { NavSidebar } from "@/components/shared/nav-sidebar";
import type { NavLink } from "@/components/shared/nav-sidebar";

export default async function FacilitiesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireRole([Role.FACILITIES]);

  const pendingPickupPointChanges = await prisma.pickupPointChangeRequest.count({
    where: { status: PickupPointChangeStatus.PENDING },
  });

  const links: NavLink[] = [
    { href: "/facilities/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/facilities/route-planning", label: "Pick-up schedule", icon: "route" },
    {
      href: "/facilities/automated-route-planner",
      label: "Automated Route Planner",
      icon: "automation",
    },
    { href: "/facilities/route-setting", label: "Route Settings", icon: "settings" },
    { href: "/facilities/pickup-point-coordinates", label: "Pick-up Points", icon: "pickup" },
    { href: "/facilities/adhoc", label: "Ad-hoc Transport", icon: "adhoc" },
    { href: "/facilities/vehicles", label: "Vehicles & Drivers", icon: "vehicles" },
    { href: "/facilities/user-info", label: "User Info", icon: "users" },
    {
      href: "/facilities/profile-approvals",
      label: "Profile Approvals",
      icon: "approvals",
      badge: pendingPickupPointChanges,
    },
    {
      href: "/facilities/allocation-history",
      label: "Allocation History",
      icon: "history",
    },
    { href: "/facilities/profile", label: "Profile", icon: "profile" },
  ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <NavSidebar user={user} title={ROLE_LABELS[Role.FACILITIES]} links={links} />
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
