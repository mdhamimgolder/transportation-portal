const MAP: Record<string, string> = {
  // weekly / generic
  submitted: "border-warning/40 bg-warning/10 text-warning",
  "pending approval": "border-warning/40 bg-warning/10 text-warning",
  pending: "border-warning/40 bg-warning/10 text-warning",
  approved: "border-success/40 bg-success/10 text-success",
  "driver assigned": "border-success/40 bg-success/10 text-success",
  allocated: "border-success/40 bg-success/10 text-success",
  rejected: "border-danger/40 bg-danger/10 text-danger",
  cancelled: "border-danger/40 bg-danger/10 text-danger",
  // adhoc
  open: "border-urgent/40 bg-urgent/10 text-urgent",
  // roles
  employee: "border-border bg-elevated text-muted",
  operations: "border-cyan/40 bg-cyan/10 text-cyan",
  facilities: "border-lime/40 bg-lime/10 text-lime",
  super_admin: "border-urgent/40 bg-urgent/10 text-urgent",
  active: "border-success/40 bg-success/10 text-success",
  inactive: "border-danger/40 bg-danger/10 text-danger",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  const cls = MAP[value.toLowerCase()] || "border-border bg-elevated text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}
    >
      {(label || value).replace(/_/g, " ")}
    </span>
  );
}
