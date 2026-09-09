"use client";

import { useActionState, useEffect, useState } from "react";
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

const initialState: UpdateEmployeeProfileState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save changes"}
    </Button>
  );
}

export function EditEmployeeProfileDialog({
  userId,
  fullName,
  employeeCode,
  contactNumber,
  address,
  pickupPoint,
  officeLocation,
  homeLatitude,
  homeLongitude,
  pickupLatitude,
  pickupLongitude,
}: {
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
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    updateEmployeeProfileByFacilitiesAction,
    initialState
  );

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {fullName}&apos;s profile</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`fullName-${userId}`}>Full name</Label>
              <Input
                id={`fullName-${userId}`}
                name="fullName"
                defaultValue={fullName}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`employeeCode-${userId}`}>Employee ID</Label>
              <Input
                id={`employeeCode-${userId}`}
                name="employeeCode"
                defaultValue={employeeCode ?? ""}
                placeholder="e.g. 123456789"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`contactNumber-${userId}`}>Contact number</Label>
            <Input
              id={`contactNumber-${userId}`}
              name="contactNumber"
              defaultValue={contactNumber ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`address-${userId}`}>Address</Label>
            <Input
              id={`address-${userId}`}
              name="address"
              defaultValue={address ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`pickupPoint-${userId}`}>Pick-up point</Label>
            <Input
              id={`pickupPoint-${userId}`}
              name="pickupPoint"
              defaultValue={pickupPoint ?? ""}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`officeLocation-${userId}`}>Office location</Label>
            <Select name="officeLocation" defaultValue={officeLocation ?? ""} required>
              <SelectTrigger id={`officeLocation-${userId}`} className="w-full">
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`homeLatitude-${userId}`}>Home latitude</Label>
              <Input id={`homeLatitude-${userId}`} name="homeLatitude" type="number" step="any" defaultValue={homeLatitude ?? ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`homeLongitude-${userId}`}>Home longitude</Label>
              <Input id={`homeLongitude-${userId}`} name="homeLongitude" type="number" step="any" defaultValue={homeLongitude ?? ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`pickupLatitude-${userId}`}>Pick-up latitude</Label>
              <Input id={`pickupLatitude-${userId}`} name="pickupLatitude" type="number" step="any" defaultValue={pickupLatitude ?? ""} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`pickupLongitude-${userId}`}>Pick-up longitude</Label>
              <Input id={`pickupLongitude-${userId}`} name="pickupLongitude" type="number" step="any" defaultValue={pickupLongitude ?? ""} required />
            </div>
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
