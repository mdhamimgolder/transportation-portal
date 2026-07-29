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
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-lg font-medium tracking-tight tabular-nums">
                    {entry.pickupTime}
                  </p>
                  <Badge variant="secondary" className="w-fit font-normal">
                    {entry.requestType}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  {entry.driverName} &middot; {entry.contactNumber}
                </p>
                <p className="text-muted-foreground">Vehicle {entry.vehicleNumber}</p>
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
