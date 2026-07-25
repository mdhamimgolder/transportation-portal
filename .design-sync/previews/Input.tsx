import { Input, Label } from "transportation-system";

export function Default() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <Label htmlFor="i-name">Full name</Label>
      <Input id="i-name" placeholder="Jordan Lee" />
    </div>
  );
}

export function States() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <Input defaultValue="jordan.lee@example.com" />
      <Input placeholder="Contact number" />
      <Input disabled placeholder="Disabled" />
      <Input aria-invalid defaultValue="not-a-number" />
    </div>
  );
}
