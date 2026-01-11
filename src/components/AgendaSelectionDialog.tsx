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

interface SISSpeaker {
  label: string;
  segments: { start: number; end: number }[];
  durationSeconds: number;
  bestMatchEmail?: string;
  similarity?: number;
}

interface SISMatch {
  speakerName: string;
  speakerLabel: string;
  confidencePercent: number;
  sampleOwnerEmail?: string;
}

interface TranscriptSegment {
  speakerId: string;
  text: string;
  start: number;
  end: number;
}

interface AgendaSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingData: {
    id: string;
    transcript: string;
    title: string;
    createdAt: string;
    transcriptSegments?: TranscriptSegment[];
    sisSpeakers?: SISSpeaker[];
    sisMatches?: SISMatch[];
    speakerNames?: Record<string, string>;
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
      // Generate AI title first
      let aiTitle = meetingData.title;
      try {
        const { generateMeetingTitle } = await import("@/lib/titleGenerator");
        aiTitle = await generateMeetingTitle(meetingData.transcript);
      } catch (e) {
        console.warn('Failed to generate AI title:', e);
      }

      // Update meeting with agenda and title (don't create new)
      const now = new Date().toISOString();
      const { meetingStorage } = await import("@/utils/meetingStorage");
      
      const finalId = meetingData.id;
      try {
        // Only update existing meeting - don't create duplicates
        console.log('📝 Updating existing meeting for protocol:', finalId);
        await meetingStorage.saveMeeting({
          id: meetingData.id,
          title: aiTitle,
          folder: 'Allmänt',
          transcript: meetingData.transcript,
          protocol: '',
          createdAt: meetingData.createdAt,
          updatedAt: now,
          userId: '',
          isCompleted: true,
          agendaId: selectedAgendaId,
        } as any);
      } catch (e) {
        console.warn('Failed to update meeting:', e);
      }

      // Check protocol generation limits using the FINAL id
      // CRITICAL: Always fetch fresh count from backend endpoint
      const currentProtocolCount = await meetingStorage.getProtocolCount(finalId);
      console.log('📊 AgendaDialog: Fresh protocol count from backend:', currentProtocolCount);
      const { allowed, reason } = await canGenerateProtocol(finalId, currentProtocolCount);
      
      if (!allowed && reason !== 'Du har nått din gräns för AI-protokoll') {
        toast({
          title: "Protokollgräns nådd",
          description: reason || "Du har nått din gräns för AI-protokoll",
          variant: "destructive",
        });
        setIsGenerating(false);
        return;
      }

      // NOTE: Do NOT increment protocol count here; GenerateProtocol page will do it once

      // Generate token and navigate
      const token = crypto.randomUUID();
      sessionStorage.setItem('protocol_generation_token', token);

      navigate('/generate-protocol', {
        state: {
          transcript: meetingData.transcript,
          meetingName: aiTitle,
          meetingId: finalId,
          meetingCreatedAt: meetingData.createdAt,
          agendaId: selectedAgendaId,
          token,
          transcriptSegments: meetingData.transcriptSegments,
          sisSpeakers: meetingData.sisSpeakers,
          sisMatches: meetingData.sisMatches,
          speakerNames: meetingData.speakerNames,
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
