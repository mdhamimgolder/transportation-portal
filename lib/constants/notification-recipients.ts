// Recipients notified when an employee changes their address or requests
// transport outside the normal flow. Read lazily (getters, never module-level
// constants) so importing this module never triggers env validation — the
// values are only resolved inside the server action that sends the mail.
import "server-only";
import { env } from "@/lib/env";

const DEFAULT_FACILITIES_NOTIFICATION_EMAIL = "ax-facilities-bd@commure.com";

export const notificationRecipients = {
  get facilitiesNotificationEmail(): string {
    return (
      env.FACILITIES_NOTIFICATION_EMAIL || DEFAULT_FACILITIES_NOTIFICATION_EMAIL
    );
  },

  get operationsNotificationEmail(): string {
    return env.OPERATIONS_NOTIFICATION_EMAIL || "";
  },
};
