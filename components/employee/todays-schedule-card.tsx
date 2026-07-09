import { MapPin } from "lucide-react";

export type TodaysScheduleEntry = {
  id: string;
  pickupTime: string;
  driverName: string;
  contactNumber: string;
};

export function TodaysScheduleCard({ entries }: { entries: TodaysScheduleEntry[] }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border bg-card p-5">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-muted-foreground">Today&apos;s Schedule</p>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pick-up scheduled today.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="text-sm">
                <p className="font-mono text-lg font-medium tracking-tight tabular-nums">
                  {entry.pickupTime}
                </p>
                <p className="text-muted-foreground">
                  {entry.driverName} &middot; {entry.contactNumber}
                </p>
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
