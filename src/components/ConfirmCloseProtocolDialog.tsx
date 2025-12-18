import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Download, Mail, AlertTriangle, Lock, Share2 } from "lucide-react";

interface ConfirmCloseProtocolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmClose: () => void;
  onDownload: () => void;
  onShare: () => void;
  isFreeUser: boolean;
  hasDownloaded?: boolean;
  hasShared?: boolean;
}

export const ConfirmCloseProtocolDialog = ({
  open,
  onOpenChange,
  onConfirmClose,
  onDownload,
  onShare,
  isFreeUser,
  hasDownloaded = false,
  hasShared = false,
}: ConfirmCloseProtocolDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-full ${isFreeUser ? 'bg-amber-500/10' : 'bg-primary/10'}`}>
              {isFreeUser ? (
                <Lock className="w-5 h-5 text-amber-500" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-primary" />
              )}
            </div>
            <AlertDialogTitle className="text-left">
              {isFreeUser ? 'Vänta! Engångstillfälle' : 'Är du säker?'}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left space-y-3">
            {isFreeUser ? (
              <>
                <p>
                  Som gratisanvändare kan du <strong>inte se detta protokoll igen</strong> efter att du stänger.
                </p>
                <p className="text-sm">
                  Ladda ner eller dela protokollet nu, eller uppgradera till Pro för att spara alla dina möten i biblioteket.
                </p>
              </>
            ) : (
              <>
                <p>
                  Detta protokoll har sparats i ditt bibliotek, men <strong>vill du ladda ner eller dela det</strong> innan du går vidare?
                </p>
                <p className="text-sm">
                  Du kan alltid hitta mötet i biblioteket senare.
                </p>
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Quick action buttons */}
        <div className="flex flex-col gap-2 my-4">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-12"
            onClick={() => {
              onDownload();
            }}
          >
            <Download className="w-4 h-4" />
            <div className="flex-1 text-left">
              <span className="font-medium">Ladda ner protokoll</span>
              {hasDownloaded && <span className="ml-2 text-xs text-green-600">✓ Nedladdat</span>}
            </div>
          </Button>
          
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-12"
            onClick={() => {
              onShare();
            }}
          >
            <Mail className="w-4 h-4" />
            <div className="flex-1 text-left">
              <span className="font-medium">Skicka via e-post</span>
              {hasShared && <span className="ml-2 text-xs text-green-600">✓ Skickat</span>}
            </div>
          </Button>
        </div>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel className="sm:flex-1">
            Gå tillbaka
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirmClose}
            className={`sm:flex-1 ${isFreeUser ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
          >
            {isFreeUser ? 'Stäng ändå' : 'Stäng'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
