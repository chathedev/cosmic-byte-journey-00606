import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Clock, UserCheck, Pencil, Save, X, Loader2, Sparkles, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { useState, useMemo, useCallback, useEffect } from "react";
import { SISSpeaker, SISMatch, SISLearningEntry } from "@/lib/asrService";
import { backendApi } from "@/lib/backendApi";

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker: string;
}

export interface TranscriptSegment {
  speaker?: string;      // Legacy field
  speakerId?: string;    // ElevenLabs uses speakerId
  text: string;
  start: number;
  end: number;
  confidence?: number;
  words?: TranscriptWord[];
}

// Helper to get speaker identifier from segment (handles both speakerId and speaker)
const getSpeakerFromSegment = (segment: TranscriptSegment): string => {
  return segment.speakerId || segment.speaker || 'unknown';
};

// Confidence thresholds for SIS match (per docs):
// - ~0.72+ triggers voice learning (embedding rollback)
// - 80-100% = Very strong match (high confidence, same person)
// - 70-79% = Strong match (likely same person, shows "secure X%" badge)
// - 60-69% = Weak/possible match; not reliable for attribution
// - 0-59% = Noise; treat as not the same person
const SIS_STRONG_THRESHOLD = 0.70; // Minimum for attribution
const SIS_VERY_STRONG_THRESHOLD = 0.80; // High confidence
const SIS_LEARNING_THRESHOLD = 0.72; // Per docs: threshold for voice learning

interface TranscriptViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcript: string;
  segments?: TranscriptSegment[];
  meetingTitle?: string;
  meetingId?: string;
  initialSpeakerNames?: Record<string, string>;
  onSpeakerNamesChange?: (names: Record<string, string>) => void;
  speakerIdentificationEnabled?: boolean;
  sisSpeakers?: SISSpeaker[];
  sisMatches?: SISMatch[];
  // Pre-loaded from /asr/status response
  backendSpeakerNames?: Record<string, string>;
  backendSisLearning?: SISLearningEntry[];
}

const getSpeakerBgColor = (speaker: string | undefined | null): string => {
  const colors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-purple-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-orange-500",
    "bg-indigo-500",
  ];
  
  if (!speaker || speaker.length === 0) {
    return colors[0];
  }
  
  const index = speaker.charCodeAt(0) - 65;
  return colors[Math.abs(index) % colors.length];
};

