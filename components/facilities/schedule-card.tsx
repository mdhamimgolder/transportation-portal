import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DAY_LABELS, formatShortDate } from "@/lib/date/week";
import {
  AssignmentForm,
  type VehicleDriverOption,
} from "@/components/facilities/assignment-form";
import {
  ReplicateAcrossWeekButton,
  CopyLastWeekButton,
} from "@/components/facilities/copy-week-buttons";

export type ScheduleCardDay = {
  id: string;
  dayOfWeek: number;
  date: string;
  needsTransport: boolean;
  arrivalTimeLabel: string | null;
  assignment: {
    vehicleDriverId: string;
    driverName: string;
    vehicleNumber: string;
    pickupTime: string;
  } | null;
};

export function ScheduleCard({
  scheduleId,
  employeeName,
  employeeCode,
  weekLabel,
  days,
  options,
}: {
  scheduleId: string;
  employeeName: string;
  employeeCode: string | null;
  weekLabel: string;
  days: ScheduleCardDay[];
  options: VehicleDriverOption[];
}) {
  const firstAssignedDayId = days.find((d) => d.assignment)?.id ?? null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {employeeName}{" "}
              {employeeCode ? (
                <Badge variant="secondary" className="font-normal">
                  {employeeCode}
                </Badge>
              ) : null}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{weekLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <ReplicateAcrossWeekButton sourceDayId={firstAssignedDayId} />
            <CopyLastWeekButton weeklyScheduleId={scheduleId} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {days.map((day) => (
          <div
            key={day.id}
            className="flex flex-col gap-2 border-b pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="w-32 shrink-0">
              <p className="text-sm font-medium">{DAY_LABELS[day.dayOfWeek - 1]}</p>
              <p className="text-xs text-muted-foreground">
                {formatShortDate(new Date(day.date))}
                {day.needsTransport && day.arrivalTimeLabel
                  ? ` · requested ${day.arrivalTimeLabel}`
                  : ""}
              </p>
            </div>
            {day.needsTransport ? (
              <AssignmentForm
                key={`${day.id}-${day.assignment ? day.assignment.vehicleDriverId + day.assignment.pickupTime : "unassigned"}`}
                target={{ weeklyScheduleDayId: day.id }}
                options={options}
                existing={day.assignment ?? undefined}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Not Required</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
