"use client";

import { useActionState, useRef } from "react";
import {
  updateUserRoleAction,
  type UpdateUserRoleState,
} from "@/actions/user-management.actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_ROLES, type Role } from "@/lib/constants/enums";

const initialState: UpdateUserRoleState = {};

export function UserRoleForm({
  userId,
  currentRole,
  disabled,
}: {
  userId: string;
  currentRole: Role;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateUserRoleAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="inline-block">
      <input type="hidden" name="id" value={userId} />
      <Select
        name="role"
        defaultValue={currentRole}
        disabled={disabled || pending}
        onValueChange={() => {
          requestAnimationFrame(() => formRef.current?.requestSubmit());
        }}
      >
        <SelectTrigger size="sm" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ALL_ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {role.replace("_", " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {state.error ? (
        <p className="mt-1 text-xs text-destructive">{state.error}</p>
      ) : null}
    </form>
  );
}
