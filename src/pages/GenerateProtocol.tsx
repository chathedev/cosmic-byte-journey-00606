import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AutoProtocolGenerator } from "@/components/AutoProtocolGenerator";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useToast } from "@/hooks/use-toast";
import { meetingStorage } from "@/utils/meetingStorage";

interface SISSpeaker {
  label: string;
  segments: { start: number; end: number }[];
  durationSeconds: number;
  bestMatchEmail?: string;
  similarity?: number;
  matches?: {
    sampleOwnerEmail: string;
    similarity: number;
  }[];
}

interface SISMatch {
  speakerName: string;
  speakerLabel: string;
  confidencePercent: number;
  segments: { start: number; end: number }[];
}

interface TranscriptSegment {
  speakerId: string;
  text: string;
  start: number;
  end: number;
}

interface LocationState {
  transcript: string;
  meetingName: string;
  meetingId: string;
  meetingCreatedAt?: string;
  agendaId?: string;
  token: string;
  transcriptSegments?: TranscriptSegment[];
  sisSpeakers?: SISSpeaker[];
  sisMatches?: SISMatch[];
}

export default function GenerateProtocol() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { incrementMeetingCount, refreshPlan, userPlan, enterpriseMembership } = useSubscription();
  const { toast } = useToast();
  const [isValidated, setIsValidated] = useState(false);
  const hasCountedRef = useRef(false);
  const [pageState, setPageState] = useState<LocationState | null>(null);

  useEffect(() => {
    (async () => {
      const navState = location.state as LocationState | null;
      console.log('🧭 GenerateProtocol init', { navStatePresent: !!navState, search: location.search });

      let payload: LocationState | null = navState && navState.transcript ? navState : null;

      // 1) Try session payload
      if (!payload) {
        const raw = sessionStorage.getItem('pending_protocol_payload');
        console.log('📦 Session pending_protocol_payload raw:', raw);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as LocationState;
            if (parsed?.transcript) payload = parsed;
            console.log('✅ Restored payload from session', { hasTranscript: !!parsed?.transcript });
          } catch (e) {
            console.warn('⚠️ Failed to parse pending_protocol_payload:', e);
          }
        }
      }

      // 2) Try query params (free-user path)
      if (!payload) {
        const params = new URLSearchParams(location.search);
        const meetingId = params.get('meetingId');
        const titleParam = params.get('title') || undefined;
        console.log('🔎 Query params', { meetingId, titleParam });
        if (meetingId) {
          try {
            console.log('🗂️ Loading meeting by ID for payload...');
            const meeting = await meetingStorage.getMeeting(meetingId);
            console.log('🗂️ Loaded meeting:', meeting);
            if (meeting?.transcript) {
              const token = `protocol-${Date.now()}`;
              payload = {
                transcript: meeting.transcript,
                meetingName: titleParam || meeting.title,
                meetingId: meeting.id,
                meetingCreatedAt: meeting.createdAt,
                token,
              };
              // Persist for refresh safety
              sessionStorage.setItem('protocol_generation_token', token);
              sessionStorage.setItem('pending_protocol_payload', JSON.stringify(payload));
            }
          } catch (e) {
            console.warn('⚠️ Failed to load meeting for query params:', e);
          }
        }
      }

      if (!payload || !payload.transcript) {
        console.warn('⛔ No valid payload found, redirecting home');
        toast({
          title: "Ogiltig åtkomst",
          description: "Vänligen starta en ny inspelning från startsidan.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      // Validate minimum word count
      const wordCount = payload.transcript.trim().split(/\s+/).filter(w => w).length;
      if (wordCount < 20) {
        console.warn('⛔ Transcript too short', { wordCount });
        toast({
          title: "För kort transkription",
          description: `Transkriptionen innehåller ${wordCount} ord. Minst 20 ord krävs för att skapa ett protokoll.`,
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      // 3) Check protocol count against limit when we have a real meetingId
      // Pro = 1 protocol generation, Enterprise = 3 protocol generations
      if (payload.meetingId) {
        try {
          // CRITICAL: Always fetch fresh count from backend endpoint, not stale meeting data
          const currentProtocolCount = await meetingStorage.getProtocolCount(payload.meetingId);
          const isEnterprise = enterpriseMembership?.isMember === true;
          const maxProtocolCount = isEnterprise ? 3 : 1;
          
          console.log('🔐 Protocol limit check (fresh from backend)', { 
            meetingId: payload.meetingId, 
            currentProtocolCount, 
            maxProtocolCount, 
            isEnterprise,
            remaining: maxProtocolCount - currentProtocolCount
          });
          
          if (currentProtocolCount >= maxProtocolCount) {
            toast({
              title: "Protokollgräns nådd",
              description: `Du har använt alla ${maxProtocolCount} protokoll för detta möte.`,
              variant: "destructive",
            });
            navigate("/");
            return;
          }
        } catch (error) {
          console.error('Error checking protocol count:', error);
          // Continue anyway if check fails
        }
      }

      // Clear token from old flows; keep pending payload until generation begins
      sessionStorage.removeItem('protocol_generation_token');
      console.log('✅ Validation complete, rendering generator');
      setPageState(payload);
      setIsValidated(true);
    })();
  }, [location, navigate, toast]);

  // Only increment protocol count - NEVER increment meeting count here
  useEffect(() => {
    if (!isValidated || hasCountedRef.current) return;
    hasCountedRef.current = true;

    const timer = setTimeout(async () => {
      if (!pageState?.meetingId) return;
      
      try {
        console.log('📊 Incrementing protocol count ONLY for:', pageState.meetingId);
        
        // CRITICAL: Only increment protocol count - meeting was already counted when created/saved
        // NEVER call incrementMeetingCount here - that would double-count existing meetings
        await meetingStorage.incrementProtocolCount(pageState.meetingId);
        
        console.log('✅ Protocol count incremented successfully');
        await refreshPlan();
      } catch (error) {
        console.warn('Failed to increment protocol count:', error);
        await refreshPlan();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [isValidated, refreshPlan, pageState]);

  const handleBackToHome = () => {
    navigate("/");
  };

  const handleNewRecording = () => {
    navigate("/");
  };

  if (!isValidated || !pageState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="w-24 h-24 mx-auto">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping"></div>
              <div className="absolute inset-0 rounded-full bg-primary/30 animate-pulse"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/60 animate-spin border-4 border-transparent border-t-background"></div>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-foreground">Förbereder protokollet</h3>
            <p className="text-muted-foreground">Laddar transkription och verifierar data...</p>
          </div>
        </div>
      </div>
    );
  }

  const isFreeUser = userPlan?.plan === 'free';

  return (
    <div className="min-h-screen bg-background">
      {pageState && (
        <AutoProtocolGenerator
          transcript={pageState.transcript}
          aiProtocol={null}
          onBack={handleBackToHome}
          showWidget={false}
          meetingCreatedAt={pageState.meetingCreatedAt}
          agendaId={pageState.agendaId}
          meetingId={pageState.meetingId}
          userId={user?.email || undefined}
          isFreeTrialMode={isFreeUser}
          transcriptSegments={pageState.transcriptSegments}
          sisSpeakers={pageState.sisSpeakers}
          sisMatches={pageState.sisMatches}
        />
      )}
    </div>
  );
}
