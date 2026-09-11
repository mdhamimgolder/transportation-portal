"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  updateEmployeeProfileByFacilitiesAction,
  type UpdateEmployeeProfileState,
} from "@/actions/facilities-profile.actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OFFICE_LOCATIONS } from "@/lib/constants/enums";
import {
  ARRIVAL_TIME_OPTIONS,
  NO_TRANSPORT_VALUE,
} from "@/lib/constants/arrival-times";

const initialState: UpdateEmployeeProfileState = {};

type EditEmployeeProfileDialogProps = {
  userId: string;
  fullName: string;
  employeeCode: string | null;
  contactNumber: string | null;
  address: string | null;
  pickupPoint: string | null;
  officeLocation: string | null;
  homeLatitude: number | null;
  homeLongitude: number | null;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  role: string;
  fixedArrivalTime: string | null;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save changes"}
    </Button>
  );
}

function EditEmployeeProfileDialogBody({
  onDone,
  ...props
}: EditEmployeeProfileDialogProps & { onDone: () => void }) {
  const [state, formAction] = useActionState(
    updateEmployeeProfileByFacilitiesAction,
    initialState
  );

  if (state.success) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Profile updated</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-foreground">
          {props.fullName}&apos;s profile was saved.
        </p>
        <DialogFooter>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {props.fullName}&apos;s profile</DialogTitle>
      </DialogHeader>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="userId" value={props.userId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`fullName-${props.userId}`}>Full name</Label>
            <Input
              id={`fullName-${props.userId}`}
              name="fullName"
              defaultValue={props.fullName}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`employeeCode-${props.userId}`}>Employee ID</Label>
            <Input
              id={`employeeCode-${props.userId}`}
              name="employeeCode"
              defaultValue={props.employeeCode ?? ""}
              placeholder="e.g. 123456789"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`contactNumber-${props.userId}`}>Contact number</Label>
          <Input
            id={`contactNumber-${props.userId}`}
            name="contactNumber"
            defaultValue={props.contactNumber ?? ""}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`address-${props.userId}`}>Address</Label>
          <Input
            id={`address-${props.userId}`}
            name="address"
            defaultValue={props.address ?? ""}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`pickupPoint-${props.userId}`}>Pick-up point</Label>
          <Input
            id={`pickupPoint-${props.userId}`}
            name="pickupPoint"
            defaultValue={props.pickupPoint ?? ""}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`officeLocation-${props.userId}`}>Office location</Label>
          <Select name="officeLocation" defaultValue={props.officeLocation ?? ""} required>
            <SelectTrigger id={`officeLocation-${props.userId}`} className="w-full">
              <SelectValue placeholder="Select office location" />
            </SelectTrigger>
            <SelectContent>
              {OFFICE_LOCATIONS.map((location) => (
                <SelectItem key={location} value={location}>
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {props.role === "FIXED_ARRIVAL" ? (
          <div className="space-y-2">
            <Label htmlFor={`fixedArrivalTime-${props.userId}`}>
              Fixed arrival time
            </Label>
            <Select
              name="fixedArrivalTime"
              defaultValue={props.fixedArrivalTime ?? NO_TRANSPORT_VALUE}
              required
            >
              <SelectTrigger id={`fixedArrivalTime-${props.userId}`} className="w-full">
                <SelectValue placeholder="Select arrival time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TRANSPORT_VALUE}>Not set</SelectItem>
                {ARRIVAL_TIME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Locked by this employee — only Facilities can change it.
            </p>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`homeLatitude-${props.userId}`}>Home latitude</Label>
            <Input
              id={`homeLatitude-${props.userId}`}
              name="homeLatitude"
              type="number"
              step="any"
              defaultValue={props.homeLatitude ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`homeLongitude-${props.userId}`}>Home longitude</Label>
            <Input
              id={`homeLongitude-${props.userId}`}
              name="homeLongitude"
              type="number"
              step="any"
              defaultValue={props.homeLongitude ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`pickupLatitude-${props.userId}`}>Pick-up latitude</Label>
            <Input
              id={`pickupLatitude-${props.userId}`}
              name="pickupLatitude"
              type="number"
              step="any"
              defaultValue={props.pickupLatitude ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`pickupLongitude-${props.userId}`}>Pick-up longitude</Label>
            <Input
              id={`pickupLongitude-${props.userId}`}
              name="pickupLongitude"
              type="number"
              step="any"
              defaultValue={props.pickupLongitude ?? ""}
              required
            />
          </div>
        </div>
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <DialogFooter>
          <SubmitButton />
        </DialogFooter>
      </form>
    </>
  );
}

export function EditEmployeeProfileDialog(props: EditEmployeeProfileDialogProps) {
  const [open, setOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setResetKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <EditEmployeeProfileDialogBody
          key={resetKey}
          onDone={() => setOpen(false)}
          {...props}
        />
      </DialogContent>
    </Dialog>
  );
}