import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type TodaysScheduleEntry = {
  id: string;
  pickupTime: string;
  driverName: string;
  contactNumber: string;
  vehicleNumber: string;
  pickupPoint?: string | null;
  requestType: string;
};

/** Facilities' pickup-time field isn't format-enforced, so real data includes
 *  things like "10.00" or "2.20 AM" alongside proper "HH:mm" -- only reformat
 *  the ones that actually match, and leave anything else exactly as stored. */
function formatTime12h(raw: string): string {
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return raw;
  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute} ${period}`;
}

export function TodaysScheduleCard({
  entries,
  title = "Today's schedule",
  className,
}: {
  entries: TodaysScheduleEntry[];
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--role-accent)" }}
          />
          {title}
        </p>
        {entries.length > 0 ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {entries.length} ride{entries.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <div className="flex min-h-[9rem] flex-col items-start justify-center gap-2 rounded-lg border border-dashed p-4">
          <p className="font-display text-base font-semibold text-foreground">
            No rides scheduled today
          </p>
          <p className="text-sm text-muted-foreground">
            Request ad-hoc transport if you need a last-minute pickup.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <div key={entry.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
                  {formatTime12h(entry.pickupTime)}
                </p>
                <Badge variant="outline" className="font-normal">
                  {entry.requestType}
                </Badge>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <span className="text-muted-foreground">Driver</span>
                <span className="font-semibold text-foreground">
                  {entry.driverName}
                </span>
                <span className="text-muted-foreground">Contact</span>
                <span className="font-mono font-semibold text-foreground">
                  {entry.contactNumber}
                </span>
                <span className="text-muted-foreground">Vehicle</span>
                <span className="font-mono font-semibold text-foreground">
                  {entry.vehicleNumber}
                </span>
                {entry.pickupPoint ? (
                  <>
                    <span className="text-muted-foreground">Pick-up point</span>
                    <span className="font-semibold text-foreground">
                      {entry.pickupPoint}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
