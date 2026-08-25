"use client";

import {
  replicateAcrossWeek,
  copyLastWeekRoutes,
} from "@/actions/route-assignment.actions";
import { Button } from "@/components/ui/button";

export function ReplicateAcrossWeekButton({ sourceDayId }: { sourceDayId: string | null }) {
  if (!sourceDayId) return null;
  return (
    <form action={replicateAcrossWeek}>
      <input type="hidden" name="sourceDayId" value={sourceDayId} />
      <Button type="submit" variant="outline" size="sm">
        Replicate across week
      </Button>
    </form>
  );
}

export function CopyLastWeekButton({ weeklyScheduleId }: { weeklyScheduleId: string }) {
  return (
    <form action={copyLastWeekRoutes}>
      <input type="hidden" name="weeklyScheduleId" value={weeklyScheduleId} />
      <Button type="submit" variant="outline" size="sm">
        Copy last week&apos;s routes
      </Button>
    </form>
  );
}
