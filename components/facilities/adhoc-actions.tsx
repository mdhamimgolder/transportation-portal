"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, MessageSquare } from "lucide-react";
import { Popover } from "radix-ui";
import { assignRoute } from "@/actions/route-assignment.actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sending..." : "Send"}
    </Button>
  );
}

export function NoteComposer({
  adHocRequestId,
  existingComment,
}: {
  adHocRequestId: string;
  existingComment: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(assignRoute, {});

  const hasComment = Boolean(existingComment && existingComment.trim());

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={hasComment ? "Edit note" : "Send a note to the employee"}
          className={cn("shrink-0", hasComment && "text-role-accent-deep")}
        >
          <MessageSquare className="size-4" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <form
            action={(fd) => {
              fd.set("adHocRequestId", adHocRequestId);
              formAction(fd);
            }}
            className="space-y-2"
          >
            <p className="text-sm font-medium">Note to employee</p>
            <Textarea
              name="comment"
              defaultValue={existingComment ?? ""}
              placeholder="Write a note for the employee..."
              rows={3}
            />
            <div className="flex items-center justify-between gap-2">
              {state.error ? (
                <p className="truncate text-xs text-destructive">{state.error}</p>
              ) : state.success ? (
                <p className="text-xs text-emerald-600">Note sent.</p>
              ) : (
                <span />
              )}
              <SendButton />
            </div>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function CopyDetailsButton({
  employeeName,
  address,
  pickupTime,
  driverName,
}: {
  employeeName: string;
  address: string | null;
  pickupTime: string;
  driverName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = [
      `Employee: ${employeeName}`,
      `Address: ${address ?? "—"}`,
      `Pick-up: ${pickupTime || "—"}`,
      `Driver: ${driverName || "—"}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={copied ? "Copied" : "Copy employee & driver details"}
      className="shrink-0"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="size-4 text-emerald-600" />
      ) : (
        <Copy className="size-4" />
      )}
    </Button>
  );
}
