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

/** Facilities' pickup-time field isn't format-enforced, so real data includes
 *  things like "10.00" or "2.20 AM" alongside proper "HH:mm" -- only compact
 *  the ones that actually match, and leave anything else exactly as stored. */
function formatCompactTime(raw: string): string {
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;
  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour < 12 ? "a" : "p";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute}${period}`;
}

export function TodaysScheduleCard({ entries }: { entries: TodaysScheduleEntry[] }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border bg-card p-5">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Today&apos;s Schedule</p>
          {entries.length > 0 ? (
            <span className="font-mono text-xs text-muted-foreground">
              {entries.length} trip{entries.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pick-up scheduled today.</p>
        ) : (
          <div className="divide-y">
            {entries.map((entry) => (
              <div key={entry.id} className="space-y-0.5 py-2 text-sm first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate">
                    <span className="font-mono font-semibold tabular-nums">
                      {formatCompactTime(entry.pickupTime)}
                    </span>{" "}
                    <span className="font-medium text-teal">{entry.driverName}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      &middot; {entry.contactNumber}
                    </span>
                  </p>
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    {entry.requestType}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Vehicle {entry.vehicleNumber}</p>
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
