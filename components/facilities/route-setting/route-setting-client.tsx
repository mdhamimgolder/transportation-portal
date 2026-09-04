"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Pencil,
  Pin,
  Plus,
  Save,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SearchableCombobox,
  type ComboboxOption,
} from "@/components/ui/searchable-combobox";
import {
  createPickupPoint,
  getAddressesForPickupPoints,
} from "@/actions/pickup-point.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  SHIFT_KEYS,
  SHIFT_LABELS,
  ARRIVAL_TIMES_BY_SHIFT,
  LABEL_FOR_ARRIVAL_VALUE,
} from "@/lib/constants/route-shifts";
import type { PinState, ShiftKey } from "@/lib/constants/route-shifts";
import {
  autoCalcPickupTimes,
  createVehicle,
  deleteAddress,
  geocodeAddressSearch,
  getVehicleShiftPins,
  reorderPickupPoints,
  saveGeocodedAddress,
  toggleVehicleShiftPin,
  updateAddress,
  updateVehicle,
  type GeocodeCandidate,
} from "@/actions/route-setting.actions";
import { OFFICE_LOCATIONS } from "@/lib/constants/enums";
import { formatShortDate, getMondayOfWeek } from "@/lib/date/week";

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** BASE ETA options — only the 10 PM / 11 PM default office arrivals. */
const BASE_ETA_OPTIONS = (["10PM", "11PM"] as const)
  .flatMap((key) => ARRIVAL_TIMES_BY_SHIFT[key])
  .map((value) => ({ value, label: LABEL_FOR_ARRIVAL_VALUE[value] }));

type PickupPointRow = {
  id: string;
  name: string;
  sequence: number;
  baseETA: string;
  isActive: boolean;
  address: {
    addressText: string;
    latitude: number;
    longitude: number;
  } | null;
};

type VehicleRow = {
  id: string;
  vehicleNumber: string;
  vehicleType: string;
  capacity: number;
  driverName: string | null;
  driverContact: string | null;
  officeLocation: string;
  baseETA: string | null;
  firstPickupTime: string | null;
  pickupPoints: PickupPointRow[];
};

type PinnerProps = {
  initialWeekStart: string;
  vehicles: VehicleRow[];
  pins: PinState[];
};

