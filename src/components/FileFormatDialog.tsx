import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileAudio, Video } from "lucide-react";

interface FileFormatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFormatSelected: (format: 'mp3' | 'mp4') => void;
}

export const FileFormatDialog = ({
  open,
  onOpenChange,
  onFormatSelected,
}: FileFormatDialogProps) => {
  const handleMP3Click = () => {
    onFormatSelected('mp3');
    onOpenChange(false);
  };

  const handleMP4Click = () => {
    onFormatSelected('mp4');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Välj filformat</DialogTitle>
          <DialogDescription>
            Vilken typ av fil vill du ladda upp?
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          <Button
            onClick={handleMP3Click}
            size="lg"
            variant="outline"
            className="h-auto py-4 px-6 flex items-start gap-4 hover:bg-primary/5 hover:border-primary transition-all"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileAudio className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold mb-1">MP3</div>
              <div className="text-xs text-muted-foreground">
                Ljudfil • Snabbt att ladda upp
              </div>
            </div>
          </Button>

          <Button
            onClick={handleMP4Click}
            size="lg"
            className="h-auto py-4 px-6 flex items-start gap-4"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center">
              <Video className="w-6 h-6" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold mb-1">MP4</div>
              <div className="text-xs opacity-90">
                Videofil • Tar längre tid
              </div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
