import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  Badge,
} from "transportation-system";

const rows = [
  { employee: "Jordan Lee", pickup: "Downtown Office", time: "7:30 AM", driver: "M. Alvarez", status: "Assigned" },
  { employee: "Priya Nair", pickup: "Riverside Depot", time: "7:45 AM", driver: "K. Osei", status: "Assigned" },
  { employee: "Sam Walters", pickup: "North Campus", time: "8:00 AM", driver: "—", status: "Pending" },
  { employee: "Dana Cho", pickup: "Downtown Office", time: "8:15 AM", driver: "M. Alvarez", status: "Assigned" },
];

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "Assigned" ? "default" : "secondary"}>
      {status}
    </Badge>
  );
}

export function Default() {
  return (
    <Table>
      <TableCaption>Today&apos;s pickup assignments</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Employee</TableHead>
          <TableHead>Pickup point</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.employee}>
            <TableCell className="font-medium">{r.employee}</TableCell>
            <TableCell>{r.pickup}</TableCell>
            <TableCell>{r.time}</TableCell>
            <TableCell>{r.driver}</TableCell>
            <TableCell>
              <StatusBadge status={r.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function WithFooter() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Vehicle</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead className="text-right">Trips today</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">VAN-014</TableCell>
          <TableCell>M. Alvarez</TableCell>
          <TableCell className="text-right">6</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">VAN-022</TableCell>
          <TableCell>K. Osei</TableCell>
          <TableCell className="text-right">4</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>Total</TableCell>
          <TableCell className="text-right">10</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