function Pinner({ initialWeekStart, vehicles, pins: initialPins }: PinnerProps) {
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState<Date>(
    () => new Date(`${initialWeekStart}T00:00:00`)
  );
  const [pins, setPins] = useState<PinState[]>(initialPins);
  const [loading, setLoading] = useState(false);

  const loadPins = useCallback(async (week: Date) => {
    setLoading(true);
    try {
      const res = await getVehicleShiftPins(toISODate(week));
      if (res.error) {
        toast({ title: "Failed to load pins", description: res.error, variant: "destructive" });
      } else {
        setPins(res.pins);
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  function shiftWeek(days: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + days);
    setWeekStart(getMondayOfWeek(next));
    void loadPins(getMondayOfWeek(next));
  }

  function pinnedShifts(vehicleId: string): ShiftKey[] {
    const pin = pins.find((p) => p.vehicleId === vehicleId);
    return pin ? pin.shifts.filter((s): s is ShiftKey => SHIFT_KEYS.includes(s)) : [];
  }

  function isPinned(vehicleId: string, shift: ShiftKey) {
    return pinnedShifts(vehicleId).includes(shift);
  }

  async function toggle(vehicleId: string, shift: ShiftKey) {
    const wasPinned = isPinned(vehicleId, shift);

    // Optimistic update.
    setPins((prev) => {
      const existing = prev.find((p) => p.vehicleId === vehicleId);
      const nextShifts = existing ? [...existing.shifts] : [];
      const idx = nextShifts.indexOf(shift);
      if (idx >= 0) nextShifts.splice(idx, 1);
      else nextShifts.push(shift);

      const filtered = prev.filter((p) => p.vehicleId !== vehicleId);
      if (nextShifts.length === 0) return filtered;
      return [...filtered, { vehicleId, shifts: nextShifts }];
    });

    const res = await toggleVehicleShiftPin(vehicleId, toISODate(weekStart), shift);
    if (!res.success) {
      // Revert.
      setPins((prev) => {
        const existing = prev.find((p) => p.vehicleId === vehicleId);
        const nextShifts = existing ? [...existing.shifts] : [];
        const reverse = wasPinned ? [...nextShifts, shift] : nextShifts.filter((s) => s !== shift);
        const filtered = prev.filter((p) => p.vehicleId !== vehicleId);
        if (reverse.length === 0) return filtered;
        return [...filtered, { vehicleId, shifts: reverse }];
      });
      toast({ title: "Pin update failed", description: res.error, variant: "destructive" });
      return;
    }

    toast({
      title: wasPinned ? "Unpinned" : "Pinned",
      description: `${SHIFT_LABELS[shift]} ${wasPinned ? "removed from" : "assigned to"} this vehicle.`,
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Pin className="size-4 text-teal" />
            Vehicle → route pinning
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous week"
              onClick={() => shiftWeek(-7)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-32 text-center text-sm font-medium">
              Week of {formatShortDate(weekStart)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next week"
              onClick={() => shiftWeek(7)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <CardDescription>
          Pinned vehicles are used for that shift when RUN MAPPING generates
          this week — with auto-solving pickup order for 11 PM+ and reuse for
          12 AM-6 AM.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Vehicle</th>
                <th className="px-3 py-2 text-center font-medium">10 PM</th>
                <th className="px-3 py-2 text-center font-medium">11 PM</th>
                <th className="px-3 py-2 text-center font-medium">12 AM-6 AM</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-b last:border-0 hover:bg-accent/40">
                  <td className="px-3 py-2">
                    <p className="font-medium">{v.vehicleNumber}</p>
                    {v.pickupPoints.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {v.pickupPoints.length} pickup point
                        {v.pickupPoints.length > 1 ? "s" : ""}
                      </p>
                    )}
                  </td>
                  {SHIFT_KEYS.map((shift) => (
                    <td key={shift} className="px-3 py-2 text-center">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void toggle(v.id, shift)}
                        aria-pressed={isPinned(v.id, shift)}
                        className="group inline-flex size-6 items-center justify-center rounded-full border transition-colors disabled:opacity-50"
                        aria-label={`${v.vehicleNumber} ${SHIFT_LABELS[shift]}`}
                        title={SHIFT_LABELS[shift]}
                      >
                        {isPinned(v.id, shift) ? (
                          <Check className="size-3.5 text-teal" />
                        ) : (
                          <span className="size-2 rounded-full bg-muted-foreground/30 group-hover:bg-muted-foreground/60" />
                        )}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    No active vehicles. Add them in the Vehicles page first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

type SequenceProps = {
  vehicles: VehicleRow[];
  addresses: AddressOption[];
};

type AddressOption = {
  id: string;
  addressText: string;
  label?: string | null;
};

type AddPointFormProps = {
  vehicle: VehicleRow;
  addresses: AddressOption[];
  defaultSequence: number;
  onCreated: (point: PickupPointRow) => void;
  onError: (message: string) => void;
};

function AddPointForm({
  vehicle,
  addresses,
  defaultSequence,
  onCreated,
  onError,
}: AddPointFormProps) {
  const [addressId, setAddressId] = useState("");
  const [sequence, setSequence] = useState(defaultSequence);
  const [saving, setSaving] = useState(false);

  const selectedAddress = addresses.find((a) => a.id === addressId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!addressId) {
      onError("Select a pickup location.");
      return;
    }
    const name = (selectedAddress?.label ?? selectedAddress?.addressText ?? "").trim();
    if (!name) {
      onError("Selected location has no name. Set a label in Geocode an address first.");
      return;
    }
    setSaving(true);
    try {
      const res = await createPickupPoint({
        vehicleId: vehicle.id,
        addressId,
        name,
        sequence,
      });
      if (!res.success || !res.data) {
        onError(res.error ?? "Failed to create pickup point.");
        return;
      }
      const created = res.data as PickupPointRow & { addressId?: string };
      onCreated({
        id: created.id,
        name: created.name,
        sequence: created.sequence,
        baseETA: created.baseETA,
        isActive: created.isActive,
        address: created.address ?? null,
      });
      setAddressId("");
      setSequence(defaultSequence);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 border-t p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Add pickup point — {vehicle.vehicleNumber}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor={`pp-address-${vehicle.id}`}>Pickup point</Label>
          <SearchableCombobox
            id={`pp-address-${vehicle.id}`}
            value={addressId || undefined}
            onChange={setAddressId}
            placeholder="Search & select a pickup point"
            emptyText="No saved points yet — use “Geocode an address” to add one."
            options={addresses.map(
              (a): ComboboxOption => ({
                value: a.id,
                searchText: `${a.label ?? ""} ${a.addressText}`,
                label: a.label ? (
                  <span className="flex flex-col items-start">
                    <span>{a.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.addressText}
                    </span>
                  </span>
                ) : (
                  a.addressText
                ),
              })
            )}
          />
          {selectedAddress && (
            <p className="text-xs text-muted-foreground">
              Point name:{" "}
              <span className="font-medium text-foreground">
                {selectedAddress.label ?? selectedAddress.addressText}
              </span>
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`pp-seq-${vehicle.id}`}>Sequence</Label>
          <Input
            id={`pp-seq-${vehicle.id}`}
            type="number"
            min={1}
            value={sequence}
            onChange={(e) => setSequence(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label>Pickup time</Label>
          <div className="flex h-9 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground">
            Auto — from the vehicle&apos;s first pickup time (5 min/km)
          </div>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        <Plus className="mr-1 size-3.5" />
        {saving ? "Adding…" : "Add point"}
      </Button>
    </form>
  );
}

type CreateVehicleFormProps = {
  nextSequence: number;
  onCreated: (vehicle: VehicleRow) => void;
};

function CreateVehicleForm({ nextSequence, onCreated }: CreateVehicleFormProps) {
  const [open, setOpen] = useState(false);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [vehicleType, setVehicleType] = useState("10-SEATER");
  const [capacity, setCapacity] = useState(10);
  const [driverName, setDriverName] = useState("");
  const [driverContact, setDriverContact] = useState("");
  const [officeLocation, setOfficeLocation] = useState("Regnum");
  const [baseETA, setBaseETA] = useState("22:00");
  const [firstPickupTime, setFirstPickupTime] = useState("20:00");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const formData = new FormData();
      formData.set("vehicleNumber", vehicleNumber.trim());
      formData.set("vehicleType", vehicleType);
      formData.set("capacity", String(capacity));
      formData.set("driverName", driverName.trim());
      formData.set("driverContact", driverContact.trim());
      formData.set("officeLocation", officeLocation);
      formData.set("baseETA", baseETA);
      formData.set("firstPickupTime", firstPickupTime);
      const res = await createVehicle(formData);
      if (!res.success) {
        setError(res.error ?? "Failed to create vehicle.");
        return;
      }
      onCreated({
        id: res.vehicleId!,
        vehicleNumber: vehicleNumber.trim(),
        vehicleType,
        capacity,
        driverName: driverName.trim() || null,
        driverContact: driverContact.trim() || null,
        officeLocation,
        baseETA,
        firstPickupTime,
        pickupPoints: [],
      });
      setVehicleNumber("");
      setVehicleType("10-SEATER");
      setCapacity(10);
      setDriverName("");
      setDriverContact("");
      setOfficeLocation("Regnum");
      setBaseETA("22:00");
      setFirstPickupTime("20:00");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed">
      <div className="p-4">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-4" />
            Add a vehicle
          </button>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Create vehicle (advanced routing)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cv-number">Vehicle no</Label>
                <Input
                  id="cv-number"
                  placeholder="e.g. BT-1108"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-type">Vehicle type</Label>
                <Select value={vehicleType} onValueChange={setVehicleType}>
                  <SelectTrigger id="cv-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10-SEATER">10-SEATER</SelectItem>
                    <SelectItem value="4-SEATER">4-SEATER</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-capacity">Capacity</Label>
                <Input
                  id="cv-capacity"
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-driver">Driver name</Label>
                <Input
                  id="cv-driver"
                  placeholder="Optional"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-office">Office location</Label>
                <Select
                  value={officeLocation}
                  onValueChange={(value) => setOfficeLocation(value)}
                >
                  <SelectTrigger id="cv-office" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFICE_LOCATIONS.map((office) => (
                      <SelectItem key={office} value={office}>
                        {office}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-base-eta">BASE ETA</Label>
                <Select value={baseETA} onValueChange={setBaseETA}>
                  <SelectTrigger id="cv-base-eta" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BASE_ETA_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Default office arrival time.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cv-first-pickup">First pickup time</Label>
                <Input
                  id="cv-first-pickup"
                  type="time"
                  value={firstPickupTime}
                  onChange={(e) => setFirstPickupTime(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Time the vehicle reaches its first pickup point.
                </p>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="cv-contact">Driver contact</Label>
                <Input
                  id="cv-contact"
                  placeholder="Optional"
                  value={driverContact}
                  onChange={(e) => setDriverContact(e.target.value)}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Creating…" : "Create vehicle"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Then use “Add point” on the new vehicle to build its 10 PM pickup
              sequence (first point is point {nextSequence}).
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

type EditVehicleFormProps = {
  vehicle: VehicleRow;
  onSaved: (updated: VehicleRow) => void;
  onCancel: () => void;
};

function EditVehicleForm({ vehicle, onSaved, onCancel }: EditVehicleFormProps) {
  const { toast } = useToast();
  const [vehicleType, setVehicleType] = useState(vehicle.vehicleType);
  const [capacity, setCapacity] = useState(vehicle.capacity);
  const [driverName, setDriverName] = useState(vehicle.driverName ?? "");
  const [driverContact, setDriverContact] = useState(vehicle.driverContact ?? "");
  const [officeLocation, setOfficeLocation] = useState(vehicle.officeLocation);
  const [baseETA, setBaseETA] = useState(vehicle.baseETA ?? "22:00");
  const [firstPickupTime, setFirstPickupTime] = useState(
    vehicle.firstPickupTime ?? "20:00"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await updateVehicle({
        id: vehicle.id,
        vehicleType,
        capacity: Number(capacity),
        driverName,
        driverContact,
        officeLocation,
        baseETA,
        firstPickupTime,
      });
      if (!res.success) {
        setError(res.error ?? "Failed to save vehicle.");
        return;
      }
      onSaved({
        ...vehicle,
        vehicleType,
        capacity: Number(capacity),
        driverName: driverName.trim() || null,
        driverContact: driverContact.trim() || null,
        officeLocation,
        baseETA,
        firstPickupTime,
      });
      toast({
        title: "Vehicle updated",
        description: `${vehicle.vehicleNumber} saved.`,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="space-y-3 border-t bg-muted/30 p-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Edit vehicle — {vehicle.vehicleNumber}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`ev-type-${vehicle.id}`}>Vehicle type</Label>
          <Select value={vehicleType} onValueChange={setVehicleType}>
            <SelectTrigger id={`ev-type-${vehicle.id}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10-SEATER">10-SEATER</SelectItem>
              <SelectItem value="4-SEATER">4-SEATER</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ev-capacity-${vehicle.id}`}>Capacity</Label>
          <Input
            id={`ev-capacity-${vehicle.id}`}
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ev-driver-${vehicle.id}`}>Driver name</Label>
          <Input
            id={`ev-driver-${vehicle.id}`}
            placeholder="Optional"
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ev-office-${vehicle.id}`}>Office location</Label>
          <Select
            value={officeLocation}
            onValueChange={(value) => setOfficeLocation(value)}
          >
            <SelectTrigger id={`ev-office-${vehicle.id}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OFFICE_LOCATIONS.map((office) => (
                <SelectItem key={office} value={office}>
                  {office}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ev-base-eta-${vehicle.id}`}>BASE ETA</Label>
          <Select value={baseETA} onValueChange={setBaseETA}>
            <SelectTrigger id={`ev-base-eta-${vehicle.id}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BASE_ETA_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Default office arrival time.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ev-first-pickup-${vehicle.id}`}>First pickup time</Label>
          <Input
            id={`ev-first-pickup-${vehicle.id}`}
            type="time"
            value={firstPickupTime}
            onChange={(e) => setFirstPickupTime(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Time the vehicle reaches its first pickup point.
          </p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor={`ev-contact-${vehicle.id}`}>Driver contact</Label>
          <Input
            id={`ev-contact-${vehicle.id}`}
            placeholder="Optional"
            value={driverContact}
            onChange={(e) => setDriverContact(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          <Save className="mr-1 size-3.5" />
          {saving ? "Saving…" : "Save vehicle"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SequenceEditor({
  vehicles: initialVehicles,
  addresses,
}: SequenceProps) {
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<VehicleRow[]>(initialVehicles);
  const [pointsByVehicle, setPointsByVehicle] = useState<
    Record<string, PickupPointRow[]>
  >(() =>
    Object.fromEntries(initialVehicles.map((v) => [v.id, [...v.pickupPoints]]))
  );
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [calcBusy, setCalcBusy] = useState<Record<string, boolean>>({});
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);

  const orders = useMemo(
    () =>
      Object.fromEntries(
        vehicles.map(
          (v) => [v.id, (pointsByVehicle[v.id] ?? []).map((p) => p.id)]
        )
      ),
    [vehicles, pointsByVehicle]
  );

  function move(vehicleId: string, index: number, dir: -1 | 1) {
    const order = orders[vehicleId] ?? [];
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setPointsByVehicle((prev) => {
      const current = [...(prev[vehicleId] ?? [])];
      const [moved] = current.splice(index, 1);
      current.splice(target, 0, moved);
      return { ...prev, [vehicleId]: current };
    });
    setDirty((prev) => ({ ...prev, [vehicleId]: true }));
  }

  async function addPoint(vehicleId: string, point: PickupPointRow) {
    setPointsByVehicle((prev) => ({
      ...prev,
      [vehicleId]: [...(prev[vehicleId] ?? []), point],
    }));
    setDirty((prev) => ({ ...prev, [vehicleId]: true }));
    // The sequence changed → recompute remaining pickup times so every point
    // stays anchored off the vehicle's first pickup time (5 min/km).
    try {
      const res = await autoCalcPickupTimes(vehicleId);
      if (res.success && res.updates) {
        const updates = res.updates;
        setPointsByVehicle((prev) => ({
          ...prev,
          [vehicleId]: (prev[vehicleId] ?? []).map((p) => {
            const match = updates.find((u) => u.id === p.id);
            return match ? { ...p, baseETA: match.baseETA } : p;
          }),
        }));
      }
    } catch {
      // best effort — the point was already created server-side
    }
  }

  function addVehicle(vehicle: VehicleRow) {
    setVehicles((prev) => [...prev, vehicle]);
    setPointsByVehicle((prev) => ({ ...prev, [vehicle.id]: [] }));
  }

  function handleVehicleSaved(updated: VehicleRow) {
    setVehicles((prev) =>
      prev.map((x) => (x.id === updated.id ? updated : x))
    );
    setEditingVehicleId(null);
  }

  async function saveOrder(vehicleId: string) {
    const order = orders[vehicleId] ?? [];
    setSaving((prev) => ({ ...prev, [vehicleId]: true }));
    try {
      const res = await reorderPickupPoints(vehicleId, order);
      if (!res.success) {
        toast({ title: "Reorder failed", description: res.error, variant: "destructive" });
        return;
      }
      setDirty((prev) => ({ ...prev, [vehicleId]: false }));
      toast({ title: "Sequence saved", description: "Pickup order updated." });
    } finally {
      setSaving((prev) => ({ ...prev, [vehicleId]: false }));
    }
  }

  async function autoCalc(vehicleId: string) {
    setCalcBusy((prev) => ({ ...prev, [vehicleId]: true }));
    try {
      const res = await autoCalcPickupTimes(vehicleId);
      if (!res.success) {
        toast({
          title: "Pickup times not set",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      const updates = res.updates ?? [];
      setPointsByVehicle((prev) => ({
        ...prev,
        [vehicleId]: (prev[vehicleId] ?? []).map((p) => {
          const match = updates.find((u) => u.id === p.id);
          return match ? { ...p, baseETA: match.baseETA } : p;
        }),
      }));
      toast({
        title: "Pickup times set",
        description:
          res.method === "first_pickup"
            ? `Anchored from the first pickup time; office arrival ≈ ${res.computedOfficeArrival ?? "—"} (5 min/km).`
            : "Calculated backwards from the vehicle BASE ETA at ~5 min/km, reaching the office by base ETA.",
      });
    } finally {
      setCalcBusy((prev) => ({ ...prev, [vehicleId]: false }));
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Truck className="size-4 text-teal" />
          Pickup sequence — 10 PM shift
        </CardTitle>
        <CardDescription>
          The first pickup point time is set on each vehicle (create / edit).
          Every later point is auto-calculated as the previous point plus the
          drive time (~5 min/km), so the office is reached right after the
          last point. Order the points with the arrows, add points, then save —
          run “Set pickup times” anytime to recompute.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {vehicles.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No active vehicles yet. Use “Add a vehicle” below to create one for
              the 10 PM pickup sequence.
            </p>
          </div>
        )}

        {vehicles.map((v) => {
          const order = orders[v.id] ?? [];
          const hasPoints = order.length > 0;
          return (
            <div key={v.id} className="rounded-lg border">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div>
                  <p className="font-semibold">{v.vehicleNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {v.vehicleType} · capacity {v.capacity}
                    {v.officeLocation ? ` · ${v.officeLocation}` : ""}
                    {v.driverName ? ` · ${v.driverName}` : ""}
                    {v.baseETA ? ` · BASE ETA ${v.baseETA}` : ""}
                    {v.firstPickupTime
                      ? ` · first pickup ${v.firstPickupTime}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {editingVehicleId !== v.id && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingVehicleId(v.id)}
                    >
                      <Pencil className="mr-1 size-3.5" />
                      Edit
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!hasPoints || calcBusy[v.id]}
                    onClick={() => void autoCalc(v.id)}
                  >
                    <Clock className="mr-1 size-3.5" />
                    {calcBusy[v.id] ? "Calculating…" : "Set pickup times"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!dirty[v.id] || saving[v.id] || !hasPoints}
                    onClick={() => void saveOrder(v.id)}
                  >
                    <Save className="mr-1 size-3.5" />
                    {saving[v.id] ? "Saving…" : "Save order"}
                  </Button>
                </div>
              </div>

              {editingVehicleId === v.id && (
                <EditVehicleForm
                  vehicle={v}
                  onSaved={handleVehicleSaved}
                  onCancel={() => setEditingVehicleId(null)}
                />
              )}

              {hasPoints ? (
                <ol className="divide-y">
                  {order.map((pointId, idx) => {
                    const point = (pointsByVehicle[v.id] ?? []).find(
                      (p) => p.id === pointId
                    )!;
                    const isLast = idx === order.length - 1;
                    return (
                      <li
                        key={pointId}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-teal/50 bg-teal/10 text-xs font-semibold text-teal">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{point.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              pickup {point.baseETA}
                              {point.address ? ` · ${point.address.addressText}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-7"
                            aria-label={`Move ${point.name} up`}
                            disabled={idx === 0}
                            onClick={() => move(v.id, idx, -1)}
                          >
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-7"
                            aria-label={`Move ${point.name} down`}
                            disabled={isLast}
                            onClick={() => move(v.id, idx, 1)}
                          >
                            <ArrowDown className="size-3.5" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="px-4 py-3 text-xs text-muted-foreground">
                  No pickup points yet — add the first point below.
                </p>
              )}

              <AddPointForm
                vehicle={v}
                addresses={addresses}
                defaultSequence={order.length + 1}
                onCreated={(point) => addPoint(v.id, point)}
                onError={(msg) =>
                  toast({ title: "Add point failed", description: msg, variant: "destructive" })
                }
              />
            </div>
          );
        })}

        <CreateVehicleForm nextSequence={1} onCreated={addVehicle} />
      </CardContent>
    </Card>
  );
}

type GeocoderProps = {
  addresses: AddressOption[];
  onAddressesChanged: () => void;
};

function Geocoder({ addresses, onAddressesChanged }: GeocoderProps) {
  const { toast } = useToast();
  const [term, setTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GeocodeCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function search() {
    const trimmed = term.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    setResults([]);
    setSaved({});
    setLabels({});
    try {
      const res = await geocodeAddressSearch(trimmed);
      if (res.error) setError(res.error);
      else setResults(res.results);
    } finally {
      setSearching(false);
    }
  }

  async function save(candidate: GeocodeCandidate, key: string) {
    setSavingId(key);
    try {
      const label = (labels[key] ?? "").trim();
      const res = await saveGeocodedAddress(
        candidate.addressText,
        candidate.lat,
        candidate.lng,
        label || undefined
      );
      if (!res.success) {
        toast({ title: "Save failed", description: res.error, variant: "destructive" });
        return;
      }
      setSaved((prev) => ({ ...prev, [key]: true }));
      toast({
        title: "Address saved",
        description: label || candidate.addressText,
      });
      onAddressesChanged();
    } finally {
      setSavingId(null);
    }
  }

  function startEdit(a: AddressOption) {
    setEditingId(a.id);
    setEditLabel(a.label ?? "");
    setEditText(a.addressText);
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setEditText("");
  }

  async function saveEdit(a: AddressOption) {
    setBusyId(a.id);
    try {
      const res = await updateAddress(a.id, {
        addressText: editText,
        label: editLabel,
      });
      if (!res.success) {
        toast({ title: "Update failed", description: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "Address updated", description: editLabel || editText });
      cancelEdit();
      onAddressesChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete(a: AddressOption) {
    setBusyId(a.id);
    try {
      const res = await deleteAddress(a.id);
      if (!res.success) {
        toast({ title: "Delete failed", description: res.error, variant: "destructive" });
        setConfirmDeleteId(null);
        return;
      }
      toast({ title: "Address deleted", description: a.label ?? a.addressText });
      setConfirmDeleteId(null);
      onAddressesChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-teal" />
            Geocode an address
          </CardTitle>
          <Badge
            variant="outline"
            className="border-lime/40 text-lime"
            title="Total saved addresses available as pickup points"
          >
            {addresses.length} added
          </Badge>
        </div>
        <CardDescription>
          Find coordinates for a pickup address using OpenStreetMap, optionally
          give it a short label, then store it so the auto route planner and the
          pickup-point dropdown can use it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Saved addresses ({addresses.length})
          </p>
          {addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved addresses yet. Search below and press “Save address”.
            </p>
          ) : (
            <ul className="space-y-2">
              {addresses.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border p-3"
                >
                  {editingId === a.id ? (
                    <div className="space-y-2">
                      <div>
                        <Label>Label</Label>
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          placeholder="e.g. Dhanmondi Hub"
                          className="mt-1"
                          disabled={busyId !== null}
                        />
                      </div>
                      <div>
                        <Label>Address</Label>
                        <Input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="mt-1"
                          disabled={busyId !== null}
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busyId !== null || !editText.trim()}
                          onClick={() => void saveEdit(a)}
                        >
                          <Check className="mr-1 size-3.5" />
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyId !== null}
                          onClick={cancelEdit}
                        >
                          <X className="mr-1 size-3.5" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {a.label ?? a.addressText}
                        </p>
                        {a.label && (
                          <p className="truncate text-xs text-muted-foreground">
                            {a.addressText}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {confirmDeleteId === a.id ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={busyId !== null}
                              onClick={() => void doDelete(a)}
                            >
                              Confirm
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busyId !== null}
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              title="Edit address"
                              disabled={busyId !== null}
                              onClick={() => startEdit(a)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              title="Delete address"
                              className="text-destructive hover:text-destructive"
                              disabled={busyId !== null}
                              onClick={() => setConfirmDeleteId(a.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder="e.g. Bashundhara, Dhaka"
            className="max-w-lg"
          />
          <Button type="button" disabled={searching || !term.trim()} onClick={() => void search()}>
            <Search className="mr-1 size-3.5" />
            {searching ? "Searching…" : "Search"}
          </Button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-destructive">
            {error} — set GEOCODER_URL so the server can reach a Nominatim
            instance.
          </p>
        )}

        {results.length > 0 && (
          <ul className="mt-4 space-y-2">
            {results.map((r, i) => {
              const key = `${r.lat}-${r.lng}-${i}`;
              return (
                <li
                  key={key}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.lat.toFixed(6)}, {r.lng.toFixed(6)}
                    </p>
                    {saved[key] ? (
                      <p className="mt-1 text-xs text-green">
                        {labels[key] ? `Label: ${labels[key]}` : "Use the address text as label"}
                      </p>
                    ) : (
                      <div className="mt-2 min-w-0">
                        <Label htmlFor={`geo-label-${key}`}>Name this point (optional)</Label>
                        <Input
                          id={`geo-label-${key}`}
                          placeholder="e.g. Dhanmondi Hub"
                          value={labels[key] ?? ""}
                          onChange={(e) =>
                            setLabels((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          className="mt-1 max-w-xs"
                        />
                      </div>
                    )}
                  </div>
                  {saved[key] ? (
                    <Badge variant="outline" className="shrink-0 border-green text-green">
                      <Check className="mr-1 size-3" /> Saved
                    </Badge>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={savingId !== null}
                      onClick={() => void save(r, key)}
                    >
                      Save address
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!searching && !error && results.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            No search yet — type an address and press Search.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type RouteSettingClientProps = {
  initialWeekStart: string;
  vehicles: VehicleRow[];
  addresses: AddressOption[];
  pins: PinState[];
};

export function RouteSettingClient({
  initialWeekStart,
  vehicles,
  addresses: initialAddresses,
  pins,
}: RouteSettingClientProps) {
  const [addresses, setAddresses] = useState<AddressOption[]>(initialAddresses);

  const refreshAddresses = useCallback(async () => {
    const res = await getAddressesForPickupPoints();
    if (res.success) setAddresses(res.data ?? []);
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <SequenceEditor vehicles={vehicles} addresses={addresses} />
        <div className="space-y-6">
          <Pinner
            initialWeekStart={initialWeekStart}
            vehicles={vehicles}
            pins={pins}
          />
          <Geocoder addresses={addresses} onAddressesChanged={refreshAddresses} />
        </div>
      </div>
    </div>
  );
}