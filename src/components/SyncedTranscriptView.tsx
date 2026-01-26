import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Users, Clock, ChevronDown, ChevronUp, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// Word-level timing data from ASR
interface TranscriptWord {
  word: string;
  text?: string;
  start: number;
  end: number;
  speaker?: string;
  speakerId?: string;
}

// Speaker block structure
interface SpeakerBlock {
  speakerId: string;
  speakerName?: string | null;
  text: string;
  start?: number;
  end?: number;
}

interface SyncedTranscriptViewProps {
  meetingId: string;
  words: TranscriptWord[];
  speakerBlocks?: SpeakerBlock[];
  speakerNames?: Record<string, string>;
  currentTime: number; // Audio playback time in seconds
  isPlaying: boolean;
  onSeek?: (time: number) => void;
  className?: string;
}

// Speaker color styles
const SPEAKER_STYLES = [
  { 
    border: 'border-l-blue-500', 
    dot: 'bg-blue-500', 
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/5',
    highlight: 'bg-blue-500/20',
  },
  { 
    border: 'border-l-emerald-500', 
    dot: 'bg-emerald-500', 
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/5',
    highlight: 'bg-emerald-500/20',
  },
  { 
    border: 'border-l-purple-500', 
    dot: 'bg-purple-500', 
    text: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-500/5',
    highlight: 'bg-purple-500/20',
  },
  { 
    border: 'border-l-amber-500', 
    dot: 'bg-amber-500', 
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/5',
    highlight: 'bg-amber-500/20',
  },
  { 
    border: 'border-l-rose-500', 
    dot: 'bg-rose-500', 
    text: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500/5',
    highlight: 'bg-rose-500/20',
  },
  { 
    border: 'border-l-cyan-500', 
    dot: 'bg-cyan-500', 
    text: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-500/5',
    highlight: 'bg-cyan-500/20',
  },
];

const formatTime = (seconds?: number): string => {
  if (seconds == null || isNaN(seconds)) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
};

