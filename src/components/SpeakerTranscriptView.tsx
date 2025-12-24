import React, { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Edit2, Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

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
  transcriptSegments: TranscriptSegment[] | null;
  transcript: string;
  sisSpeakers: Speaker[] | null;
  lyraSpeakers: Speaker[] | null;
  speakerNames: Record<string, string> | null;
  lyraSpeakerNames: Record<string, string> | null;
  onSaveSpeakerName?: (speakerLabel: string, newName: string) => Promise<void>;
  sisEnabled?: boolean;
  className?: string;
}

// Minimalistic speaker color palette
const SPEAKER_STYLES = [
  { accent: 'hsl(217, 91%, 60%)', label: 'text-blue-600 dark:text-blue-400' },
  { accent: 'hsl(160, 84%, 39%)', label: 'text-emerald-600 dark:text-emerald-400' },
  { accent: 'hsl(38, 92%, 50%)', label: 'text-amber-600 dark:text-amber-400' },
  { accent: 'hsl(271, 91%, 65%)', label: 'text-purple-500 dark:text-purple-400' },
  { accent: 'hsl(350, 89%, 60%)', label: 'text-rose-500 dark:text-rose-400' },
  { accent: 'hsl(187, 85%, 43%)', label: 'text-cyan-600 dark:text-cyan-400' },
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
  transcriptSegments,
  transcript,
  sisSpeakers,
  lyraSpeakers,
  speakerNames,
  lyraSpeakerNames,
  onSaveSpeakerName,
  sisEnabled = false,
  className,
}) => {
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Use lyra speakers if available, otherwise sis speakers
  const speakers = lyraSpeakers || sisSpeakers;
  const names = lyraSpeakerNames || speakerNames || {};

  // Check if we have speaker diarization data
  const hasSpeakerData = sisEnabled && speakers && speakers.length > 0;

  // Create speaker style map
  const speakerStyleMap = useMemo(() => {
    if (!speakers) return {};
    const map: Record<string, typeof SPEAKER_STYLES[0] & { index: number }> = {};
    speakers.forEach((speaker, index) => {
      map[speaker.label] = { ...SPEAKER_STYLES[index % SPEAKER_STYLES.length], index };
    });
    return map;
  }, [speakers]);

  // Match transcript segments to speakers using midpoint of each segment
  const segmentsWithSpeakers = useMemo(() => {
    if (!transcriptSegments || !speakers || speakers.length === 0) return [];

    return transcriptSegments.map(segment => {
      // Use midpoint of segment to determine speaker
      const midpoint = (segment.start + segment.end) / 2;
      const matchedSpeaker = findSpeakerAtTime(midpoint, speakers);
      
      // If no match at midpoint, try start time
      const finalSpeaker = matchedSpeaker || findSpeakerAtTime(segment.start, speakers);

      return {
        ...segment,
        speaker: finalSpeaker,
      };
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

  const getSpeakerDisplayName = (speakerLabel: string | null) => {
    if (!speakerLabel) return 'Okänd';
    return names[speakerLabel] || 
           speakers?.find(s => s.label === speakerLabel)?.speakerName || 
           speakerLabel;
  };

  const handleEditSpeaker = (speakerLabel: string) => {
    setEditingSpeaker(speakerLabel);
    setEditedName(getSpeakerDisplayName(speakerLabel));
  };

  const handleSaveSpeakerName = async () => {
    if (!editingSpeaker || !onSaveSpeakerName) return;

    setSavingName(true);
    try {
      await onSaveSpeakerName(editingSpeaker, editedName);
      toast.success('Talarnamn sparat');
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
          return `${speakerName}: ${group.text}`;
        })
        .join('\n\n');
      navigator.clipboard.writeText(text);
    } else {
      navigator.clipboard.writeText(transcript || '');
    }
    toast.success('Transkription kopierad');
  }, [hasSpeakerData, groupedSegments, transcript, names]);

  // If no speaker data or SIS not enabled, show simple transcript
  if (!hasSpeakerData || !transcriptSegments || groupedSegments.length === 0) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Transkription</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyTranscript}
            className="h-8 gap-2 text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="text-xs">Kopiera</span>
          </Button>
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-foreground whitespace-pre-wrap leading-relaxed">
            {transcript || 'Ingen transkription tillgänglig.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {/* Minimal header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">Transkription</span>
          
          {/* Inline speaker chips */}
          <div className="flex items-center gap-2">
            {speakers?.map(speaker => {
              const style = speakerStyleMap[speaker.label];
              const isEditing = editingSpeaker === speaker.label;

              return (
                <div key={speaker.label} className="flex items-center">
                  {isEditing ? (
                    <div className="flex items-center gap-1 bg-muted rounded-full pl-2 pr-1 py-0.5">
                      <div 
                        className="w-2 h-2 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: style?.accent }}
                      />
                      <Input
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="h-5 w-20 text-xs px-1.5 py-0 border-0 bg-transparent focus-visible:ring-0"
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
                        className="h-5 w-5 p-0 hover:bg-transparent"
                      >
                        <Check className="h-3 w-3 text-emerald-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingSpeaker(null)}
                        className="h-5 w-5 p-0 hover:bg-transparent"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSaveSpeakerName && handleEditSpeaker(speaker.label)}
                      className={cn(
                        "flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full",
                        "bg-muted/50 hover:bg-muted transition-colors",
                        onSaveSpeakerName && "cursor-pointer"
                      )}
                    >
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: style?.accent }}
                      />
                      <span className={style?.label}>
                        {getSpeakerDisplayName(speaker.label)}
                      </span>
                      {onSaveSpeakerName && (
                        <Edit2 className="h-2.5 w-2.5 opacity-40" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyTranscript}
          className="h-8 gap-2 text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
          <span className="text-xs">Kopiera</span>
        </Button>
      </div>

      {/* Conversation-style transcript */}
      <ScrollArea className="max-h-[65vh]">
        <div className="space-y-4 pr-4">
          {groupedSegments.map((group, index) => {
            const style = group.speaker ? speakerStyleMap[group.speaker] : null;
            const speakerName = getSpeakerDisplayName(group.speaker);
            const isEven = (style?.index ?? 0) % 2 === 0;

            return (
              <div
                key={index}
                className={cn(
                  "flex gap-3",
                  !isEven && "flex-row-reverse"
                )}
              >
                {/* Speaker indicator line */}
                <div className="flex flex-col items-center gap-1 pt-1">
                  <div 
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: style?.accent || 'hsl(var(--muted-foreground))' }}
                  />
                  <div 
                    className="w-0.5 flex-1 rounded-full opacity-20"
                    style={{ backgroundColor: style?.accent || 'hsl(var(--muted-foreground))' }}
                  />
                </div>

                {/* Content */}
                <div className={cn(
                  "flex-1 space-y-1",
                  !isEven && "text-right"
                )}>
                  {/* Speaker name & time */}
                  <div className={cn(
                    "flex items-center gap-2",
                    !isEven && "flex-row-reverse"
                  )}>
                    <span className={cn("text-sm font-medium", style?.label || "text-muted-foreground")}>
                      {speakerName}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {formatTime(group.startTime)}
                    </span>
                  </div>

                  {/* Message bubble */}
                  <div
                    className={cn(
                      "inline-block max-w-[90%] rounded-2xl px-4 py-2.5",
                      isEven 
                        ? "rounded-tl-sm bg-muted/60" 
                        : "rounded-tr-sm bg-primary/5 dark:bg-primary/10"
                    )}
                  >
                    <p className={cn(
                      "text-sm leading-relaxed text-foreground",
                      !isEven && "text-left"
                    )}>
                      {group.text}
                    </p>
                  </div>
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
