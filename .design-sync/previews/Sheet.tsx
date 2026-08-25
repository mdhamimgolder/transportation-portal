import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Button,
} from "transportation-system";

export function Default() {
  return (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant="outline">Open menu</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Transportation</SheetTitle>
          <SheetDescription>Navigate between sections</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}
