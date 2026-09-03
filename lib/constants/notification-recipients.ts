// Email addresses notified when an employee changes their address.
// Facilities is fixed; Operations recipient is configurable (env override).

export const FACILITIES_NOTIFICATION_EMAIL =
  process.env.FACILITIES_NOTIFICATION_EMAIL || "ax-facilities-bd@commure.com";

export const OPERATIONS_NOTIFICATION_EMAIL =
  process.env.OPERATIONS_NOTIFICATION_EMAIL || "";