const getSpeakerNumber = (speakerId: string): number => {
  const match = speakerId.match(/speaker[_\s-]?(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
};

export const SyncedTranscriptView: React.FC<SyncedTranscriptViewProps> = ({
  meetingId,
  words,
  speakerBlocks = [],
  speakerNames = {},
  currentTime,
  isPlaying,
  onSeek,
  className,
}) => {
  const [showSpeakerPanel, setShowSpeakerPanel] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);

  // Group words by speaker
  const wordsBySpeaker = useMemo(() => {
    const groups: { speakerId: string; words: TranscriptWord[]; start: number; end: number }[] = [];
    let currentGroup: { speakerId: string; words: TranscriptWord[]; start: number; end: number } | null = null;

    words.forEach(word => {
      const speakerId = word.speakerId || word.speaker || 'speaker_0';
      
      if (!currentGroup || currentGroup.speakerId !== speakerId) {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = {
          speakerId,
          words: [word],
          start: word.start,
          end: word.end,
        };
      } else {
        currentGroup.words.push(word);
        currentGroup.end = word.end;
      }
    });

    if (currentGroup) groups.push(currentGroup);
    return groups;
  }, [words]);

  // Get unique speakers
  const uniqueSpeakers = useMemo(() => {
    const speakerSet = new Set<string>();
    words.forEach(w => speakerSet.add(w.speakerId || w.speaker || 'speaker_0'));
    return Array.from(speakerSet).sort((a, b) => getSpeakerNumber(a) - getSpeakerNumber(b));
  }, [words]);

  // Speaker stats
  const speakerStats = useMemo(() => {
    const stats: Record<string, { wordCount: number; duration: number }> = {};
    
    words.forEach(word => {
      const id = word.speakerId || word.speaker || 'speaker_0';
      if (!stats[id]) {
        stats[id] = { wordCount: 0, duration: 0 };
      }
      stats[id].wordCount++;
      stats[id].duration += (word.end - word.start);
    });
    
    return stats;
  }, [words]);

  // Create stable color map
  const speakerStyleMap = useMemo(() => {
    const map: Record<string, typeof SPEAKER_STYLES[0]> = {};
    uniqueSpeakers.forEach((id, index) => {
      map[id] = SPEAKER_STYLES[index % SPEAKER_STYLES.length];
    });
    return map;
  }, [uniqueSpeakers]);

  // Get display name for speaker
  const getSpeakerDisplayName = useCallback((speakerId: string): string => {
    if (speakerNames[speakerId]) return speakerNames[speakerId];
    const num = getSpeakerNumber(speakerId);
    return `Talare ${num + 1}`;
  }, [speakerNames]);

  // Find current word index
  const currentWordIndex = useMemo(() => {
    for (let i = 0; i < words.length; i++) {
      if (currentTime >= words[i].start && currentTime <= words[i].end) {
        return i;
      }
      // Find word that hasn't started yet (for between-word states)
      if (i > 0 && currentTime > words[i - 1].end && currentTime < words[i].start) {
        return i - 1;
      }
    }
    // If past all words, return last
    if (words.length > 0 && currentTime > words[words.length - 1].end) {
      return words.length - 1;
    }
    return -1;
  }, [words, currentTime]);

  // Auto-scroll to active word during playback
  useEffect(() => {
    if (isPlaying && activeWordRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const activeWord = activeWordRef.current;
      
      const containerRect = container.getBoundingClientRect();
      const wordRect = activeWord.getBoundingClientRect();
      
      // Check if word is outside visible area (with padding)
      const isOutOfView = 
        wordRect.top < containerRect.top + 80 || 
        wordRect.bottom > containerRect.bottom - 80;
      
      if (isOutOfView) {
        // Calculate scroll position to center the word
        const wordOffsetTop = activeWord.offsetTop;
        const containerHeight = container.clientHeight;
        const scrollTo = wordOffsetTop - (containerHeight / 2) + (activeWord.clientHeight / 2);
        
        container.scrollTo({
          top: Math.max(0, scrollTo),
          behavior: 'smooth'
        });
      }
    }
  }, [currentWordIndex, isPlaying]);

  // Copy transcript
  const handleCopyTranscript = useCallback(() => {
    const text = wordsBySpeaker
      .map(group => {
        const name = getSpeakerDisplayName(group.speakerId);
        const time = formatTime(group.start);
        const groupText = group.words.map(w => w.word || w.text).join(' ');
        return time ? `[${time}] ${name}: ${groupText}` : `${name}: ${groupText}`;
      })
      .join('\n\n');
    navigator.clipboard.writeText(text);
    toast.success('Transkription kopierad');
  }, [wordsBySpeaker, getSpeakerDisplayName]);

  // Handle word click to seek
  const handleWordClick = useCallback((time: number) => {
    onSeek?.(time);
  }, [onSeek]);

  // Total duration
  const totalDuration = useMemo(() => {
    if (words.length === 0) return 0;
    return words[words.length - 1].end;
  }, [words]);

  if (!words || words.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        Ingen transkription med ordtidsstämplar tillgänglig.
      </div>
    );
  }

  let globalWordIndex = 0;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-border/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>{uniqueSpeakers.length} talare</span>
          </div>
          {totalDuration > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>{formatDuration(totalDuration)}</span>
            </div>
          )}
          {isPlaying && (
            <Badge variant="secondary" className="gap-1 text-xs animate-pulse">
              <Play className="w-3 h-3" />
              Spelar
            </Badge>
          )}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyTranscript}
          className="h-8 gap-1.5 text-xs"
        >
          <Copy className="h-3.5 w-3.5" />
          Kopiera
        </Button>
      </div>

      {/* Speaker Panel (collapsed by default) */}
      <Collapsible open={showSpeakerPanel} onOpenChange={setShowSpeakerPanel}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-between h-auto py-2 px-3 hover:bg-muted/50"
          >
            <span className="text-xs font-medium text-muted-foreground">Talare & statistik</span>
            {showSpeakerPanel ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="grid gap-2 pt-2 sm:grid-cols-2">
            {uniqueSpeakers.map(speakerId => {
              const styles = speakerStyleMap[speakerId];
              const stats = speakerStats[speakerId];
              const displayName = getSpeakerDisplayName(speakerId);

              return (
                <div
                  key={speakerId}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border border-border/50 transition-all",
                    styles?.bg || "bg-muted/30"
                  )}
                >
                  <div className={cn("w-2 h-2 rounded-full shrink-0", styles?.dot)} />
                  <div className="flex-1 min-w-0">
                    <span className={cn("font-medium text-sm", styles?.text)}>
                      {displayName}
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {stats?.wordCount || 0} ord
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Synced Transcript */}
      <div 
        ref={scrollContainerRef}
        className="max-h-[60vh] overflow-y-auto overscroll-contain scroll-smooth pr-2 pb-8"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--border)) transparent' }}
      >
        <div className="space-y-4">
          {wordsBySpeaker.map((group, groupIdx) => {
            const styles = speakerStyleMap[group.speakerId];
            const displayName = getSpeakerDisplayName(group.speakerId);
            const timestamp = formatTime(group.start);
            const prevGroup = groupIdx > 0 ? wordsBySpeaker[groupIdx - 1] : null;
            const showDivider = prevGroup && prevGroup.speakerId !== group.speakerId;
            const groupStartIndex = globalWordIndex;

            return (
              <motion.div
                key={groupIdx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(groupIdx * 0.02, 0.3) }}
              >
                {showDivider && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-px bg-border/40" />
                  </div>
                )}

                <div
                  className={cn(
                    "relative pl-4 py-3 border-l-2 rounded-r-lg transition-colors",
                    styles?.border || "border-l-muted-foreground/30",
                    styles?.bg || "bg-muted/10"
                  )}
                >
                  {/* Speaker header */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn("w-2 h-2 rounded-full", styles?.dot || "bg-muted-foreground/50")} />
                    <span className={cn("text-sm font-semibold", styles?.text || "text-muted-foreground")}>
                      {displayName}
                    </span>
                    {timestamp && (
                      <Badge 
                        variant="outline" 
                        className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground/70 border-border/50 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleWordClick(group.start)}
                      >
                        {timestamp}
                      </Badge>
                    )}
                  </div>

                  {/* Word-by-word text with highlighting */}
                  <p className="text-sm leading-relaxed text-foreground pl-4">
                    {group.words.map((word, wordIdx) => {
                      const absoluteIndex = groupStartIndex + wordIdx;
                      const isActive = absoluteIndex === currentWordIndex;
                      const isPast = absoluteIndex < currentWordIndex;
                      globalWordIndex++;

                      return (
                        <span
                          key={wordIdx}
                          ref={isActive ? activeWordRef : null}
                          onClick={() => handleWordClick(word.start)}
                          className={cn(
                            "cursor-pointer transition-all duration-150 rounded px-0.5 -mx-0.5",
                            isActive && cn(
                              "font-semibold scale-105 inline-block",
                              styles?.highlight || "bg-primary/20"
                            ),
                            isPast && "text-muted-foreground/70",
                            !isActive && !isPast && "hover:bg-muted/50"
                          )}
                        >
                          {word.word || word.text}
                          {wordIdx < group.words.length - 1 ? ' ' : ''}
                        </span>
                      );
                    })}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
        {/* Bottom spacer for full scrollability */}
        <div className="h-4" />
      </div>

      {/* Current time indicator */}
      {isPlaying && (
        <div className="text-center text-xs text-muted-foreground pt-2 border-t border-border/30">
          <span className="tabular-nums">{formatTime(currentTime)}</span>
          <span className="mx-2">•</span>
          <span>Klicka på ett ord för att hoppa dit</span>
        </div>
      )}
    </div>
  );
};

export default SyncedTranscriptView;
