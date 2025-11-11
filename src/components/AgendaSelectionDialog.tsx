import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AgendaSelectorNew } from "./AgendaSelectorNew";
import { meetingStorage } from "@/utils/meetingStorage";
import { Square } from "lucide-react";

interface AgendaSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingData: {
    id: string;
    transcript: string;
    title: string;
    createdAt: string;
  };
}

export function AgendaSelectionDialog({ open, onOpenChange, meetingData }: AgendaSelectionDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canGenerateProtocol, incrementMeetingCount } = useSubscription();
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | undefined>();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);

    try {
      // Free plan users always allowed to generate (with watermark)
      // Paid users check limits
      const latest = await meetingStorage.getMeeting(meetingData.id);
      const currentProtocolCount = latest?.protocolCount || 0;
      const { allowed, reason } = await canGenerateProtocol(meetingData.id, currentProtocolCount);
      
      // For free users, skip the limit check and allow generation
      if (!allowed && reason !== 'Du har nått din gräns för AI-protokoll') {
        toast({
          title: "Protokollgräns nådd",
          description: reason || "Du har nått din gräns för AI-protokoll",
          variant: "destructive",
        });
        setIsGenerating(false);
        return;
      }

      // Increment protocol count
      await meetingStorage.incrementProtocolCount(meetingData.id);
      
      // Count meeting ONLY if not already counted
      const wasCounted = await meetingStorage.markCountedIfNeeded(meetingData.id);
      if (wasCounted) {
        await incrementMeetingCount(meetingData.id);
      }

      // Generate token and navigate
      const token = crypto.randomUUID();
      sessionStorage.setItem('protocol_generation_token', token);

      navigate('/generate-protocol', {
        state: {
          transcript: meetingData.transcript,
          meetingName: meetingData.title,
          meetingId: meetingData.id,
          meetingCreatedAt: meetingData.createdAt,
          agendaId: selectedAgendaId,
          token
        }
      });
      
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error generating protocol:', error);
      toast({
        title: "Fel",
        description: error.message || "Kunde inte starta protokollgenerering",
        variant: "destructive",
      });
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generera protokoll</DialogTitle>
          <DialogDescription>
            Välj en mötesagenda (valfritt) innan du genererar protokollet.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <AgendaSelectorNew
            selectedAgendaId={selectedAgendaId}
            onSelectAgenda={setSelectedAgendaId}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Avbryt
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
          >
            <Square className="w-4 h-4" />
            {isGenerating ? "Startar..." : "Generera"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
