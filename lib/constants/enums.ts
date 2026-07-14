export const Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  EMPLOYEE: "EMPLOYEE",
  OPERATIONS: "OPERATIONS",
  FACILITIES: "FACILITIES",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.EMPLOYEE,
  Role.OPERATIONS,
  Role.FACILITIES,
];

export const WeeklyScheduleStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type WeeklyScheduleStatus =
  (typeof WeeklyScheduleStatus)[keyof typeof WeeklyScheduleStatus];

export const AdHocStatus = {
  PENDING: "PENDING",
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
};

export const ROLE_PATH_PREFIX: Record<Role, string> = {
  SUPER_ADMIN: "/super-admin",
  EMPLOYEE: "/employee",
  OPERATIONS: "/operations",
  FACILITIES: "/facilities",
};
