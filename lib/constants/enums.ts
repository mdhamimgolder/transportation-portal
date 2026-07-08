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

export const AuditActionType = {
  USER_LOGIN: "USER_LOGIN",
  USER_LOGOUT: "USER_LOGOUT",
  USER_CREATED: "USER_CREATED",
  USER_BULK_CREATED: "USER_BULK_CREATED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  USER_DEACTIVATED: "USER_DEACTIVATED",
  USER_REACTIVATED: "USER_REACTIVATED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PROFILE_EDITED: "PROFILE_EDITED",
  ADDRESS_CHANGE_REQUESTED: "ADDRESS_CHANGE_REQUESTED",
  ADDRESS_CHANGE_APPROVED: "ADDRESS_CHANGE_APPROVED",
  ADDRESS_CHANGE_REJECTED: "ADDRESS_CHANGE_REJECTED",
  CONTACT_CHANGE_REQUESTED: "CONTACT_CHANGE_REQUESTED",
  CONTACT_CHANGE_APPROVED: "CONTACT_CHANGE_APPROVED",
  CONTACT_CHANGE_REJECTED: "CONTACT_CHANGE_REJECTED",
  PICKUP_POINT_CHANGE_REQUESTED: "PICKUP_POINT_CHANGE_REQUESTED",
  PICKUP_POINT_CHANGE_APPROVED: "PICKUP_POINT_CHANGE_APPROVED",
  PICKUP_POINT_CHANGE_REJECTED: "PICKUP_POINT_CHANGE_REJECTED",
  SCHEDULE_SUBMITTED: "SCHEDULE_SUBMITTED",
  SCHEDULE_APPROVED: "SCHEDULE_APPROVED",
  SCHEDULE_REJECTED: "SCHEDULE_REJECTED",
  SCHEDULE_EDITED: "SCHEDULE_EDITED",
  ADHOC_SUBMITTED: "ADHOC_SUBMITTED",
  ROUTE_ASSIGNED: "ROUTE_ASSIGNED",
  VEHICLE_DRIVER_CREATED: "VEHICLE_DRIVER_CREATED",
  VEHICLE_DRIVER_EDITED: "VEHICLE_DRIVER_EDITED",
  VEHICLE_DRIVER_DEACTIVATED: "VEHICLE_DRIVER_DEACTIVATED",
} as const;
export type AuditActionType =
  (typeof AuditActionType)[keyof typeof AuditActionType];

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
