import type { Role } from "@/api/types";

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

export const NAV: Record<Role, NavItem[]> = {
  employee: [
    { to: "/employee", label: "My Transport", icon: "🚐", end: true },
    { to: "/employee/weekly", label: "Weekly Schedule", icon: "🗓️" },
    { to: "/employee/adhoc", label: "Ad-Hoc Request", icon: "⚡" },
    { to: "/employee/profile", label: "Profile", icon: "👤" },
  ],
  operations: [
    { to: "/operations", label: "Overview", icon: "📊", end: true },
    { to: "/operations/weekly", label: "Weekly Approvals", icon: "✅" },
    { to: "/operations/adhoc", label: "Ad-Hoc Tracking", icon: "⚡" },
    { to: "/operations/address", label: "Profile Approvals", icon: "🏠" },
    { to: "/operations/profiles", label: "Employee Profiles", icon: "👥" },
    { to: "/operations/history", label: "Allocation History", icon: "🕑" },
  ],
  facilities: [
    { to: "/facilities", label: "Route Planning", icon: "🗺️", end: true },
    { to: "/facilities/adhoc", label: "Ad-Hoc Transport", icon: "⚡" },
    { to: "/facilities/profiles", label: "Employee Profiles", icon: "👥" },
    { to: "/facilities/history", label: "Allocation History", icon: "🕑" },
  ],
  super_admin: [
    { to: "/admin", label: "Overview", icon: "📊", end: true },
    { to: "/admin/users", label: "Users", icon: "👥" },
    { to: "/admin/bulk", label: "Bulk Upload", icon: "📤" },
    { to: "/admin/audit", label: "Audit Log", icon: "📜" },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  employee: "Employee",
  operations: "Operations",
  facilities: "Facilities",
  super_admin: "Super Admin",
};
