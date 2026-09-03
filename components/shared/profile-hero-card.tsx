"use client";

import { Card } from "@/components/ui/card";

interface ProfileHeroCardProps {
  user: {
    fullName: string;
    email: string;
    department?: string | null;
    address?: string | null;
    contactNumber?: string | null;
    pickupPoint?: string | null;
    officeLocation?: string | null;
    employeeCode?: string | null;
  };
  showPickupPoint?: boolean;
}

export function ProfileHeroCard({
  user,
  showPickupPoint = true,
}: ProfileHeroCardProps) {
  return (
    <Card className="border-slate-800 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg p-4 sm:p-6">
      <div className="p-2 sm:p-4 lg:p-6 space-y-6">
        {/* User Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-full bg-[#70bccc]/20 flex items-center justify-center border-2 border-[#70bccc]">
              <span className="text-2xl font-bold text-[#70bccc]">
                {user.fullName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-semibold break-words">{user.fullName}</h2>
              <p className="text-slate-300 break-all">{user.email}</p>
              {user.department && (
                <p className="text-sm text-[#70bccc] mt-1">{user.department}</p>
              )}
            </div>
          </div>
        </div>

        {/* The six profile facts stay in a predictable order at every breakpoint. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-slate-700">
          <ProfileFact label="Address" value={user.address} />
          <ProfileFact label="Contact Number" value={user.contactNumber} />
          {showPickupPoint && <ProfileFact label="Pick-up Point" value={user.pickupPoint} />}
          <ProfileFact label="Employee ID" value={user.employeeCode} />
          <ProfileFact label="Department" value={user.department} />
          <ProfileFact label="Office Location" value={user.officeLocation} />
        </div>
      </div>
    </Card>
  );
}

function ProfileFact({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium break-words text-white">
        {value || "Not set"}
      </p>
    </div>
  );
}
