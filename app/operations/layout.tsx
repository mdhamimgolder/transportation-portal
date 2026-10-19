import { requireRole } from "@/lib/rbac/guards";
import { Role, ROLE_LABELS } from "@/lib/constants/enums";
import { NavSidebar } from "@/components/shared/nav-sidebar";
import type { NavLink } from "@/components/shared/nav-sidebar";

export default async function OperationsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireRole([Role.OPERATIONS]);

  const links: NavLink[] = [
    { href: "/operations/dashboard", label: "Dashboard", icon: "dashboard" },
    {
      href: "/operations/weekly-requests",
      label: "MDS Weekly Schedule",
      icon: "weekly-requests",
    },
    { href: "/operations/adhoc", label: "Adhoc Monitoring", icon: "adhoc" },
    {
      href: "/operations/allocation-history",
      label: "Allocation History",
      icon: "history",
    },
    { href: "/operations/my-schedule", label: "My Schedule", icon: "weekly" },
    { href: "/operations/profile", label: "Profile", icon: "profile" },
  ];

  return (
    <div data-role={Role.OPERATIONS} className="flex min-h-screen flex-col lg:flex-row">
      <NavSidebar
        user={user}
        title={ROLE_LABELS[Role.OPERATIONS]}
        links={links}
        activeAccentClassName="bg-[rgba(112,188,204,0.15)] text-[#70bccc]"
        activeDotClassName="bg-[#70bccc]"
        avatarClassName="bg-[#0f3038]"
        avatarTextClassName="text-[#70bccc]"
      />
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">
        <div className="mx-auto w-full max-w-7xl space-y-6 2xl:max-w-[1680px]">{children}</div>
      </main>
    </div>
  );
}
