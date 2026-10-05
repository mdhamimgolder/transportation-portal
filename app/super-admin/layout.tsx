import { requireRole } from "@/lib/rbac/guards";
import { Role, ROLE_LABELS } from "@/lib/constants/enums";
import { NavSidebar } from "@/components/shared/nav-sidebar";
import type { NavLink } from "@/components/shared/nav-sidebar";

const links: NavLink[] = [
  { href: "/super-admin/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/super-admin/users", label: "Users", icon: "users" },
  { href: "/super-admin/reports", label: "Reports", icon: "reports" },
  { href: "/super-admin/audit-log", label: "Audit Log", icon: "audit" },
  { href: "/super-admin/settings", label: "Settings", icon: "settings" },
];

export default async function SuperAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireRole([Role.SUPER_ADMIN]);

  return (
    <div data-role={Role.SUPER_ADMIN} className="flex min-h-screen flex-col lg:flex-row">
      <NavSidebar
        user={user}
        title={ROLE_LABELS[Role.SUPER_ADMIN]}
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
