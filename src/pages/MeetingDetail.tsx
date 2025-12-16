import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, FileText, Trash2, MessageCircle, Calendar, CheckCircle2, AlertCircle, Mic, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { meetingStorage, type MeetingSession } from "@/utils/meetingStorage";
import { pollASRStatus, type SISMatch, type SISSpeaker, type TranscriptSegment as ASRTranscriptSegment } from "@/lib/asrService";
import { apiClient } from "@/lib/api";
import { subscribeToUpload, getUploadStatus } from "@/lib/backgroundUploader";
import { sendTranscriptionCompleteEmail } from "@/lib/emailNotification";
import { AgendaSelectionDialog } from "@/components/AgendaSelectionDialog";
import { AutoProtocolGenerator } from "@/components/AutoProtocolGenerator";
import { MeetingChat } from "@/components/MeetingChat";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { hasPlusAccess } from "@/lib/accessCheck";

// Removed typing effect - using simple fade animation instead

interface AgendaSISSpeaker {
  label: string;
  segments: { start: number; end: number }[];
  durationSeconds: number;
  bestMatchEmail?: string;
  similarity?: number;
}

interface AgendaSISMatch {
  speakerName: string;
  speakerLabel: string;
  confidencePercent: number;
  sampleOwnerEmail?: string;
}

interface MeetingDataForDialog {
  id: string;
  transcript: string;
  title: string;
  createdAt: string;
  transcriptSegments?: { speakerId: string; text: string; start: number; end: number }[];
  sisSpeakers?: AgendaSISSpeaker[];
  sisMatches?: AgendaSISMatch[];
}

const MeetingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { userPlan, incrementMeetingCount } = useSubscription();

  const [meeting, setMeeting] = useState<MeetingSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<'uploading' | 'processing' | 'done' | 'failed' | null>(null);
  const [stage, setStage] = useState<'uploading' | 'transcribing' | 'sis_processing' | 'done' | 'error' | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<ASRTranscriptSegment[] | null>(null);
  const [sisSpeakers, setSisSpeakers] = useState<SISSpeaker[]>([]);
  const [sisMatches, setSisMatches] = useState<SISMatch[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAgendaDialog, setShowAgendaDialog] = useState(false);
  const [pendingMeetingData, setPendingMeetingData] = useState<MeetingDataForDialog | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<{ transcript: string; aiProtocol: any } | null>(null);
  const [chatMeeting, setChatMeeting] = useState<MeetingSession | null>(null);

  const pollingRef = useRef(false);
  const transcriptionDoneRef = useRef(false);

  // Simple stage-based status text
  const getStageInfo = () => {
    if (stage === 'transcribing') return { title: 'Transkriberar...' };
    if (stage === 'sis_processing') return { title: 'Identifierar talare...' };
    if (stage === 'uploading' || status === 'uploading') return { title: 'Laddar upp...' };
    if (status === 'processing') return { title: 'Transkriberar...' };
    return { title: 'Startar...' };
  };

  // Format date helper
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Load meeting data
  useEffect(() => {
    if (!id || !user) return;

    const loadMeeting = async () => {
      setIsLoading(true);
      try {
        // First check sessionStorage for pending meeting
        const pendingMeetingJson = sessionStorage.getItem('pendingMeeting');
        let pendingMeeting: MeetingSession | null = null;
        
        if (pendingMeetingJson) {
          try {
            pendingMeeting = JSON.parse(pendingMeetingJson);
            if (pendingMeeting?.id === id) {
              const uploadStatus = getUploadStatus(id);
              // Only override when we actually have background-upload status.
              // If we already have a pendingMeeting (from normal upload flow), keep its status.
              if (uploadStatus) {
                pendingMeeting.transcriptionStatus = uploadStatus.status === 'complete' ? 'processing' : 'uploading';
              }
              setMeeting(pendingMeeting);
              setStatus(pendingMeeting.transcriptionStatus);
              sessionStorage.removeItem('pendingMeeting');
              setIsLoading(false);
              return;
            }
          } catch (e) {
            console.error('Failed to parse pending meeting:', e);
          }
        }

        // Otherwise fetch from backend
        const fetchedMeeting = await meetingStorage.getMeeting(id);
        if (fetchedMeeting) {
          setMeeting(fetchedMeeting);
          if (fetchedMeeting.transcript && fetchedMeeting.transcript.trim().length > 0) {
            setTranscript(fetchedMeeting.transcript);
            setStatus('done');
          } else {
            setStatus('processing');
          }
        } else {
          toast({
            title: "Möte hittades inte",
            description: "Kunde inte hitta mötet.",
            variant: "destructive",
          });
          navigate('/library');
        }
      } catch (error) {
        console.error('Failed to load meeting:', error);
        toast({
          title: "Fel",
          description: "Kunde inte ladda mötet.",
          variant: "destructive",
        });
        navigate('/library');
      } finally {
        setIsLoading(false);
      }
    };

    loadMeeting();
  }, [id, user, navigate, toast]);

  // Subscribe to background upload status
  useEffect(() => {
    if (!id) return;

    const unsubscribe = subscribeToUpload((meetingId, uploadStatus) => {
      if (meetingId !== id) return;
      
      console.log('📤 Upload status update:', meetingId, uploadStatus.status);
      
      if (uploadStatus.status === 'complete') {
        setStatus('processing');
      } else if (uploadStatus.status === 'error') {
        setStatus('failed');
      } else {
        setStatus('uploading');
      }
    });

    return () => { unsubscribe(); };
  }, [id]);

  // Poll for transcription status - fast initially, then slower
  useEffect(() => {
    if (!id || !user || transcriptionDoneRef.current) return;
    if (status === 'done' || status === 'failed') return;

    pollingRef.current = true;
    let pollCount = 0;

    const doPoll = async () => {
      if (!pollingRef.current || transcriptionDoneRef.current) return;

      try {
        const asrStatus = await pollASRStatus(id);
        pollCount++;

        // Update stage immediately for better UX
        if (asrStatus.stage) {
          setStage(asrStatus.stage);
        }
        
        // If we get processing/transcribing status, update from uploading
        if (asrStatus.status === 'processing' || asrStatus.stage === 'transcribing') {
          if (status === 'uploading') {
            setStatus('processing');
          }
        }

        if (asrStatus.status === 'completed' || asrStatus.status === 'done') {
          transcriptionDoneRef.current = true;
          pollingRef.current = false;

          const newTranscript = asrStatus.transcript || '';
          setTranscript(newTranscript);
          setTranscriptSegments(asrStatus.transcriptSegments || null);
          setSisSpeakers(asrStatus.sisSpeakers || []);
          setSisMatches(asrStatus.sisMatches || []);
          setStatus('done');

          try {
            await apiClient.updateMeeting(id, {
              transcript: newTranscript,
              isCompleted: true,
              transcriptSegments: asrStatus.transcriptSegments || undefined,
            });
            console.log('✅ Meeting updated with transcript');
          } catch (updateErr) {
            console.warn('⚠️ Could not update meeting with transcript:', updateErr);
          }

          void incrementMeetingCount(id).catch((e) => {
            console.warn('⚠️ Could not increment meeting count:', e);
          });

          if (user?.email) {
            const authToken = apiClient.getAuthToken();
            if (authToken) {
              sendTranscriptionCompleteEmail({
                userEmail: user.email,
                userName: user.displayName || undefined,
                meetingTitle: meeting?.title || 'Möte',
                meetingId: id,
                authToken,
              }).catch(e => console.error('Email error:', e));
            }
          }

          toast({
            title: 'Transkribering klar!',
            description: 'Ditt möte har transkriberats.',
          });

          setMeeting(prev => prev ? { ...prev, transcript: newTranscript, transcriptionStatus: 'done' } : null);
          return;
        }

        if (asrStatus.status === 'error' || asrStatus.status === 'failed') {
          transcriptionDoneRef.current = true;
          pollingRef.current = false;
          setStatus('failed');
          toast({
            title: 'Transkribering misslyckades',
            description: asrStatus.error || 'Försök igen.',
            variant: 'destructive',
          });
          return;
        }

        // Schedule next poll - fast initially, then slower
        const delay = pollCount < 10 ? 500 : pollCount < 20 ? 1500 : 3000;
        if (pollingRef.current && !transcriptionDoneRef.current) {
          setTimeout(doPoll, delay);
        }
      } catch (e) {
        if (pollingRef.current && !transcriptionDoneRef.current) {
          setTimeout(doPoll, 2000);
        }
      }
    };

    doPoll();

    return () => {
      pollingRef.current = false;
    };
  }, [id, user, status, meeting, toast, incrementMeetingCount]);

  // Handle delete
  const handleDelete = async () => {
    if (!id || !meeting) return;
    setIsDeleting(true);
    try {
      await meetingStorage.deleteMeeting(id);
      toast({
        title: "Möte borttaget",
        description: "Mötet har tagits bort.",
      });
      navigate('/library');
    } catch (error) {
      toast({
        title: "Fel",
        description: "Kunde inte ta bort mötet.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };


  // Handle create protocol
  const handleCreateProtocol = async () => {
    if (!meeting || !transcript) return;

    // Fetch SIS data for protocol
    let fetchedSegments: { speakerId: string; text: string; start: number; end: number }[] | undefined;
    let fetchedSisSpeakers: AgendaSISSpeaker[] = [];
    let fetchedSisMatches: AgendaSISMatch[] = [];

    try {
      const asrStatus = await pollASRStatus(meeting.id);
      if (asrStatus.sisSpeakers) {
        fetchedSisSpeakers = asrStatus.sisSpeakers.map(s => ({
          label: s.label,
          segments: s.segments || [],
          durationSeconds: s.durationSeconds || 0,
          bestMatchEmail: s.bestMatchEmail,
          similarity: s.similarity,
        }));
      }
      if (asrStatus.sisMatches) {
        fetchedSisMatches = asrStatus.sisMatches.map(m => ({
          speakerName: m.speakerName || '',
          speakerLabel: m.speakerLabel || '',
          confidencePercent: m.confidencePercent || 0,
          sampleOwnerEmail: m.sampleOwnerEmail,
        }));
      }
      if (asrStatus.transcriptSegments) {
        fetchedSegments = asrStatus.transcriptSegments.map(seg => ({
          speakerId: seg.speakerId,
          text: seg.text,
          start: seg.start,
          end: seg.end,
        }));
      }
    } catch (e) {
      console.warn('Could not fetch SIS data for protocol:', e);
    }

    setPendingMeetingData({
      id: meeting.id,
      transcript: transcript,
      title: meeting.title,
      createdAt: meeting.createdAt,
      transcriptSegments: fetchedSegments,
      sisSpeakers: fetchedSisSpeakers.length > 0 ? fetchedSisSpeakers : undefined,
      sisMatches: fetchedSisMatches.length > 0 ? fetchedSisMatches : undefined,
    });
    setShowAgendaDialog(true);
  };

  // If showing protocol generator
  if (selectedProtocol) {
    return (
      <AutoProtocolGenerator
        transcript={selectedProtocol.transcript}
        aiProtocol={selectedProtocol.aiProtocol}
        onBack={() => setSelectedProtocol(null)}
        showWidget={false}
      />
    );
  }

  // If showing chat
  if (chatMeeting) {
    return (
      <div className="min-h-screen bg-background">
        <MeetingChat
          transcript={transcript || ''}
          meetingTitle={chatMeeting.title}
          onClose={() => setChatMeeting(null)}
        />
      </div>
    );
  }

  const isProcessing = status === 'uploading' || status === 'processing';
  const hasTranscript = !!transcript && transcript.trim().length > 0;

  return (
    <div className="min-h-screen bg-background animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/library')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Tillbaka
          </Button>
          {meeting && (
            <h1 className="text-lg font-semibold truncate flex-1">{meeting.title}</h1>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Laddar möte...</p>
            </div>
          </div>
        ) : meeting ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Card className="overflow-hidden">
              <CardHeader className="space-y-4">
                {/* Meta info */}
                <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(meeting.createdAt)}
                  </span>
                  {meeting.source && (
                    <Badge variant={meeting.source === 'live' ? 'default' : 'secondary'} className="text-xs">
                      {meeting.source === 'live' ? (
                        <><Mic className="w-3 h-3 mr-1" />Live</>
                      ) : (
                        <><Upload className="w-3 h-3 mr-1" />Uppladdad</>
                      )}
                    </Badge>
                  )}
                  {status === 'done' && (
                    <Badge variant="outline" className="text-green-600 border-green-600/30 bg-green-500/10">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Klar
                    </Badge>
                  )}
                  {status === 'failed' && (
                    <Badge variant="destructive">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Misslyckades
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Status/Transcript */}
                <AnimatePresence mode="wait">
                  {isProcessing ? (
                    <motion.div
                      key="processing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="bg-muted/30 border border-border/50 rounded-lg p-4"
                    >
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{getStageInfo().title}</p>
                          <p className="text-xs text-muted-foreground">
                            Längre möten kan ta några minuter
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ) : status === 'failed' ? (
                    <motion.div
                      key="failed"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="bg-destructive/10 rounded-xl p-8 text-center"
                    >
                      <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
                      <p className="font-medium text-destructive">Transkribering misslyckades</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Försök ladda upp filen igen från startsidan.
                      </p>
                      <Button 
                        variant="outline" 
                        className="mt-4"
                        onClick={() => navigate('/')}
                      >
                        Tillbaka till start
                      </Button>
                    </motion.div>
                  ) : hasTranscript ? (
                    <motion.div
                      key="transcript"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center gap-2 mb-4">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <span className="font-medium">Transkription</span>
                      </div>
                      <div className="bg-muted/30 rounded-xl p-6 max-h-[400px] overflow-y-auto prose prose-sm dark:prose-invert">
                        <motion.p 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.5 }}
                          className="whitespace-pre-wrap leading-relaxed text-foreground/90"
                        >
                          {transcript}
                        </motion.p>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {/* Actions */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex flex-wrap gap-3 pt-4 border-t border-border"
                >
                  <Button
                    onClick={handleCreateProtocol}
                    variant="outline"
                    disabled={isProcessing || !hasTranscript}
                    className="gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    {isProcessing ? 'Väntar...' : 'Skapa protokoll'}
                  </Button>
                  {hasPlusAccess(user, userPlan) && (
                    <Button
                      onClick={() => setChatMeeting(meeting)}
                      variant="outline"
                      disabled={!hasTranscript}
                      className="gap-2"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Chatta
                    </Button>
                  )}
                  <Button
                    onClick={() => setShowDeleteConfirm(true)}
                    variant="destructive"
                    disabled={userPlan?.plan === 'free' || isDeleting}
                    className="gap-2 ml-auto"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Ta bort
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}
      </div>

      {/* Dialogs */}
      {pendingMeetingData && (
        <AgendaSelectionDialog
          open={showAgendaDialog}
          onOpenChange={setShowAgendaDialog}
          meetingData={pendingMeetingData}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Ta bort möte?"
        description={`Är du säker på att du vill ta bort "${meeting?.title}"? Detta kan inte ångras.`}
        confirmText="Ta bort"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
};

export default MeetingDetail;
