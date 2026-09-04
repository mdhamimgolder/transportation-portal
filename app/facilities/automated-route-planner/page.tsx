import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { getSubmissionWindow } from "@/lib/date/week";
import { getWeekRouteOverview } from "@/actions/route-generation.actions";
import { AutoRoutePlannerClient } from "@/components/facilities/auto-route-planner-client";

export const dynamic = "force-dynamic";

/** Local calendar date string (no UTC scatter) so the week label is exact in
 * any timezone. */
function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default async function AutomatedRoutePlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireRole([Role.FACILITIES, Role.SUPER_ADMIN]);

  const params = await searchParams;
  const weekParam = typeof params.week === "string" && params.week ? params.week : undefined;
  const targetWeek = weekParam
    ? new Date(`${weekParam}T00:00:00`)
    : getSubmissionWindow().weekStartDate;
  const weekLabel = toLocalISODate(targetWeek);
  const overview = await getWeekRouteOverview(weekLabel);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Auto Route Planner</h1>
        <p className="text-sm text-muted-foreground">
          Pick a week, then run mapping. Routes are generated for all 5 days
          (Monday-Friday) across the 10 PM, 11 PM and 12 AM-6 AM shifts using
          open-source OSRM routing — no API keys required. Vehicles pinned in
          Route Setting are used first for their shift.
        </p>
      </div>
      <AutoRoutePlannerClient
        initialWeekStart={weekLabel}
        initialOverview={overview}
      />
    </div>
  );
}