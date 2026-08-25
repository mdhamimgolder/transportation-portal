import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getTransportSettings } from "@/lib/queries/settings";
import { WeeklyLockForm } from "@/components/super-admin/weekly-lock-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SuperAdminSettingsPage() {
  await requireRole([Role.SUPER_ADMIN]);
  const settings = await getTransportSettings();

  const time = `${String(settings.weeklyLockHour).padStart(2, "0")}:${String(
    settings.weeklyLockMinute
  ).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          Settings
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Portal-wide configuration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly submission lock</CardTitle>
          <p className="text-xs text-muted-foreground">
            Employees can submit or edit their weekly schedule until this day
            and time each week. After it passes, the window locks and rolls
            to the following week.
          </p>
        </CardHeader>
        <CardContent>
          <WeeklyLockForm dayOfWeek={settings.weeklyLockDayOfWeek} time={time} />
        </CardContent>
      </Card>
    </div>
  );
}