// Format time - handles both milliseconds and seconds
const formatTime = (time: number): string => {
  const totalSeconds = time > 1000 ? Math.floor(time / 1000) : Math.floor(time);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export function TranscriptViewerDialog({
  open,
  onOpenChange,
  transcript,
  segments,
  meetingTitle,
  meetingId,
  initialSpeakerNames,
  onSpeakerNamesChange,
  speakerIdentificationEnabled = false,
  sisSpeakers,
  sisMatches,
  backendSpeakerNames,
  backendSisLearning,
}: TranscriptViewerDialogProps) {
  const { toast } = useToast();
  
  // Per docs section 3: pick display name from response.speakerNames[label] first
  // State: merge backend names → initial props (priority order)
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>(() => ({
    ...initialSpeakerNames,
    ...backendSpeakerNames, // Backend names take priority (auto-applied aliases)
  }));
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [sisLearning, setSisLearning] = useState<SISLearningEntry[]>(backendSisLearning || []);
  const [loadedFromBackend, setLoadedFromBackend] = useState(!!backendSpeakerNames && Object.keys(backendSpeakerNames).length > 0);

  // Sync state when props change (e.g., after meeting refresh per docs section 3)
  useEffect(() => {
    if (backendSpeakerNames) {
      // Backend speakerNames take priority - these are the "cached" aliases
      setSpeakerNames(prev => ({ ...prev, ...backendSpeakerNames }));
      if (Object.keys(backendSpeakerNames).length > 0) {
        setLoadedFromBackend(true);
      }
    }
  }, [backendSpeakerNames]);

  useEffect(() => {
    if (backendSisLearning && backendSisLearning.length > 0) {
      setSisLearning(backendSisLearning);
    }
  }, [backendSisLearning]);

  // Per docs: "fetch current aliases via GET /meetings/:meetingId/speaker-names"
  // Load speaker names from backend to hydrate UI without waiting for /asr/status
  useEffect(() => {
    if (open && meetingId && !loadedFromBackend) {
      backendApi.getSpeakerNames(meetingId).then(data => {
        // Merge: existing local state, then backend aliases (backend takes priority)
        setSpeakerNames(prev => ({ ...prev, ...data.speakerNames }));
        if (data.sisLearning && data.sisLearning.length > 0) {
          setSisLearning(prev => [...prev, ...data.sisLearning.filter(
            l => !prev.some(p => p.email === l.email)
          )]);
        }
        setLoadedFromBackend(true);
      }).catch(err => {
        console.warn('[SIS] Could not load speaker names:', err);
        setLoadedFromBackend(true);
      });
    }
  }, [open, meetingId, loadedFromBackend]);

  // Build speaker identification map from SIS data
  // Per docs: sisSpeakers[n] carries bestMatchEmail plus the similarity percent
  // that shows up as the "secure 70%" badge. Backend resolves labels using both
  // sisMatches and sisSpeakers.bestMatchEmail when speakerLabel is missing.
  const sisIdentifiedSpeakers = useMemo(() => {
    const map: Record<string, { 
      name: string; 
      email: string; 
      confidence: number; 
      speakerLabel?: string; 
      hasAlias: boolean;
      canLearn: boolean; // Per docs: similarity > 0.72 triggers learning
    }> = {};
    
    const transcriptSpeakerIds = segments 
      ? [...new Set(segments.map(s => getSpeakerFromSegment(s)))]
      : [];
    
    const hasTimeOverlap = (s1: { start: number; end: number }, s2: { start: number; end: number }) => {
      return s1.start < s2.end && s2.start < s1.end;
    };
    
    // Per docs: sisSpeakers[n].bestMatchEmail + similarity for "secure X%" badge
    // Use this to resolve labels even when speakerLabel is missing
    if (sisSpeakers && sisSpeakers.length > 0 && segments && segments.length > 0) {
      transcriptSpeakerIds.forEach(speakerId => {
        const speakerSegments = segments.filter(s => getSpeakerFromSegment(s) === speakerId);
        
        for (const sisSpeaker of sisSpeakers) {
          if (sisSpeaker.similarity && sisSpeaker.similarity >= SIS_STRONG_THRESHOLD && sisSpeaker.bestMatchEmail) {
            const hasOverlap = speakerSegments.some(seg => 
              sisSpeaker.segments?.some(sisSeg => hasTimeOverlap(seg, sisSeg))
            );
            
            if (hasOverlap) {
              // Per docs priority: sisSpeaker.speakerName → sisMatch.speakerName → email prefix
              const matchWithName = sisMatches?.find(m => m.sampleOwnerEmail === sisSpeaker.bestMatchEmail);
              const speakerName = sisSpeaker.speakerName || matchWithName?.speakerName || sisSpeaker.bestMatchEmail.split('@')[0];
              const hasAlias = !!(sisSpeaker.speakerName || matchWithName?.speakerName);
              
              map[speakerId] = {
                name: speakerName,
                email: sisSpeaker.bestMatchEmail,
                confidence: sisSpeaker.similarity,
                speakerLabel: sisSpeaker.label,
                hasAlias,
                canLearn: sisSpeaker.similarity >= SIS_LEARNING_THRESHOLD,
              };
              break;
            }
          }
        }
      });
      
      // Per docs: If only one speaker in transcript and one in sisSpeakers, map directly
      // This handles cases where time overlap doesn't match due to segment timing differences
      if (Object.keys(map).length === 0 && transcriptSpeakerIds.length === 1 && sisSpeakers.length === 1) {
        const sisSpeaker = sisSpeakers[0];
        if (sisSpeaker.similarity && sisSpeaker.similarity >= SIS_STRONG_THRESHOLD && sisSpeaker.bestMatchEmail) {
          const matchWithName = sisMatches?.find(m => m.sampleOwnerEmail === sisSpeaker.bestMatchEmail);
          const speakerName = sisSpeaker.speakerName || matchWithName?.speakerName || sisSpeaker.bestMatchEmail.split('@')[0];
          const hasAlias = !!(sisSpeaker.speakerName || matchWithName?.speakerName);
          
          map[transcriptSpeakerIds[0]] = {
            name: speakerName,
            email: sisSpeaker.bestMatchEmail,
            confidence: sisSpeaker.similarity,
            speakerLabel: sisSpeaker.label,
            hasAlias,
            canLearn: sisSpeaker.similarity >= SIS_LEARNING_THRESHOLD,
          };
        }
      }
    }
    
    // Per docs: Also check sisMatches for speakerLabel mapping (fallback resolution)
    // Backend may set speakerLabel from sisSpeakers.bestMatchEmail when sanitizing
    if (sisMatches && sisMatches.length > 0) {
      sisMatches.forEach(match => {
        const label = match.speakerLabel;
        if (label && match.score >= SIS_STRONG_THRESHOLD && !map[label]) {
          // Get corresponding sisSpeaker for speakerName priority
          const sisSpeaker = sisSpeakers?.find(s => s.label === label || s.bestMatchEmail === match.sampleOwnerEmail);
          const speakerName = sisSpeaker?.speakerName || match.speakerName || match.sampleOwnerEmail.split('@')[0];
          const hasAlias = !!(sisSpeaker?.speakerName || match.speakerName);
          
          map[label] = {
            name: speakerName,
            email: match.sampleOwnerEmail,
            confidence: match.score,
            speakerLabel: label,
            hasAlias,
            canLearn: match.score >= SIS_LEARNING_THRESHOLD,
          };
        }
      });
      
      // Per docs: Fallback - if sisMatches has no speakerLabel, use sisSpeakers.bestMatchEmail to resolve
      // This handles cases where sanitized /asr/status hides speakerLabel
      sisMatches.forEach(match => {
        if (!match.speakerLabel && match.score >= SIS_STRONG_THRESHOLD) {
          // Find sisSpeaker with matching bestMatchEmail
          const sisSpeaker = sisSpeakers?.find(s => s.bestMatchEmail === match.sampleOwnerEmail);
          if (sisSpeaker?.label && !map[sisSpeaker.label]) {
            const speakerName = sisSpeaker.speakerName || match.speakerName || match.sampleOwnerEmail.split('@')[0];
            const hasAlias = !!(sisSpeaker.speakerName || match.speakerName);
            
            map[sisSpeaker.label] = {
              name: speakerName,
              email: match.sampleOwnerEmail,
              confidence: match.score,
              speakerLabel: sisSpeaker.label,
              hasAlias,
              canLearn: match.score >= SIS_LEARNING_THRESHOLD,
            };
          }
        }
      });
    }
    
    return map;
  }, [sisSpeakers, sisMatches, segments]);

  const handleCopy = async () => {
    try {
      let textToCopy = transcript;
      
      if (segments && segments.length > 0) {
        textToCopy = segments
          .map(s => {
            const speakerKey = getSpeakerFromSegment(s);
            const displayName = getSpeakerDisplayName(speakerKey);
            return `[${displayName}] ${s.text}`;
          })
          .join('\n\n');
      }
      
      await navigator.clipboard.writeText(textToCopy);
      toast({
        title: "Kopierat!",
        description: "Transkriptet har kopierats till urklipp.",
        duration: 2000,
      });
    } catch (err) {
      toast({
        title: "Kunde inte kopiera",
        description: "Försök igen.",
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  // Display name priority per docs section 3:
  // 1. response.speakerNames[label] (from manual rename or auto-applied backend cache)
  // 2. sisSpeakers[n].speakerName (alias decorated by backend from stored aliases)
  // 3. sisMatch.speakerName (from SIS match data)
  // 4. label (original diarization label if readable)
  // 5. speaker_{n} fallback → "Talare N" for Swedish UI
  const getSpeakerDisplayName = useCallback((speaker: string): string => {
    // 1. First check speakerNames map (backend cache or manual rename)
    if (speakerNames[speaker]) {
      return speakerNames[speaker];
    }
    
    // 2. Check sisSpeakers[n].speakerName (backend-decorated alias)
    const sisSpeaker = sisSpeakers?.find(s => s.label === speaker);
    if (sisSpeaker?.speakerName) {
      return sisSpeaker.speakerName;
    }
    
    // 2b. Per docs: also check sisSpeakers by bestMatchEmail when speakerLabel is sanitized
    const sisSpeakerByEmail = sisSpeakers?.find(s => {
      // Find if this speaker was matched via bestMatchEmail
      const matchForSpeaker = sisMatches?.find(m => m.speakerLabel === speaker);
      return matchForSpeaker && s.bestMatchEmail === matchForSpeaker.sampleOwnerEmail && s.speakerName;
    });
    if (sisSpeakerByEmail?.speakerName) {
      return sisSpeakerByEmail.speakerName;
    }
    
    // 3. Check sisMatches[n].speakerName (fallback)
    const matchWithLabel = sisMatches?.find(m => m.speakerLabel === speaker);
    if (matchWithLabel?.speakerName) {
      return matchWithLabel.speakerName;
    }
    
    // 3b. Check our computed sisIdentifiedSpeakers map for resolved aliases
    const sisInfo = sisIdentifiedSpeakers[speaker];
    if (sisInfo?.hasAlias && sisInfo.name) {
      return sisInfo.name;
    }
    
    // 4. Use the label as-is if it's human-readable (not speaker_N pattern)
    if (speaker && !speaker.match(/^speaker_\d+$/i)) {
      return speaker;
    }
    
    // 5. Fall back to "Talare X" format for Swedish UI
    const match = speaker.match(/speaker_(\d+)/i);
    if (match) {
      return `Talare ${parseInt(match[1], 10) + 1}`;
    }
    return `Talare ${speaker}`;
  }, [speakerNames, sisSpeakers, sisMatches, sisIdentifiedSpeakers]);

  const isSISIdentified = (speaker: string): boolean => {
    return !!sisIdentifiedSpeakers[speaker];
  };

  const getSISConfidence = (speaker: string): number => {
    return sisIdentifiedSpeakers[speaker]?.confidence || 0;
  };

  const uniqueSpeakers = segments 
    ? [...new Set(segments.map(s => getSpeakerFromSegment(s)))].filter(s => s !== 'unknown').sort()
    : [];

  const identifiedCount = uniqueSpeakers.filter(s => isSISIdentified(s)).length;

  const totalDuration = segments && segments.length > 0
    ? Math.max(...segments.map(s => s.end))
    : 0;

  // Start editing a speaker name
  const startEditing = (speakerId: string) => {
    const currentName = speakerNames[speakerId] || sisIdentifiedSpeakers[speakerId]?.name || '';
    setEditingSpeaker(speakerId);
    setEditValue(currentName);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingSpeaker(null);
    setEditValue("");
  };

  // Save speaker name - per docs section 2:
  // PUT /meetings/:meetingId/speaker-names with full speakerNames map
  // Backend validates, updates meeting record, associates with SIS voice, persists alias
  const saveSpeakerName = async (speakerId: string) => {
    if (!editValue.trim()) {
      cancelEditing();
      return;
    }

    const trimmedName = editValue.trim();
    
    // Per docs: "keep sending the saved speakerNames map in PUT"
    const newNames = {
      ...speakerNames,
      [speakerId]: trimmedName,
    };

    // Optimistic update
    setSpeakerNames(newNames);
    setEditingSpeaker(null);
    setEditValue("");

    // Save to backend if we have a meeting ID
    if (meetingId) {
      setIsSaving(true);
      try {
        const sisInfo = sisIdentifiedSpeakers[speakerId];
        
        if (sisInfo) {
          console.log(`[SIS] Saving "${trimmedName}" for ${sisInfo.email} (${Math.round(sisInfo.confidence * 100)}%)`);
        }
        
        // Per docs: send full speakerNames map so backend can rewrite both meeting record and /asr/status
        const result = await backendApi.saveSpeakerNames(meetingId, newNames);
        
        // Per docs section 3: "refresh the meeting payload after a rename"
        // Update local state with the returned speakerNames (may include auto-applied aliases)
        if (result.speakerNames) {
          setSpeakerNames(prev => ({ ...prev, ...result.speakerNames }));
        }
        
        // Notify parent to refresh meeting data
        onSpeakerNamesChange?.(result.speakerNames || newNames);
        
        // Update sisLearning from response
        if (result.sisLearning && result.sisLearning.length > 0) {
          setSisLearning(result.sisLearning);
          
          // Per docs section 4: surface "learning confidence" badge when updated: true
          const learnedVoice = result.sisLearning.find(l => l.updated);
          if (learnedVoice) {
            toast({
              title: "Röst inlärd!",
              description: (
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  <span>"{trimmedName}" känns igen automatiskt i framtida möten ({Math.round(learnedVoice.similarity * 100)}%)</span>
                </div>
              ),
              duration: 4000,
            });
          } else {
            toast({
              title: "Namn sparat",
              description: sisInfo 
                ? `"${trimmedName}" kopplat till röst (${Math.round(sisInfo.confidence * 100)}%)`
                : `Sparade "${trimmedName}"`,
              duration: 2500,
            });
          }
        } else {
          toast({
            title: "Namn sparat",
            description: `Sparade "${trimmedName}"`,
            duration: 2000,
          });
        }
      } catch (error) {
        console.error('[SIS] Failed to save speaker names:', error);
        // Rollback on error
        setSpeakerNames(prev => {
          const reverted = { ...prev };
          delete reverted[speakerId];
          if (initialSpeakerNames?.[speakerId]) {
            reverted[speakerId] = initialSpeakerNames[speakerId];
          }
          return reverted;
        });
        toast({
          title: "Kunde inte spara",
          description: "Försök igen senare.",
          variant: "destructive",
          duration: 3000,
        });
      } finally {
        setIsSaving(false);
      }
    } else {
      // No meetingId - just update locally
      onSpeakerNamesChange?.(newNames);
    }
  };

  // Check if a speaker can be renamed (always allow, but show different UI for SIS-identified)
  const canRename = (speakerId: string): boolean => {
    return !!meetingId; // Can only rename if we have a meeting ID to save to
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 py-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <DialogTitle className="text-base font-medium">
                {meetingTitle || "Transkript"}
              </DialogTitle>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {totalDuration > 0 && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatTime(totalDuration)}</span>
                  </div>
                )}
                {speakerIdentificationEnabled && identifiedCount > 0 && (
                  <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <UserCheck className="w-3 h-3" />
                    <span>{identifiedCount} identifierad{identifiedCount !== 1 ? 'e' : ''}</span>
                  </div>
                )}
                {isSaving && (
                  <div className="flex items-center gap-1 text-amber-600">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Sparar...</span>
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Copy className="w-3 h-3 mr-1" />
              Kopiera
            </Button>
          </div>
        </DialogHeader>

        {/* Speaker Legend - for renaming and voice learning */}
        {speakerIdentificationEnabled && uniqueSpeakers.length > 0 && (
          <div className="px-5 py-2.5 border-b border-border/30 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-muted-foreground">Klicka för att namnge talare:</p>
              {sisLearning.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-emerald-600">
                  <Sparkles className="w-3 h-3" />
                  <span>{sisLearning.filter(l => l.updated).length} röst{sisLearning.filter(l => l.updated).length !== 1 ? 'er' : ''} inlärda</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {uniqueSpeakers.map(speakerId => {
                const isEditing = editingSpeaker === speakerId;
                const isIdentified = isSISIdentified(speakerId);
                const confidence = getSISConfidence(speakerId);
                const displayName = getSpeakerDisplayName(speakerId);
                const hasCustomName = !!speakerNames[speakerId];
                const sisInfo = sisIdentifiedSpeakers[speakerId];
                const voiceLearned = sisInfo && sisLearning.some(l => l.email === sisInfo.email && l.updated);
                
                if (isEditing) {
                  return (
                    <div key={speakerId} className="flex items-center gap-1 bg-background rounded-md border border-primary/50 shadow-sm px-1.5 py-0.5">
                      <div className={`w-4 h-4 rounded-full ${getSpeakerBgColor(speakerId)} flex items-center justify-center`}>
                        <span className="text-[7px] font-semibold text-white">
                          {displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveSpeakerName(speakerId);
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        placeholder="Ange namn..."
                        className="h-5 w-32 text-[11px] px-1.5 py-0 border-0 focus-visible:ring-0"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => saveSpeakerName(speakerId)}
                        disabled={isSaving}
                        className="h-5 w-5 p-0 hover:bg-emerald-500/20"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                        ) : (
                          <Save className="w-3 h-3 text-emerald-600" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelEditing}
                        className="h-5 w-5 p-0 hover:bg-destructive/20"
                      >
                        <X className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </div>
                  );
                }
                
                return (
                  <button
                    key={speakerId}
                    onClick={() => canRename(speakerId) && startEditing(speakerId)}
                    disabled={!canRename(speakerId) || isSaving}
                    className={`group flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
                      canRename(speakerId) && !isSaving
                        ? 'hover:bg-muted/80 hover:shadow-sm cursor-pointer' 
                        : 'opacity-50 cursor-not-allowed'
                    } ${
                      voiceLearned
                        ? 'bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 border border-emerald-500/30'
                        : isIdentified 
                          ? 'bg-emerald-500/10 border border-emerald-500/20' 
                          : hasCustomName
                            ? 'bg-blue-500/10 border border-blue-500/20'
                            : 'bg-muted/50 border border-border/50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full ${getSpeakerBgColor(speakerId)} flex items-center justify-center relative`}>
                      <span className="text-[7px] font-semibold text-white">
                        {displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                      {voiceLearned && (
                        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-background" />
                      )}
                    </div>
                    <span className="text-[11px] font-medium">{displayName}</span>
                {/* Per docs: "secure X%" confidence badge from sisSpeakers.similarity */}
                    {isIdentified && (
                      <div className="flex items-center gap-0.5" title={`Säker ${Math.round(confidence * 100)}% - röstmatchning`}>
                        <Volume2 className={`w-2.5 h-2.5 ${confidence >= SIS_VERY_STRONG_THRESHOLD ? 'text-emerald-600' : 'text-amber-600'}`} />
                        <span className={`text-[9px] ${confidence >= SIS_VERY_STRONG_THRESHOLD ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {Math.round(confidence * 100)}%
                        </span>
                      </div>
                    )}
                    {canRename(speakerId) && (
                      <Pencil className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                );
              })}
            </div>
            {/* Hint about voice learning */}
            {uniqueSpeakers.some(s => isSISIdentified(s)) && !sisLearning.some(l => l.updated) && (
              <p className="text-[9px] text-muted-foreground/70 mt-2 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Namnge talare för att lära systemet deras röster
              </p>
            )}
          </div>
        )}

        {/* Content */}
        <ScrollArea className="flex-1 max-h-[55vh]">
          <div className="px-5 py-4">
            {speakerIdentificationEnabled && segments && segments.length > 0 ? (
              <div className="space-y-0">
                {segments.map((segment, index) => {
                  const speakerKey = getSpeakerFromSegment(segment);
                  const isIdentified = isSISIdentified(speakerKey);
                  const confidence = getSISConfidence(speakerKey);
                  const displayName = getSpeakerDisplayName(speakerKey);
                  const hasCustomName = !!speakerNames[speakerKey];
                  const sisInfo = sisIdentifiedSpeakers[speakerKey];
                  const voiceLearned = sisInfo && sisLearning.some(l => l.email === sisInfo.email && l.updated);
                  
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(index * 0.02, 0.5), duration: 0.15 }}
                      className="py-3 border-b border-border/30 last:border-0"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`relative w-5 h-5 rounded-full ${getSpeakerBgColor(speakerKey)} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <span className="text-[8px] font-semibold text-white">
                            {displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                          {voiceLearned && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-background" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`text-xs font-medium ${
                              voiceLearned
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : isIdentified 
                                  ? 'text-emerald-700 dark:text-emerald-400' 
                                  : hasCustomName 
                                    ? 'text-blue-700 dark:text-blue-400'
                                    : 'text-muted-foreground'
                            }`}>
                              {displayName}
                            </span>
                           {/* Per docs: confidence badge from sisSpeakers.similarity */}
                            {isIdentified && (
                              <div className="flex items-center gap-0.5" title={`Säker ${Math.round(confidence * 100)}%`}>
                                <Volume2 className={`w-2.5 h-2.5 ${confidence >= SIS_VERY_STRONG_THRESHOLD ? 'text-emerald-500' : 'text-amber-500'}`} />
                                <span className={`text-[9px] ${confidence >= SIS_VERY_STRONG_THRESHOLD ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {Math.round(confidence * 100)}%
                                </span>
                              </div>
                            )}
                            <span className="text-[10px] text-muted-foreground/50 ml-auto">
                              {formatTime(segment.start)}
                            </span>
                          </div>
                          <p className="text-[13px] leading-relaxed text-foreground/85">
                            {segment.text}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
                {transcript}
              </p>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-border/50 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/60">
            {transcript.split(/\s+/).filter(Boolean).length} ord
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Stäng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
