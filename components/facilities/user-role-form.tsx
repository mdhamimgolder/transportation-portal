"use client";

import { useActionState, useRef } from "react";
import {
  updateUserRoleByFacilitiesAction,
  type UpdateUserRoleState,
} from "@/actions/user-management.actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_ROLES, ROLE_LABELS, Role, type Role as RoleType } from "@/lib/constants/enums";

/**
 * Roles Facilities may assign on the User Info page — every role except
 * Super Admin, which must never be grantable or visible outside the
 * Super Admin's own user management.
 */
export const FACILITIES_ROLE_OPTIONS = ALL_ROLES.filter(
  (role) => role !== Role.SUPER_ADMIN
);

const initialState: UpdateUserRoleState = {};

export function FacilitiesUserRoleForm({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: RoleType;
}) {
  const [state, formAction, pending] = useActionState(
    updateUserRoleByFacilitiesAction,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="inline-block">
      <input type="hidden" name="id" value={userId} />
      <Select
        name="role"
        defaultValue={currentRole}
        disabled={pending}
        onValueChange={() => {
          requestAnimationFrame(() => formRef.current?.requestSubmit());
        }}
      >
        <SelectTrigger size="sm" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FACILITIES_ROLE_OPTIONS.map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {state.error ? (
        <p className="mt-1 max-w-48 text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
