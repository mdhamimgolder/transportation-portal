import { requireRole } from "@/lib/rbac/guards";
import { Role, ROLE_LABELS } from "@/lib/constants/enums";
import { NavSidebar } from "@/components/shared/nav-sidebar";
import type { NavLink } from "@/components/shared/nav-sidebar";

const links: NavLink[] = [
  { href: "/corporate-employee/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/corporate-employee/my-schedule", label: "My Schedule", icon: "weekly" },
  { href: "/corporate-employee/adhoc", label: "Ad-hoc Request", icon: "adhoc" },
  { href: "/corporate-employee/profile", label: "Profile", icon: "profile" },
];

export default async function CorporateEmployeeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireRole([Role.CORPORATE_EMPLOYEE]);

  return (
    <div data-role={Role.CORPORATE_EMPLOYEE} className="flex min-h-screen flex-col lg:flex-row">
      <NavSidebar
        user={user}
        title={ROLE_LABELS[Role.CORPORATE_EMPLOYEE]}
        links={links}
        forceExpanded
        hideMenuLabel
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
