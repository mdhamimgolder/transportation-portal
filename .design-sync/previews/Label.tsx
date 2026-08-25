import { Label, Input, Checkbox } from "transportation-system";

export function Default() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <Label htmlFor="l-email">Email address</Label>
      <Input id="l-email" type="email" placeholder="you@example.com" />
    </div>
  );
}

export function WithCheckbox() {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id="l-terms" />
      <Label htmlFor="l-terms">Accept terms and conditions</Label>
    </div>
  );
}
