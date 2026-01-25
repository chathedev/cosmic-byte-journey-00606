import React, { useState, useMemo } from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SpeakerBlock {
  speakerId: string;
  speakerName: string | null;
  text: string;
}

interface TranscriptBlockViewProps {
  meetingId: string;
  transcriptRaw?: string | null;
  speakerBlocksCleaned?: SpeakerBlock[] | null;
  speakerBlocksRaw?: SpeakerBlock[] | null;
  speakerNames?: Record<string, string>;
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
  transcriptRaw,
  speakerBlocksCleaned,
  speakerBlocksRaw,
  speakerNames = {},
  className,
}) => {
  const [showRaw, setShowRaw] = useState(false);

  // Determine which blocks to display - ALWAYS use speakerBlocksCleaned by default
  const blocks = useMemo(() => {
    if (showRaw) {
      // Show raw version
      if (speakerBlocksRaw && speakerBlocksRaw.length > 0) {
        return speakerBlocksRaw;
      }
      // Fallback to raw transcript as single block
      if (transcriptRaw) {
        return [{
          speakerId: 'speaker_1',
          speakerName: null,
          text: transcriptRaw,
        }];
      }
    }
    
    // Default: show cleaned version from speakerBlocksCleaned
    if (speakerBlocksCleaned && speakerBlocksCleaned.length > 0) {
      return speakerBlocksCleaned;
    }
    
    // No blocks available
    return [];
  }, [showRaw, speakerBlocksCleaned, speakerBlocksRaw, transcriptRaw]);

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

  const getSpeakerDisplayName = (speakerId: string, blockSpeakerName: string | null): string => {
    // Priority: speakerNames map > block speakerName > formatted speakerId
    if (speakerNames[speakerId]) {
      return speakerNames[speakerId];
    }
    if (blockSpeakerName) {
      return blockSpeakerName;
    }
    // Format speaker_1 -> Talare 1
    const match = speakerId.match(/speaker[_-]?(\d+)/i);
    if (match) {
      return `Talare ${match[1]}`;
    }
    return speakerId;
  };

  // Check if we have raw transcript available for toggle
  const hasRawAvailable = !!(transcriptRaw || (speakerBlocksRaw && speakerBlocksRaw.length > 0));
  const hasMultipleSpeakers = uniqueSpeakers.length > 1;

  // If no blocks at all, show nothing
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {hasMultipleSpeakers && (
            <div className="flex items-center gap-1.5">
              {uniqueSpeakers.map(speakerId => {
                const colors = speakerColorMap[speakerId];
                const block = blocks.find(b => b.speakerId === speakerId);
                const displayName = getSpeakerDisplayName(speakerId, block?.speakerName || null);

                return (
                  <div
                    key={speakerId}
                    className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-muted/50"
                  >
                    <div className={cn("w-2 h-2 rounded-full", colors?.dot)} />
                    <span className={cn("font-medium", colors?.text)}>
                      {displayName}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Raw/Clean toggle */}
        {hasRawAvailable && (
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
