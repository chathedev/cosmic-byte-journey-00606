import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, FileText, Trash2, MessageCircle, Calendar, CheckCircle2, AlertCircle, Mic, Upload, Users, UserCheck, Volume2, Pencil, Save, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { meetingStorage, type MeetingSession } from "@/utils/meetingStorage";
import { pollASRStatus, type SISMatch, type SISSpeaker, type TranscriptSegment as ASRTranscriptSegment, type LyraLearningEntry } from "@/lib/asrService";
import { apiClient } from "@/lib/api";
import { backendApi } from "@/lib/backendApi";
import { subscribeToUpload, getUploadStatus } from "@/lib/backgroundUploader";
import { sendTranscriptionCompleteEmail } from "@/lib/emailNotification";
import { AgendaSelectionDialog } from "@/components/AgendaSelectionDialog";
import { AutoProtocolGenerator } from "@/components/AutoProtocolGenerator";
import { MeetingChat } from "@/components/MeetingChat";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { hasPlusAccess } from "@/lib/accessCheck";

interface AgendaLyraSpeaker {
  label: string;
  segments: { start: number; end: number }[];
  durationSeconds: number;
  bestMatchEmail?: string;
  similarity?: number;
}

interface AgendaLyraMatch {
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
  sisSpeakers?: AgendaLyraSpeaker[];
  sisMatches?: AgendaLyraMatch[];
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
  const [lyraSpeakers, setLyraSpeakers] = useState<SISSpeaker[]>([]);
  const [lyraMatches, setLyraMatches] = useState<SISMatch[]>([]);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [lyraLearning, setLyraLearning] = useState<LyraLearningEntry[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAgendaDialog, setShowAgendaDialog] = useState(false);
  const [pendingMeetingData, setPendingMeetingData] = useState<MeetingDataForDialog | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<{ transcript: string; aiProtocol: any } | null>(null);
  const [chatMeeting, setChatMeeting] = useState<MeetingSession | null>(null);
  
