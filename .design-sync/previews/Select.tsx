import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from "transportation-system";

export function Default() {
  return (
    <Select defaultOpen defaultValue="7-30">
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Arrival time" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Morning</SelectLabel>
          <SelectItem value="7-00">7:00 AM</SelectItem>
          <SelectItem value="7-30">7:30 AM</SelectItem>
          <SelectItem value="8-00">8:00 AM</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Evening</SelectLabel>
          <SelectItem value="5-30">5:30 PM</SelectItem>
          <SelectItem value="6-00">6:00 PM</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
