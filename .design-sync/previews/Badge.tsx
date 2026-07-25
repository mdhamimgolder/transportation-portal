import { Badge } from "transportation-system";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="ghost">Ghost</Badge>
      <Badge variant="link">Link</Badge>
    </div>
  );
}

export function StatusUse() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">Assigned</Badge>
      <Badge variant="secondary">Pending</Badge>
      <Badge variant="destructive">Rejected</Badge>
      <Badge variant="outline">Cancelled</Badge>
    </div>
  );
}
