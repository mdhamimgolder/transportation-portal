import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type TodaysScheduleEntry = {
  id: string;
  pickupTime: string;
  driverName: string;
  contactNumber: string;
  vehicleNumber: string;
  requestType: string;
};

export function TodaysScheduleCard({ entries }: { entries: TodaysScheduleEntry[] }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border bg-card p-5">
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-sm text-muted-foreground">Today&apos;s Schedule</p>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pick-up scheduled today.</p>
        ) : (
          <div className="divide-y">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-mono text-base font-medium tracking-tight tabular-nums">
                    {entry.pickupTime}
                  </p>
                  <p className="truncate text-muted-foreground">
                    {entry.driverName} &middot; {entry.contactNumber} &middot;{" "}
                    {entry.vehicleNumber}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 font-normal">
                  {entry.requestType}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
        <MapPin className="size-5" />
      </div>
    </div>
  );
}
