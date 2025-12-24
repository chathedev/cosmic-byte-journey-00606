import React, { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Edit2, User, Copy, Clock } from 'lucide-react';
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

// Speaker colors - minimalistic palette
const SPEAKER_COLORS = [
  { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
  { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' },
  { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-600 dark:text-cyan-400', dot: 'bg-cyan-500' },
];

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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

  // Create speaker color map
  const speakerColorMap = useMemo(() => {
    if (!speakers) return {};
    const map: Record<string, typeof SPEAKER_COLORS[0]> = {};
    speakers.forEach((speaker, index) => {
      map[speaker.label] = SPEAKER_COLORS[index % SPEAKER_COLORS.length];
    });
    return map;
  }, [speakers]);

  // Match transcript segments to speakers based on time overlap
  const segmentsWithSpeakers = useMemo(() => {
    if (!transcriptSegments || !speakers) return [];

    return transcriptSegments.map(segment => {
      // Find which speaker was talking during this segment
      let matchedSpeaker: string | null = null;
      let maxOverlap = 0;

      for (const speaker of speakers) {
        for (const speakerSegment of speaker.segments) {
          // Calculate overlap
          const overlapStart = Math.max(segment.start, speakerSegment.start);
          const overlapEnd = Math.min(segment.end, speakerSegment.end);
          const overlap = Math.max(0, overlapEnd - overlapStart);

          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            matchedSpeaker = speaker.label;
          }
        }
      }

      return {
        ...segment,
        speaker: matchedSpeaker,
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
    }> = [];

    let currentGroup: typeof groups[0] | null = null;

    for (const segment of segmentsWithSpeakers) {
      if (!currentGroup || currentGroup.speaker !== segment.speaker) {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          speaker: segment.speaker,
          segments: [segment],
          startTime: segment.start,
          endTime: segment.end,
        };
      } else {
        currentGroup.segments.push(segment);
        currentGroup.endTime = segment.end;
      }
    }

    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  }, [segmentsWithSpeakers]);

  const handleEditSpeaker = (speakerLabel: string) => {
    setEditingSpeaker(speakerLabel);
    setEditedName(names[speakerLabel] || speakerLabel);
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
          const speakerName = group.speaker ? (names[group.speaker] || group.speaker) : 'Okänd';
          const content = group.segments.map(s => s.text.trim()).join(' ');
          return `${speakerName}: ${content}`;
        })
        .join('\n\n');
      navigator.clipboard.writeText(text);
    } else {
      navigator.clipboard.writeText(transcript || '');
    }
    toast.success('Transkription kopierad');
  }, [hasSpeakerData, groupedSegments, names, transcript]);

  // If no speaker data or SIS not enabled, show simple transcript
  if (!hasSpeakerData || !transcriptSegments || groupedSegments.length === 0) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Transkription</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyTranscript}
            className="h-8 gap-2"
          >
            <Copy className="h-3.5 w-3.5" />
            Kopiera
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
    <div className={cn("space-y-4", className)}>
      {/* Header with speaker legend */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Transkription med talare</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyTranscript}
            className="h-8 gap-2"
          >
            <Copy className="h-3.5 w-3.5" />
            Kopiera
          </Button>
        </div>

        {/* Speaker legend with inline editing */}
        <div className="flex flex-wrap gap-2">
          {speakers?.map(speaker => {
            const colors = speakerColorMap[speaker.label];
            const isEditing = editingSpeaker === speaker.label;

            return (
              <div
                key={speaker.label}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs",
                  colors?.bg,
                  "border",
                  colors?.border
                )}
              >
                <div className={cn("w-2 h-2 rounded-full", colors?.dot)} />
                
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="h-5 w-24 text-xs px-1.5 py-0"
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
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className={cn("font-medium", colors?.text)}>
                      {names[speaker.label] || speaker.speakerName || speaker.label}
                    </span>
                    {onSaveSpeakerName && (
                      <button
                        onClick={() => handleEditSpeaker(speaker.label)}
                        className="opacity-50 hover:opacity-100 transition-opacity"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Transcript with speaker attribution */}
      <ScrollArea className="max-h-[60vh]">
        <div className="space-y-4 pr-4">
          {groupedSegments.map((group, index) => {
            const colors = group.speaker ? speakerColorMap[group.speaker] : null;
            const speakerName = group.speaker 
              ? (names[group.speaker] || speakers?.find(s => s.label === group.speaker)?.speakerName || group.speaker)
              : 'Okänd';

            return (
              <div
                key={index}
                className={cn(
                  "rounded-lg p-3 space-y-1.5",
                  colors?.bg || "bg-muted/50",
                  "border",
                  colors?.border || "border-border"
                )}
              >
                {/* Speaker header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", colors?.dot || "bg-muted-foreground")} />
                    <span className={cn("text-sm font-medium", colors?.text || "text-muted-foreground")}>
                      {speakerName}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(group.startTime)}
                  </span>
                </div>

                {/* Content */}
                <p className="text-sm text-foreground leading-relaxed pl-4">
                  {group.segments.map(s => s.text.trim()).join(' ')}
                </p>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SpeakerTranscriptView;
