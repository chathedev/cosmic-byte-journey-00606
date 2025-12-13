import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Copy, Clock, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import { SISSpeaker, SISMatch } from "@/lib/asrService";

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

// Confidence thresholds for SIS match:
// 80-100% = Very strong match (same person)
// 70-79% = Strong match (likely same person)  
// 60-69% = Weak/possible match; not reliable
// 0-59% = Noise; treat as not the same person
const SIS_STRONG_THRESHOLD = 0.70; // Minimum for attribution
const SIS_VERY_STRONG_THRESHOLD = 0.80; // High confidence

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
  initialSpeakerNames,
  speakerIdentificationEnabled = false,
  sisSpeakers,
  sisMatches,
}: TranscriptViewerDialogProps) {
  const { toast } = useToast();
  const [speakerNames] = useState<Record<string, string>>(initialSpeakerNames || {});

  // Build speaker identification map from SIS data
  const sisIdentifiedSpeakers = useMemo(() => {
    const map: Record<string, { name: string; email: string; confidence: number }> = {};
    
    const transcriptSpeakerIds = segments 
      ? [...new Set(segments.map(s => getSpeakerFromSegment(s)))]
      : [];
    
    const hasTimeOverlap = (s1: { start: number; end: number }, s2: { start: number; end: number }) => {
      return s1.start < s2.end && s2.start < s1.end;
    };
    
    // Match transcript speakers to SIS speakers by time overlap
    if (sisSpeakers && sisSpeakers.length > 0 && segments && segments.length > 0) {
      transcriptSpeakerIds.forEach(speakerId => {
        const speakerSegments = segments.filter(s => getSpeakerFromSegment(s) === speakerId);
        
        for (const sisSpeaker of sisSpeakers) {
          if (sisSpeaker.similarity && sisSpeaker.similarity >= SIS_STRONG_THRESHOLD && sisSpeaker.bestMatchEmail) {
            const hasOverlap = speakerSegments.some(seg => 
              sisSpeaker.segments?.some(sisSeg => hasTimeOverlap(seg, sisSeg))
            );
            
            if (hasOverlap) {
              const matchWithName = sisMatches?.find(m => m.sampleOwnerEmail === sisSpeaker.bestMatchEmail);
              const speakerName = (matchWithName as any)?.speakerName || sisSpeaker.bestMatchEmail.split('@')[0];
              
              map[speakerId] = {
                name: speakerName,
                email: sisSpeaker.bestMatchEmail,
                confidence: sisSpeaker.similarity,
              };
              break;
            }
          }
        }
      });
      
      // If only one speaker in both and no overlap found, map them directly
      if (Object.keys(map).length === 0 && transcriptSpeakerIds.length === 1 && sisSpeakers.length === 1) {
        const sisSpeaker = sisSpeakers[0];
        if (sisSpeaker.similarity && sisSpeaker.similarity >= SIS_STRONG_THRESHOLD && sisSpeaker.bestMatchEmail) {
          const matchWithName = sisMatches?.find(m => m.sampleOwnerEmail === sisSpeaker.bestMatchEmail);
          const speakerName = (matchWithName as any)?.speakerName || sisSpeaker.bestMatchEmail.split('@')[0];
          
          map[transcriptSpeakerIds[0]] = {
            name: speakerName,
            email: sisSpeaker.bestMatchEmail,
            confidence: sisSpeaker.similarity,
          };
        }
      }
    }
    
    // Also check sisMatches directly for speakerLabel mapping
    if (sisMatches && sisMatches.length > 0) {
      sisMatches.forEach(match => {
        if (match.speakerLabel && match.score >= SIS_STRONG_THRESHOLD) {
          const speakerName = (match as any).speakerName || match.sampleOwnerEmail.split('@')[0];
          
          if (transcriptSpeakerIds.includes(match.speakerLabel)) {
            map[match.speakerLabel] = {
              name: speakerName,
              email: match.sampleOwnerEmail,
              confidence: match.score,
            };
          }
          map[match.speakerLabel] = {
            name: speakerName,
            email: match.sampleOwnerEmail,
            confidence: match.score,
          };
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
            const sisMatch = sisIdentifiedSpeakers[speakerKey];
            const name = sisMatch?.name || speakerNames[speakerKey] || `Talare ${speakerKey}`;
            return `[${name}] ${s.text}`;
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

  const getSpeakerDisplayName = (speaker: string): string => {
    if (speakerNames[speaker]) return speakerNames[speaker];
    
    const sisMatch = sisIdentifiedSpeakers[speaker];
    if (sisMatch) return sisMatch.name;
    
    const match = speaker.match(/speaker_(\d+)/i);
    if (match) {
      return `Talare ${parseInt(match[1], 10) + 1}`;
    }
    return `Talare ${speaker}`;
  };

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
                  
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.02, duration: 0.15 }}
                      className="py-3 border-b border-border/30 last:border-0"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`w-5 h-5 rounded-full ${getSpeakerBgColor(speakerKey)} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <span className="text-[8px] font-semibold text-white">
                            {displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5 mb-0.5">
                            <span className={`text-xs font-medium ${isIdentified ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {displayName}
                            </span>
                            {isIdentified && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                {Math.round(confidence * 100)}%
                              </span>
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
