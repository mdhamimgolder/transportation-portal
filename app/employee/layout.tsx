import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { MobileNav } from "@/components/shared/mobile-nav";
import type { NavLink } from "@/components/shared/nav-sidebar";

const links: NavLink[] = [
  { href: "/employee/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/employee/weekly", label: "Weekly", icon: "weekly" },
  { href: "/employee/adhoc", label: "Ad-hoc", icon: "adhoc" },
  { href: "/employee/profile", label: "Profile", icon: "profile" },
];

export default async function EmployeeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireRole([Role.EMPLOYEE]);

  return (
    <MobileNav user={user} links={links}>
      {children}
    </MobileNav>
  );
}
