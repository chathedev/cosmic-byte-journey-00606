import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Users, Clock, ChevronDown, ChevronUp, Play, Edit2, Check, X, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { backendApi } from '@/lib/backendApi';
import {
  computeSpeakerIndexOffset,
  getBackendSpeakerKeyForTranscriptId,
  isGenericSpeakerName,
  lookupSpeakerNameRecord,
  normalizeSpeakerBackendKey,
} from '@/lib/speakerNameResolution';

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
  cleanedTranscript?: string; // AI-cleaned transcript text (preferred over raw words)
  speakerNames?: Record<string, string>;
  speakerNamesLoading?: boolean;
  currentTime: number; // Audio playback time in seconds
  isPlaying: boolean;
  onSeek?: (time: number) => void;
  onSpeakerNamesUpdated?: (names: Record<string, string>) => void;
  className?: string;
}

const RESET_BACKWARDS_THRESHOLD_SEC = 5; // treat big backwards jumps as a new chunk that reset to 0:00

function normalizeWordTimeline(input: TranscriptWord[]): TranscriptWord[] {
  if (!Array.isArray(input) || input.length === 0) return [];

  let offset = 0;
  let lastAbsStart = -Infinity;
  let lastAbsEnd = -Infinity;

  return input.map((w, idx) => {
    const parsedStart = typeof w.start === 'number' ? w.start : Number.parseFloat(String(w.start));
    const parsedEnd = typeof w.end === 'number' ? w.end : Number.parseFloat(String(w.end));

    const rawStart = Number.isFinite(parsedStart) ? parsedStart : 0;
    const rawEnd = Number.isFinite(parsedEnd) ? parsedEnd : rawStart;

    let absStart = rawStart + offset;
    let absEnd = rawEnd + offset;

    // Detect timestamp reset (e.g. chunked ASR concatenation where the next chunk starts at 0:00)
    if (idx > 0 && absStart < lastAbsStart - RESET_BACKWARDS_THRESHOLD_SEC) {
      offset = Number.isFinite(lastAbsEnd) ? lastAbsEnd : offset;
      absStart = rawStart + offset;
      absEnd = rawEnd + offset;
    }

    // Stabilize small out-of-order glitches without reordering words (binary-search needs monotonic starts)
    if (idx > 0 && absStart < lastAbsStart) {
      absStart = lastAbsStart;
      absEnd = Math.max(absEnd, absStart);
    }

    if (absEnd < absStart) absEnd = absStart;

    lastAbsStart = absStart;
    lastAbsEnd = Math.max(lastAbsEnd, absEnd);

    return { ...w, start: absStart, end: absEnd };
  });
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

// (Speaker name normalization/resolution lives in '@/lib/speakerNameResolution')

export const SyncedTranscriptView: React.FC<SyncedTranscriptViewProps> = ({
  meetingId,
  words,
  speakerBlocks = [],
  cleanedTranscript,
  speakerNames: initialSpeakerNames = {},
  speakerNamesLoading = false,
  currentTime,
  isPlaying,
  onSeek,
  onSpeakerNamesUpdated,
  className,
}) => {
  const [showSpeakerPanel, setShowSpeakerPanel] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [localSpeakerNames, setLocalSpeakerNames] = useState<Record<string, string>>({});
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);

  const normalizedWords = useMemo(() => normalizeWordTimeline(words), [words]);

  // Merge speaker names with local edits taking priority
  const speakerNames = { ...initialSpeakerNames, ...localSpeakerNames };

  // Build a map of block-level suggested names
  const blockSuggestedNames = useMemo(() => {
    const suggestions: Record<string, string> = {};
    speakerBlocks.forEach(block => {
      if (block.speakerName && !isGenericSpeakerName(block.speakerName) && !suggestions[block.speakerId]) {
        suggestions[block.speakerId] = block.speakerName;
      }
    });
    return suggestions;
  }, [speakerBlocks]);

  // Auto-scroll stability: avoid fighting the user's manual scrolling and throttle programmatic scroll.
  const programmaticScrollRef = useRef(false);
  const userScrollLockUntilRef = useRef(0);
  const lastAutoScrollAtRef = useRef(0);
  const prefersReducedMotionRef = useRef(false);
  const lastUserInteractionRef = useRef(0);
  const isUserScrollingRef = useRef(false);
  const scrollIdleTimerRef = useRef<number | null>(null);
  const forceAutoScrollRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    prefersReducedMotionRef.current =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }, []);

  // Lock auto-scroll when user manually scrolls, resume after 2s of no interaction
  const lockAutoScrollForUser = useCallback(() => {
    userScrollLockUntilRef.current = Date.now() + 2000;
    lastUserInteractionRef.current = Date.now();
    isUserScrollingRef.current = true;
    
    // Clear existing idle timer
    if (scrollIdleTimerRef.current) {
      window.clearTimeout(scrollIdleTimerRef.current);
    }
    
    // Set new idle timer to resume auto-scroll
    scrollIdleTimerRef.current = window.setTimeout(() => {
      isUserScrollingRef.current = false;
      userScrollLockUntilRef.current = 0;
    }, 2000);
  }, []);

  // Cleanup idle timer on unmount
  useEffect(() => {
    return () => {
      if (scrollIdleTimerRef.current) {
        window.clearTimeout(scrollIdleTimerRef.current);
      }
    };
  }, []);

  const handleContainerScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;
    lockAutoScrollForUser();
  }, [lockAutoScrollForUser]);

  const handleContainerWheel = useCallback(() => {
    lockAutoScrollForUser();
  }, [lockAutoScrollForUser]);

  const handleContainerTouch = useCallback(() => {
    lockAutoScrollForUser();
  }, [lockAutoScrollForUser]);

  // Group words by speaker
  const wordsBySpeaker = useMemo(() => {
    const groups: { speakerId: string; words: TranscriptWord[]; start: number; end: number; cleanedText?: string }[] = [];
    let currentGroup: { speakerId: string; words: TranscriptWord[]; start: number; end: number; cleanedText?: string } | null = null;

    normalizedWords.forEach(word => {
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
    
    // Try to match groups with cleaned speaker blocks by timestamp overlap
    // speakerBlocks have cleaned/AI-corrected text that should be preferred
    if (speakerBlocks.length > 0) {
      groups.forEach((group, idx) => {
        // Find matching speaker block by timestamp or speaker ID
        const matchingBlock = speakerBlocks.find(block => {
          const blockStart = block.start ?? 0;
          const blockEnd = block.end ?? Infinity;
          const timeOverlap = group.start >= blockStart - 1 && group.start <= blockEnd + 1;
          const speakerMatch = block.speakerId === group.speakerId || 
            block.speakerId.replace('speaker_', '') === group.speakerId.replace('speaker_', '');
          return speakerMatch || timeOverlap;
        });
        
        if (matchingBlock?.text) {
          group.cleanedText = matchingBlock.text;
        }
      });
    }
    
    // Fallback: if we have a single cleaned transcript and single group, use it
    if (groups.length === 1 && cleanedTranscript && !groups[0].cleanedText) {
      groups[0].cleanedText = cleanedTranscript;
    }
    
    return groups;
  }, [normalizedWords, speakerBlocks, cleanedTranscript]);

  // Get unique speakers
  const uniqueSpeakers = useMemo(() => {
    const speakerSet = new Set<string>();
    normalizedWords.forEach(w => speakerSet.add(w.speakerId || w.speaker || 'speaker_0'));
    return Array.from(speakerSet).sort((a, b) => getSpeakerNumber(a) - getSpeakerNumber(b));
  }, [normalizedWords]);

  // Speaker stats
  const speakerStats = useMemo(() => {
    const stats: Record<string, { wordCount: number; duration: number }> = {};
    
    normalizedWords.forEach(word => {
      const id = word.speakerId || word.speaker || 'speaker_0';
      if (!stats[id]) {
        stats[id] = { wordCount: 0, duration: 0 };
      }
      stats[id].wordCount++;
      stats[id].duration += (word.end - word.start);
    });
    
    return stats;
  }, [normalizedWords]);

  // Create stable color map
  const speakerStyleMap = useMemo(() => {
    const map: Record<string, typeof SPEAKER_STYLES[0]> = {};
    uniqueSpeakers.forEach((id, index) => {
      map[id] = SPEAKER_STYLES[index % SPEAKER_STYLES.length];
    });
    return map;
  }, [uniqueSpeakers]);

  // If backend stores aliases as speaker_1 but transcript uses speaker_0, detect that offset.
  const speakerIndexOffset = useMemo(() => {
    // Prefer backend-hydrated names (initial) for offset detection.
    const source = Object.keys(initialSpeakerNames).length > 0 ? initialSpeakerNames : speakerNames;
    return computeSpeakerIndexOffset(uniqueSpeakers, source);
  }, [uniqueSpeakers, initialSpeakerNames, speakerNames]);

  /**
   * Display name resolution priority (per backend docs):
   * 1) speakerNames[label] - User-edited names (highest priority)
   * 2) block.speakerName - AI-suggested from cleanup ("Hej, jag heter...")
   * 3) Formatted label - "Talare X" fallback
   */
  const getSpeakerDisplayName = useCallback((speakerId: string): string => {
    // 1) Check user-edited names first (with normalization fallback)
    const userName = lookupSpeakerNameRecord(speakerNames, speakerId, speakerIndexOffset);
    if (userName) {
      return userName;
    }
    // 2) Check block-level suggested names from AI cleanup (with normalization)
    const blockName = lookupSpeakerNameRecord(blockSuggestedNames, speakerId, 0);
    if (blockName) {
      return blockName;
    }
    // 3) Check initial speaker names (may contain suggestions from backend)
    const initialName = lookupSpeakerNameRecord(initialSpeakerNames, speakerId, speakerIndexOffset);
    if (initialName) {
      return initialName;
    }
    // 4) Fallback to formatted label
    const num = getSpeakerNumber(speakerId);
    return `Talare ${num + 1}`;
  }, [speakerNames, blockSuggestedNames, initialSpeakerNames, speakerIndexOffset]);

  // Check if name is AI-suggested (not user-edited)
  const isAISuggested = useCallback((speakerId: string): boolean => {
    const backendKey = getBackendSpeakerKeyForTranscriptId(speakerId, speakerIndexOffset);
    if (localSpeakerNames[backendKey] || localSpeakerNames[speakerId] || localSpeakerNames[normalizeSpeakerBackendKey(speakerId)]) {
      return false;
    }
    return !!lookupSpeakerNameRecord(blockSuggestedNames, speakerId, 0);
  }, [localSpeakerNames, blockSuggestedNames, speakerIndexOffset]);

  // Find current word index - improved algorithm for accurate word tracking
  const currentWordIndex = useMemo(() => {
    if (normalizedWords.length === 0) return -1;
    if (currentTime < 0) return -1;
    
    // Before first word
    if (currentTime < normalizedWords[0].start) {
      return -1;
    }
    
    // Binary search for efficiency with long transcripts
    let left = 0;
    let right = normalizedWords.length - 1;
    let bestMatch = -1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const word = normalizedWords[mid];
      
      if (currentTime >= word.start && currentTime <= word.end) {
        // Exact match - word is currently being spoken
        return mid;
      }
      
      if (currentTime < word.start) {
        right = mid - 1;
      } else {
        // currentTime > word.end - this word has passed, but might be the best match
        bestMatch = mid;
        left = mid + 1;
      }
    }
    
    // Check if we're between words (in a gap)
    if (bestMatch >= 0 && bestMatch < normalizedWords.length - 1) {
      const nextWord = normalizedWords[bestMatch + 1];
      // If we're closer to the next word and within a small gap, prefer showing the previous word
      if (currentTime < nextWord.start) {
        return bestMatch;
      }
    }
    
    // Past all words - return last word
    if (bestMatch === -1 && normalizedWords.length > 0 && currentTime >= normalizedWords[normalizedWords.length - 1].end) {
      return normalizedWords.length - 1;
    }
    
    return bestMatch;
  }, [normalizedWords, currentTime]);

  // Auto-scroll to active word during playback.
  // IMPORTANT: Do not auto-scroll on pause; only when playing or when a seek explicitly requested it.
  useEffect(() => {
    if (!activeWordRef.current || !scrollContainerRef.current) return;
    if (currentWordIndex < 0) return;

    const force = forceAutoScrollRef.current;
    const shouldAutoScroll = isPlaying || force;
    if (!shouldAutoScroll) return;

    const now = Date.now();
    
    // Skip if user is actively scrolling
    if (!force) {
      if (isPlaying && isUserScrollingRef.current) return;
      if (isPlaying && now < userScrollLockUntilRef.current) return;
    }
    
    // Throttle scroll updates during playback (every 200ms for smoother feel)
    if (!force && isPlaying && now - lastAutoScrollAtRef.current < 200) return;

    const container = scrollContainerRef.current;
    const activeWord = activeWordRef.current;

    const containerRect = container.getBoundingClientRect();
    const wordRect = activeWord.getBoundingClientRect();

    // Center the active word vertically in the container
    const containerCenter = containerRect.top + containerRect.height / 2;
    const wordCenter = wordRect.top + wordRect.height / 2;
    const distanceFromCenter = Math.abs(wordCenter - containerCenter);

    // Only scroll if word is more than 15% away from center
    const threshold = containerRect.height * 0.15;
    if (distanceFromCenter < threshold) return;

    const wordTopRelativeToContainer = wordRect.top - containerRect.top + container.scrollTop;
    const targetTop = wordTopRelativeToContainer - container.clientHeight / 2 + wordRect.height / 2;

    programmaticScrollRef.current = true;
    lastAutoScrollAtRef.current = now;

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: prefersReducedMotionRef.current ? 'auto' : 'smooth',
    });

    if (force) {
      forceAutoScrollRef.current = false;
    }

    window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, prefersReducedMotionRef.current ? 0 : 250);
  }, [currentWordIndex, isPlaying]);

  // Normalize speaker label to backend format (speaker_0, speaker_1, etc.)
  const normalizeSpeakerLabel = (label: string): string => {
    if (/^speaker_\d+$/.test(label)) return label;
    const match = label.match(/(?:speaker|talare)[_\s-]?(\d+)/i);
    if (match) return `speaker_${match[1]}`;
    const numMatch = label.match(/(\d+)/);
    if (numMatch) return `speaker_${numMatch[1]}`;
    return label.toLowerCase().replace(/\s+/g, '_');
  };

  // Handle edit speaker
  const handleEditSpeaker = (speakerId: string) => {
    setEditingSpeaker(speakerId);
    setEditedName(getSpeakerDisplayName(speakerId));
  };

  // Save speaker name to backend
  const handleSaveSpeakerName = async () => {
    if (!editingSpeaker || !meetingId) return;

    // Normalize to backend format, accounting for potential speaker_0 vs speaker_1 offset.
    const speakerLabel = getBackendSpeakerKeyForTranscriptId(editingSpeaker, speakerIndexOffset);
    const newName = editedName.trim();
    
    if (!newName) {
      setEditingSpeaker(null);
      return;
    }

    setSavingName(true);
    
    try {
      setLocalSpeakerNames(prev => ({ ...prev, [speakerLabel]: newName }));
      
      // Build normalized names map for backend
      const normalizedNames: Record<string, string> = {};
      Object.entries(speakerNames).forEach(([key, value]) => {
        const normalizedKey = normalizeSpeakerBackendKey(key);
        if (normalizedKey) normalizedNames[normalizedKey] = value;
      });
      normalizedNames[speakerLabel] = newName;
      
      console.log('[Speaker] Saving speaker names:', normalizedNames);
      
      const saveResult = await backendApi.saveSpeakerNames(meetingId, normalizedNames);
      onSpeakerNamesUpdated?.(saveResult.speakerNames);
      toast.success(`Namn sparat: ${newName}`);
    } catch (error) {
      console.error('Error saving speaker name:', error);
      toast.error('Kunde inte spara namn');
      setLocalSpeakerNames(prev => {
        const reverted = { ...prev };
        delete reverted[speakerLabel];
        return reverted;
      });
    } finally {
      setSavingName(false);
      setEditingSpeaker(null);
    }
  };

  // Copy transcript - prefer cleaned text
  const handleCopyTranscript = useCallback(() => {
    const text = wordsBySpeaker
      .map(group => {
        const name = getSpeakerDisplayName(group.speakerId);
        const time = formatTime(group.start);
        // Prefer cleaned text if available, otherwise join raw words
        const groupText = group.cleanedText || group.words.map(w => w.word || w.text).join(' ');
        return time ? `[${time}] ${name}: ${groupText}` : `${name}: ${groupText}`;
      })
      .join('\n\n');
    navigator.clipboard.writeText(text);
    toast.success('Transkription kopierad');
  }, [wordsBySpeaker, getSpeakerDisplayName]);

  // Handle word click to seek
  const handleWordClick = useCallback((time: number) => {
    // Ensure a click/seek never gets treated as "manual scrolling" and that we re-center immediately.
    forceAutoScrollRef.current = true;
    isUserScrollingRef.current = false;
    userScrollLockUntilRef.current = 0;
    onSeek?.(time);
  }, [onSeek]);

  // Total duration
  const totalDuration = useMemo(() => {
    if (normalizedWords.length === 0) return 0;
    return normalizedWords[normalizedWords.length - 1].end;
  }, [normalizedWords]);

  // Build a map of absolute word indices for each group - computed once per render
  const groupWordIndices = useMemo(() => {
    const indices: number[] = [];
    let runningIndex = 0;
    wordsBySpeaker.forEach(group => {
      indices.push(runningIndex);
      runningIndex += group.words.length;
    });
    return indices;
  }, [wordsBySpeaker]);

  if (!normalizedWords || normalizedWords.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        Ingen transkription med ordtidsstämplar tillgänglig.
      </div>
    );
  }

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

      {/* Speaker Panel with inline editing */}
      <Collapsible open={showSpeakerPanel} onOpenChange={setShowSpeakerPanel}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-between h-auto py-2 px-3 hover:bg-muted/50"
          >
            <span className="text-xs font-medium text-muted-foreground">Talare • Klicka för att redigera namn</span>
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
              const isEditing = editingSpeaker === speakerId;
              const isSuggested = isAISuggested(speakerId);
              const hasRealName = !isGenericSpeakerName(displayName);

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
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          className="h-7 text-sm"
                          autoFocus
                          placeholder="Ange namn..."
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
                          className="h-7 w-7 p-0"
                        >
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingSpeaker(null)}
                          className="h-7 w-7 p-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEditSpeaker(speakerId)}
                        className="w-full text-left group"
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn("font-medium text-sm", styles?.text)}>
                            {displayName}
                          </span>
                          {/* Loading indicator for generic names while waiting for Lyra */}
                          {speakerNamesLoading && !hasRealName && (
                            <Badge variant="outline" className="gap-1 text-[10px] h-5 px-1.5 text-muted-foreground border-border/50 bg-muted/30 animate-pulse">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              Hämtar...
                            </Badge>
                          )}
                          {isSuggested && hasRealName && !speakerNamesLoading && (
                            <Badge variant="outline" className="gap-1 text-[10px] h-5 px-1.5 text-amber-600 border-amber-500/30 bg-amber-500/5">
                              <Sparkles className="w-2.5 h-2.5" />
                              Förslag
                            </Badge>
                          )}
                          <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {stats?.wordCount || 0} ord
                        </div>
                      </button>
                    )}
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
        onScroll={handleContainerScroll}
        onWheel={handleContainerWheel}
        onTouchStart={handleContainerTouch}
        onTouchMove={handleContainerTouch}
        className="max-h-[60vh] overflow-y-auto overscroll-contain pr-2 pb-8"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--border)) transparent' }}
      >
        <div className="space-y-4">
          {wordsBySpeaker.map((group, groupIdx) => {
            const styles = speakerStyleMap[group.speakerId];
            const displayName = getSpeakerDisplayName(group.speakerId);
            const timestamp = formatTime(group.start);
            const prevGroup = groupIdx > 0 ? wordsBySpeaker[groupIdx - 1] : null;
            const showDivider = prevGroup && prevGroup.speakerId !== group.speakerId;
            const groupStartIndex = groupWordIndices[groupIdx];

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
                    {/* Loading indicator for generic names */}
                    {speakerNamesLoading && isGenericSpeakerName(displayName) && (
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    )}
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

                  {/* Text content - always render word-by-word for click-to-seek and highlighting */}
                  <div className="text-sm leading-relaxed text-foreground pl-4">
                    <p>
                      {group.words.map((word, wordIdx) => {
                        const absoluteIndex = groupStartIndex + wordIdx;
                        const isActive = absoluteIndex === currentWordIndex;
                        const isPast = absoluteIndex < currentWordIndex;

                        return (
                          <React.Fragment key={wordIdx}>
                            <span
                              ref={isActive ? activeWordRef : null}
                              onClick={() => handleWordClick(word.start)}
                              className={cn(
                                "cursor-pointer rounded-sm px-0.5 -mx-0.5 inline-block align-baseline box-decoration-clone transition-[background-color,box-shadow] duration-75",
                                isActive && "bg-primary/20 ring-1 ring-primary/30",
                                isPast && "text-muted-foreground/60",
                                !isActive && !isPast && "hover:bg-muted/50"
                              )}
                            >
                              {word.word || word.text}
                            </span>
                            {wordIdx < group.words.length - 1 && ' '}
                          </React.Fragment>
                        );
                      })}
                    </p>
                  </div>
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
        <div className="flex items-center justify-center pt-2 border-t border-border/30">
          <Badge variant="outline" className="text-xs tabular-nums">
            {formatTime(currentTime)}
          </Badge>
        </div>
      )}
    </div>
  );
};

export default SyncedTranscriptView;
