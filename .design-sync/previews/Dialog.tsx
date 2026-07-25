import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from "transportation-system";

export function Default() {
  return (
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant="outline">Reject request</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject weekly schedule</DialogTitle>
          <DialogDescription>
            This will notify the employee and ask them to resubmit before the deadline.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button variant="destructive">Reject</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
