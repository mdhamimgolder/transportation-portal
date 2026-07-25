import { Textarea, Label } from "transportation-system";

export function Default() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <Label htmlFor="t-reason">Reason for rejection</Label>
      <Textarea id="t-reason" placeholder="Explain why this schedule is being rejected..." />
    </div>
  );
}

export function States() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <Textarea defaultValue="Pickup point needs to be confirmed with facilities before approval." />
      <Textarea disabled placeholder="Disabled" />
    </div>
  );
}
