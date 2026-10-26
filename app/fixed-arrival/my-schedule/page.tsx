import { requireRole } from "@/lib/rbac/guards";
import { Role } from "@/lib/constants/enums";
import { prisma } from "@/lib/prisma";
import {
  getMondayOfWeek,
  startOfToday,
  getWeekDays,
  DAY_LABELS,
  formatShortDate,
} from "@/lib/date/week";
import { ARRIVAL_TIME_OPTIONS } from "@/lib/constants/arrival-times";
import { FixedArrivalPicker } from "@/components/fixed-arrival/fixed-arrival-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays } from "lucide-react";

export default async function FixedArrivalMySchedulePage() {
  const session = await requireRole([Role.FIXED_ARRIVAL]);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.id },
    select: { fixedArrivalTime: true },
  });

  const ARRIVAL_TIME_LABELS = Object.fromEntries(
    ARRIVAL_TIME_OPTIONS.map((o) => [o.value, o.label])
  );

  const thisMonday = getMondayOfWeek(startOfToday());
  const weekDates = getWeekDays(thisMonday);
  const arrivalLabel = user.fixedArrivalTime
    ? ARRIVAL_TIME_LABELS[user.fixedArrivalTime] ?? user.fixedArrivalTime
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My Schedule</h1>
        <p className="text-sm text-muted-foreground">
          You pick your arrival time once — every week after that, transport is
          planned automatically around it.
        </p>
      </div>

      {user.fixedArrivalTime ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-4 text-amber" />
              Your arrival time is fixed
            </CardTitle>
            <CardDescription>
              Locked on your profile until Facilities changes it for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted p-4">
              <span className="text-sm text-muted-foreground">Arrival at office</span>
              <Badge variant="secondary" className="text-base tabular-nums">
                {arrivalLabel}
              </Badge>
              <span className="text-sm text-muted-foreground">
                &mdash; you are auto-included in every route mapping for this
                time.
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              To change your arrival time, please contact the Facilities team —
              they will update it for you.
            </p>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                This week&apos;s service days
              </p>
              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
                {weekDates.map((date, i) => (
                  <div key={i} className="rounded-md bg-muted/40 px-2.5 py-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{DAY_LABELS[i]}</p>
                    <p className="text-xs">{formatShortDate(date)}</p>
                    <p className="text-sm font-medium">{arrivalLabel}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-[24rem] py-9">
          <CardHeader>
            <CardTitle>Choose your arrival time</CardTitle>
            <CardDescription>
              This is a one-time selection. After you save it, you won&apos;t be
              able to change it yourself — Facilities will, if ever needed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FixedArrivalPicker />
          </CardContent>
        </Card>
      )}
    </div>
  );
}