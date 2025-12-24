import React, { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Edit2, Copy, X, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { backendApi } from '@/lib/backendApi';

interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

interface Speaker {
  label: string;
  segments: Array<{ start: number; end: number }>;
  durationSeconds: number;
  bestMatchEmail: string | null;
  similarity: number;
  speakerName: string;
}

interface SpeakerTranscriptViewProps {
  meetingId: string;
  transcriptSegments: TranscriptSegment[] | null;
  transcript: string;
  sisSpeakers: Speaker[] | null;
  lyraSpeakers: Speaker[] | null;
  speakerNames: Record<string, string> | null;
  lyraSpeakerNames: Record<string, string> | null;
  onSpeakerNamesUpdated?: (names: Record<string, string>) => void;
  sisEnabled?: boolean;
  className?: string;
}

// Clean, professional speaker colors
const SPEAKER_COLORS = [
  { border: 'border-l-blue-500', dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/5' },
  { border: 'border-l-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/5' },
  { border: 'border-l-amber-500', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/5' },
  { border: 'border-l-purple-500', dot: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/5' },
  { border: 'border-l-rose-500', dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/5' },
  { border: 'border-l-cyan-500', dot: 'bg-cyan-500', text: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-500/5' },
];

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Find which speaker is talking at a given time point
const findSpeakerAtTime = (time: number, speakers: Speaker[]): string | null => {
  for (const speaker of speakers) {
    for (const seg of speaker.segments) {
      if (time >= seg.start && time <= seg.end) {
        return speaker.label;
      }
    }
  }
  return null;
};

export const SpeakerTranscriptView: React.FC<SpeakerTranscriptViewProps> = ({
  meetingId,
  transcriptSegments,
  transcript,
  sisSpeakers,
  lyraSpeakers,
  speakerNames: initialSpeakerNames,
  lyraSpeakerNames: initialLyraSpeakerNames,
  onSpeakerNamesUpdated,
  sisEnabled = false,
  className,
}) => {
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [localSpeakerNames, setLocalSpeakerNames] = useState<Record<string, string>>({});
  const [learningStatus, setLearningStatus] = useState<Record<string, 'learned' | 'rejected' | null>>({});

  // Use lyra speakers if available, otherwise sis speakers
  const speakers = lyraSpeakers || sisSpeakers;
  const names = { ...(initialLyraSpeakerNames || initialSpeakerNames || {}), ...localSpeakerNames };

  // Check if we have speaker diarization data
  const hasSpeakerData = sisEnabled && speakers && speakers.length > 1;

  // Create speaker color map
  const speakerColorMap = useMemo(() => {
    if (!speakers) return {};
    const map: Record<string, typeof SPEAKER_COLORS[0]> = {};
    speakers.forEach((speaker, index) => {
      map[speaker.label] = SPEAKER_COLORS[index % SPEAKER_COLORS.length];
    });
    return map;
  }, [speakers]);

  // Match transcript segments to speakers using midpoint of each segment
  const segmentsWithSpeakers = useMemo(() => {
    if (!transcriptSegments || !speakers || speakers.length === 0) return [];

    return transcriptSegments.map(segment => {
      const midpoint = (segment.start + segment.end) / 2;
      const matchedSpeaker = findSpeakerAtTime(midpoint, speakers);
      const finalSpeaker = matchedSpeaker || findSpeakerAtTime(segment.start, speakers);
      return { ...segment, speaker: finalSpeaker };
    });
  }, [transcriptSegments, speakers]);

  // Group consecutive segments by same speaker
  const groupedSegments = useMemo(() => {
    if (!segmentsWithSpeakers.length) return [];

    const groups: Array<{
      speaker: string | null;
      segments: typeof segmentsWithSpeakers;
      startTime: number;
      endTime: number;
      text: string;
    }> = [];

    let currentGroup: typeof groups[0] | null = null;

    for (const segment of segmentsWithSpeakers) {
      if (!currentGroup || currentGroup.speaker !== segment.speaker) {
        if (currentGroup) {
          currentGroup.text = currentGroup.segments.map(s => s.text.trim()).join(' ');
          groups.push(currentGroup);
        }
        currentGroup = {
          speaker: segment.speaker,
          segments: [segment],
          startTime: segment.start,
          endTime: segment.end,
          text: '',
        };
      } else {
        currentGroup.segments.push(segment);
        currentGroup.endTime = segment.end;
      }
    }

    if (currentGroup) {
      currentGroup.text = currentGroup.segments.map(s => s.text.trim()).join(' ');
      groups.push(currentGroup);
    }

    return groups;
  }, [segmentsWithSpeakers]);

  const getSpeakerDisplayName = useCallback((speakerLabel: string | null) => {
    if (!speakerLabel) return 'Okänd';
    return names[speakerLabel] || 
           speakers?.find(s => s.label === speakerLabel)?.speakerName || 
           speakerLabel;
  }, [names, speakers]);

  const handleEditSpeaker = (speakerLabel: string) => {
    setEditingSpeaker(speakerLabel);
    setEditedName(getSpeakerDisplayName(speakerLabel));
  };

  const handleSaveSpeakerName = async () => {
    if (!editingSpeaker || !meetingId) return;

    const speakerLabel = editingSpeaker;
    const newName = editedName.trim();
    
    if (!newName) {
      setEditingSpeaker(null);
      return;
    }

    setSavingName(true);
    
    try {
      const updatedNames = { ...names, [speakerLabel]: newName };
      setLocalSpeakerNames(prev => ({ ...prev, [speakerLabel]: newName }));
      
      const saveResult = await backendApi.saveSpeakerNames(meetingId, updatedNames);
      onSpeakerNamesUpdated?.(saveResult.speakerNames);
      
      const learnResult = await backendApi.renameSpeaker(meetingId, speakerLabel, newName);
      
      if (learnResult.ok && !learnResult.rejected) {
        setLearningStatus(prev => ({ ...prev, [speakerLabel]: 'learned' }));
        toast.success(
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span>Talare inlärd: {newName}</span>
          </div>
        );
      } else if (learnResult.rejected) {
        setLearningStatus(prev => ({ ...prev, [speakerLabel]: 'rejected' }));
        toast.info(
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span>Namn sparat, men kunde inte lära talaren ännu</span>
          </div>
        );
      } else {
        toast.success('Talarnamn sparat');
      }
      
    } catch (error) {
      console.error('Error saving speaker name:', error);
      toast.error('Kunde inte spara namn');
    } finally {
      setSavingName(false);
      setEditingSpeaker(null);
    }
  };

  const handleCopyTranscript = useCallback(() => {
    if (hasSpeakerData && groupedSegments.length > 0) {
      const text = groupedSegments
        .map(group => {
          const speakerName = getSpeakerDisplayName(group.speaker);
          return `[${formatTime(group.startTime)}] ${speakerName}:\n${group.text}`;
        })
        .join('\n\n');
      navigator.clipboard.writeText(text);
    } else {
      navigator.clipboard.writeText(transcript || '');
    }
    toast.success('Transkription kopierad');
  }, [hasSpeakerData, groupedSegments, transcript, getSpeakerDisplayName]);

  // If no speaker data or SIS not enabled, show simple transcript
  if (!hasSpeakerData || !transcriptSegments || groupedSegments.length === 0) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Transkription</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyTranscript}
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3 w-3" />
            Kopiera
          </Button>
        </div>
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {transcript || 'Ingen transkription tillgänglig.'}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with speaker chips */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Transkription</span>
            <span className="text-xs text-muted-foreground/60">• {speakers?.length} talare</span>
          </div>
          
          {/* Speaker chips for quick edit */}
          <div className="flex flex-wrap gap-1.5">
            {speakers?.map(speaker => {
              const colors = speakerColorMap[speaker.label];
              const isEditing = editingSpeaker === speaker.label;
              const learnStatus = learningStatus[speaker.label];

              if (isEditing) {
                return (
                  <div key={speaker.label} className="flex items-center gap-1 bg-muted rounded-md px-2 py-1">
                    <div className={cn("w-2 h-2 rounded-full flex-shrink-0", colors?.dot)} />
                    <Input
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="h-5 w-28 text-xs px-1 py-0 border-0 bg-transparent focus-visible:ring-0"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveSpeakerName();
                        if (e.key === 'Escape') setEditingSpeaker(null);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSaveSpeakerName}
                      disabled={savingName}
                      className="h-5 w-5 p-0"
                    >
                      <Check className="h-3 w-3 text-emerald-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingSpeaker(null)}
                      className="h-5 w-5 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              }

              return (
                <button
                  key={speaker.label}
                  onClick={() => handleEditSpeaker(speaker.label)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md",
                    "bg-muted/50 hover:bg-muted border border-transparent hover:border-border/50",
                    "transition-all duration-150"
                  )}
                >
                  <div className={cn("w-2 h-2 rounded-full", colors?.dot)} />
                  <span className={cn("font-medium", colors?.text)}>
                    {getSpeakerDisplayName(speaker.label)}
                  </span>
                  {learnStatus === 'learned' && (
                    <Sparkles className="h-2.5 w-2.5 text-amber-500" />
                  )}
                  <Edit2 className="h-2.5 w-2.5 opacity-30" />
                </button>
              );
            })}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyTranscript}
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          <Copy className="h-3 w-3" />
          Kopiera
        </Button>
      </div>

      {/* Clean linear transcript with speaker blocks */}
      <ScrollArea className="max-h-[60vh]">
        <div className="space-y-0 pr-2">
          {groupedSegments.map((group, index) => {
            const colors = group.speaker ? speakerColorMap[group.speaker] : null;
            const speakerName = getSpeakerDisplayName(group.speaker);
            const prevGroup = index > 0 ? groupedSegments[index - 1] : null;
            const showDivider = prevGroup && prevGroup.speaker !== group.speaker;

            return (
              <div key={index}>
                {/* Divider line between different speakers */}
                {showDivider && (
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                )}

                {/* Speaker segment */}
                <div
                  className={cn(
                    "relative pl-4 py-2 border-l-2 transition-colors",
                    colors?.border || "border-l-muted-foreground/30",
                    "hover:bg-muted/30"
                  )}
                >
                  {/* Speaker name and time */}
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn("w-1.5 h-1.5 rounded-full", colors?.dot || "bg-muted-foreground/50")} />
                    <span className={cn("text-xs font-semibold", colors?.text || "text-muted-foreground")}>
                      {speakerName}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                      {formatTime(group.startTime)}
                    </span>
                  </div>

                  {/* Text content */}
                  <p className="text-sm text-foreground leading-relaxed pl-3.5">
                    {group.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SpeakerTranscriptView;
