import { useState } from "react";
import { ArrowLeft, FileText, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { meetingStorage } from "@/utils/meetingStorage";
import { useToast } from "@/hooks/use-toast";
import { generateMeetingTitle } from "@/lib/titleGenerator";
import { useNavigate } from "react-router-dom";

interface TranscriptPreviewProps {
  transcript: string;
  onBack: () => void;
  onGenerateProtocol: () => void;
}

export const TranscriptPreview = ({ transcript, onBack, onGenerateProtocol }: TranscriptPreviewProps) => {
  const { userPlan, incrementMeetingCount } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);

  const isPaidUser = userPlan && userPlan.plan !== 'free';

  const handleSaveToLibrary = async () => {
    if (!isPaidUser) {
      toast({
        title: "Uppgradera till Pro",
        description: "Spara till bibliotek är endast tillgängligt för Pro och Plus användare",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      
      // Generate AI-powered title
      const title = await generateMeetingTitle(transcript);

      // Create new meeting and increment meeting count
      const meetingId = await meetingStorage.saveMeeting({
        id: '', // Empty ID means CREATE new meeting
        title,
        transcript,
        folder: 'Allmänt',
        createdAt: now,
        updatedAt: now,
        userId: '',
        isCompleted: true,
        protocolCount: 0,
      });

      // CRITICAL: Do NOT count meeting here if it already exists in backend
      // Meeting counting happens on first save during recording, not during protocol generation
      console.log('📄 Saving transcript - meeting counting handled by recording flow');

      toast({
        title: "Sparat!",
        description: "Transkriptionen har sparats i biblioteket",
      });

      onBack();
    } catch (error) {
      console.error('Failed to save to library:', error);
      toast({
        title: "Fel",
        description: "Kunde inte spara till biblioteket",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 container max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 space-y-4">
          <Button
            variant="ghost"
            onClick={onBack}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tillbaka
          </Button>

          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              Transkribering klar
            </h1>
            <p className="text-muted-foreground">
              Välj vad du vill göra med din transkription
            </p>
          </div>
        </div>

        {/* Transcript Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Transkription</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/30 rounded-lg p-6 max-h-96 overflow-y-auto">
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {transcript}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {isPaidUser && (
            <Button
              onClick={handleSaveToLibrary}
              size="lg"
              variant="outline"
              className="px-8 py-6 text-lg"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sparar...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-5 w-5" />
                  Spara till bibliotek
                </>
              )}
            </Button>
          )}
          
          <Button
            onClick={async () => {
              try {
                const now = new Date().toISOString();
                const title = await generateMeetingTitle(transcript);
                
                const meetingId = await meetingStorage.saveMeeting({
                  id: '',
                  title,
                  transcript,
                  folder: 'Allmänt',
                  createdAt: now,
                  updatedAt: now,
                  userId: '',
                  isCompleted: true,
                  protocolCount: 0,
                });

                // CRITICAL: Do NOT count meeting during protocol generation
                // Meeting was already counted during initial recording/save
                console.log('📄 Protocol generation - meeting already counted during recording');

                // All users navigate to generate-protocol page
                const token = `protocol-${Date.now()}`;
                const payload = {
                  transcript,
                  meetingName: title,
                  meetingId,
                  meetingCreatedAt: now,
                  token,
                };
                sessionStorage.setItem('protocol_generation_token', token);
                sessionStorage.setItem('pending_protocol_payload', JSON.stringify(payload));
                navigate('/generate-protocol', { 
                  state: payload 
                });
              } catch (error) {
                console.error('Error generating protocol:', error);
                toast({
                  title: "Fel",
                  description: "Kunde inte generera protokoll. Försök igen.",
                  variant: "destructive"
                });
              }
            }}
            size="lg"
            className="px-8 py-6 text-lg"
          >
            <FileText className="mr-2 h-5 w-5" />
            Generera protokoll
          </Button>
        </div>
      </div>
    </div>
  );
};