  // Editing states
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editingSpeakerValue, setEditingSpeakerValue] = useState('');
  const [isSavingSpeaker, setIsSavingSpeaker] = useState(false);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);

  // Speaker identification UX thresholds (per docs)
  const SIS_DISPLAY_THRESHOLD_PERCENT = 75;
  const getSISVerificationLabel = (percent: number) => {
    if (percent >= 92) return 'Stark verifiering';
    if (percent >= 85) return 'Verifierad';
    if (percent >= 75) return 'Trolig';
    return 'Okänd';
  };

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
          
          // Load segments from meeting if available
          if (fetchedMeeting.transcriptSegments && fetchedMeeting.transcriptSegments.length > 0) {
            setTranscriptSegments(fetchedMeeting.transcriptSegments.map((seg: any) => ({
              speakerId: seg.speakerId || seg.speaker || 'unknown',
              text: seg.text,
              start: seg.start,
              end: seg.end,
              confidence: seg.confidence || 0,
            })));
          }
          
          if (fetchedMeeting.transcript && fetchedMeeting.transcript.trim().length > 0) {
            setTranscript(fetchedMeeting.transcript);
            setStatus('done');
            
            // For completed meetings, also fetch Lyra data from ASR if segments not loaded
            if (!fetchedMeeting.transcriptSegments || fetchedMeeting.transcriptSegments.length === 0) {
              try {
                const asrStatus = await pollASRStatus(id);
                if (asrStatus.transcriptSegments && asrStatus.transcriptSegments.length > 0) {
                  setTranscriptSegments(asrStatus.transcriptSegments);
                }
                // Use Lyra mirror fields when available, fallback to SIS fields
                setLyraSpeakers(asrStatus.lyraSpeakers || asrStatus.sisSpeakers || []);
                setLyraMatches(asrStatus.lyraMatches || asrStatus.sisMatches || []);
                setSpeakerNames(asrStatus.lyraSpeakerNames || asrStatus.speakerNames || {});
                setLyraLearning(asrStatus.lyraLearning || asrStatus.sisLearning || []);
              } catch (e) {
                console.log('Could not fetch ASR data for completed meeting:', e);
              }
            }
            
            // Load speaker names from backend
            try {
              const namesData = await backendApi.getSpeakerNames(id);
              if (namesData.speakerNames && Object.keys(namesData.speakerNames).length > 0) {
                setSpeakerNames(prev => ({ ...prev, ...namesData.speakerNames }));
              }
            } catch (e) {
              console.log('Could not fetch speaker names:', e);
            }
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
        if (asrStatus.status === 'processing' || asrStatus.stage === 'transcribing' || asrStatus.stage === 'sis_processing') {
          if (status === 'uploading') {
            setStatus('processing');
          }
        }

        // Check for full completion:
        // - status must be 'completed' or 'done'
        // - AND stage must be 'done' (not 'sis_processing')
        // - OR lyraStatus/sisStatus must be 'done' (not 'processing')
        const mainDone = asrStatus.status === 'completed' || asrStatus.status === 'done';
        const lyraOrSisDone = asrStatus.lyraStatus === 'done' || asrStatus.sisStatus === 'done' || 
                              asrStatus.lyraStatus === 'no_samples' || asrStatus.sisStatus === 'no_samples' ||
                              asrStatus.lyraStatus === 'disabled' || asrStatus.sisStatus === 'disabled';
        const stageDone = asrStatus.stage === 'done';
        
        // Per docs: fully done when stage === 'done' OR (status done AND lyra/sis done)
        const isFullyDone = mainDone && asrStatus.transcript && (stageDone || lyraOrSisDone);
        
        if (isFullyDone) {
          transcriptionDoneRef.current = true;
          pollingRef.current = false;

          const newTranscript = asrStatus.transcript || '';
          setTranscript(newTranscript);
          setTranscriptSegments(asrStatus.transcriptSegments || null);
          // Use Lyra mirror fields when available, fallback to SIS fields
          setLyraSpeakers(asrStatus.lyraSpeakers || asrStatus.sisSpeakers || []);
          setLyraMatches(asrStatus.lyraMatches || asrStatus.sisMatches || []);
          setSpeakerNames(asrStatus.lyraSpeakerNames || asrStatus.speakerNames || {});
          setLyraLearning(asrStatus.lyraLearning || asrStatus.sisLearning || []);
          setStatus('done');
          setStage('done');

          // Log completion details
          console.log('✅ ASR completed:', {
            meetingId: id,
            transcriptLength: newTranscript.length,
            segments: asrStatus.transcriptSegments?.length || 0,
            lyraStatus: asrStatus.lyraStatus,
            lyraSpeakers: asrStatus.lyraSpeakers?.length || 0,
            lyraMatches: asrStatus.lyraMatches?.length || 0,
            speakerNames: asrStatus.speakerNames,
          });

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

  // Handle save speaker name - per docs: PUT /meetings/:meetingId/speaker-names
  // Backend updates meeting record and persists alias for future Lyra learning
  const handleSaveSpeakerName = useCallback(async () => {
    if (!id || !editingSpeaker || !editingSpeakerValue.trim()) return;
    
    setIsSavingSpeaker(true);
    try {
      const newNames = { ...speakerNames, [editingSpeaker]: editingSpeakerValue.trim() };
      const response = await backendApi.saveSpeakerNames(id, newNames);
      
      // Use returned speakerNames from backend (may include auto-applied aliases)
      setSpeakerNames(response.speakerNames || newNames);
      
      // Update lyraLearning if learning was triggered
      if (response.sisLearning && response.sisLearning.length > 0) {
        setLyraLearning(prev => {
          const existing = [...prev];
          response.sisLearning?.forEach(entry => {
            const idx = existing.findIndex(e => e.email === entry.email);
            if (idx >= 0) {
              existing[idx] = entry;
            } else {
              existing.push(entry);
            }
          });
          return existing;
        });
      }
      
      setEditingSpeaker(null);
      setEditingSpeakerValue('');
      toast({
        title: 'Namn sparat',
        description: 'Talarnamnet har uppdaterats och kommer att användas i framtiden.',
      });
    } catch (error) {
      console.error('Failed to save speaker name:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte spara talarnamnet.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingSpeaker(false);
    }
  }, [id, editingSpeaker, editingSpeakerValue, speakerNames, toast]);

  // Handle save transcript
  const handleSaveTranscript = useCallback(async () => {
    if (!id || !editedTranscript.trim()) return;

    setIsSavingTranscript(true);
    try {
      const nextTranscript = editedTranscript.trim();
      await apiClient.updateMeeting(id, { transcript: nextTranscript });

      setTranscript(nextTranscript);
      setMeeting((prev) =>
        prev ? { ...prev, transcript: nextTranscript, updatedAt: new Date().toISOString() } : prev
      );
      setIsEditingTranscript(false);

      toast({
        title: 'Transkription sparad',
        description: 'Dina ändringar har sparats.',
      });
    } catch (error) {
      console.error('Failed to save transcript:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte spara transkriptionen.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingTranscript(false);
    }
  }, [id, editedTranscript, toast]);

  const handleResetTranscriptFromASR = useCallback(async () => {
    if (!id) return;

    try {
      const asrStatus = await pollASRStatus(id);
      const asrTranscript = (asrStatus.transcript || '').trim();

      if (!asrTranscript) {
        toast({
          title: 'Ingen ASR-transkription',
          description: 'Det finns ingen automatisk version att återställa från ännu.',
          variant: 'destructive',
        });
        return;
      }

      setEditedTranscript(asrTranscript);
      toast({
        title: 'Återställd från ASR',
        description: 'Spara för att använda den automatiska versionen.',
      });
    } catch (error) {
      console.error('Failed to reset transcript from ASR:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta ASR-transkriptionen.',
        variant: 'destructive',
      });
    }
  }, [id, toast]);

  // Refresh Lyra/speaker data from ASR status
  const refreshLyraData = useCallback(async () => {
    if (!id) return;
    
    try {
      const asrStatus = await pollASRStatus(id);
      
      // Update all Lyra/speaker data from fresh ASR status
      if (asrStatus.transcriptSegments && asrStatus.transcriptSegments.length > 0) {
        setTranscriptSegments(asrStatus.transcriptSegments);
      }
      setLyraSpeakers(asrStatus.lyraSpeakers || asrStatus.sisSpeakers || []);
      setLyraMatches(asrStatus.lyraMatches || asrStatus.sisMatches || []);
      setSpeakerNames(prev => ({
        ...prev,
        ...(asrStatus.speakerNames || asrStatus.lyraSpeakerNames || {})
      }));
      setLyraLearning(asrStatus.lyraLearning || asrStatus.sisLearning || []);
      
      console.log('🔄 Lyra data refreshed:', {
        speakers: asrStatus.lyraSpeakers?.length || 0,
        matches: asrStatus.lyraMatches?.length || 0,
        speakerNames: asrStatus.speakerNames,
      });
    } catch (error) {
      console.error('Failed to refresh Lyra data:', error);
    }
  }, [id]);

  // Handle create protocol
  const handleCreateProtocol = async () => {
    if (!meeting || !transcript) return;

    // Fetch Lyra data for protocol
    let fetchedSegments: { speakerId: string; text: string; start: number; end: number }[] | undefined;
    let fetchedLyraSpeakers: AgendaLyraSpeaker[] = [];
    let fetchedLyraMatches: AgendaLyraMatch[] = [];

    try {
      const asrStatus = await pollASRStatus(meeting.id);
      if (asrStatus.sisSpeakers) {
        fetchedLyraSpeakers = asrStatus.sisSpeakers.map(s => ({
          label: s.label,
          segments: s.segments || [],
          durationSeconds: s.durationSeconds || 0,
          bestMatchEmail: s.bestMatchEmail,
          similarity: s.similarity,
        }));
      }
      if (asrStatus.sisMatches) {
        fetchedLyraMatches = asrStatus.sisMatches.map(m => ({
          speakerName: m.speakerName || '',
          speakerLabel: m.speakerLabel || '',
          confidencePercent: m.confidencePercent || 0,
          sampleOwnerEmail: m.sampleOwnerEmail,
        }));
      }
      if (asrStatus.transcriptSegments) {
        fetchedSegments = asrStatus.transcriptSegments.map(seg => ({
          speakerId: seg.speakerId || '',
          text: seg.text,
          start: seg.start,
          end: seg.end,
        }));
      }
    } catch (e) {
      console.warn('Could not fetch Lyra data for protocol:', e);
    }

    setPendingMeetingData({
      id: meeting.id,
      transcript: transcript,
      title: meeting.title,
      createdAt: meeting.createdAt,
      transcriptSegments: fetchedSegments,
      sisSpeakers: fetchedLyraSpeakers.length > 0 ? fetchedLyraSpeakers : undefined,
      sisMatches: fetchedLyraMatches.length > 0 ? fetchedLyraMatches : undefined,
    });
    setShowAgendaDialog(true);
  };

  // Get speaker display name - per docs: speakerNames[label] → sisSpeakers[n].speakerName → label → speaker_{n}
  const getSpeakerDisplayName = useCallback((speakerId: string): string | null => {
    if (!speakerId || speakerId === 'unknown' || speakerId.toLowerCase() === 'unknown') return null;
    
    // 1. First check speakerNames map (from backend/manual rename) - per docs this is primary
    if (speakerNames[speakerId]) {
      return speakerNames[speakerId];
    }
    
    // 2. Check lyraMatches for speakerName by label
    const match = lyraMatches.find(m => 
      m.speakerLabel === speakerId || 
      m.speakerLabel?.toLowerCase() === speakerId.toLowerCase()
    );
    if (match && match.confidencePercent >= SIS_DISPLAY_THRESHOLD_PERCENT) {
      if (match.speakerName) return match.speakerName;
      if (match.sampleOwnerEmail) return match.sampleOwnerEmail.split('@')[0];
    }
    
    // 3. Check lyraSpeakers for speakerName or bestMatchEmail
    const speaker = lyraSpeakers.find(s => 
      s.label === speakerId || 
      s.label?.toLowerCase() === speakerId.toLowerCase()
    );
    const speakerConfidencePercent = speaker?.similarity != null ? Math.round(speaker.similarity * 100) : 0;
    if (speaker?.bestMatchEmail && speakerConfidencePercent >= SIS_DISPLAY_THRESHOLD_PERCENT) {
      if (speaker.speakerName) return speaker.speakerName;
      return speaker.bestMatchEmail.split('@')[0];
    }
    
    // 4. Fallback to Talare X format for speaker_X patterns
    const numMatch = speakerId.match(/(?:speaker_?|talare_?)(\d+)/i);
    if (numMatch) return `Talare ${parseInt(numMatch[1], 10) + 1}`;
    
    // 5. If it's a single letter like 'A', 'B', convert to Talare A, Talare B
    if (/^[A-Z]$/i.test(speakerId)) {
      return `Talare ${speakerId.toUpperCase()}`;
    }
    
    return speakerId;
  }, [speakerNames, lyraMatches, lyraSpeakers]);

  // Get confidence percent for a speaker - per docs: sisMatch.confidencePercent for badges
  const getSpeakerConfidence = useCallback((speakerId: string): number | null => {
    // Check lyraMatches first
    const match = lyraMatches.find(m => 
      m.speakerLabel === speakerId || 
      m.speakerLabel?.toLowerCase() === speakerId.toLowerCase()
    );
    if (match?.confidencePercent) return match.confidencePercent;
    
    // Check lyraSpeakers similarity (0.0-1.0 → convert to percent)
    const speaker = lyraSpeakers.find(s => 
      s.label === speakerId || 
      s.label?.toLowerCase() === speakerId.toLowerCase()
    );
    if (speaker?.similarity != null) return Math.round(speaker.similarity * 100);
    
    return null;
  }, [lyraMatches, lyraSpeakers]);

  // Check if speaker is identified via Lyra (confidence buckets per docs)
  const isSpeakerIdentified = useCallback((speakerId: string): boolean => {
    const ownerEmail = user?.email?.toLowerCase();

    // Single speaker + same owner email: treat as verified-by-context
    if (ownerEmail) {
      if (lyraMatches.length === 1) {
        const m = lyraMatches[0];
        if ((m.speakerLabel || '').toLowerCase() === speakerId.toLowerCase() && (m.sampleOwnerEmail || '').toLowerCase() === ownerEmail) {
          return true;
        }
      }
      if (lyraSpeakers.length === 1) {
        const s = lyraSpeakers[0];
        if ((s.label || '').toLowerCase() === speakerId.toLowerCase() && (s.bestMatchEmail || '').toLowerCase() === ownerEmail) {
          return true;
        }
      }
    }

    return lyraMatches.some(m => 
      (m.speakerLabel === speakerId || m.speakerLabel?.toLowerCase() === speakerId.toLowerCase()) &&
      (m.confidencePercent ?? 0) >= SIS_DISPLAY_THRESHOLD_PERCENT
    ) || lyraSpeakers.some(s => {
      const p = s.similarity != null ? Math.round(s.similarity * 100) : 0;
      return (s.label === speakerId || s.label?.toLowerCase() === speakerId.toLowerCase()) && !!s.bestMatchEmail && p >= SIS_DISPLAY_THRESHOLD_PERCENT;
    });
  }, [lyraMatches, lyraSpeakers, user?.email]);

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

  // Helper functions for rendering
  const getSpeakerColor = (speakerId: string): string => {
    const colors = [
      'bg-blue-500',
      'bg-emerald-500',
      'bg-amber-500',
      'bg-purple-500',
      'bg-rose-500',
      'bg-cyan-500',
      'bg-indigo-500',
      'bg-teal-500',
    ];
    if (!speakerId || speakerId === 'unknown') return 'bg-muted-foreground/50';
    const index = speakerId.charCodeAt(speakerId.length - 1);
    return colors[Math.abs(index) % colors.length];
  };
  
  const formatTime = (time: number): string => {
    const totalSeconds = time > 1000 ? Math.floor(time / 1000) : Math.floor(time);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Group consecutive segments by same speaker
  const groupedSegments = transcriptSegments ? (() => {
    const grouped: { speakerId: string; text: string; start: number; end: number }[] = [];
    for (const seg of transcriptSegments) {
      const prev = grouped[grouped.length - 1];
      const rawSpeakerId = (seg as any).speakerId || (seg as any).speaker || 'unknown';
      const speakerId = String(rawSpeakerId).toLowerCase() === 'unknown' ? 'unknown' : rawSpeakerId;
      
      if (prev && prev.speakerId === speakerId) {
        prev.text = `${prev.text}\n${seg.text}`;
        prev.end = seg.end;
      } else {
        grouped.push({ speakerId, text: seg.text, start: seg.start, end: seg.end });
      }
    }
    return grouped;
  })() : [];

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
                      {/* Speaker Identification Section - show if we have Lyra matches OR lyraSpeakers with bestMatchEmail */}
                      {(lyraMatches.length > 0 || lyraSpeakers.some(s => s.bestMatchEmail)) && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-5"
                        >
                          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-primary/10">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                              <Users className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1">
                              <span className="text-sm font-semibold">Identifierade talare</span>
                              <p className="text-xs text-muted-foreground">Röstidentifiering via Lyra</p>
                            </div>
                            {/* Show learning badge if any speaker learned in this meeting */}
                            {lyraLearning.some(l => l.updated) && (
                              <Badge variant="outline" className="text-purple-600 border-purple-500/30 bg-purple-500/10 gap-1">
                                <Sparkles className="w-3 h-3" />
                                Lyra lärde sig
                              </Badge>
                            )}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {/* Build speakers from lyraMatches first, then fill in from lyraSpeakers */}
                            {(() => {
                              type UniqueSpeaker = { 
                                name: string; 
                                confidencePercent: number; 
                                email?: string; 
                                speakerLabel?: string; 
                                count: number; 
                                learned: boolean;
                                durationSeconds?: number;
                              };
                              
                              const uniqueSpeakers: UniqueSpeaker[] = [];
                              const processedLabels = new Set<string>();
                              
                              // First add from lyraMatches
                              for (const match of lyraMatches) {
                                const label = match.speakerLabel || '';
                                const name = speakerNames[label] || match.speakerName || match.sampleOwnerEmail?.split('@')[0];
                                if (!name) continue;
                                
                                const learningEntry = lyraLearning.find(l => l.email === match.sampleOwnerEmail);
                                const existing = uniqueSpeakers.find(s => s.name === name);
                                
                                if (existing) {
                                  if (match.confidencePercent > existing.confidencePercent) {
                                    existing.confidencePercent = match.confidencePercent;
                                  }
                                  existing.count++;
                                  if (learningEntry?.updated) existing.learned = true;
                                } else {
                                  uniqueSpeakers.push({ 
                                    name, 
                                    confidencePercent: match.confidencePercent,
                                    email: match.sampleOwnerEmail,
                                    speakerLabel: label,
                                    count: 1,
                                    learned: learningEntry?.updated || false,
                                    durationSeconds: match.durationSeconds ?? undefined,
                                  });
                                }
                                if (label) processedLabels.add(label);
                              }
                              
                              // Then add from lyraSpeakers if not already in matches
                              for (const speaker of lyraSpeakers) {
                                if (!speaker.bestMatchEmail || processedLabels.has(speaker.label)) continue;
                                
                                const name = speakerNames[speaker.label] || speaker.speakerName || speaker.bestMatchEmail.split('@')[0];
                                const confidencePercent = speaker.similarity != null ? Math.round(speaker.similarity * 100) : 0;
                                const learningEntry = lyraLearning.find(l => l.email === speaker.bestMatchEmail);
                                
                                uniqueSpeakers.push({
                                  name,
                                  confidencePercent,
                                  email: speaker.bestMatchEmail,
                                  speakerLabel: speaker.label,
                                  count: 1,
                                  learned: learningEntry?.updated || false,
                                  durationSeconds: speaker.durationSeconds ?? undefined,
                                });
                                processedLabels.add(speaker.label);
                              }
                              
                               const displaySpeakers = uniqueSpeakers.filter((s) => {
                                 // Single speaker + same owner email: verified by context
                                 const ownerEmail = user?.email?.toLowerCase();
                                 const contextVerified = !!ownerEmail && uniqueSpeakers.length === 1 && (s.email || '').toLowerCase() === ownerEmail;
                                 return contextVerified || s.confidencePercent >= SIS_DISPLAY_THRESHOLD_PERCENT;
                               });
                               
                               return displaySpeakers.map((speaker, idx) => {
                                 const ownerEmail = user?.email?.toLowerCase();
                                 const contextVerified = !!ownerEmail && displaySpeakers.length === 1 && (speaker.email || '').toLowerCase() === ownerEmail;
                                 const label = contextVerified ? 'Verifierad (kontext)' : getSISVerificationLabel(speaker.confidencePercent);

                                 const tint = contextVerified || speaker.confidencePercent >= 85
                                   ? 'bg-green-500/20 text-green-700 dark:text-green-400 ring-2 ring-green-500/30'
                                   : 'bg-blue-500/20 text-blue-700 dark:text-blue-400 ring-2 ring-blue-500/30';

                                 return (
                                   <div
                                     key={idx}
                                     className="flex items-center gap-3 bg-background/60 backdrop-blur-sm rounded-lg p-3 border border-border/30 hover:border-primary/30 transition-colors"
                                   >
                                     <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${tint}`}>
                                       {speaker.name.charAt(0).toUpperCase()}
                                     </div>
                                     <div className="flex-1 min-w-0">
                                       <div className="flex items-center gap-2">
                                         <p className="text-sm font-medium truncate">{speaker.name}</p>
                                         {speaker.learned && (
                                           <span title="Lyra lärde sig från denna talare">
                                             <Sparkles className="w-3 h-3 text-purple-500 flex-shrink-0" />
                                           </span>
                                         )}
                                       </div>
                                       <div className="flex items-center gap-2 mt-0.5">
                                         <span className="text-xs font-medium text-muted-foreground">
                                           {label}
                                         </span>
                                         {speaker.durationSeconds != null && speaker.durationSeconds > 0 && (
                                           <span className="text-xs text-muted-foreground">
                                             • {Math.round(speaker.durationSeconds)}s
                                           </span>
                                         )}
                                       </div>
                                     </div>
                                     <UserCheck className={`w-4 h-4 ${contextVerified || speaker.confidencePercent >= 85 ? 'text-green-500' : 'text-blue-500'}`} />
                                   </div>
                                 );
                               });
                            })()}
                          </div>
                        </motion.div>
                      )}

                      {/* Transcript Section with Speaker Segments */}
                      <div className="flex items-center gap-2 mb-4">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <span className="font-medium">Transkription</span>
                        {!isEditingTranscript && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto gap-1 text-xs"
                            onClick={() => {
                              setEditedTranscript(transcript || '');
                              setIsEditingTranscript(true);
                            }}
                          >
                            <Pencil className="w-3 h-3" />
                            Redigera
                          </Button>
                        )}
                      </div>

                      {isEditingTranscript ? (
                        <div className="space-y-3">
                          <Textarea
                            value={editedTranscript}
                            onChange={(e) => setEditedTranscript(e.target.value)}
                            className="min-h-[300px] text-sm"
                            placeholder="Redigera transkriptionen..."
                          />
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setIsEditingTranscript(false)}
                              disabled={isSavingTranscript}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Avbryt
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleResetTranscriptFromASR}
                              disabled={isSavingTranscript}
                            >
                              Återställ från ASR
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveTranscript}
                              disabled={isSavingTranscript || !editedTranscript.trim()}
                            >
                              {isSavingTranscript ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4 mr-1" />
                              )}
                              Spara
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl max-h-[600px] overflow-y-auto">
                          {groupedSegments.length > 0 ? (
                            <div className="space-y-1">
                              {groupedSegments.map((segment, idx) => {
                                const manualName = speakerNames[segment.speakerId];
                                const isIdentified = isSpeakerIdentified(segment.speakerId);
                                const confidence = getSpeakerConfidence(segment.speakerId);
                                const resolvedName = manualName || (isIdentified ? getSpeakerDisplayName(segment.speakerId) : null);
                                const displayName = resolvedName || 'Okänd talare';
                                const isEditing = editingSpeaker === segment.speakerId;
                                const canEdit = !!segment.speakerId && String(segment.speakerId).toLowerCase() !== 'unknown';

                                // Speaker colors for horizontal accent line
                                const speakerColors = [
                                  'from-blue-500 to-blue-400',
                                  'from-emerald-500 to-emerald-400',
                                  'from-amber-500 to-amber-400',
                                  'from-purple-500 to-purple-400',
                                  'from-rose-500 to-rose-400',
                                  'from-cyan-500 to-cyan-400',
                                ];
                                const colorIndex = segment.speakerId ? Math.abs(segment.speakerId.charCodeAt(segment.speakerId.length - 1)) % speakerColors.length : 0;
                                const lineGradient = isIdentified && confidence != null && confidence >= 85
                                  ? 'from-primary to-primary/70'
                                  : isIdentified
                                    ? 'from-accent to-accent/70'
                                    : speakerColors[colorIndex];

                                const badgeClass = confidence != null && confidence >= 85
                                  ? 'border-primary/30 text-primary bg-primary/10'
                                  : 'border-accent/30 text-accent-foreground bg-accent/10';

                                return (
                                  <motion.div
                                    key={`${segment.speakerId}-${segment.start}-${idx}`}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(idx * 0.015, 0.2) }}
                                    className="group"
                                  >
                                    {/* Horizontal colored accent line */}
                                    <div className={`h-[2px] bg-gradient-to-r ${lineGradient} rounded-full mb-2`} />
                                    
                                    {/* Speaker name row */}
                                    <div className="flex items-center gap-2 mb-1.5 px-1">
                                      {isEditing ? (
                                        <div className="flex items-center gap-2 min-w-0">
                                          <Input
                                            value={editingSpeakerValue}
                                            onChange={(e) => setEditingSpeakerValue(e.target.value)}
                                            className="h-7 text-sm w-[140px]"
                                            placeholder="Namn..."
                                            autoFocus
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleSaveSpeakerName();
                                              if (e.key === 'Escape') {
                                                setEditingSpeaker(null);
                                                setEditingSpeakerValue('');
                                              }
                                            }}
                                          />
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0"
                                            onClick={handleSaveSpeakerName}
                                            disabled={isSavingSpeaker}
                                          >
                                            {isSavingSpeaker ? (
                                              <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                              <Save className="w-3 h-3" />
                                            )}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0"
                                            onClick={() => {
                                              setEditingSpeaker(null);
                                              setEditingSpeakerValue('');
                                            }}
                                          >
                                            <X className="w-3 h-3" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <>
                                          <span className="text-xs font-semibold text-foreground/80">
                                            {displayName}
                                          </span>
                                          {isIdentified && confidence != null && (
                                            <Badge
                                              variant="outline"
                                              className={`text-[9px] px-1.5 py-0 h-4 ${badgeClass}`}
                                            >
                                              {getSISVerificationLabel(confidence)}
                                            </Badge>
                                          )}
                                          <span className="text-[10px] text-muted-foreground ml-auto">
                                            {formatTime(segment.start)}
                                          </span>
                                          {canEdit && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                                              onClick={() => {
                                                setEditingSpeaker(segment.speakerId);
                                                setEditingSpeakerValue(manualName || resolvedName || '');
                                              }}
                                            >
                                              <Pencil className="w-2.5 h-2.5" />
                                            </Button>
                                          )}
                                        </>
                                      )}
                                    </div>

                                    {/* Transcript text */}
                                    <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed px-1 pb-4">
                                      {segment.text}
                                    </p>
                                  </motion.div>
                                );
                              })}
                            </div>
                          ) : (
                            <motion.p 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.5 }}
                              className="whitespace-pre-wrap leading-relaxed text-foreground/90 text-sm p-4 bg-muted/30 rounded-xl"
                            >
                              {transcript}
                            </motion.p>
                          )}
                        </div>
                      )}
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
