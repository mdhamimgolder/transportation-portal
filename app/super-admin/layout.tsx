import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { NavSidebar } from "@/components/shared/nav-sidebar";
import type { NavLink } from "@/components/shared/nav-sidebar";

const links: NavLink[] = [
  { href: "/super-admin/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/super-admin/users", label: "Users", icon: "users" },
  { href: "/super-admin/reports", label: "Reports", icon: "reports" },
  { href: "/super-admin/settings", label: "Settings", icon: "settings" },
];

export default async function SuperAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireRole([Role.SUPER_ADMIN]);

  return (
    <div className="flex min-h-screen">
      <NavSidebar user={user} title="Super Admin" links={links} />
      <main className="flex-1 px-6 py-8 lg:px-10">
        <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
