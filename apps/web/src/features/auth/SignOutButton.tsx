import { Tooltip } from "@base-ui/react/tooltip";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/session";

export function SignOutButton() {
  const navigate = useNavigate();
  const signOut = useSessionStore((state) => state.signOut);

  const handleSignOut = async () => {
    await signOut();
    void navigate("/login", { replace: true });
  };

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <Button
            variant="outline"
            size="icon"
            className="fixed top-4 right-14 z-50"
            aria-label="Sign out"
            onClick={handleSignOut}
          >
            <LogOut />
          </Button>
        }
      />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8}>
          <Tooltip.Popup className="rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md">
            Sign out
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
