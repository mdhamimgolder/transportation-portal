"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit } from "lucide-react";
import {
  createPickupPoint,
  updatePickupPoint,
  deletePickupPoint,
  getAddressesForPickupPoints,
} from "@/actions/pickup-point.actions";
import { useToast } from "@/hooks/use-toast";

interface PickupPoint {
  id: string;
  name: string;
  sequence: number;
  baseETA: string;
  address?: {
    addressText: string;
  } | null;
  isActive: boolean;
}

interface Vehicle {
  id: string;
  vehicleNumber: string;
  vehicleType: string;
  capacity: number;
  driverName: string | null;
  driverContact: string | null;
  officeLocation: string;
  isActive: boolean;
  pickupSequence: PickupPoint[];
}

interface Address {
  id: string;
  addressText: string;
  latitude: number;
  longitude: number;
}

export function VehiclePickupPointsManager({ vehicles }: { vehicles: Vehicle[] }) {
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState<PickupPoint | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const handleAddPoint = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    setEditingPoint(null);
    setIsDialogOpen(true);
  };

  const handleDeletePoint = async (pointId: string) => {
    if (confirm("Are you sure you want to delete this pickup point?")) {
      const result = await deletePickupPoint(pointId);
      if (result.success) {
        toast({
          title: "Success",
          description: "Pickup point deleted — remaining times recalculated",
        });
        router.refresh();
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="space-y-6">
      {vehicles.map((vehicle) => (
        <div key={vehicle.id} className="border rounded-lg p-4">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() =>
              setExpandedVehicle(expandedVehicle === vehicle.id ? null : vehicle.id)
            }
          >
            <div className="flex-1">
              <h3 className="font-semibold text-lg">
                {vehicle.vehicleNumber} ({vehicle.vehicleType})
              </h3>
              <p className="text-sm text-gray-600">
                {vehicle.driverName || "N/A"} • {vehicle.driverContact || "N/A"}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {vehicle.officeLocation || "Regnum"} • Capacity: {vehicle.capacity} •{" "}
                {vehicle.pickupSequence.length} pickup points
              </p>
            </div>
            <div>
              <Badge variant={vehicle.isActive ? "default" : "secondary"}>
                {vehicle.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>

          {expandedVehicle === vehicle.id && (
            <div className="mt-4 space-y-4">
              {/* Pickup Points Table */}
              <div>
                <h4 className="font-medium mb-3 flex items-center justify-between">
                  <span>Pickup Points</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAddPoint(vehicle.id)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Point
                  </Button>
                </h4>

                {vehicle.pickupSequence.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-12">Seq</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead className="w-24">Pickup time</TableHead>
                          <TableHead className="w-20">Status</TableHead>
                          <TableHead className="w-24">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vehicle.pickupSequence
                          .sort((a, b) => a.sequence - b.sequence)
                          .map((point) => (
                            <TableRow key={point.id}>
                              <TableCell className="font-bold">
                                {point.sequence}
                              </TableCell>
                              <TableCell>{point.name}</TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {point.address?.addressText || "N/A"}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {point.baseETA}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={point.isActive ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {point.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingPoint(point);
                                      setSelectedVehicleId(vehicle.id);
                                      setIsDialogOpen(true);
                                    }}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => handleDeletePoint(point.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded border border-dashed">
                    No pickup points defined for this vehicle
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add/Edit Pickup Point Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPoint ? "Edit Pickup Point" : "Add Pickup Point"}
            </DialogTitle>
            <DialogDescription>
              Define a pickup location for the 10 PM shift route
            </DialogDescription>
          </DialogHeader>
          {selectedVehicleId && (
            <PickupPointForm
              point={editingPoint}
              vehicleId={selectedVehicleId}
              onClose={() => setIsDialogOpen(false)}
              onSuccess={() => {
                setIsDialogOpen(false);
                toast({
                  title: "Success",
                  description: editingPoint
                    ? "Pickup point updated — remaining times recalculated"
                    : "Pickup point created — remaining times recalculated",
                });
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PickupPointFormProps {
  point: PickupPoint | null;
  vehicleId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function PickupPointForm({
  point,
  vehicleId,
  onClose,
  onSuccess,
}: PickupPointFormProps) {
  const [formData, setFormData] = useState<{
    name: string;
    sequence: number;
    addressId: string;
    isActive: boolean;
  }>({
    name: point?.name || "",
    sequence: point?.sequence || 1,
    addressId: "",
    isActive: point?.isActive ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const { toast } = useToast();

  React.useEffect(() => {
    const fetchAddresses = async () => {
      setLoadingAddresses(true);
      const result = await getAddressesForPickupPoints();
      if (result.success) {
        setAddresses(result.data ?? []);
      }
      setLoadingAddresses(false);
    };
    fetchAddresses();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (point) {
        // Update
        const result = await updatePickupPoint({
          id: point.id,
          name: formData.name,
          sequence: formData.sequence,
          isActive: formData.isActive,
        });

        if (!result.success) {
          toast({
            title: "Error",
            description: result.error,
            variant: "destructive",
          });
        } else {
          onSuccess();
        }
      } else {
        // Create
        if (!formData.addressId) {
          toast({
            title: "Error",
            description: "Please select a location",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        const result = await createPickupPoint({
          vehicleId,
          addressId: formData.addressId,
          name: formData.name,
          sequence: formData.sequence,
        });

        if (!result.success) {
          toast({
            title: "Error",
            description: result.error,
            variant: "destructive",
          });
        } else {
          onSuccess();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Point Name *</Label>
        <Input
          id="name"
          placeholder="e.g., Dhanmondi Hub"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="address">Pickup Location *</Label>
        {loadingAddresses ? (
          <div className="text-sm text-gray-500 p-2">Loading addresses...</div>
        ) : (
          <select
            id="address"
            value={formData.addressId}
            onChange={(e) => setFormData({ ...formData, addressId: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
            required={!point}
          >
            <option value="">Select a location</option>
            {addresses.map((addr) => (
              <option key={addr.id} value={addr.id}>
                {addr.addressText}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <Label htmlFor="sequence">Sequence (Order) *</Label>
        <Input
          id="sequence"
          type="number"
          min="1"
          max="10"
          value={formData.sequence}
          onChange={(e) =>
            setFormData({ ...formData, sequence: parseInt(e.target.value) })
          }
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Pickup time is calculated automatically from the vehicle&apos;s first
          pickup time (~5 min/km, 5-minute grid).
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="active"
          checked={formData.isActive}
          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          className="rounded"
        />
        <Label htmlFor="active" className="mb-0">
          Active
        </Label>
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading ? "Saving..." : point ? "Update" : "Create"}
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
