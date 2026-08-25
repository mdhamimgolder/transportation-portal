"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createVehicleDriver,
  updateVehicleDriver,
  type VehicleDriverFormState,
} from "@/actions/vehicle-driver.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initialState: VehicleDriverFormState = {};

export type VehicleDriverRecord = {
  id: string;
  driverName: string;
  contactNumber: string;
  vehicleNumber: string;
  vendor: string;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : label}
    </Button>
  );
}

export function VehicleDriverFormDialog({
  record,
}: {
  record?: VehicleDriverRecord;
}) {
  const [open, setOpen] = useState(false);
  const action = record ? updateVehicleDriver : createVehicleDriver;
  const [state, formAction] = useActionState(action, initialState);

  useEffect(() => {
    if (state !== initialState && !state.error) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={record ? "outline" : "default"}
          size={record ? "sm" : "default"}
        >
          {record ? "Edit" : "Add Vehicle & Driver"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {record ? "Edit vehicle & driver" : "Add a vehicle & driver"}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {record ? <input type="hidden" name="id" value={record.id} /> : null}
          <div className="space-y-2">
            <Label htmlFor="driverName">Driver name</Label>
            <Input
              id="driverName"
              name="driverName"
              defaultValue={record?.driverName}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactNumber">Contact number</Label>
            <Input
              id="contactNumber"
              name="contactNumber"
              defaultValue={record?.contactNumber}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vehicleNumber">Vehicle No</Label>
            <Input
              id="vehicleNumber"
              name="vehicleNumber"
              defaultValue={record?.vehicleNumber}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor</Label>
            <Input
              id="vendor"
              name="vendor"
              defaultValue={record?.vendor}
              required
            />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <DialogFooter>
            <SubmitButton label={record ? "Save changes" : "Add"} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
