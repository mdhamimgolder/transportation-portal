import { requireRole } from "@/lib/rbac/guards";
import { Role, AddressChangeStatus, ContactChangeStatus } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import { NavSidebar } from "@/components/shared/nav-sidebar";
import type { NavLink } from "@/components/shared/nav-sidebar";

export default async function OperationsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireRole([Role.OPERATIONS]);

  const [pendingAddressChanges, pendingContactChanges] = await Promise.all([
    prisma.addressChangeRequest.count({
      where: { status: AddressChangeStatus.PENDING },
    }),
    prisma.contactChangeRequest.count({
      where: { status: ContactChangeStatus.PENDING },
    }),
  ]);

  const links: NavLink[] = [
    { href: "/operations/dashboard", label: "Dashboard", icon: "dashboard" },
    {
      href: "/operations/weekly-requests",
      label: "Weekly Requests",
      icon: "weekly-requests",
    },
    { href: "/operations/adhoc", label: "Ad-hoc Transport", icon: "adhoc" },
    {
      href: "/operations/profile-approvals",
      label: "Profile Approvals",
      icon: "approvals",
      badge: pendingAddressChanges + pendingContactChanges,
    },
    {
      href: "/operations/allocation-history",
      label: "Allocation History",
      icon: "history",
    },
    { href: "/operations/profile", label: "Profile", icon: "profile" },
  ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <NavSidebar user={user} title="Operations" links={links} />
      <main className="flex-1 px-4 py-6 lg:px-10 lg:py-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
