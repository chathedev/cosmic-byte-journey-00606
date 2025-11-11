import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mic, Pause, Square, FileText, ArrowLeft } from "lucide-react";

interface RecordingTutorialProps {
  open: boolean;
  onClose: () => void;
}

export const RecordingTutorial = ({ open, onClose }: RecordingTutorialProps) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hur du använder inspelningen</DialogTitle>
          <DialogDescription>
            Enkla steg för att spela in och generera ditt mötesprotokoll
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Mic className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="font-medium text-sm mb-1">Slå på mikrofon</h4>
              <p className="text-xs text-muted-foreground">Klicka "Slå på" för att börja spela in ditt möte</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Pause className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="font-medium text-sm mb-1">Pausa</h4>
              <p className="text-xs text-muted-foreground">Tryck "Pausa" för att pausa inspelningen tillfälligt</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Square className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="font-medium text-sm mb-1">Avsluta & Generera</h4>
              <p className="text-xs text-muted-foreground">Klicka "Avsluta" när du är klar för att generera protokoll automatiskt</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="font-medium text-sm mb-1">Spara</h4>
              <p className="text-xs text-muted-foreground">Spara transkriptionen till biblioteket utan att generera protokoll</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ArrowLeft className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="font-medium text-sm mb-1">Gå tillbaka</h4>
              <p className="text-xs text-muted-foreground">Använd tillbaka-knappen för att avbryta och gå tillbaka till startsidan</p>
            </div>
          </div>
        </div>

        <Button onClick={onClose} className="w-full">
          Jag förstår, börja inspelning
        </Button>
      </DialogContent>
    </Dialog>
  );
};
