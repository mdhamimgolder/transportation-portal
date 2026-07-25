import { Checkbox, Label } from "transportation-system";

export function Default() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="c-transport" />
        <Label htmlFor="c-transport">Needs transport</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c-notify" defaultChecked />
        <Label htmlFor="c-notify">Email notifications</Label>
      </div>
    </div>
  );
}

export function DisabledStates() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="c-off" disabled />
        <Label htmlFor="c-off">Disabled, unchecked</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c-on" disabled defaultChecked />
        <Label htmlFor="c-on">Disabled, checked</Label>
      </div>
    </div>
  );
}
