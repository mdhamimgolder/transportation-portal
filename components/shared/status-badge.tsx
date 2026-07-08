import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber/10 text-amber-foreground",
  APPROVED: "bg-green/10 text-green-foreground",
  ASSIGNED: "bg-green/10 text-green-foreground",
  REJECTED: "bg-red/10 text-red-foreground",
  CANCELLED: "bg-red/10 text-red-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {status.toLowerCase()}
    </span>
  );
}
