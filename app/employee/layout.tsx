import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { NavSidebar } from "@/components/shared/nav-sidebar";
import type { NavLink } from "@/components/shared/nav-sidebar";

const links: NavLink[] = [
  { href: "/employee/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/employee/weekly", label: "Weekly Schedule", icon: "weekly" },
  { href: "/employee/adhoc", label: "Ad-hoc Request", icon: "adhoc" },
  { href: "/employee/profile", label: "Profile", icon: "profile" },
];

export default async function EmployeeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireRole([Role.EMPLOYEE]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <NavSidebar
        user={user}
        title="Employee"
        links={links}
        forceExpanded
        hideMenuLabel
        activeAccentClassName="bg-[rgba(174,242,255,0.14)] text-[#aef2ff]"
        activeDotClassName="bg-[#aef2ff]"
        avatarClassName="bg-[#0e2a33]"
        avatarTextClassName="text-[#aef2ff]"
      />
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">
        <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
      </main>
    </div>
  );
}
