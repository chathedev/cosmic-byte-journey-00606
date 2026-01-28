import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, FileText, Trash2, MessageCircle, Calendar, CheckCircle2, AlertCircle, Mic, Upload, Users, UserCheck, Sparkles, Clock, Save, RotateCcw, Edit3, X, ChevronDown, Eye, Download, RefreshCw, Lock, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { meetingStorage, type MeetingSession } from "@/utils/meetingStorage";
import { pollASRStatus, downloadAudioBackup, type SISMatch, type SISSpeaker, type TranscriptSegment as ASRTranscriptSegment, type LyraLearningEntry, type ReconstructedSegment, type QueueMetadata, type AudioBackup, type TranscriptWord } from "@/lib/asrService";
import { AudioBackupCard } from "@/components/AudioBackupCard";
import { AudioPlayerCard } from "@/components/AudioPlayerCard";
import { retryTranscriptionFromBackup } from "@/lib/audioRetry";
import { ProcessingStatusMessage } from "@/components/ProcessingStatusMessage";
import { apiClient } from "@/lib/api";
import { backendApi } from "@/lib/backendApi";
import { subscribeToUpload, getUploadStatus, resolveBackendMeetingId, hasBackendAlias } from "@/lib/backgroundUploader";
import { sendTranscriptionCompleteEmail } from "@/lib/emailNotification";
import { AgendaSelectionDialog } from "@/components/AgendaSelectionDialog";
import { AutoProtocolGenerator } from "@/components/AutoProtocolGenerator";
import { MeetingRecorder } from "@/components/MeetingRecorder";
import { IntegratedTranscriptPlayer } from "@/components/IntegratedTranscriptPlayer";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ProtocolViewerDialog } from "@/components/ProtocolViewerDialog";
import { TranscriptTextView } from "@/components/TranscriptTextView";
import { EnhancedSpeakerView } from "@/components/EnhancedSpeakerView";
import { SyncedTranscriptView } from "@/components/SyncedTranscriptView";
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
  speakerNames?: Record<string, string>;
  speakerBlocksCleaned?: Array<{ speakerId: string; speakerName: string | null; text: string; start?: number; end?: number }>;
}

const MeetingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { userPlan, incrementMeetingCount, isAdmin } = useSubscription();

  // Check if we're starting in recording mode (from navigation state)
  const locationState = location.state as { startRecording?: boolean; isFreeTrialMode?: boolean; selectedLanguage?: 'sv-SE' | 'en-US' } | null;
  const [isRecordingMode, setIsRecordingMode] = useState(locationState?.startRecording === true);
  const isFreeTrialMode = locationState?.isFreeTrialMode || false;
  const selectedLanguage = locationState?.selectedLanguage || 'sv-SE';

  // Determine if user has ASR access (Enterprise or Admin)
  // NOTE: plan can be non-string at runtime; coerce defensively.
  const useAsrMode = isAdmin || (String((userPlan as any)?.plan ?? '').toLowerCase() === 'enterprise');

  const [meeting, setMeeting] = useState<MeetingSession | null>(null);
  const [isLoading, setIsLoading] = useState(!isRecordingMode); // Skip loading if starting in recording mode
  const [status, setStatus] = useState<'uploading' | 'queued' | 'processing' | 'done' | 'failed' | 'recording' | null>(isRecordingMode ? 'recording' : null);
  const [stage, setStage] = useState<'uploading' | 'queued' | 'transcribing' | 'sis_processing' | 'done' | 'error' | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptRaw, setTranscriptRaw] = useState<string | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<ASRTranscriptSegment[] | null>(null);
  const [reconstructedSegments, setReconstructedSegments] = useState<ReconstructedSegment[] | null>(null);
  const [speakerBlocksCleaned, setSpeakerBlocksCleaned] = useState<Array<{ speakerId: string; speakerName: string | null; text: string; start?: number; end?: number }> | null>(null);
  const [speakerBlocksRaw, setSpeakerBlocksRaw] = useState<Array<{ speakerId: string; speakerName: string | null; text: string; start?: number; end?: number }> | null>(null);
  const [lyraSpeakers, setLyraSpeakers] = useState<SISSpeaker[]>([]);
  const [lyraMatches, setLyraMatches] = useState<SISMatch[]>([]);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [speakerNamesLoading, setSpeakerNamesLoading] = useState(false);
  const [lyraLearning, setLyraLearning] = useState<LyraLearningEntry[]>([]);
  const [isSISDisabled, setIsSISDisabled] = useState(false);
  
  // Meeting title state (for editing in recording mode)
  const [meetingTitle, setMeetingTitle] = useState('Namnlöst möte');
  
  // Queue and upload progress state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [backendProgress, setBackendProgress] = useState<number | undefined>(undefined);
  const [queueMetadata, setQueueMetadata] = useState<QueueMetadata | undefined>(undefined);
  const [fileSize, setFileSize] = useState<number>(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAgendaDialog, setShowAgendaDialog] = useState(false);
  const [pendingMeetingData, setPendingMeetingData] = useState<MeetingDataForDialog | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<{ transcript: string; aiProtocol: any } | null>(null);
  
  // Unified editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [editedSpeakerNames, setEditedSpeakerNames] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSpeakers, setShowSpeakers] = useState(true);
  const [hasManualTranscript, setHasManualTranscript] = useState(false);
  // Prevent initial polling/toasts from firing before we have resolved meeting + ASR state on first load.
  const [initialStatusResolved, setInitialStatusResolved] = useState(false);

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
  const [showSpeakerNameConfirm, setShowSpeakerNameConfirm] = useState(false);

  // Audio backup failsafe state - server-side copy of original recording
  const [audioBackup, setAudioBackup] = useState<AudioBackup | null>(null);
  const [isDownloadingAudio, setIsDownloadingAudio] = useState(false);
  const [isRetryingTranscription, setIsRetryingTranscription] = useState(false);

  // Word-level timing for synced transcript view
  const [transcriptWords, setTranscriptWords] = useState<TranscriptWord[]>([]);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioIsPlaying, setAudioIsPlaying] = useState(false);
  const [audioSeekTo, setAudioSeekTo] = useState<number | undefined>(undefined);

  // Speaker identification UX thresholds (per docs)
  const SIS_DISPLAY_THRESHOLD_PERCENT = 75;
  const getSISVerificationLabel = (percent: number) => {
    if (percent >= 92) return 'Stark verifiering';
    if (percent >= 85) return 'Verifierad';
    if (percent >= 75) return 'Trolig';
    return 'Okänd';
  };

  // Protocol limits: 2 generations per meeting (1 initial + 1 replacement)
  const maxProtocolGenerations = 2;
  const [backendProtocolCount, setBackendProtocolCount] = useState<number>(0);
  const protocolCountUsed = backendProtocolCount;
  const protocolCountRemaining = Math.max(0, maxProtocolGenerations - protocolCountUsed);
  const canGenerateMoreProtocols = protocolCountUsed < maxProtocolGenerations;

  const pollingRef = useRef(false);
  const transcriptionDoneRef = useRef(false);

  // Recording mode handlers - defined early to satisfy hooks rules
  const handleRecordingComplete = useCallback(() => {
    setIsRecordingMode(false);
    setStatus('processing');
    setIsLoading(false);
    
    // Reload meeting data to start polling
    if (id) {
      const loadAfterRecording = async () => {
        try {
          const fetchedMeeting = await meetingStorage.getMeeting(id);
          if (fetchedMeeting) {
            setMeeting(fetchedMeeting);
            setMeetingTitle(fetchedMeeting.title);
          }
        } catch (e) {
          console.warn('Could not reload meeting after recording:', e);
        }
      };
      loadAfterRecording();
    }
  }, [id]);

  const handleRecordingCancel = useCallback(() => {
    // Delete the pre-created meeting and go back
    if (id) {
      meetingStorage.deleteMeeting(id).catch(console.warn);
    }
    navigate('/');
  }, [id, navigate]);

  const handleRecordingTitleChange = useCallback((newTitle: string) => {
    setMeetingTitle(newTitle);
    if (meeting) {
      setMeeting({ ...meeting, title: newTitle });
    }
  }, [meeting]);

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

  // Load meeting data (skip if in recording mode - data not needed yet)
  useEffect(() => {
    if (!id || !user || isRecordingMode) return;

    // Reset gate on mount / meeting id change
    setInitialStatusResolved(false);

    const loadMeeting = async () => {
      setIsLoading(true);
      
      // Resolve backend alias if upload returned a different ID
      const resolvedId = resolveBackendMeetingId(id);
      if (resolvedId !== id) {
        console.log('📋 Meeting detail: using resolved backend ID:', { original: id, resolved: resolvedId });
      }

      // If the user has manually edited the transcript, we should NOT show speaker segmentation.
      // Persisted in localStorage so it survives refresh.
      const transcriptEditedKeyA = `meeting_transcript_edited_${id}`;
      const transcriptEditedKeyB = `meeting_transcript_edited_${resolvedId}`;
      const isManualTranscript =
        localStorage.getItem(transcriptEditedKeyA) === '1' || localStorage.getItem(transcriptEditedKeyB) === '1';
      setHasManualTranscript(isManualTranscript);
      
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
          
          // NOTE: We defer loading segments until we know if SIS is disabled
          // This happens in the ASR status fetch below
          if (isManualTranscript) {
            setTranscriptSegments(null);
            setReconstructedSegments(null);
          }
          
          if (fetchedMeeting.transcript && fetchedMeeting.transcript.trim().length > 0) {
            setTranscript(fetchedMeeting.transcript);
            setStatus('done');
            
            // CRITICAL: Fetch speaker names from dedicated endpoint FIRST
            // This ensures user-edited names are captured before ASR status overwrites them
            let dedicatedSpeakerNames: Record<string, string> = {};
            try {
              console.log('🔄 [InitialLoad] Fetching speaker names from dedicated endpoint...');
              const namesData = await backendApi.getSpeakerNames(id);
              if (namesData.speakerNames && Object.keys(namesData.speakerNames).length > 0) {
                console.log('✅ [InitialLoad] Dedicated speaker names:', namesData.speakerNames);
                dedicatedSpeakerNames = namesData.speakerNames;
              }
            } catch (e) {
              console.log('Could not fetch speaker names from dedicated endpoint:', e);
            }
            
            // ALWAYS fetch ASR/SIS status for completed meetings to check if SIS is disabled
            try {
              const asrStatus = await pollASRStatus(id);

              // Check if SIS/LYRA is disabled - this is critical for UI decisions
              const sisDisabled = asrStatus.lyraStatus === 'disabled' || asrStatus.sisStatus === 'disabled';
              setIsSISDisabled(sisDisabled);

              // Always load speaker identification metadata (useful for UI and naming)
              setLyraSpeakers(asrStatus.lyraSpeakers || asrStatus.sisSpeakers || []);
              setLyraMatches(asrStatus.lyraMatches || asrStatus.sisMatches || []);
              
              // CRITICAL: Merge ASR speaker names with dedicated endpoint names
              // Dedicated endpoint names take priority (user-edited)
              const asrSpeakerNames = asrStatus.lyraSpeakerNames || asrStatus.speakerNames || {};
              const mergedSpeakerNames = { ...asrSpeakerNames, ...dedicatedSpeakerNames };
              console.log('🔀 [InitialLoad] Merged speaker names:', { asr: asrSpeakerNames, dedicated: dedicatedSpeakerNames, merged: mergedSpeakerNames });
              setSpeakerNames(mergedSpeakerNames);
              
              setLyraLearning(asrStatus.lyraLearning || asrStatus.sisLearning || []);
              
              // Capture transcript cleanup fields (raw/cleaned + speaker blocks)
              if (asrStatus.transcriptRaw) {
                setTranscriptRaw(asrStatus.transcriptRaw);
              }
              if (asrStatus.speakerBlocksCleaned) {
                setSpeakerBlocksCleaned(asrStatus.speakerBlocksCleaned);
              }
              if (asrStatus.speakerBlocksRaw) {
                setSpeakerBlocksRaw(asrStatus.speakerBlocksRaw);
              }
              
              // Capture audio backup failsafe info - available even for completed meetings
              if (asrStatus.audioBackup?.available) {
                setAudioBackup(asrStatus.audioBackup);
              }

              // Only hydrate segmentation when transcript is NOT manually edited and SIS is not disabled
              if (!isManualTranscript && !sisDisabled) {
                if (asrStatus.transcriptSegments && asrStatus.transcriptSegments.length > 0) {
                  setTranscriptSegments(asrStatus.transcriptSegments);
                }
                if (asrStatus.reconstructedSegments && asrStatus.reconstructedSegments.length > 0) {
                  setReconstructedSegments(asrStatus.reconstructedSegments);
                }
              }
              
              // Capture word-level timing for synced playback
              if (asrStatus.words && asrStatus.words.length > 0) {
                setTranscriptWords(asrStatus.words);
              }
            } catch (e) {
              console.log('Could not fetch ASR data for completed meeting:', e);
              // Even if ASR fails, still apply dedicated speaker names
              if (Object.keys(dedicatedSpeakerNames).length > 0) {
                setSpeakerNames(dedicatedSpeakerNames);
              }
            }
          } else {
            // No transcript yet - check ASR status to determine if failed or still processing
            // CRITICAL: This prevents restart of transcription polling on page refresh for failed meetings
            try {
              const asrStatus = await pollASRStatus(id);
              console.log('📊 Initial ASR status check (no transcript):', asrStatus.status, asrStatus.stage);
              
              // Capture audio backup failsafe info - available even for failed meetings
              if (asrStatus.audioBackup?.available) {
                setAudioBackup(asrStatus.audioBackup);
              }
              
              if (asrStatus.status === 'error' || asrStatus.status === 'failed') {
                // Transcription failed - show failed state, don't start polling
                console.log('📛 Meeting has failed transcription - showing failed state');
                // Mark failure toast as already handled for this meeting so navigating/reloading doesn't show it again.
                localStorage.setItem(`transcription_fail_toast_shown_${id}`,'true');
                localStorage.setItem(`transcription_fail_toast_shown_${resolvedId}`,'true');
                setStatus('failed');
                setStage('error');
                transcriptionDoneRef.current = true; // Prevent polling from starting
              } else if (asrStatus.status === 'completed' || asrStatus.status === 'done') {
                // Actually completed but meeting object didn't have transcript - update it
                if (asrStatus.transcript) {
                  setTranscript(asrStatus.transcript);
                  setTranscriptSegments(asrStatus.transcriptSegments || null);
                  setReconstructedSegments(asrStatus.reconstructedSegments || null);
                  setLyraSpeakers(asrStatus.lyraSpeakers || asrStatus.sisSpeakers || []);
                  setLyraMatches(asrStatus.lyraMatches || asrStatus.sisMatches || []);
                  
                  // Fetch dedicated speaker names endpoint and merge with ASR names
                  const fallbackAsrNames = asrStatus.lyraSpeakerNames || asrStatus.speakerNames || {};
                  try {
                    console.log('🔄 [FallbackLoad] Fetching speaker names from dedicated endpoint...');
                    const fallbackNamesData = await backendApi.getSpeakerNames(id);
                    if (fallbackNamesData.speakerNames && Object.keys(fallbackNamesData.speakerNames).length > 0) {
                      console.log('✅ [FallbackLoad] Dedicated speaker names:', fallbackNamesData.speakerNames);
                      setSpeakerNames({ ...fallbackAsrNames, ...fallbackNamesData.speakerNames });
                    } else {
                      setSpeakerNames(fallbackAsrNames);
                    }
                  } catch (fallbackSpeakerNamesError) {
                    console.log('Could not fetch speaker names:', fallbackSpeakerNamesError);
                    setSpeakerNames(fallbackAsrNames);
                  }
                  
                  setLyraLearning(asrStatus.lyraLearning || asrStatus.sisLearning || []);
                  setStatus('done');
                  transcriptionDoneRef.current = true;
                } else {
                  // Edge case: marked done but no transcript
                  setStatus('failed');
                  transcriptionDoneRef.current = true;
                }
              } else {
                // Still processing - allow polling to continue
                setStatus('processing');
                if (asrStatus.stage) {
                  setStage(asrStatus.stage);
                }
                if (typeof asrStatus.progress === 'number') {
                  setBackendProgress(asrStatus.progress);
                }
                if (asrStatus.metadata) {
                  setQueueMetadata(asrStatus.metadata);
                }
              }
            } catch (e) {
              console.log('Could not fetch initial ASR status, defaulting to processing:', e);
              setStatus('processing');
            }
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
        setInitialStatusResolved(true);
      }
    };

    loadMeeting();
  }, [id, user, navigate, toast]);

  // Load protocol data and count when meeting has a protocol
  useEffect(() => {
    const loadProtocolData = async () => {
      if (!id) return;
      
      // CRITICAL: Always fetch the latest protocol count from backend endpoint
      try {
        const countData = await meetingStorage.getProtocolCount(id);
        console.log('📊 Fresh protocol count from backend:', countData);
        setBackendProtocolCount(countData);
      } catch (error) {
        console.log('Could not load protocol count:', error);
        setBackendProtocolCount(0);
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
      
      // Track upload progress and file size
      setUploadProgress(uploadStatus.progress || 0);
      if (uploadStatus.file?.size) {
        setFileSize(uploadStatus.file.size);
      }
      
      if (uploadStatus.status === 'complete') {
        setStatus('queued'); // After upload, job goes to queue
        setUploadProgress(100);
      } else if (uploadStatus.status === 'error') {
        setStatus('failed');
      } else {
        setStatus('uploading');
        setStage('uploading');
      }
    });

    return () => { unsubscribe(); };
  }, [id]);

  // Poll for transcription status
  useEffect(() => {
    if (!id || !user || !initialStatusResolved || transcriptionDoneRef.current) return;
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
        
        // Update queue metadata from backend
        if (asrStatus.metadata) {
          setQueueMetadata(asrStatus.metadata);
        }
        
        // Update backend progress if available
        if (typeof asrStatus.progress === 'number') {
          setBackendProgress(asrStatus.progress);
        }
        
        // Capture audio backup failsafe info - available even during processing/error
        if (asrStatus.audioBackup?.available) {
          setAudioBackup(asrStatus.audioBackup);
        }
        
        // Update status based on ASR response
        if (asrStatus.status === 'queued') {
          setStatus('queued');
        } else if (asrStatus.status === 'processing' || asrStatus.stage === 'transcribing' || asrStatus.stage === 'sis_processing') {
          setStatus('processing');
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

          // Fresh ASR result overrides any previous manual transcript edit
          localStorage.removeItem(`meeting_transcript_edited_${id}`);
          localStorage.removeItem(`meeting_transcript_edited_${resolveBackendMeetingId(id)}`);
          setHasManualTranscript(false);

          const newTranscript = asrStatus.transcript || '';
          setTranscript(newTranscript);
          setTranscriptRaw(asrStatus.transcriptRaw || null);
          setTranscriptSegments(asrStatus.transcriptSegments || null);
          // Use reconstructed segments as the source of truth for speaker turns
          setReconstructedSegments(asrStatus.reconstructedSegments || null);
          setSpeakerBlocksCleaned(asrStatus.speakerBlocksCleaned || null);
          setSpeakerBlocksRaw(asrStatus.speakerBlocksRaw || null);
          setLyraSpeakers(asrStatus.lyraSpeakers || asrStatus.sisSpeakers || []);
          setLyraMatches(asrStatus.lyraMatches || asrStatus.sisMatches || []);
          
          // CRITICAL: Fetch speaker names from dedicated endpoint FIRST, then merge with ASR names
          // Dedicated endpoint has user-edited names which should take priority
          const asrSpeakerNames = asrStatus.lyraSpeakerNames || asrStatus.speakerNames || {};
          
          // Set initial ASR names immediately so transcript renders
          setSpeakerNames(asrSpeakerNames);
          
          // Check if Lyra is still processing or if we should wait for name updates
          const lyraActive = asrStatus.lyraStatus === 'processing' || asrStatus.lyraStatus === 'done';
          const sisActive = asrStatus.sisStatus === 'processing' || asrStatus.sisStatus === 'done';
          const shouldWaitForNames = lyraActive || sisActive;
          
          if (shouldWaitForNames) {
            // Show loading indicator for speaker names
            setSpeakerNamesLoading(true);
          }
          
          // Helper to fetch and merge speaker names
          const fetchAndMergeSpeakerNames = async (logPrefix: string, isFinal: boolean = false): Promise<boolean> => {
            try {
              console.log(`🔄 [${logPrefix}] Fetching speaker names from dedicated endpoint...`);
              const namesData = await backendApi.getSpeakerNames(id);
              if (namesData.speakerNames && Object.keys(namesData.speakerNames).length > 0) {
                console.log(`✅ [${logPrefix}] Merging speaker names:`, { asr: asrSpeakerNames, dedicated: namesData.speakerNames });
                // Merge: ASR names as base, dedicated endpoint overwrites
                setSpeakerNames(prev => ({ ...asrSpeakerNames, ...prev, ...namesData.speakerNames }));
                // If we got real names, stop showing loading
                setSpeakerNamesLoading(false);
                return true;
              }
              if (isFinal) {
                // Last fetch attempt, stop loading regardless
                setSpeakerNamesLoading(false);
              }
              return false;
            } catch (speakerNamesError) {
              console.log(`Could not fetch speaker names (${logPrefix}):`, speakerNamesError);
              if (isFinal) {
                setSpeakerNamesLoading(false);
              }
              return false;
            }
          };
          
          // Initial fetch
          await fetchAndMergeSpeakerNames('PollingComplete');
          
          // CRITICAL: Schedule delayed re-fetches to catch backend updates (every 1s)
          // Backend may still be processing speaker names after ASR completes
          const delayedFetches = [1000, 2000, 3000, 5000, 8000]; // 1s, 2s, 3s, 5s, 8s after completion
          delayedFetches.forEach((delay, idx) => {
            const isFinal = idx === delayedFetches.length - 1;
            setTimeout(() => {
              console.log(`⏰ [DelayedRefetch ${idx + 1}] Re-fetching speaker names after ${delay}ms...`);
              fetchAndMergeSpeakerNames(`DelayedRefetch-${delay}ms`, isFinal);
            }, delay);
          });
          
          setLyraLearning(asrStatus.lyraLearning || asrStatus.sisLearning || []);
          setIsSISDisabled(sisDisabled);
          
          // Capture word-level timing for synced playback
          if (asrStatus.words && asrStatus.words.length > 0) {
            setTranscriptWords(asrStatus.words);
          }
          
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
          
          // Only show failure toast once per meeting (like success toast).
          // Use both route ID and any resolved backend ID to avoid duplicate toasts when aliases are involved.
          const resolvedForToast = resolveBackendMeetingId(id);
          const failToastKeyA = `transcription_fail_toast_shown_${id}`;
          const failToastKeyB = `transcription_fail_toast_shown_${resolvedForToast}`;
          const alreadyShown = Boolean(localStorage.getItem(failToastKeyA) || localStorage.getItem(failToastKeyB));
          if (!alreadyShown) {
            localStorage.setItem(failToastKeyA, 'true');
            localStorage.setItem(failToastKeyB, 'true');
            const errorMsg = asrStatus.error 
              ? (typeof asrStatus.error === 'string' ? asrStatus.error : ((asrStatus.error as any)?.message || 'Försök igen.'))
              : 'Försök igen.';
            toast({
              title: 'Transkribering misslyckades',
              description: errorMsg,
              variant: 'destructive',
            });
          }
          return;
        }

        // Consistent 1s polling for responsiveness (as requested)
        const delay = 1000;
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
  }, [id, user, status, meeting, toast, incrementMeetingCount, initialStatusResolved]);

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

  // Download audio backup failsafe
  const handleDownloadAudioBackup = async () => {
    if (!id) return;
    setIsDownloadingAudio(true);
    try {
      await downloadAudioBackup(id, audioBackup?.downloadPath);
      toast({
        title: 'Nedladdning startad',
        description: 'Din ljudinspelning laddas ner.',
      });
    } catch (error: any) {
      toast({
        title: 'Nedladdning misslyckades',
        description: error?.message || 'Kunde inte ladda ner ljudfilen.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloadingAudio(false);
    }
  };

  // Retry transcription using server-side audio backup
  const handleRetryTranscription = async () => {
    if (!id) return;
    setIsRetryingTranscription(true);
    try {
      const result = await retryTranscriptionFromBackup(id, audioBackup?.downloadPath);
      if (result.success) {
        toast({
          title: 'Transkribering startad',
          description: 'Din inspelning transkriberas på nytt.',
        });
        // Clear fail toast flag so it shows again if retry also fails
        localStorage.removeItem(`transcription_fail_toast_shown_${id}`);
        // Reset status to trigger polling again
        setStatus('processing');
        setStage('transcribing');
        transcriptionDoneRef.current = false;
        pollingRef.current = true;
      } else {
        throw new Error(result.error || 'Kunde inte starta om transkribering');
      }
    } catch (error: any) {
      toast({
        title: 'Kunde inte starta om',
        description: error?.message || 'Försök igen om en stund.',
        variant: 'destructive',
      });
    } finally {
      setIsRetryingTranscription(false);
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
      // Save transcript if changed - use normalized comparison to avoid false positives from whitespace
      const normalizedEdited = editedTranscript.replace(/\s+/g, ' ').trim();
      const normalizedOriginal = (transcript || '').replace(/\s+/g, ' ').trim();
      const transcriptChanged = normalizedEdited !== normalizedOriginal;

      if (transcriptChanged) {
        await apiClient.updateMeeting(id, { transcript: editedTranscript.trim() });
        setTranscript(editedTranscript.trim());
        setMeeting(prev => prev ? { ...prev, transcript: editedTranscript.trim(), updatedAt: new Date().toISOString() } : prev);

        // Mark transcript as manually edited (persist so refresh doesn't re-enable segments)
        localStorage.setItem(`meeting_transcript_edited_${id}`, '1');
        localStorage.setItem(`meeting_transcript_edited_${resolveBackendMeetingId(id)}`, '1');
        setHasManualTranscript(true);

        // Clear ALL segment data when transcript text is manually edited
        setTranscriptSegments(null);
        setReconstructedSegments(null);
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
      if (!canGenerateMoreProtocols) {
        toast({
          title: 'Gräns nådd',
          description: `Du har använt din protokollgenerering för detta möte.`,
          variant: 'destructive',
        });
        return;
      }
      setShowReplaceProtocolConfirm(true);
      return;
    }

    // Defensive: SIS kan vara avstängt även om state inte hunnit uppdateras ännu.
    // Om backend säger "disabled" ska vi INTE visa dialogen "Talarnamn saknas".
    if (!isSISDisabled) {
      try {
        const asrStatus = await pollASRStatus(meeting.id);
        const sisDisabledNow =
          (asrStatus as any)?.lyraStatus === 'disabled' || (asrStatus as any)?.sisStatus === 'disabled';

        if (sisDisabledNow) {
          setIsSISDisabled(true);
          await proceedWithProtocolGeneration();
          return;
        }
      } catch (e) {
        // Ignore - fall back to existing UX
      }
    }

    // Check if speakers have generic names - show confirmation if so
    // SKIP this check entirely when SIS is disabled (no speaker segmentation = no speaker names to warn about)
    if (!isSISDisabled) {
      const hasGenericNames = (() => {
        const allSpeakerLabels = new Set<string>();

        // SIS/LYRA-derived labels (when available)
        lyraMatches.forEach((m) => (m as any)?.speakerLabel != null && allSpeakerLabels.add(String((m as any).speakerLabel)));
        lyraSpeakers.forEach((s) => (s as any)?.label != null && allSpeakerLabels.add(String((s as any).label)));

        // transcriptSegments speaker IDs
        if (transcriptSegments && transcriptSegments.length > 0) {
          transcriptSegments.forEach((seg) => {
            const raw = (seg as any)?.speakerId;
            if (raw != null) allSpeakerLabels.add(String(raw));
          });
        }

        // reconstructedSegments speaker IDs
        if (reconstructedSegments && reconstructedSegments.length > 0) {
          reconstructedSegments.forEach((seg) => {
            const raw = (seg as any)?.speaker;
            if (raw != null) allSpeakerLabels.add(String(raw));
          });
        }

        // Transcript-embedded labels, e.g. "Talare 1:", "speaker_0:", "[Talare 1]:"
        const transcriptText = transcript ?? "";
        const transcriptLabelPattern =
          /(^|\n)\s*(\[(?:talare|speaker)[_\s-]?\d+\]|\b(?:talare|speaker)[_\s-]?\d+)\s*[:\-]/gi;

        let match: RegExpExecArray | null;
        while ((match = transcriptLabelPattern.exec(transcriptText)) !== null) {
          const raw = match[2] ?? "";
          const label = raw.replace(/[\[\]]/g, "").trim();
          if (label) allSpeakerLabels.add(label);
        }

        // If no speaker labels found at all, no generic names to warn about
        if (allSpeakerLabels.size === 0) return false;

        const genericPatterns = [/^(?:speaker|talare)[_\s-]?\d+$/i, /^unknown$/i, /^okänd$/i];

        const getCustomName = (label: string) => {
          const labelStr = String((label as any) ?? '');
          const lower = labelStr.toLowerCase();
          const underscored = labelStr.replace(/\s+/g, "_").toLowerCase();
          return speakerNames[labelStr] ?? speakerNames[lower] ?? speakerNames[underscored];
        };

        for (const label of allSpeakerLabels) {
          const customName = getCustomName(label);
          const nameToCheck = (customName ?? label).trim();
          const isGeneric = genericPatterns.some((p) => p.test(nameToCheck));
          if (isGeneric) return true;
        }

        return false;
      })();

      if (hasGenericNames) {
        setShowSpeakerNameConfirm(true);
        return;
      }
    }

    await proceedWithProtocolGeneration();
  };

  // Confirm and proceed with protocol generation (after speaker name warning)
  const handleConfirmProtocolWithGenericNames = async () => {
    setShowSpeakerNameConfirm(false);
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
      speakerNames: Object.keys(speakerNames).length > 0 ? speakerNames : undefined,
      speakerBlocksCleaned: speakerBlocksCleaned && speakerBlocksCleaned.length > 0 ? speakerBlocksCleaned : undefined,
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
    
    // Double-check protocol count limit before proceeding
    if (!canGenerateMoreProtocols) {
      toast({
        title: 'Protokollgräns nådd',
        description: `Du har redan använt ${protocolCountUsed} av ${maxProtocolGenerations} protokollgenereringar för detta möte.`,
        variant: 'destructive',
      });
      setShowReplaceProtocolConfirm(false);
      return;
    }
    
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
  // NOTE: speakerId can be non-string at runtime (backend may return numbers/objects).
  const getSpeakerDisplayName = useCallback((speakerId: string, index?: number): string => {
    const fallbackName = `Talare ${(index ?? 0) + 1}`;

    const speakerIdStr = String((speakerId as any) ?? '');
    const speakerIdLower = speakerIdStr.toLowerCase().trim();

    if (!speakerIdStr || speakerIdLower === 'unknown') {
      return fallbackName;
    }

    const namesSource = isEditing ? editedSpeakerNames : speakerNames;

    if (namesSource[speakerIdStr]) {
      return namesSource[speakerIdStr];
    }

    const match = lyraMatches.find((m) => {
      const labelStr = String((m as any)?.speakerLabel ?? '');
      return labelStr === speakerIdStr || labelStr.toLowerCase() === speakerIdLower;
    });
    if (match && (match.confidencePercent ?? 0) >= SIS_DISPLAY_THRESHOLD_PERCENT) {
      if (match.speakerName) return match.speakerName;
      if (match.sampleOwnerEmail) return match.sampleOwnerEmail.split('@')[0];
    }

    const speaker = lyraSpeakers.find((s) => {
      const labelStr = String((s as any)?.label ?? '');
      return labelStr === speakerIdStr || labelStr.toLowerCase() === speakerIdLower;
    });
    const speakerConfidencePercent = speaker?.similarity != null ? Math.round(speaker.similarity * 100) : 0;
    if (speaker?.bestMatchEmail && speakerConfidencePercent >= SIS_DISPLAY_THRESHOLD_PERCENT) {
      if ((speaker as any).speakerName) return (speaker as any).speakerName;
      return speaker.bestMatchEmail.split('@')[0];
    }

    const numMatch = speakerIdStr.match(/(?:speaker_?|talare_?)(\d+)/i);
    if (numMatch) return `Talare ${parseInt(numMatch[1], 10) + 1}`;

    if (/^[A-Z]$/i.test(speakerIdStr)) {
      return `Talare ${speakerIdStr.toUpperCase()}`;
    }

    return fallbackName;
  }, [speakerNames, editedSpeakerNames, lyraMatches, lyraSpeakers, isEditing]);

  // Get confidence percent
  const getSpeakerConfidence = useCallback((speakerId: string): number | null => {
    const speakerIdStr = String((speakerId as any) ?? '');
    const speakerIdLower = speakerIdStr.toLowerCase().trim();

    const match = lyraMatches.find((m) => {
      const labelStr = String((m as any)?.speakerLabel ?? '');
      return labelStr === speakerIdStr || labelStr.toLowerCase() === speakerIdLower;
    });
    if (match?.confidencePercent) return match.confidencePercent;

    const speaker = lyraSpeakers.find((s) => {
      const labelStr = String((s as any)?.label ?? '');
      return labelStr === speakerIdStr || labelStr.toLowerCase() === speakerIdLower;
    });
    if (speaker?.similarity != null) return Math.round(speaker.similarity * 100);

    return null;
  }, [lyraMatches, lyraSpeakers]);

  // Check if speaker is identified
  const isSpeakerIdentified = useCallback((speakerId: string): boolean => {
    const speakerIdStr = String((speakerId as any) ?? '');
    const speakerIdLower = speakerIdStr.toLowerCase().trim();
    const ownerEmail = user?.email?.toLowerCase();

    if (ownerEmail) {
      if (lyraMatches.length === 1) {
        const m = lyraMatches[0];
        const labelLower = String((m as any)?.speakerLabel ?? '').toLowerCase().trim();
        const ownerLower = String((m as any)?.sampleOwnerEmail ?? '').toLowerCase();
        if (labelLower === speakerIdLower && ownerLower === ownerEmail) {
          return true;
        }
      }
      if (lyraSpeakers.length === 1) {
        const s = lyraSpeakers[0];
        const labelLower = String((s as any)?.label ?? '').toLowerCase().trim();
        const ownerLower = String((s as any)?.bestMatchEmail ?? '').toLowerCase();
        if (labelLower === speakerIdLower && ownerLower === ownerEmail) {
          return true;
        }
      }
    }

    return (
      lyraMatches.some((m) => {
        const labelStr = String((m as any)?.speakerLabel ?? '');
        return (labelStr === speakerIdStr || labelStr.toLowerCase() === speakerIdLower) && (m.confidencePercent ?? 0) >= SIS_DISPLAY_THRESHOLD_PERCENT;
      }) ||
      lyraSpeakers.some((s) => {
        const p = s.similarity != null ? Math.round(s.similarity * 100) : 0;
        const labelStr = String((s as any)?.label ?? '');
        return (labelStr === speakerIdStr || labelStr.toLowerCase() === speakerIdLower) && !!s.bestMatchEmail && p >= SIS_DISPLAY_THRESHOLD_PERCENT;
      })
    );
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


  const isProcessing = status === 'uploading' || status === 'queued' || status === 'processing';
  const hasTranscript = !!transcript && transcript.trim().length > 0;

  // Helper to get a nice speaker label like "Talare 1", "Talare 2"
  const getSpeakerFallbackName = (speakerId: string, index: number): string => {
    const speakerIdStr = String((speakerId as any) ?? '');
    const speakerIdLower = speakerIdStr.toLowerCase().trim();
    if (!speakerIdStr || speakerIdLower === 'unknown') {
      return `Talare ${index + 1}`;
    }
    const numMatch = speakerIdStr.match(/(?:speaker_?|talare_?)(\d+)/i);
    if (numMatch) return `Talare ${parseInt(numMatch[1], 10) + 1}`;
    if (/^[A-Z]$/i.test(speakerIdStr)) return `Talare ${speakerIdStr.toUpperCase()}`;
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

    // Helper for case-insensitive name lookup
    const getNameFromSource = (label: string, namesSource: Record<string, string>): string | undefined => {
      const labelStr = String((label as any) ?? '');
      // Direct match first
      if (namesSource[labelStr]) return namesSource[labelStr];
      // Case-insensitive match
      const lowerLabel = labelStr.toLowerCase();
      const matchKey = Object.keys(namesSource).find(k => k.toLowerCase() === lowerLabel);
      return matchKey ? namesSource[matchKey] : undefined;
    };

    // First add from lyraMatches (high confidence)
    for (const match of lyraMatches) {
      const label = String((match as any)?.speakerLabel ?? '');
      if (!label || processedLabels.has(label)) continue;
      
      const namesSource = isEditing ? editedSpeakerNames : speakerNames;
      const fallbackName = getSpeakerFallbackName(label, speakerIndex);
      const customName = getNameFromSource(label, namesSource);
      const name = customName || match.speakerName || match.sampleOwnerEmail?.split('@')[0] || fallbackName;
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
      const label = String((speaker as any)?.label ?? '');
      if (!label || processedLabels.has(label)) continue;
      
      const namesSource = isEditing ? editedSpeakerNames : speakerNames;
      const fallbackName = getSpeakerFallbackName(label, speakerIndex);
      const customName = getNameFromSource(label, namesSource);
      const name = customName || (speaker as any).speakerName || (speaker.bestMatchEmail ? speaker.bestMatchEmail.split('@')[0] : fallbackName);
      const confidence = speaker.similarity != null ? Math.round(speaker.similarity * 100) : 0;
      const learningEntry = lyraLearning.find(l => l.email === speaker.bestMatchEmail);
      const isIdentified = !!speaker.bestMatchEmail && confidence >= SIS_DISPLAY_THRESHOLD_PERCENT;
      
      speakers.push({
        label,
        name,
        confidence,
        learned: learningEntry?.updated || false,
        email: speaker.bestMatchEmail,
        isIdentified,
      });
      processedLabels.add(label);
      speakerIndex++;
    }

    // Add any unique speakers from segments that weren't in matches/speakers
    if (transcriptSegments) {
      const segmentLabels = new Set<string>();
      for (const seg of transcriptSegments) {
        const rawId = String((seg as any)?.speakerId ?? (seg as any)?.speaker ?? 'unknown');
        if (rawId && rawId.toLowerCase() !== 'unknown' && !processedLabels.has(rawId) && !segmentLabels.has(rawId)) {
          segmentLabels.add(rawId);
          const namesSource = isEditing ? editedSpeakerNames : speakerNames;
          const fallbackName = getSpeakerFallbackName(rawId, speakerIndex);
          const customName = getNameFromSource(rawId, namesSource);
          const name = customName || fallbackName;
          
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

    // If transcription is done and we found speakers from segments (even with SIS disabled),
    // OR if SIS is disabled but we have segment speakers, show them for editing
    // This allows users to name speakers even when SIS isn't running
    if (speakers.length === 0 && status === 'done' && hasTranscript) {
      // Check if we have any segment-based speakers
      if (transcriptSegments && transcriptSegments.length > 0) {
        const segmentLabels = new Set<string>();
        for (const seg of transcriptSegments) {
          const rawId = String((seg as any)?.speakerId ?? (seg as any)?.speaker ?? '');
          if (rawId && rawId.toLowerCase() !== 'unknown') {
            segmentLabels.add(rawId);
          }
        }
        
        // Add speakers found in segments
        let idx = 0;
        for (const label of segmentLabels) {
          const namesSource = isEditing ? editedSpeakerNames : speakerNames;
          const fallbackName = getSpeakerFallbackName(label, idx);
          const customName = getNameFromSource(label, namesSource);
          const name = customName || fallbackName;
          
          speakers.push({
            label,
            name,
            confidence: 0,
            learned: false,
            email: undefined,
            isIdentified: false,
          });
          idx++;
        }
      }
      
      // If still no speakers, create a default one (but only if SIS is NOT disabled)
      if (speakers.length === 0 && !isSISDisabled) {
        const defaultLabel = 'speaker_0';
        const namesSource = isEditing ? editedSpeakerNames : speakerNames;
        const customName = getNameFromSource(defaultLabel, namesSource);
        const name = customName || 'Talare 1';
        
        speakers.push({
          label: defaultLabel,
          name,
          confidence: 0,
          learned: false,
          email: undefined,
          isIdentified: false,
        });
      }
    }

    return speakers;
  })();

  // Find speaker at a given time using lyraSpeakers time segments (fallback only)
  const findSpeakerAtTime = (time: number): string => {
    for (const speaker of lyraSpeakers) {
      for (const seg of speaker.segments) {
        if (time >= seg.start && time <= seg.end) {
          return speaker.label;
        }
      }
    }
    return 'unknown';
  };

  // Use reconstructedSegments as source of truth when available.
  // IMPORTANT: Speaker segmentation should never show a different transcript than the canonical `transcript`.
  // If segment text looks out of sync (can happen depending on ASR stage / words payload), we re-slice the
  // canonical transcript across the segment timings instead of rendering potentially wrong segment text.
  const groupedSegments = (() => {
    if (hasManualTranscript) return [];

    // Strip speaker labels like "Talare 1:", "speaker_0:", "[Talare A]:" etc.
    const stripSpeakerLabels = (text: string): string => {
      if (!text) return '';
      return text
        // Remove leading speaker labels with various formats
        .replace(/(^|\n)\s*(\[?(?:talare|speaker)[_\s-]?[A-Z0-9]+\]?)\s*[:\-]\s*/gi, '$1')
        // Normalize multiple spaces/newlines
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Normalize text for comparison (strip labels, lowercase, normalize whitespace)
    const normalizeForCompare = (text: string): string => {
      return stripSpeakerLabels(text).toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    };

    // Check if segment texts match the canonical transcript
    // More robust check: compare word count AND content overlap
    const segmentsMatchTranscript = (segmentTexts: string[], fullTranscript: string): boolean => {
      const joined = normalizeForCompare(segmentTexts.join(' '));
      const full = normalizeForCompare(fullTranscript);

      // Empty check
      if (!joined || !full) return false;
      if (joined.length < 10 && full.length > 50) return false;

      // Length ratio check (allow 60-140% range for flexibility)
      const ratio = joined.length / Math.max(1, full.length);
      if (ratio < 0.6 || ratio > 1.4) return false;

      // Word count comparison
      const joinedWords = joined.split(/\s+/).filter(Boolean);
      const fullWords = full.split(/\s+/).filter(Boolean);
      const wordRatio = joinedWords.length / Math.max(1, fullWords.length);
      if (wordRatio < 0.6 || wordRatio > 1.4) return false;

      // Content overlap: check first and last N words match
      const checkWords = Math.min(10, Math.floor(joinedWords.length / 4));
      if (checkWords >= 3) {
        const firstMatch = joinedWords.slice(0, checkWords).join(' ') === fullWords.slice(0, checkWords).join(' ');
        const lastMatch = joinedWords.slice(-checkWords).join(' ') === fullWords.slice(-checkWords).join(' ');
        // If neither first nor last match, segments are likely wrong
        if (!firstMatch && !lastMatch) return false;
      }

      return true;
    };

    // Distribute canonical transcript text across segment timings proportionally
    const distributeTranscriptAcrossTimings = (
      segments: Array<{ speakerId: string; speakerName?: string; start: number; end: number }>,
      fullTranscript: string
    ): Array<{ speakerId: string; speakerName?: string; text: string; start: number; end: number }> => {
      // Extract words from canonical transcript
      const words = stripSpeakerLabels(fullTranscript)
        .split(/\s+/)
        .map((w) => w.trim())
        .filter(Boolean);

      if (segments.length === 0) return [];
      if (words.length === 0) {
        return segments.map((s) => ({ ...s, text: '' }));
      }

      // Calculate durations, handling missing/invalid timing
      const durations = segments.map((s) => {
        const start = typeof s.start === 'number' ? s.start : 0;
        const end = typeof s.end === 'number' ? s.end : start;
        return Math.max(0, end - start);
      });
      const totalDuration = durations.reduce((sum, d) => sum + d, 0);
      const totalWords = words.length;

      let wordIndex = 0;
      const out = segments.map((seg, i) => {
        const isLast = i === segments.length - 1;

        let count: number;
        if (isLast) {
          // Last segment gets all remaining words
          count = Math.max(0, totalWords - wordIndex);
        } else if (totalDuration > 0 && durations[i] > 0) {
          // Proportional distribution based on duration
          const proportion = durations[i] / totalDuration;
          count = Math.max(1, Math.round(proportion * totalWords));
          // Don't exceed remaining words
          count = Math.min(count, totalWords - wordIndex);
        } else {
          // No timing info: split evenly
          const remaining = segments.length - i;
          count = Math.max(1, Math.ceil((totalWords - wordIndex) / remaining));
        }

        const text = words.slice(wordIndex, wordIndex + count).join(' ');
        wordIndex += count;

        return { ...seg, text };
      });

      // Safety: append any leftover words to the last segment
      if (wordIndex < totalWords && out.length > 0) {
        const remaining = words.slice(wordIndex).join(' ');
        out[out.length - 1].text = `${out[out.length - 1].text} ${remaining}`.trim();
      }

      return out;
    };

    // Extract speaker timings from various segment sources
    const extractTimings = (
      segments: Array<{ speakerId?: string; speaker?: string; speakerName?: string; start?: number; end?: number }>
    ): Array<{ speakerId: string; speakerName?: string; start: number; end: number }> => {
      const result: Array<{ speakerId: string; speakerName?: string; start: number; end: number }> = [];
      
      for (const seg of segments) {
        let rawSpeakerId = (seg as any).speakerId || (seg as any).speaker || '';
        
        // If no speaker, try time-based matching from lyraSpeakers
        if (!rawSpeakerId || String(rawSpeakerId).toLowerCase() === 'unknown') {
          const start = typeof seg.start === 'number' ? seg.start : 0;
          const end = typeof seg.end === 'number' ? seg.end : start;
          const midpoint = (start + end) / 2;
          rawSpeakerId = findSpeakerAtTime(midpoint);
          if (rawSpeakerId === 'unknown') {
            rawSpeakerId = findSpeakerAtTime(start);
          }
        }
        
        const speakerId = String(rawSpeakerId).toLowerCase() === 'unknown' ? 'unknown' : rawSpeakerId;
        const start = typeof seg.start === 'number' ? seg.start : 0;
        const end = typeof seg.end === 'number' ? seg.end : start;
        
        result.push({
          speakerId,
          speakerName: (seg as any).speakerName,
          start,
          end,
        });
      }
      
      return result;
    };

    // Merge consecutive segments from same speaker
    const mergeConsecutiveSpeakers = (
      segments: Array<{ speakerId: string; speakerName?: string; text: string; start: number; end: number }>
    ): Array<{ speakerId: string; speakerName?: string; text: string; start: number; end: number }> => {
      if (segments.length === 0) return [];
      
      const merged: typeof segments = [];
      for (const seg of segments) {
        const prev = merged[merged.length - 1];
        if (prev && prev.speakerId === seg.speakerId) {
          prev.text = [prev.text, seg.text].filter(Boolean).join(' ');
          prev.end = seg.end;
        } else {
          merged.push({ ...seg });
        }
      }
      return merged;
    };

    // 1) Prefer reconstructedSegments (backend-prepared speaker turns)
    if (reconstructedSegments && reconstructedSegments.length > 0) {
      const base = reconstructedSegments.map((seg) => ({
        speakerId: seg.speaker || 'unknown',
        speakerName: seg.speakerName,
        text: seg.text || '',
        start: typeof seg.start === 'number' ? seg.start : 0,
        end: typeof seg.end === 'number' ? seg.end : 0,
      }));

      const hasText = base.some((s) => s.text.trim().length > 0);
      const canonicalTranscript = transcript?.trim() || '';

      // ALWAYS use canonical transcript if available - this ensures consistency
      if (canonicalTranscript) {
        // If segments have no text, or text doesn't match canonical, redistribute
        if (!hasText || !segmentsMatchTranscript(base.map((s) => s.text), canonicalTranscript)) {
          const timings = base.map(({ speakerId, speakerName, start, end }) => ({ speakerId, speakerName, start, end }));
          return mergeConsecutiveSpeakers(distributeTranscriptAcrossTimings(timings, canonicalTranscript));
        }
      }

      return mergeConsecutiveSpeakers(base);
    }

    // 2) Fallback: use transcriptSegments
    if (transcriptSegments && transcriptSegments.length > 0) {
      const timings = extractTimings(transcriptSegments as any[]);
      const canonicalTranscript = transcript?.trim() || '';

      if (canonicalTranscript && timings.length > 0) {
        // Check if segment texts match
        const segmentTexts = (transcriptSegments as any[]).map((s) => s.text || '').filter(Boolean);
        const hasText = segmentTexts.some((t) => t.trim().length > 0);
        
        if (!hasText || !segmentsMatchTranscript(segmentTexts, canonicalTranscript)) {
          return mergeConsecutiveSpeakers(distributeTranscriptAcrossTimings(timings, canonicalTranscript));
        }

        // Segments have matching text, use them directly
        const grouped = timings.map((t, i) => ({
          ...t,
          text: (transcriptSegments as any[])[i]?.text || '',
        }));
        return mergeConsecutiveSpeakers(grouped);
      }

      // No canonical transcript, use segment texts as-is
      const grouped = timings.map((t, i) => ({
        ...t,
        text: (transcriptSegments as any[])[i]?.text || '',
      }));
      return mergeConsecutiveSpeakers(grouped);
    }

    // 3) Fallback: use lyraSpeakers with segments and slice transcript proportionally
    if (lyraSpeakers.length > 0 && transcript?.trim()) {
      // Flatten all speaker segments
      const allSegments: { speaker: string; start: number; end: number }[] = [];
      for (const speaker of lyraSpeakers) {
        if (speaker.segments && speaker.segments.length > 0) {
          for (const seg of speaker.segments) {
            if (typeof seg.start === 'number' && typeof seg.end === 'number') {
              allSegments.push({ speaker: speaker.label, start: seg.start, end: seg.end });
            }
          }
        }
      }

      if (allSegments.length > 0) {
        allSegments.sort((a, b) => a.start - b.start);

        // Merge overlapping segments from same speaker
        const merged: { speaker: string; start: number; end: number }[] = [];
        for (const seg of allSegments) {
          const last = merged[merged.length - 1];
          if (last && last.speaker === seg.speaker && seg.start <= last.end + 0.1) {
            last.end = Math.max(last.end, seg.end);
          } else {
            merged.push({ ...seg });
          }
        }

        const timings = merged.map((s) => ({
          speakerId: s.speaker,
          speakerName: uniqueSpeakers.find((u) => 
            u.label && s.speaker && 
            String(u.label).toLowerCase() === String(s.speaker).toLowerCase()
          )?.name,
          start: s.start,
          end: s.end,
        }));

        return mergeConsecutiveSpeakers(distributeTranscriptAcrossTimings(timings, transcript.trim()));
      }
    }

    return [];
  })();

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
          .map((s) => String(s.speakerId || ''))
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
    const speakerIdStr = String((speakerId as any) ?? '');
    // Normalize the speaker ID for comparison
    const normalizedId = speakerIdStr.toLowerCase().trim();
    
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
      String((s as any).label ?? '').toLowerCase() === normalizedId
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
      String((m as any)?.speakerLabel ?? '').toLowerCase() === normalizedId
    );
    if (match?.speakerName) {
      return match.speakerName;
    }
    if (match?.sampleOwnerEmail) {
      return match.sampleOwnerEmail.split('@')[0];
    }
    
    // Check lyraSpeakers (case-insensitive)
    const speaker = lyraSpeakers.find(s => 
      String((s as any)?.label ?? '').toLowerCase() === normalizedId
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
    const numMatch = speakerIdStr.match(/(?:speaker_?|talare_?)(\d+)/i);
    if (numMatch) return `Talare ${parseInt(numMatch[1], 10) + 1}`;
    if (/^[A-Z]$/i.test(speakerIdStr)) return `Talare ${speakerIdStr.toUpperCase()}`;
    
    // Find index in unique speakers
    const idx = uniqueSpeakers.findIndex(s => String((s as any).label ?? '').toLowerCase() === normalizedId);
    return `Talare ${idx >= 0 ? idx + 1 : 1}`;
  };

  // Get speaker color class based on speaker index - includes border-left for clean linear design
  const getSpeakerColorClass = (speakerId: string): string => {
    const colors = [
      'border-l-blue-500 text-blue-600 dark:text-blue-400',
      'border-l-emerald-500 text-emerald-600 dark:text-emerald-400',
      'border-l-purple-500 text-purple-600 dark:text-purple-400',
      'border-l-amber-500 text-amber-600 dark:text-amber-400',
      'border-l-rose-500 text-rose-600 dark:text-rose-400',
      'border-l-cyan-500 text-cyan-600 dark:text-cyan-400',
    ];
    
    const normalizedId = String((speakerId as any) ?? '').toLowerCase().trim();
    
    if (!speakerId || normalizedId === 'unknown') {
      return 'border-l-muted-foreground/30 text-muted-foreground';
    }
    
    const idx = uniqueSpeakers.findIndex(s => String((s as any).label ?? '').toLowerCase() === normalizedId);
    return colors[idx >= 0 ? idx % colors.length : 0];
  };

  // Get dot color for speaker
  const getSpeakerDotClass = (speakerId: string): string => {
    const dots = [
      'bg-blue-500',
      'bg-emerald-500',
      'bg-purple-500',
      'bg-amber-500',
      'bg-rose-500',
      'bg-cyan-500',
    ];
    
    const normalizedId = String((speakerId as any) ?? '').toLowerCase().trim();
    
    if (!speakerId || normalizedId === 'unknown') {
      return 'bg-muted-foreground/50';
    }
    
    const idx = uniqueSpeakers.findIndex(s => String((s as any).label ?? '').toLowerCase() === normalizedId);
    return dots[idx >= 0 ? idx % dots.length : 0];
  };

  // Get text color class for speaker name
  const getSpeakerTextClass = (speakerId: string): string => {
    const textColors = [
      'text-blue-600 dark:text-blue-400',
      'text-emerald-600 dark:text-emerald-400',
      'text-purple-600 dark:text-purple-400',
      'text-amber-600 dark:text-amber-400',
      'text-rose-600 dark:text-rose-400',
      'text-cyan-600 dark:text-cyan-400',
    ];
    
    const normalizedId = String((speakerId as any) ?? '').toLowerCase().trim();
    
    if (!speakerId || normalizedId === 'unknown') {
      return 'text-muted-foreground';
    }
    
    const idx = uniqueSpeakers.findIndex(s => String((s as any).label ?? '').toLowerCase() === normalizedId);
    return textColors[idx >= 0 ? idx % textColors.length : 0];
  };

  const displayTranscript = isEditing ? editedTranscript : (transcript || '');
  
  // Only show segmented view if:
  // 1. Not editing
  // 2. SIS is NOT disabled (companies with SIS off should see plain text)
  // 3. We have segments with text
  const hasSegments =
    !isEditing &&
    !isSISDisabled &&
    groupedSegments.length > 0 &&
    groupedSegments.some((s) => (s as any)?.text && String((s as any).text).trim().length > 0);

  // Check if we have enhanced speaker blocks from backend (new format with speakerId, text, start, end)
  const hasSpeakerBlocks = 
    !isEditing &&
    !isSISDisabled &&
    ((speakerBlocksCleaned && speakerBlocksCleaned.length > 0) || 
     (speakerBlocksRaw && speakerBlocksRaw.length > 0));

  // Recording mode view - full-screen recorder
  if (isRecordingMode && id) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
        <MeetingRecorder
          meetingId={id}
          meetingTitle={meetingTitle}
          onTitleChange={handleRecordingTitleChange}
          onRecordingComplete={handleRecordingComplete}
          onCancel={handleRecordingCancel}
          useAsrMode={useAsrMode}
          language={selectedLanguage === 'en-US' ? 'en' : 'sv'}
        />
      </div>
    );
  }

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
            <h1 className="font-semibold text-base truncate">{meeting?.title || meetingTitle || 'Laddar...'}</h1>
            {meeting && (
              <p className="text-xs text-muted-foreground">
                {formatDate(meeting.createdAt)} • {formatTime(meeting.createdAt)}
              </p>
            )}
          </div>

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
                className="flex flex-col items-center justify-center py-16 gap-8"
              >
                {/* Animated background orb */}
                <div className="relative">
                  <motion.div 
                    animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
                    transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                    className="absolute inset-0 bg-gradient-to-br from-primary/30 to-accent/30 rounded-full blur-2xl w-32 h-32 -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2"
                  />
                </div>
                
                {/* Simple processing message */}
                <ProcessingStatusMessage />
                
                {/* Audio backup failsafe */}
                <div className="flex flex-col items-center gap-3">
                  
                  {/* Audio backup indicator - visible during processing */}
                  {audioBackup?.available && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card/50 border border-border/30">
                      <Badge variant="outline" className="gap-1 text-green-600 border-green-500/30 bg-green-500/5 text-xs">
                        <CheckCircle2 className="w-3 h-3" />
                        Ljud säkrat
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDownloadAudioBackup}
                        disabled={isDownloadingAudio}
                        className="gap-1.5 h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                      >
                        {isDownloadingAudio ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        Ladda ner
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : status === 'failed' ? (
              <motion.div
                key="failed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 sm:py-24"
              >
                {/* Minimal failed state */}
                <div className="w-full max-w-sm space-y-8">
                  {/* Icon and status */}
                  <div className="text-center space-y-3">
                    <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                      <AlertCircle className="w-7 h-7 text-destructive" />
                    </div>
                    <div>
                      <h2 className="text-lg font-medium">Transkribering misslyckades</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {audioBackup?.available 
                          ? 'Din inspelning är säkrad'
                          : 'Ladda upp filen igen'
                        }
                      </p>
                    </div>
                  </div>
                  
                  {/* Action buttons - primary focus on retry */}
                  {audioBackup?.available && (
                    <div className="space-y-3">
                      <Button
                        onClick={handleRetryTranscription}
                        disabled={isRetryingTranscription}
                        className="w-full h-12 gap-2 rounded-xl"
                        size="lg"
                      >
                        {isRetryingTranscription ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Startar...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            Försök igen
                          </>
                        )}
                      </Button>
                      
                      <Button
                        onClick={handleDownloadAudioBackup}
                        disabled={isDownloadingAudio}
                        variant="ghost"
                        className="w-full gap-2 text-muted-foreground"
                      >
                        {isDownloadingAudio ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Ladda ner inspelning
                      </Button>
                    </div>
                  )}
                  
                  {/* File info - subtle */}
                  {audioBackup?.available && (
                    <div className="text-center text-xs text-muted-foreground/60 space-y-0.5">
                      <p>{audioBackup.originalName || 'inspelning.wav'}</p>
                      {audioBackup.sizeBytes && (
                        <p>{(audioBackup.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>
                      )}
                    </div>
                  )}
                  
                  {/* Back link */}
                  <div className="text-center pt-4">
                    <Button 
                      onClick={() => navigate('/library')} 
                      variant="link" 
                      className="text-muted-foreground text-sm"
                    >
                      ← Tillbaka till biblioteket
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : hasTranscript ? (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Protocol Section - MOVED TO TOP for prominence */}
                {protocolData && !isEditing && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-card/50 to-card/50 backdrop-blur-sm overflow-hidden shadow-lg"
                  >
                    <div className="px-5 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <span className="font-semibold text-base">Protokoll</span>
                          <p className="text-xs text-muted-foreground">
                            Sparat {new Date(protocolData.storedAt).toLocaleDateString('sv-SE')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={handleViewProtocol}
                          size="sm"
                          variant="secondary"
                          className="gap-1.5 h-9"
                        >
                          <Eye className="w-4 h-4" />
                          Visa
                        </Button>
                        <Button
                          onClick={handleDownloadProtocol}
                          size="sm"
                          variant="outline"
                          className="gap-1.5 h-9"
                        >
                          <Download className="w-4 h-4" />
                          Ladda ner
                        </Button>
                        <Button
                          onClick={() => setShowDeleteProtocolConfirm(true)}
                          size="sm"
                          variant="ghost"
                          className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                          title="Ta bort protokoll"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Quick Actions Bar - Create/Replace Protocol */}
                {!isEditing && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden"
                  >
                    <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Primary action - Create/Replace Protocol */}
                      <Button
                        onClick={handleCreateProtocol}
                        variant={protocolData ? "outline" : "default"}
                        className="gap-2 h-11 text-sm font-medium sm:flex-1"
                        disabled={loadingProtocol || !canGenerateMoreProtocols}
                      >
                        {loadingProtocol ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : !canGenerateMoreProtocols ? (
                          <Lock className="w-4 h-4" />
                        ) : protocolData ? (
                          <RefreshCw className="w-4 h-4" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        {!canGenerateMoreProtocols 
                          ? 'Gräns nådd'
                          : protocolData 
                            ? 'Ersätt protokoll'
                            : 'Skapa protokoll med AI'
                        }
                      </Button>
                      
                      {!isSISDisabled && (
                        <Badge variant="secondary" className="text-xs px-2.5 py-1.5 shrink-0">
                          {protocolCountRemaining > 0 
                            ? `${protocolCountRemaining} av ${maxProtocolGenerations} kvar`
                            : `0 av ${maxProtocolGenerations} kvar`
                          }
                        </Badge>
                      )}

                      {/* Secondary actions */}
                      <div className="flex items-center gap-1 sm:ml-auto">
                        {hasPlusAccess(user, userPlan) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/chat?meeting=${meeting.id}`)}
                            className="gap-1.5 text-xs h-9"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Chatta</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="gap-1.5 text-xs h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Ta bort</span>
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Status Bar - Compact */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Badge variant="outline" className="gap-1 h-6 text-green-600 border-green-500/30 bg-green-500/5">
                    <CheckCircle2 className="w-3 h-3" />
                    Klar
                  </Badge>
                  {meeting.source && (
                    <Badge variant="secondary" className="gap-1 h-6">
                      {meeting.source === 'live' ? <Mic className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
                      {meeting.source === 'live' ? 'Inspelning' : 'Uppladdad'}
                    </Badge>
                  )}
                  {!isSISDisabled && lyraLearning.some(l => l.updated) && (
                    <Badge variant="outline" className="gap-1 h-6 text-purple-600 border-purple-500/30 bg-purple-500/5">
                      <Sparkles className="w-3 h-3" />
                      Lyra lärde sig
                    </Badge>
                  )}
                </div>

                {/* Speakers Section - Only show when SIS is enabled and editing */}
                {!isSISDisabled && uniqueSpeakers.length > 0 && isEditing && (
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
                          <span className="font-medium text-sm">Redigera talarnamn</span>
                          <p className="text-xs text-muted-foreground">
                            {uniqueSpeakers.length} {uniqueSpeakers.length === 1 ? 'talare' : 'talare'} • Namnge för protokollet
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

                {/* Transcript Section with Integrated Audio Player */}
                <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
                  {/* Header with Audio Player integrated */}
                  <div className="px-5 py-4 border-b border-border/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <span className="font-medium text-sm">Transkription</span>
                          {audioBackup?.available && (
                            <p className="text-xs text-muted-foreground">
                              Med ljuduppspelning
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Audio backup download */}
                      {audioBackup?.available && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDownloadAudioBackup}
                          disabled={isDownloadingAudio}
                          className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {isDownloadingAudio ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          Ladda ner ljud
                        </Button>
                      )}
                    </div>

                    {/* Integrated Audio Player */}
                    {audioBackup?.available && audioBackup.downloadPath && !isEditing && (
                      <IntegratedTranscriptPlayer
                        meetingId={meeting.id}
                        audioBackup={audioBackup}
                        onTimeUpdate={setAudioCurrentTime}
                        onPlayStateChange={setAudioIsPlaying}
                        seekTo={audioSeekTo}
                      />
                    )}
                  </div>

                  {/* Transcript Content */}
                  <div className="px-5 py-4">
                    {isEditing ? (
                      <Textarea
                        value={editedTranscript}
                        onChange={(e) => handleTranscriptChange(e.target.value)}
                        className="min-h-[400px] text-sm leading-relaxed resize-none border-0 bg-transparent p-0 focus-visible:ring-0"
                        placeholder="Redigera transkriptionen..."
                      />
                    ) : transcriptWords.length > 0 && audioBackup?.available ? (
                      // Synced transcript view with word-by-word highlighting during audio playback
                      <SyncedTranscriptView
                        meetingId={id || ''}
                        words={transcriptWords}
                        speakerBlocks={speakerBlocksCleaned || speakerBlocksRaw || []}
                        speakerNames={speakerNames}
                        speakerNamesLoading={speakerNamesLoading}
                        currentTime={audioCurrentTime}
                        isPlaying={audioIsPlaying}
                        onSeek={(time) => setAudioSeekTo(time)}
                        onSpeakerNamesUpdated={(names) => setSpeakerNames(names)}
                      />
                    ) : hasSpeakerBlocks ? (
                      // Enhanced speaker view with speakerBlocksCleaned/Raw data
                      <EnhancedSpeakerView
                        meetingId={id || ''}
                        speakerBlocks={speakerBlocksCleaned || speakerBlocksRaw || []}
                        speakerNames={speakerNames}
                        speakerNamesLoading={speakerNamesLoading}
                        onSpeakerNamesUpdated={(names) => setSpeakerNames(names)}
                      />
                    ) : hasSegments ? (
                      // Speaker-segmented view (SIS enabled with segments)
                      <div className="space-y-0 max-h-[60vh] overflow-y-auto">
                        {groupedSegments.map((segment, idx) => {
                          const speakerName = getSegmentSpeakerName(segment.speakerId);
                          const colorClass = getSpeakerColorClass(segment.speakerId);
                          const dotClass = getSpeakerDotClass(segment.speakerId);
                          const textClass = getSpeakerTextClass(segment.speakerId);
                          const timestamp = formatTimestamp(segment.start);
                          const prevSegment = idx > 0 ? groupedSegments[idx - 1] : null;
                          const showDivider = prevSegment && prevSegment.speakerId !== segment.speakerId;

                          return (
                            <div key={idx}>
                              {showDivider && <div className="h-px bg-border/40 my-3" />}
                              <div className={`pl-4 py-2.5 border-l-2 hover:bg-muted/20 transition-colors rounded-r ${colorClass}`}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <div className={`w-2 h-2 rounded-full ${dotClass}`} />
                                  <span className={`text-sm font-semibold ${textClass}`}>{speakerName}</span>
                                  {timestamp && (
                                    <span className="text-xs text-muted-foreground/60 tabular-nums">{timestamp}</span>
                                  )}
                                </div>
                                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap pl-4">
                                  {segment.text || ''}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // Clean text view - uses speakerBlocksCleaned or transcriptRaw with expand/collapse
                      <TranscriptTextView
                        meetingId={id || ''}
                        transcriptRaw={transcriptRaw}
                        speakerBlocksCleaned={speakerBlocksCleaned}
                        speakerNames={speakerNames}
                      />
                    )}
                  </div>
                </div>

                {/* Protocol section moved to top of page */}
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
        description={canGenerateMoreProtocols 
          ? "Är du säker på att du vill ta bort detta protokoll? Du kan generera ett nytt efteråt."
          : `Är du säker på att du vill ta bort detta protokoll? OBS: Du har använt alla ${maxProtocolGenerations} protokollgenereringar för detta möte och kan inte skapa ett nytt.`
        }
        confirmText="Ta bort"
        onConfirm={handleDeleteProtocol}
        variant="destructive"
      />

      {/* Replace Protocol Confirm Dialog */}
      <ConfirmDialog
        open={showReplaceProtocolConfirm}
        onOpenChange={setShowReplaceProtocolConfirm}
        title={canGenerateMoreProtocols ? "Ersätt protokoll" : "Protokollgräns nådd"}
        description={canGenerateMoreProtocols
          ? `Vill du ersätta det befintliga protokollet? Du har använt ${protocolCountUsed} av ${maxProtocolGenerations}. Efter detta har du ${Math.max(0, protocolCountRemaining - 1)} kvar.`
          : `Du har redan använt alla ${maxProtocolGenerations} protokollgenereringar för detta möte. Du kan inte ersätta protokollet.`
        }
        confirmText={canGenerateMoreProtocols ? "Ersätt" : "OK"}
        onConfirm={canGenerateMoreProtocols ? handleReplaceProtocol : () => setShowReplaceProtocolConfirm(false)}
        variant={canGenerateMoreProtocols ? "destructive" : "default"}
      />

      {/* Speaker Name Confirmation Dialog */}
      <ConfirmDialog
        open={showSpeakerNameConfirm}
        onOpenChange={setShowSpeakerNameConfirm}
        title="Talarnamn saknas"
        description="Några talare har fortfarande generiska namn (t.ex. 'Talare 1'). För bästa resultat i protokollet, redigera mötet och namnge talarna först. Vill du fortsätta ändå?"
        confirmText="Fortsätt ändå"
        cancelText="Redigera namn"
        onConfirm={handleConfirmProtocolWithGenericNames}
        onCancel={() => {
          setShowSpeakerNameConfirm(false);
          setIsEditing(true);
        }}
        variant="default"
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
