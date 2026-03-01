import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Phone, Play, Square } from "lucide-react";

interface CallInterruptionDialogProps {
  open: boolean;
  onContinue: () => void;
  onStop: () => void;
  durationSec: number;
}

export const CallInterruptionDialog = ({
  open,
  onContinue,
  onStop,
  durationSec,
}: CallInterruptionDialogProps) => {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            Inspelningen pausades
          </AlertDialogTitle>
          <AlertDialogDescription>
            Det verkar som att du hade ett samtal. Din inspelning ({Math.floor(durationSec / 60)} min {durationSec % 60} sek) är sparad och redo att fortsätta.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStop} className="gap-1.5">
            <Square className="w-4 h-4" />
            Avsluta inspelning
          </AlertDialogCancel>
          <AlertDialogAction onClick={onContinue} className="gap-1.5">
            <Play className="w-4 h-4" />
            Fortsätt spela in
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
