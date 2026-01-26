import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Users, Clock, ChevronDown, Play, MessageSquare, Timer, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
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
  currentTime: number;
  isPlaying: boolean;
  onSeek?: (time: number) => void;
  className?: string;
}

// Beautiful gradient-based speaker styles
const SPEAKER_STYLES = [
  { 
    gradient: 'from-blue-500/10 to-blue-500/5',
    border: 'border-l-blue-500', 
    dot: 'bg-gradient-to-br from-blue-400 to-blue-600', 
    text: 'text-blue-600 dark:text-blue-400',
    highlight: 'bg-blue-500/25 ring-1 ring-blue-500/40',
    avatar: 'bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-lg shadow-blue-500/25',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  { 
    gradient: 'from-emerald-500/10 to-emerald-500/5',
    border: 'border-l-emerald-500', 
    dot: 'bg-gradient-to-br from-emerald-400 to-emerald-600', 
    text: 'text-emerald-600 dark:text-emerald-400',
    highlight: 'bg-emerald-500/25 ring-1 ring-emerald-500/40',
    avatar: 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/25',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  { 
    gradient: 'from-violet-500/10 to-violet-500/5',
    border: 'border-l-violet-500', 
    dot: 'bg-gradient-to-br from-violet-400 to-violet-600', 
    text: 'text-violet-600 dark:text-violet-400',
    highlight: 'bg-violet-500/25 ring-1 ring-violet-500/40',
    avatar: 'bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-lg shadow-violet-500/25',
    badge: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  },
  { 
    gradient: 'from-amber-500/10 to-amber-500/5',
    border: 'border-l-amber-500', 
    dot: 'bg-gradient-to-br from-amber-400 to-amber-600', 
    text: 'text-amber-600 dark:text-amber-400',
    highlight: 'bg-amber-500/25 ring-1 ring-amber-500/40',
    avatar: 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/25',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  { 
    gradient: 'from-rose-500/10 to-rose-500/5',
    border: 'border-l-rose-500', 
    dot: 'bg-gradient-to-br from-rose-400 to-rose-600', 
    text: 'text-rose-600 dark:text-rose-400',
    highlight: 'bg-rose-500/25 ring-1 ring-rose-500/40',
    avatar: 'bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-lg shadow-rose-500/25',
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },
  { 
    gradient: 'from-cyan-500/10 to-cyan-500/5',
    border: 'border-l-cyan-500', 
    dot: 'bg-gradient-to-br from-cyan-400 to-cyan-600', 
    text: 'text-cyan-600 dark:text-cyan-400',
    highlight: 'bg-cyan-500/25 ring-1 ring-cyan-500/40',
    avatar: 'bg-gradient-to-br from-cyan-400 to-cyan-600 text-white shadow-lg shadow-cyan-500/25',
    badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
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

  const getSpeakerInitials = useCallback((speakerId: string): string => {
    const name = getSpeakerDisplayName(speakerId);
    if (name.startsWith('Talare ')) {
      return `T${name.replace('Talare ', '')}`;
    }
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [getSpeakerDisplayName]);

  // Find current word index
  const currentWordIndex = useMemo(() => {
    for (let i = 0; i < words.length; i++) {
      if (currentTime >= words[i].start && currentTime <= words[i].end) {
        return i;
      }
      if (i > 0 && currentTime > words[i - 1].end && currentTime < words[i].start) {
        return i - 1;
      }
    }
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
      
      const isOutOfView = 
        wordRect.top < containerRect.top + 60 || 
        wordRect.bottom > containerRect.bottom - 60;
      
      if (isOutOfView) {
        activeWord.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // Total duration and words
  const totalDuration = useMemo(() => {
    if (words.length === 0) return 0;
    return words[words.length - 1].end;
  }, [words]);

  const totalWords = words.length;

  if (!words || words.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        Ingen transkription med ordtidsstämplar tillgänglig.
      </div>
    );
  }

  let globalWordIndex = 0;

  return (
    <div className={cn("space-y-5", className)}>
      {/* Header Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border/50">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="gap-1.5 h-7 px-3 font-medium">
            <Users className="w-3.5 h-3.5" />
            {uniqueSpeakers.length} talare
          </Badge>
          {totalDuration > 0 && (
            <Badge variant="secondary" className="gap-1.5 h-7 px-3 font-medium">
              <Timer className="w-3.5 h-3.5" />
              {formatDuration(totalDuration)}
            </Badge>
          )}
          <Badge variant="secondary" className="gap-1.5 h-7 px-3 font-medium">
            <MessageSquare className="w-3.5 h-3.5" />
            {totalWords.toLocaleString()} ord
          </Badge>
          {isPlaying && (
            <Badge className="gap-1.5 h-7 px-3 font-medium bg-primary/10 text-primary border-primary/20 animate-pulse">
              <Volume2 className="w-3.5 h-3.5" />
              Spelar
            </Badge>
          )}
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyTranscript}
          className="h-8 gap-1.5 text-xs font-medium"
        >
          <Copy className="h-3.5 w-3.5" />
          Kopiera allt
        </Button>
      </div>

      {/* Speaker Panel */}
      <Collapsible open={showSpeakerPanel} onOpenChange={setShowSpeakerPanel}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between py-2 px-1 text-left group">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {uniqueSpeakers.slice(0, 4).map(speakerId => {
                  const styles = speakerStyleMap[speakerId];
                  const initials = getSpeakerInitials(speakerId);
                  return (
                    <div
                      key={speakerId}
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ring-background",
                        styles?.avatar
                      )}
                    >
                      {initials}
                    </div>
                  );
                })}
              </div>
              <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                Talardetaljer
              </span>
            </div>
            <motion.div
              animate={{ rotate: showSpeakerPanel ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </motion.div>
          </button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="grid gap-2 pt-2 sm:grid-cols-2">
            {uniqueSpeakers.map(speakerId => {
              const styles = speakerStyleMap[speakerId];
              const stats = speakerStats[speakerId];
              const displayName = getSpeakerDisplayName(speakerId);
              const initials = getSpeakerInitials(speakerId);
              const percentage = totalWords > 0 
                ? Math.round((stats?.wordCount || 0) / totalWords * 100) 
                : 0;

              return (
                <div
                  key={speakerId}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border border-border/50 transition-all",
                    `bg-gradient-to-br ${styles?.gradient || 'from-muted/50 to-muted/30'}`
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                    styles?.avatar
                  )}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={cn("font-semibold text-sm", styles?.text)}>
                      {displayName}
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {stats?.wordCount || 0} ord ({percentage}%)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Synced Transcript */}
      <ScrollArea className="max-h-[55vh]">
        <div ref={scrollContainerRef} className="space-y-1 pr-2">
          {wordsBySpeaker.map((group, groupIdx) => {
            const styles = speakerStyleMap[group.speakerId];
            const displayName = getSpeakerDisplayName(group.speakerId);
            const initials = getSpeakerInitials(group.speakerId);
            const timestamp = formatTime(group.start);
            const prevGroup = groupIdx > 0 ? wordsBySpeaker[groupIdx - 1] : null;
            const showDivider = prevGroup && prevGroup.speakerId !== group.speakerId;
            const groupStartIndex = globalWordIndex;

            return (
              <motion.div
                key={groupIdx}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(groupIdx * 0.02, 0.3) }}
              >
                {showDivider && (
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                  </div>
                )}

                {/* Message bubble */}
                <div className="flex gap-3 py-2 group">
                  {/* Mini avatar */}
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5",
                    styles?.avatar || "bg-muted text-muted-foreground"
                  )}>
                    {initials}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-sm font-semibold", styles?.text || "text-foreground")}>
                        {displayName}
                      </span>
                      {timestamp && (
                        <button
                          onClick={() => handleWordClick(group.start)}
                          className="text-[11px] text-muted-foreground/60 tabular-nums hover:text-primary transition-colors"
                        >
                          {timestamp}
                        </button>
                      )}
                    </div>

                    {/* Text bubble with word highlighting */}
                    <div className={cn(
                      "rounded-2xl rounded-tl-md px-4 py-2.5 transition-colors",
                      `bg-gradient-to-br ${styles?.gradient || 'from-muted/50 to-muted/30'}`,
                      "border border-border/30"
                    )}>
                      <p className="text-sm leading-relaxed text-foreground">
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
                                "cursor-pointer transition-all duration-100 rounded-sm px-0.5 -mx-0.5 inline-block",
                                isActive && cn(
                                  "font-semibold scale-[1.02]",
                                  styles?.highlight || "bg-primary/20"
                                ),
                                isPast && isPlaying && "text-muted-foreground/60",
                                !isActive && !isPast && "hover:bg-muted/60"
                              )}
                            >
                              {word.word || word.text}
                              {wordIdx < group.words.length - 1 ? ' ' : ''}
                            </span>
                          );
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Playback info bar */}
      {(isPlaying || currentTime > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-3 text-xs text-muted-foreground pt-3 border-t border-border/30"
        >
          <span className="tabular-nums font-medium">{formatTime(currentTime)}</span>
          <span className="text-muted-foreground/40">•</span>
          <span>Klicka på ett ord för att hoppa dit</span>
        </motion.div>
      )}
    </div>
  );
};

export default SyncedTranscriptView;
