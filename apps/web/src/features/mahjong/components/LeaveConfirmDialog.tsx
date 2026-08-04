import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/shared/ui/button";

interface LeaveConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHandOff: () => void;
  onForceLeave: () => void;
}

/** "Hand off to AI" vs "Force exit" choice shown from TableHud's leave button. */
export function LeaveConfirmDialog({
  open,
  onOpenChange,
  onHandOff,
  onForceLeave,
}: LeaveConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-96 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-xl border bg-background p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">Leave room?</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            Hand off: an AI takes over your seat and the game continues for everyone else. Force
            exit: the whole session ends now for every player, straight to settlement.
          </Dialog.Description>
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="outline">Cancel</Button>} />
            <Button variant="secondary" onClick={onHandOff}>
              Hand off to AI
            </Button>
            <Button variant="destructive" onClick={onForceLeave}>
              Force exit
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
