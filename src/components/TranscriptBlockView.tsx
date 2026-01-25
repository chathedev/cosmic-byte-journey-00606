import React, { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Edit2, X, FileText, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { backendApi } from '@/lib/backendApi';

interface SpeakerBlock {
  speakerId: string;
  speakerName: string | null;
  text: string;
}

interface TranscriptBlockViewProps {
  meetingId: string;
  transcript: string;
  transcriptRaw?: string | null;
  speakerBlocksCleaned?: SpeakerBlock[] | null;
  speakerBlocksRaw?: SpeakerBlock[] | null;
  speakerNames: Record<string, string>;
  onSpeakerNamesUpdated?: (names: Record<string, string>) => void;
  className?: string;
}

// Clean, professional speaker colors
const SPEAKER_COLORS = [
  { border: 'border-l-blue-500', dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  { border: 'border-l-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  { border: 'border-l-amber-500', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  { border: 'border-l-purple-500', dot: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400' },
  { border: 'border-l-rose-500', dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  { border: 'border-l-cyan-500', dot: 'bg-cyan-500', text: 'text-cyan-600 dark:text-cyan-400' },
];

export const TranscriptBlockView: React.FC<TranscriptBlockViewProps> = ({
  meetingId,
  transcript,
  transcriptRaw,
  speakerBlocksCleaned,
  speakerBlocksRaw,
  speakerNames: initialSpeakerNames,
  onSpeakerNamesUpdated,
  className,
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [localSpeakerNames, setLocalSpeakerNames] = useState<Record<string, string>>({});

  const speakerNames = { ...initialSpeakerNames, ...localSpeakerNames };

  // Determine which blocks to display
  const blocks = useMemo(() => {
    const sourceBlocks = showRaw ? speakerBlocksRaw : speakerBlocksCleaned;
    
    if (sourceBlocks && sourceBlocks.length > 0) {
      return sourceBlocks;
    }
    
    // Fallback: wrap entire transcript as single speaker block
    const displayText = showRaw ? (transcriptRaw || transcript) : transcript;
    return [{
      speakerId: 'speaker_1',
      speakerName: null,
      text: displayText,
    }];
  }, [showRaw, speakerBlocksCleaned, speakerBlocksRaw, transcript, transcriptRaw]);

  // Get unique speakers from blocks
  const uniqueSpeakers = useMemo(() => {
    const seen = new Set<string>();
    return blocks.filter(b => {
      if (seen.has(b.speakerId)) return false;
      seen.add(b.speakerId);
      return true;
    }).map(b => b.speakerId);
  }, [blocks]);

  // Create speaker color map
  const speakerColorMap = useMemo(() => {
    const map: Record<string, typeof SPEAKER_COLORS[0]> = {};
    uniqueSpeakers.forEach((speakerId, index) => {
      map[speakerId] = SPEAKER_COLORS[index % SPEAKER_COLORS.length];
    });
    return map;
  }, [uniqueSpeakers]);

  const getSpeakerDisplayName = useCallback((speakerId: string, blockSpeakerName: string | null) => {
    // Priority: user-edited names > block speakerName > speakerId
    return speakerNames[speakerId] || blockSpeakerName || speakerId;
  }, [speakerNames]);

  const handleEditSpeaker = (speakerId: string, currentName: string) => {
    setEditingSpeaker(speakerId);
    setEditedName(currentName);
  };

  const handleSaveSpeakerName = async () => {
    if (!editingSpeaker || !meetingId) return;

    const speakerId = editingSpeaker;
    const newName = editedName.trim();
    
    if (!newName) {
      setEditingSpeaker(null);
      return;
    }

    setSavingName(true);
    
    try {
      const updatedNames = { ...speakerNames, [speakerId]: newName };
      setLocalSpeakerNames(prev => ({ ...prev, [speakerId]: newName }));
      
      const saveResult = await backendApi.saveSpeakerNames(meetingId, updatedNames);
      onSpeakerNamesUpdated?.(saveResult.speakerNames);
      
      toast.success('Talarnamn sparat');
    } catch (error) {
      console.error('Error saving speaker name:', error);
      toast.error('Kunde inte spara namn');
    } finally {
      setSavingName(false);
      setEditingSpeaker(null);
    }
  };

  const hasRawTranscript = !!transcriptRaw && transcriptRaw !== transcript;
  const hasMultipleSpeakers = uniqueSpeakers.length > 1;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Transkription</span>
            {hasMultipleSpeakers && (
              <span className="text-xs text-muted-foreground/60">• {uniqueSpeakers.length} talare</span>
            )}
          </div>
          
          {/* Speaker chips for quick edit */}
          {hasMultipleSpeakers && (
            <div className="flex flex-wrap gap-1.5">
              {uniqueSpeakers.map(speakerId => {
                const colors = speakerColorMap[speakerId];
                const block = blocks.find(b => b.speakerId === speakerId);
                const displayName = getSpeakerDisplayName(speakerId, block?.speakerName || null);
                const isEditing = editingSpeaker === speakerId;

                if (isEditing) {
                  return (
                    <div key={speakerId} className="flex items-center gap-1 bg-muted rounded-md px-2 py-1">
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
                    key={speakerId}
                    onClick={() => handleEditSpeaker(speakerId, displayName)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md",
                      "bg-muted/50 hover:bg-muted border border-transparent hover:border-border/50",
                      "transition-all duration-150"
                    )}
                  >
                    <div className={cn("w-2 h-2 rounded-full", colors?.dot)} />
                    <span className={cn("font-medium", colors?.text)}>
                      {displayName}
                    </span>
                    <Edit2 className="h-2.5 w-2.5 opacity-30" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Raw/Clean toggle */}
        {hasRawTranscript && (
          <button
            onClick={() => setShowRaw(!showRaw)}
            className={cn(
              "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md flex-shrink-0",
              "bg-muted/50 hover:bg-muted border border-transparent hover:border-border/50",
              "transition-all duration-150"
            )}
          >
            {showRaw ? (
              <>
                <ToggleRight className="h-3.5 w-3.5 text-primary" />
                <span className="text-muted-foreground">Rå text</span>
              </>
            ) : (
              <>
                <ToggleLeft className="h-3.5 w-3.5" />
                <span className="text-muted-foreground">Städad</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Transcript content */}
      <ScrollArea className="max-h-[60vh]">
        <div className="space-y-0 pr-2">
          {blocks.map((block, index) => {
            const colors = speakerColorMap[block.speakerId];
            const displayName = getSpeakerDisplayName(block.speakerId, block.speakerName);
            const prevBlock = index > 0 ? blocks[index - 1] : null;
            const showDivider = prevBlock && prevBlock.speakerId !== block.speakerId;

            return (
              <div key={index}>
                {/* Divider between different speakers */}
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
                  {/* Speaker name */}
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn("w-1.5 h-1.5 rounded-full", colors?.dot || "bg-muted-foreground/50")} />
                    <span className={cn("text-xs font-semibold", colors?.text || "text-muted-foreground")}>
                      {displayName}
                    </span>
                  </div>

                  {/* Text content */}
                  <p className="text-sm text-foreground leading-relaxed pl-3.5 whitespace-pre-wrap">
                    {block.text}
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

export default TranscriptBlockView;
