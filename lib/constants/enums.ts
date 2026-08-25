export const Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  EMPLOYEE: "EMPLOYEE",
  OPERATIONS: "OPERATIONS",
  FACILITIES: "FACILITIES",
  CORPORATE_EMPLOYEE: "CORPORATE_EMPLOYEE",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.EMPLOYEE,
  Role.OPERATIONS,
  Role.FACILITIES,
  Role.CORPORATE_EMPLOYEE,
];

// Human-readable labels shown in the UI (role dropdowns, sidebar titles).
// Internal role codes and route prefixes stay unchanged for backward
// compatibility with existing accounts/URLs -- only the display text differs.
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  EMPLOYEE: "Employee-MDS",
  OPERATIONS: "Operation-Admin",
  FACILITIES: "Facilities",
  CORPORATE_EMPLOYEE: "Operation-Corporate Employee",
};

export const WeeklyScheduleStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type WeeklyScheduleStatus =
  (typeof WeeklyScheduleStatus)[keyof typeof WeeklyScheduleStatus];

export const AdHocStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  ASSIGNED: "ASSIGNED",
  CANCELLED: "CANCELLED",
} as const;
export type AdHocStatus = (typeof AdHocStatus)[keyof typeof AdHocStatus];

export const AddressChangeStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type AddressChangeStatus =
  (typeof AddressChangeStatus)[keyof typeof AddressChangeStatus];

export const ContactChangeStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type ContactChangeStatus =
  (typeof ContactChangeStatus)[keyof typeof ContactChangeStatus];

export const PickupPointChangeStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type PickupPointChangeStatus =
  (typeof PickupPointChangeStatus)[keyof typeof PickupPointChangeStatus];

// Maps each internal role to the URL path prefix that owns its dashboard.
export const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin/dashboard",
  EMPLOYEE: "/employee/dashboard",
  OPERATIONS: "/operations/dashboard",
  FACILITIES: "/facilities/dashboard",
  CORPORATE_EMPLOYEE: "/corporate-employee/dashboard",
};

export const ROLE_PATH_PREFIX: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin",
  EMPLOYEE: "/employee",
  OPERATIONS: "/operations",
  FACILITIES: "/facilities",
  CORPORATE_EMPLOYEE: "/corporate-employee",
};
