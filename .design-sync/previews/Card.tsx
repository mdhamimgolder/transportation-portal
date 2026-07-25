import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from "transportation-system";

export function Default() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Weekly Schedule</CardTitle>
        <CardDescription>Week of Jul 21 – Jul 25</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          5 days requested, pickup times set for each weekday.
        </p>
      </CardContent>
      <CardFooter>
        <Button className="w-full">View details</Button>
      </CardFooter>
    </Card>
  );
}

export function WithAction() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Ad-hoc Request</CardTitle>
        <CardDescription>Submitted by Jordan Lee</CardDescription>
        <CardAction>
          <Badge>Pending</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Requested pickup at 7:30 PM from the downtown office.
        </p>
      </CardContent>
      <CardFooter className="gap-2 border-t">
        <Button variant="outline" size="sm">
          Decline
        </Button>
        <Button size="sm">Approve</Button>
      </CardFooter>
    </Card>
  );
}

export function Simple() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Vehicles Available</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">12</p>
        <p className="text-sm text-muted-foreground">Active fleet today</p>
      </CardContent>
    </Card>
  );
}
