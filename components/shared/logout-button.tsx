import { LogOut } from "lucide-react";
import { logoutAction } from "@/actions/auth.actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        aria-label="Log out"
        title="Log out"
        className="text-muted-foreground hover:text-foreground"
      >
        <LogOut className="size-4" />
      </Button>
    </form>
  );
}
