import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, FileText, Trash2, MessageCircle, Calendar, CheckCircle2, AlertCircle, Mic, Upload, Users, UserCheck, Sparkles, Clock, Save, RotateCcw, Edit3, X, ChevronDown, Eye, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { meetingStorage, type MeetingSession } from "@/utils/meetingStorage";
import { pollASRStatus, type SISMatch, type SISSpeaker, type TranscriptSegment as ASRTranscriptSegment, type LyraLearningEntry } from "@/lib/asrService";
import { apiClient } from "@/lib/api";
import { backendApi } from "@/lib/backendApi";
import { subscribeToUpload, getUploadStatus, resolveBackendMeetingId, hasBackendAlias } from "@/lib/backgroundUploader";
import { sendTranscriptionCompleteEmail } from "@/lib/emailNotification";
import { AgendaSelectionDialog } from "@/components/AgendaSelectionDialog";
import { AutoProtocolGenerator } from "@/components/AutoProtocolGenerator";
import { MeetingChat } from "@/components/MeetingChat";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ProtocolViewerDialog } from "@/components/ProtocolViewerDialog";
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
  const [isSISDisabled, setIsSISDisabled] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAgendaDialog, setShowAgendaDialog] = useState(false);
  const [pendingMeetingData, setPendingMeetingData] = useState<MeetingDataForDialog | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<{ transcript: string; aiProtocol: any } | null>(null);
  const [chatMeeting, setChatMeeting] = useState<MeetingSession | null>(null);
  
  // Unified editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [editedSpeakerNames, setEditedSpeakerNames] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSpeakers, setShowSpeakers] = useState(true);

  // Protocol management state
  const [protocolData, setProtocolData] = useState<{
    fileName: string;
    mimeType: string;
    blob: string;
    storedAt: string;
    size: number;
  } | null>(null);
  const [loadingProtocol, setLoadingProtocol] = useState(false);
  const [viewingProtocol, setViewingProtocol] = useState(false);
  const [showDeleteProtocolConfirm, setShowDeleteProtocolConfirm] = useState(false);
  const [showReplaceProtocolConfirm, setShowReplaceProtocolConfirm] = useState(false);

  // Speaker identification UX thresholds (per docs)
  const SIS_DISPLAY_THRESHOLD_PERCENT = 75;
  const getSISVerificationLabel = (percent: number) => {
    if (percent >= 92) return 'Stark verifiering';
    if (percent >= 85) return 'Verifierad';
    if (percent >= 75) return 'Trolig';
    return 'Okänd';
  };

  // Protocol limits: Pro = 1 replacement, Enterprise = 3 replacements
  const { enterpriseMembership } = useSubscription();
  const isEnterprise = enterpriseMembership?.isMember === true;
  const maxProtocolReplaces = isEnterprise ? 3 : 1;
  const currentProtocolCount = meeting?.protocolCount || 0;
  const canReplaceProtocol = currentProtocolCount < maxProtocolReplaces;

  const pollingRef = useRef(false);
  const transcriptionDoneRef = useRef(false);

  // Simple stage-based status text
  const getStageInfo = () => {
    if (stage === 'transcribing') return { title: 'Transkriberar...', subtitle: 'Konverterar ljud till text' };
    if (stage === 'sis_processing') return { title: 'Identifierar talare...', subtitle: 'Analyserar röster' };
    if (stage === 'uploading' || status === 'uploading') return { title: 'Laddar upp...', subtitle: 'Skickar ljudfil' };
    if (status === 'processing') return { title: 'Transkriberar...', subtitle: 'Konverterar ljud till text' };
    return { title: 'Startar...', subtitle: 'Förbereder transkribering' };
  };

  // Format date helper
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Load meeting data
  useEffect(() => {
    if (!id || !user) return;

    const loadMeeting = async () => {
      setIsLoading(true);
      
      // Resolve backend alias if upload returned a different ID
      const resolvedId = resolveBackendMeetingId(id);
      if (resolvedId !== id) {
        console.log('📋 Meeting detail: using resolved backend ID:', { original: id, resolved: resolvedId });
      }
      
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

        // Try fetching with original ID first, then resolved ID if different
        let fetchedMeeting = await meetingStorage.getMeeting(id);
        
        // If not found and we have a resolved ID, try that
        if (!fetchedMeeting && resolvedId !== id) {
          console.log('📋 Meeting not found with original ID, trying resolved ID...');
          fetchedMeeting = await meetingStorage.getMeeting(resolvedId);
        }
        
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
                setLyraSpeakers(asrStatus.lyraSpeakers || asrStatus.sisSpeakers || []);
                setLyraMatches(asrStatus.lyraMatches || asrStatus.sisMatches || []);
                setSpeakerNames(asrStatus.lyraSpeakerNames || asrStatus.speakerNames || {});
                setLyraLearning(asrStatus.lyraLearning || asrStatus.sisLearning || []);
                // Check if SIS/LYRA is disabled
                const sisDisabled = asrStatus.lyraStatus === 'disabled' || asrStatus.sisStatus === 'disabled';
                setIsSISDisabled(sisDisabled);
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

  // Load protocol data and count when meeting has a protocol
  useEffect(() => {
    const loadProtocolData = async () => {
      if (!id) return;
      
      // Always fetch the latest protocol count from backend
      try {
        const countData = await meetingStorage.getProtocolCount(id);
        if (countData > 0) {
          setMeeting(prev => prev ? { ...prev, protocolCount: countData } : null);
        }
      } catch (error) {
        console.log('Could not load protocol count:', error);
      }
      
      // Load protocol document if meeting has protocol
      if (!meeting?.protocol) {
        setProtocolData(null);
        return;
      }
      
      try {
        setLoadingProtocol(true);
        const data = await backendApi.getProtocol(id);
        if (data?.protocol) {
          setProtocolData(data.protocol);
        }
      } catch (error) {
        console.log('Could not load protocol:', error);
      } finally {
        setLoadingProtocol(false);
      }
    };
    
    loadProtocolData();
  }, [id, meeting?.protocol]);

  // Subscribe to background upload status
  useEffect(() => {
    if (!id) return;

    const unsubscribe = subscribeToUpload((meetingId, uploadStatus) => {
      if (meetingId !== id) return;
      
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

  // Poll for transcription status
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

        if (asrStatus.stage) {
          setStage(asrStatus.stage);
        }
        
        if (asrStatus.status === 'processing' || asrStatus.stage === 'transcribing' || asrStatus.stage === 'sis_processing') {
          if (status === 'uploading') {
            setStatus('processing');
          }
        }

        const mainDone = asrStatus.status === 'completed' || asrStatus.status === 'done';
        const lyraOrSisDone = asrStatus.lyraStatus === 'done' || asrStatus.sisStatus === 'done' || 
                              asrStatus.lyraStatus === 'no_samples' || asrStatus.sisStatus === 'no_samples' ||
                              asrStatus.lyraStatus === 'disabled' || asrStatus.sisStatus === 'disabled';
        const stageDone = asrStatus.stage === 'done';
        
        const isFullyDone = mainDone && asrStatus.transcript && (stageDone || lyraOrSisDone);
        
        // Check if SIS/LYRA is explicitly disabled
        const sisDisabled = asrStatus.lyraStatus === 'disabled' || asrStatus.sisStatus === 'disabled';
        
        if (isFullyDone) {
          transcriptionDoneRef.current = true;
          pollingRef.current = false;

          const newTranscript = asrStatus.transcript || '';
          setTranscript(newTranscript);
          setTranscriptSegments(asrStatus.transcriptSegments || null);
          setLyraSpeakers(asrStatus.lyraSpeakers || asrStatus.sisSpeakers || []);
          setLyraMatches(asrStatus.lyraMatches || asrStatus.sisMatches || []);
          setSpeakerNames(asrStatus.lyraSpeakerNames || asrStatus.speakerNames || {});
          setLyraLearning(asrStatus.lyraLearning || asrStatus.sisLearning || []);
          setIsSISDisabled(sisDisabled);
          setStatus('done');
          setStage('done');

          try {
            await apiClient.updateMeeting(id, {
              transcript: newTranscript,
              isCompleted: true,
              transcriptSegments: asrStatus.transcriptSegments || undefined,
            });
          } catch (updateErr) {
            console.warn('Could not update meeting with transcript:', updateErr);
          }

          void incrementMeetingCount(id).catch(() => {});

          if (user?.email) {
            const authToken = apiClient.getAuthToken();
            if (authToken) {
              sendTranscriptionCompleteEmail({
                userEmail: user.email,
                userName: user.displayName || undefined,
                meetingTitle: meeting?.title || 'Möte',
                meetingId: id,
                authToken,
              }).catch(() => {});
            }
          }

          // Only show toast if not already shown for this meeting
          const toastKey = `transcription_toast_shown_${id}`;
          if (!localStorage.getItem(toastKey)) {
            localStorage.setItem(toastKey, 'true');
            toast({
              title: 'Transkribering klar!',
              description: 'Ditt möte har transkriberats.',
            });
          }

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

  // Enter edit mode
  const enterEditMode = () => {
    setEditedTranscript(transcript || '');
    setEditedSpeakerNames({ ...speakerNames });
    setIsEditing(true);
    setHasUnsavedChanges(false);
  };

  // Cancel edit mode
  const cancelEditMode = () => {
    setIsEditing(false);
    setEditedTranscript('');
    setEditedSpeakerNames({});
    setHasUnsavedChanges(false);
  };

  // Handle transcript change
  const handleTranscriptChange = (value: string) => {
    setEditedTranscript(value);
    setHasUnsavedChanges(true);
  };

  // Handle speaker name change
  const handleSpeakerNameChange = (label: string, name: string) => {
    setEditedSpeakerNames(prev => ({ ...prev, [label]: name }));
    setHasUnsavedChanges(true);
  };

  // Save all changes
  const handleSaveAll = async () => {
    if (!id) return;
    setIsSaving(true);

    try {
      // Save transcript if changed
      if (editedTranscript.trim() !== (transcript || '').trim()) {
        await apiClient.updateMeeting(id, { transcript: editedTranscript.trim() });
        setTranscript(editedTranscript.trim());
        setMeeting(prev => prev ? { ...prev, transcript: editedTranscript.trim(), updatedAt: new Date().toISOString() } : prev);
      }

      // Save speaker names if changed
      const hasNameChanges = Object.keys(editedSpeakerNames).some(
        key => editedSpeakerNames[key] !== speakerNames[key]
      );
      
      if (hasNameChanges) {
        const response = await backendApi.saveSpeakerNames(id, editedSpeakerNames);
        setSpeakerNames(response.speakerNames || editedSpeakerNames);
        
        if (response.sisLearning && response.sisLearning.length > 0) {
          setLyraLearning(prev => {
            const existing = [...prev];
            response.sisLearning?.forEach(entry => {
              const idx = existing.findIndex(e => e.email === entry.email);
              if (idx >= 0) existing[idx] = entry;
              else existing.push(entry);
            });
            return existing;
          });
        }
      }

      setIsEditing(false);
      setHasUnsavedChanges(false);
      toast({
        title: 'Ändringar sparade',
        description: 'Transkription och talarnamn har uppdaterats.',
      });
    } catch (error) {
      console.error('Failed to save:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte spara ändringarna.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset transcript from ASR
  const handleResetFromASR = async () => {
    if (!id) return;
    try {
      const asrStatus = await pollASRStatus(id);
      if (asrStatus.transcript) {
        setEditedTranscript(asrStatus.transcript);
        setHasUnsavedChanges(true);
        toast({ title: 'Återställd från ASR', description: 'Spara för att bekräfta.' });
      }
    } catch (e) {
      toast({ title: 'Fel', description: 'Kunde inte hämta ASR-data.', variant: 'destructive' });
    }
  };

  // Handle create protocol - check if one exists first
  const handleCreateProtocol = async () => {
    if (!meeting || !transcript) return;

    // If protocol exists, show replace confirmation
    if (protocolData) {
      if (!canReplaceProtocol) {
        toast({
          title: 'Gräns nådd',
          description: `Du har nått gränsen för protokollersättningar (${maxProtocolReplaces}). Uppgradera för fler.`,
          variant: 'destructive',
        });
        return;
      }
      setShowReplaceProtocolConfirm(true);
      return;
    }

    await proceedWithProtocolGeneration();
  };

  // Proceed with protocol generation
  const proceedWithProtocolGeneration = async () => {
    if (!meeting || !transcript) return;

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

  // Handle view protocol
  const handleViewProtocol = () => {
    if (protocolData) {
      setViewingProtocol(true);
    }
  };

  // Handle download protocol
  const handleDownloadProtocol = () => {
    if (!protocolData?.blob) return;

    try {
      const base64Data = protocolData.blob.replace(/^data:.*?;base64,/, '');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const file = new Blob([bytes], { type: protocolData.mimeType });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = protocolData.fileName;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Protokoll nedladdat",
        description: protocolData.fileName,
        duration: 2000,
      });
    } catch (error: any) {
      toast({
        title: "Fel",
        description: error.message || "Kunde inte ladda ner protokoll",
        variant: "destructive",
        duration: 2500,
      });
    }
  };

  // Handle delete protocol
  const handleDeleteProtocol = async () => {
    if (!id) return;
    
    try {
      await backendApi.deleteProtocol(id);
      setProtocolData(null);
      
      // Update meeting state to reflect no protocol
      setMeeting(prev => prev ? { ...prev, protocol: null } : null);
      
      toast({
        title: "Protokoll borttaget",
        description: "Du kan nu generera ett nytt protokoll",
        duration: 2000,
      });
      setShowDeleteProtocolConfirm(false);
    } catch (error: any) {
      toast({
        title: "Fel",
        description: error.message || "Kunde inte ta bort protokoll",
        variant: "destructive",
        duration: 2500,
      });
    }
  };

  // Handle replace protocol
  const handleReplaceProtocol = async () => {
    if (!id) return;
    
    try {
      await backendApi.deleteProtocol(id);
      setProtocolData(null);
      
      // Update local state - protocol count will be incremented during new generation
      setMeeting(prev => prev ? { 
        ...prev, 
        protocol: null,
      } : null);
      
      setShowReplaceProtocolConfirm(false);
      
      // Proceed with new generation
      await proceedWithProtocolGeneration();
      
      toast({
        title: "Protokoll ersätts",
        description: "Nytt protokoll kommer att genereras",
        duration: 2000,
      });
    } catch (error: any) {
      toast({
        title: "Fel",
        description: error.message || "Kunde inte ersätta protokoll",
        variant: "destructive",
        duration: 2500,
      });
    }
  };

  // Get speaker display name - always returns a name (never null or "Okänd talare")
  const getSpeakerDisplayName = useCallback((speakerId: string, index?: number): string => {
    const fallbackName = `Talare ${(index ?? 0) + 1}`;
    
    if (!speakerId || speakerId === 'unknown' || speakerId.toLowerCase() === 'unknown') {
      return fallbackName;
    }
    
    const namesSource = isEditing ? editedSpeakerNames : speakerNames;
    
    if (namesSource[speakerId]) {
      return namesSource[speakerId];
    }
    
    const match = lyraMatches.find(m => 
      m.speakerLabel === speakerId || m.speakerLabel?.toLowerCase() === speakerId.toLowerCase()
    );
    if (match && match.confidencePercent >= SIS_DISPLAY_THRESHOLD_PERCENT) {
      if (match.speakerName) return match.speakerName;
      if (match.sampleOwnerEmail) return match.sampleOwnerEmail.split('@')[0];
    }
    
    const speaker = lyraSpeakers.find(s => 
      s.label === speakerId || s.label?.toLowerCase() === speakerId.toLowerCase()
    );
    const speakerConfidencePercent = speaker?.similarity != null ? Math.round(speaker.similarity * 100) : 0;
    if (speaker?.bestMatchEmail && speakerConfidencePercent >= SIS_DISPLAY_THRESHOLD_PERCENT) {
      if (speaker.speakerName) return speaker.speakerName;
      return speaker.bestMatchEmail.split('@')[0];
    }
    
    const numMatch = speakerId.match(/(?:speaker_?|talare_?)(\d+)/i);
    if (numMatch) return `Talare ${parseInt(numMatch[1], 10) + 1}`;
    
    if (/^[A-Z]$/i.test(speakerId)) {
      return `Talare ${speakerId.toUpperCase()}`;
    }
    
    return fallbackName;
  }, [speakerNames, editedSpeakerNames, lyraMatches, lyraSpeakers, isEditing]);

  // Get confidence percent
  const getSpeakerConfidence = useCallback((speakerId: string): number | null => {
    const match = lyraMatches.find(m => 
      m.speakerLabel === speakerId || m.speakerLabel?.toLowerCase() === speakerId.toLowerCase()
    );
    if (match?.confidencePercent) return match.confidencePercent;
    
    const speaker = lyraSpeakers.find(s => 
      s.label === speakerId || s.label?.toLowerCase() === speakerId.toLowerCase()
    );
    if (speaker?.similarity != null) return Math.round(speaker.similarity * 100);
    
    return null;
  }, [lyraMatches, lyraSpeakers]);

  // Check if speaker is identified
  const isSpeakerIdentified = useCallback((speakerId: string): boolean => {
    const ownerEmail = user?.email?.toLowerCase();

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

  // Helper to get a nice speaker label like "Talare 1", "Talare 2"
  const getSpeakerFallbackName = (speakerId: string, index: number): string => {
    if (!speakerId || speakerId === 'unknown' || speakerId.toLowerCase() === 'unknown') {
      return `Talare ${index + 1}`;
    }
    const numMatch = speakerId.match(/(?:speaker_?|talare_?)(\d+)/i);
    if (numMatch) return `Talare ${parseInt(numMatch[1], 10) + 1}`;
    if (/^[A-Z]$/i.test(speakerId)) return `Talare ${speakerId.toUpperCase()}`;
    return `Talare ${index + 1}`;
  };

  // Get unique speakers for display - include ALL speakers for editing, not just identified ones
  // When SIS/Lyra is enabled but has no matches, still show "Talare 1", "Talare 2", etc. for learning
  const uniqueSpeakers = (() => {
    const speakers: { 
      label: string; 
      name: string; 
      confidence: number; 
      learned: boolean;
      email?: string;
      isIdentified: boolean;
    }[] = [];
    const processedLabels = new Set<string>();
    let speakerIndex = 0;

    // First add from lyraMatches (high confidence)
    for (const match of lyraMatches) {
      const label = match.speakerLabel || '';
      if (!label || processedLabels.has(label)) continue;
      
      const namesSource = isEditing ? editedSpeakerNames : speakerNames;
      const fallbackName = getSpeakerFallbackName(label, speakerIndex);
      const name = namesSource[label] || match.speakerName || match.sampleOwnerEmail?.split('@')[0] || fallbackName;
      const learningEntry = lyraLearning.find(l => l.email === match.sampleOwnerEmail);
      const isIdentified = match.confidencePercent >= SIS_DISPLAY_THRESHOLD_PERCENT;
      
      speakers.push({
        label,
        name,
        confidence: match.confidencePercent,
        learned: learningEntry?.updated || false,
        email: match.sampleOwnerEmail,
        isIdentified,
      });
      processedLabels.add(label);
      speakerIndex++;
    }

    // Then add from lyraSpeakers
    for (const speaker of lyraSpeakers) {
      if (processedLabels.has(speaker.label)) continue;
      
      const namesSource = isEditing ? editedSpeakerNames : speakerNames;
      const fallbackName = getSpeakerFallbackName(speaker.label, speakerIndex);
      const name = namesSource[speaker.label] || speaker.speakerName || (speaker.bestMatchEmail ? speaker.bestMatchEmail.split('@')[0] : fallbackName);
      const confidence = speaker.similarity != null ? Math.round(speaker.similarity * 100) : 0;
      const learningEntry = lyraLearning.find(l => l.email === speaker.bestMatchEmail);
      const isIdentified = !!speaker.bestMatchEmail && confidence >= SIS_DISPLAY_THRESHOLD_PERCENT;
      
      speakers.push({
        label: speaker.label,
        name,
        confidence,
        learned: learningEntry?.updated || false,
        email: speaker.bestMatchEmail,
        isIdentified,
      });
      processedLabels.add(speaker.label);
      speakerIndex++;
    }

    // Add any unique speakers from segments that weren't in matches/speakers
    if (transcriptSegments) {
      const segmentLabels = new Set<string>();
      for (const seg of transcriptSegments) {
        const rawId = (seg as any).speakerId || (seg as any).speaker || 'unknown';
        if (rawId && rawId.toLowerCase() !== 'unknown' && !processedLabels.has(rawId) && !segmentLabels.has(rawId)) {
          segmentLabels.add(rawId);
          const namesSource = isEditing ? editedSpeakerNames : speakerNames;
          const fallbackName = getSpeakerFallbackName(rawId, speakerIndex);
          const name = namesSource[rawId] || fallbackName;
          
          speakers.push({
            label: rawId,
            name,
            confidence: 0,
            learned: false,
            email: undefined,
            isIdentified: false,
          });
          processedLabels.add(rawId);
          speakerIndex++;
        }
      }
    }

    // If SIS/Lyra ran (status done) but found NO matches AND no segments with speakers,
    // create a default "Talare 1" so users can still name the speaker for learning
    // Only do this if SIS is NOT disabled
    if (speakers.length === 0 && status === 'done' && hasTranscript && !isSISDisabled) {
      const defaultLabel = 'speaker_0';
      const namesSource = isEditing ? editedSpeakerNames : speakerNames;
      const name = namesSource[defaultLabel] || 'Talare 1';
      
      speakers.push({
        label: defaultLabel,
        name,
        confidence: 0,
        learned: false,
        email: undefined,
        isIdentified: false,
      });
    }

    return speakers;
  })();

  // Group consecutive segments
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

  // Infer primary speaker
  const inferredPrimarySpeakerId = (() => {
    const matchLabels = Array.from(
      new Set(
        lyraMatches
          .filter((m) => (m.confidencePercent ?? 0) >= SIS_DISPLAY_THRESHOLD_PERCENT && !!m.speakerLabel)
          .map((m) => String(m.speakerLabel))
      )
    );
    if (matchLabels.length === 1) return matchLabels[0];

    const speakerLabels = Array.from(
      new Set(
        lyraSpeakers
          .filter((s) => {
            const p = s.similarity != null ? Math.round(s.similarity * 100) : 0;
            return !!s.bestMatchEmail && p >= SIS_DISPLAY_THRESHOLD_PERCENT;
          })
          .map((s) => String(s.label))
      )
    );
    if (speakerLabels.length === 1) return speakerLabels[0];

    const nonUnknown = Array.from(
      new Set(
        groupedSegments
          .map((s) => String(s.speakerId))
          .filter((s) => s && s.toLowerCase() !== 'unknown')
      )
    );
    if (nonUnknown.length === 1) return nonUnknown[0];

    return null;
  })();

  // Helper to format seconds to MM:SS
  const formatTimestamp = (seconds: number): string => {
    if (!seconds && seconds !== 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get display name for a speaker in segments
  const getSegmentSpeakerName = (speakerId: string): string => {
    // Normalize the speaker ID for comparison
    const normalizedId = (speakerId || '').toLowerCase().trim();
    
    if (!speakerId || normalizedId === 'unknown') {
      // If there's only 1 speaker and they're identified, use their name even for "unknown" segments
      if (uniqueSpeakers.length === 1 && uniqueSpeakers[0].isIdentified) {
        return uniqueSpeakers[0].name;
      }
      // If there's only 1 speaker (even unidentified), still use their name
      if (uniqueSpeakers.length === 1 && uniqueSpeakers[0].name) {
        return uniqueSpeakers[0].name;
      }
      return 'Talare';
    }
    
    // First check uniqueSpeakers - this already has all the resolved names including context verification
    // Use case-insensitive matching
    const resolvedSpeaker = uniqueSpeakers.find(s => 
      s.label.toLowerCase() === normalizedId
    );
    if (resolvedSpeaker) {
      return resolvedSpeaker.name;
    }
    
    // Check edited names if in edit mode (case-insensitive)
    const namesSource = isEditing ? editedSpeakerNames : speakerNames;
    const nameKey = Object.keys(namesSource).find(k => k.toLowerCase() === normalizedId);
    if (nameKey && namesSource[nameKey]) {
      return namesSource[nameKey];
    }
    
    // Check lyraMatches for identified name (case-insensitive)
    const match = lyraMatches.find(m => 
      (m.speakerLabel || '').toLowerCase() === normalizedId
    );
    if (match?.speakerName) {
      return match.speakerName;
    }
    if (match?.sampleOwnerEmail) {
      return match.sampleOwnerEmail.split('@')[0];
    }
    
    // Check lyraSpeakers (case-insensitive)
    const speaker = lyraSpeakers.find(s => 
      (s.label || '').toLowerCase() === normalizedId
    );
    if (speaker?.speakerName) {
      return speaker.speakerName;
    }
    if (speaker?.bestMatchEmail) {
      return speaker.bestMatchEmail.split('@')[0];
    }
    
    // If only 1 speaker exists and no direct match, assume it's that speaker
    if (uniqueSpeakers.length === 1) {
      return uniqueSpeakers[0].name;
    }
    
    // Fallback to "Talare X"
    const numMatch = speakerId.match(/(?:speaker_?|talare_?)(\d+)/i);
    if (numMatch) return `Talare ${parseInt(numMatch[1], 10) + 1}`;
    if (/^[A-Z]$/i.test(speakerId)) return `Talare ${speakerId.toUpperCase()}`;
    
    // Find index in unique speakers
    const idx = uniqueSpeakers.findIndex(s => s.label.toLowerCase() === normalizedId);
    return `Talare ${idx >= 0 ? idx + 1 : 1}`;
  };

  // Get speaker color class based on speaker index
  const getSpeakerColorClass = (speakerId: string): string => {
    const colors = [
      'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    ];
    
    const normalizedId = (speakerId || '').toLowerCase().trim();
    
    if (!speakerId || normalizedId === 'unknown') {
      return 'bg-muted text-muted-foreground border-border';
    }
    
    const idx = uniqueSpeakers.findIndex(s => s.label.toLowerCase() === normalizedId);
    return colors[idx >= 0 ? idx % colors.length : 0];
  };

  const displayTranscript = isEditing ? editedTranscript : (transcript || '');
  // Only show speaker-attributed segments if SIS/LYRA is enabled
  const hasSegments = groupedSegments.length > 0 && !isEditing && !isSISDisabled;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Floating Header */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50"
      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/library')}
            className="shrink-0 rounded-full hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-base truncate">{meeting?.title || 'Laddar...'}</h1>
            {meeting && (
              <p className="text-xs text-muted-foreground">
                {formatDate(meeting.createdAt)} • {formatTime(meeting.createdAt)}
              </p>
            )}
          </div>

          {hasTranscript && !isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={enterEditMode}
              className="gap-2 rounded-full"
            >
              <Edit3 className="w-4 h-4" />
              <span className="hidden sm:inline">Redigera</span>
            </Button>
          )}

          {isEditing && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelEditMode}
                className="rounded-full"
              >
                <X className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Avbryt</span>
              </Button>
              <Button
                size="sm"
                onClick={handleSaveAll}
                disabled={isSaving || !hasUnsavedChanges}
                className="gap-2 rounded-full bg-primary"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Spara</span>
              </Button>
            </div>
          )}
        </div>
      </motion.header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {isLoading ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-32 gap-4"
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Laddar möte...</p>
          </motion.div>
        ) : meeting ? (
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center py-24 gap-6"
              >
                <div className="relative">
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute inset-0 bg-primary/20 rounded-full blur-xl"
                  />
                  <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-primary-foreground animate-spin" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-semibold">{getStageInfo().title}</h2>
                  <p className="text-sm text-muted-foreground">{getStageInfo().subtitle}</p>
                </div>
                <Badge variant="secondary" className="gap-2">
                  <Clock className="w-3 h-3" />
                  Längre möten kan ta några minuter
                </Badge>
              </motion.div>
            ) : status === 'failed' ? (
              <motion.div
                key="failed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-24 gap-6"
              >
                <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="w-10 h-10 text-destructive" />
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-semibold text-destructive">Transkribering misslyckades</h2>
                  <p className="text-sm text-muted-foreground">Försök ladda upp filen igen</p>
                </div>
                <Button onClick={() => navigate('/')} variant="outline" className="rounded-full">
                  Tillbaka till start
                </Button>
              </motion.div>
            ) : hasTranscript ? (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Status Bar */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className="gap-1.5 text-green-600 border-green-500/30 bg-green-500/5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Klar
                  </Badge>
                  {meeting.source && (
                    <Badge variant="secondary" className="gap-1.5">
                      {meeting.source === 'live' ? <Mic className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
                      {meeting.source === 'live' ? 'Live-inspelning' : 'Uppladdad'}
                    </Badge>
                  )}
                  {!isSISDisabled && lyraLearning.some(l => l.updated) && (
                    <Badge variant="outline" className="gap-1.5 text-purple-600 border-purple-500/30 bg-purple-500/5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Lyra lärde sig
                    </Badge>
                  )}
                </div>

                {/* Speakers Section - Only show when SIS/LYRA is enabled */}
                {uniqueSpeakers.length > 0 && !isSISDisabled && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden"
                  >
                    <button
                      onClick={() => setShowSpeakers(!showSpeakers)}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div className="text-left">
                          <span className="font-medium text-sm">Talare</span>
                          <p className="text-xs text-muted-foreground">
                            {uniqueSpeakers.length} {uniqueSpeakers.length === 1 ? 'talare' : 'talare'}
                            {uniqueSpeakers.some(s => s.isIdentified) 
                              ? ' • Röstidentifiering via Lyra'
                              : uniqueSpeakers.length > 0 && ' • Namnge för att lära Lyra'
                            }
                          </p>
                        </div>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${showSpeakers ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {showSpeakers && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 grid gap-3 sm:grid-cols-2">
                            {uniqueSpeakers.map((speaker, idx) => {
                              const ownerEmail = user?.email?.toLowerCase();
                              const contextVerified = !!ownerEmail && uniqueSpeakers.length === 1 && (speaker.email || '').toLowerCase() === ownerEmail;
                              const isStrong = contextVerified || speaker.confidence >= 85;
                              
                              // Use proper label based on identification status
                              let statusLabel: string;
                              if (contextVerified) {
                                statusLabel = 'Verifierad (kontext)';
                              } else if (speaker.isIdentified) {
                                statusLabel = getSISVerificationLabel(speaker.confidence);
                              } else {
                                statusLabel = 'Ej identifierad';
                              }

                              return (
                                <div
                                  key={idx}
                                  className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border/30 hover:border-border transition-colors"
                                >
                                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                                    isStrong 
                                      ? 'bg-green-500/15 text-green-600 dark:text-green-400 ring-2 ring-green-500/20' 
                                      : speaker.isIdentified
                                        ? 'bg-primary/10 text-primary ring-2 ring-primary/20'
                                        : 'bg-muted text-muted-foreground ring-2 ring-border'
                                  }`}>
                                    {speaker.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    {isEditing ? (
                                      <Input
                                        value={editedSpeakerNames[speaker.label] || speaker.name}
                                        onChange={(e) => handleSpeakerNameChange(speaker.label, e.target.value)}
                                        className="h-8 text-sm"
                                        placeholder="Ange namn..."
                                      />
                                    ) : (
                                      <>
                                        <div className="flex items-center gap-2">
                                          <p className="font-medium text-sm truncate">{speaker.name}</p>
                                          {speaker.learned && <Sparkles className="w-3 h-3 text-purple-500 shrink-0" />}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{statusLabel}</p>
                                      </>
                                    )}
                                  </div>
                                  {!isEditing && speaker.isIdentified && (
                                    <UserCheck className={`w-4 h-4 shrink-0 ${isStrong ? 'text-green-500' : 'text-primary'}`} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* Transcript Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden"
                >
                  <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium text-sm">Transkription</span>
                    </div>
                    {isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleResetFromASR}
                        className="gap-1.5 text-xs rounded-full"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Återställ
                      </Button>
                    )}
                  </div>

                  <div className="p-5">
                    {isEditing ? (
                      <Textarea
                        value={editedTranscript}
                        onChange={(e) => handleTranscriptChange(e.target.value)}
                        className="min-h-[400px] text-sm leading-relaxed resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
                        placeholder="Redigera transkriptionen..."
                      />
                    ) : hasSegments ? (
                      // Show segments with speaker attribution
                      <div className="space-y-4">
                        {groupedSegments.map((segment, idx) => {
                          const speakerName = getSegmentSpeakerName(segment.speakerId);
                          const colorClass = getSpeakerColorClass(segment.speakerId);
                          const timestamp = formatTimestamp(segment.start);
                          
                          return (
                            <div key={idx} className="group">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${colorClass}`}>
                                  {speakerName}
                                </span>
                                {timestamp && (
                                  <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">
                                    {timestamp}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap pl-0.5">
                                {segment.text}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // Fallback to plain text display
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <div className="space-y-4 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                          {displayTranscript}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Protocol Section - Show if protocol exists */}
                {protocolData && !isEditing && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18 }}
                    className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden"
                  >
                    <div className="px-5 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <span className="font-medium text-sm">Protokoll</span>
                          <p className="text-xs text-muted-foreground">
                            Sparat {new Date(protocolData.storedAt).toLocaleDateString('sv-SE')}
                            {currentProtocolCount > 0 && ` • ${currentProtocolCount}/${maxProtocolReplaces} ersättningar`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          onClick={handleViewProtocol}
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          title="Visa protokoll"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={handleDownloadProtocol}
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          title="Ladda ner protokoll"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => setShowDeleteProtocolConfirm(true)}
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          title="Ta bort protokoll"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Action Buttons */}
                {!isEditing && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-wrap gap-3"
                  >
                    <Button
                      onClick={handleCreateProtocol}
                      variant={protocolData ? "outline" : "default"}
                      className="flex-1 sm:flex-none gap-2 rounded-full h-12"
                      disabled={loadingProtocol}
                    >
                      {loadingProtocol ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : protocolData ? (
                        <RefreshCw className="w-4 h-4" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                      {protocolData 
                        ? (canReplaceProtocol ? 'Ersätt protokoll' : 'Gräns nådd')
                        : 'Skapa protokoll'
                      }
                    </Button>

                    {hasPlusAccess(user, userPlan) && (
                      <Button
                        variant="outline"
                        onClick={() => setChatMeeting(meeting)}
                        className="flex-1 sm:flex-none gap-2 rounded-full h-12"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Chatta med mötet
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="gap-2 rounded-full h-12 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Ta bort</span>
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        ) : null}
      </main>

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
        title="Ta bort möte"
        description="Är du säker på att du vill ta bort detta möte? Detta går inte att ångra."
        confirmText="Ta bort"
        onConfirm={handleDelete}
        variant="destructive"
      />

      {/* Delete Protocol Confirm Dialog */}
      <ConfirmDialog
        open={showDeleteProtocolConfirm}
        onOpenChange={setShowDeleteProtocolConfirm}
        title="Ta bort protokoll"
        description="Är du säker på att du vill ta bort detta protokoll? Du kan generera ett nytt efteråt."
        confirmText="Ta bort"
        onConfirm={handleDeleteProtocol}
        variant="destructive"
      />

      {/* Replace Protocol Confirm Dialog */}
      <ConfirmDialog
        open={showReplaceProtocolConfirm}
        onOpenChange={setShowReplaceProtocolConfirm}
        title="Ersätt protokoll"
        description={`Vill du ersätta det befintliga protokollet? Efter detta har du ${Math.max(0, maxProtocolReplaces - currentProtocolCount - 1)} ersättningar kvar av ${maxProtocolReplaces}.`}
        confirmText="Ersätt"
        onConfirm={handleReplaceProtocol}
        variant="destructive"
      />

      {/* Protocol Viewer Dialog */}
      <ProtocolViewerDialog
        open={viewingProtocol}
        onOpenChange={setViewingProtocol}
        protocol={protocolData}
      />
    </div>
  );
};

export default MeetingDetail;
