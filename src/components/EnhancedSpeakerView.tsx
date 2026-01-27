import React, { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Edit2, Copy, X, Users, Clock, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { backendApi } from '@/lib/backendApi';
import { motion, AnimatePresence } from 'framer-motion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface SpeakerBlock {
  speakerId: string;
  speakerName?: string | null;
  text: string;
  start?: number;
  end?: number;
}

interface EnhancedSpeakerViewProps {
  meetingId: string;
  speakerBlocks: SpeakerBlock[];
  speakerNames?: Record<string, string>;
  onSpeakerNamesUpdated?: (names: Record<string, string>) => void;
  className?: string;
}

// Clean, professional speaker colors with full styling
const SPEAKER_STYLES = [
  { 
    border: 'border-l-blue-500', 
    dot: 'bg-blue-500', 
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-500/5 hover:bg-blue-500/10',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    avatar: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  },
  { 
    border: 'border-l-emerald-500', 
    dot: 'bg-emerald-500', 
    text: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/5 hover:bg-emerald-500/10',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    avatar: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  },
  { 
    border: 'border-l-purple-500', 
    dot: 'bg-purple-500', 
    text: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-500/5 hover:bg-purple-500/10',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    avatar: 'bg-purple-500/20 text-purple-600 dark:text-purple-400',
  },
  { 
    border: 'border-l-amber-500', 
    dot: 'bg-amber-500', 
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/5 hover:bg-amber-500/10',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    avatar: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  },
  { 
    border: 'border-l-rose-500', 
    dot: 'bg-rose-500', 
    text: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500/5 hover:bg-rose-500/10',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    avatar: 'bg-rose-500/20 text-rose-600 dark:text-rose-400',
  },
  { 
    border: 'border-l-cyan-500', 
    dot: 'bg-cyan-500', 
    text: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-500/5 hover:bg-cyan-500/10',
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    avatar: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400',
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

// Extract speaker number from ID (e.g., "speaker_0" -> 0, "speaker_1" -> 1)
const getSpeakerNumber = (speakerId: string): number => {
  const match = speakerId.match(/speaker[_\s-]?(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
};

// Check if a name is a generic placeholder
const isGenericName = (name: string): boolean => {
  if (!name) return true;
  const lower = name.toLowerCase().trim();
  // Match "Talare 1", "Speaker 0", "speaker_1", etc.
  return /^(talare|speaker)[_\s-]?\d*$/i.test(lower) || lower === 'unknown' || lower === 'okänd';
};

export const EnhancedSpeakerView: React.FC<EnhancedSpeakerViewProps> = ({
  meetingId,
  speakerBlocks,
  speakerNames: initialSpeakerNames = {},
  onSpeakerNamesUpdated,
  className,
}) => {
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [localSpeakerNames, setLocalSpeakerNames] = useState<Record<string, string>>({});
  const [showSpeakerPanel, setShowSpeakerPanel] = useState(true);

  // Merge speaker names with local edits taking priority
  const speakerNames = { ...initialSpeakerNames, ...localSpeakerNames };

  // Build a map of block-level suggested names (from speakerBlocksCleaned)
  const blockSuggestedNames = useMemo(() => {
    const suggestions: Record<string, string> = {};
    speakerBlocks.forEach(block => {
      // Only use block.speakerName if it's a real name (not generic)
      if (block.speakerName && !isGenericName(block.speakerName) && !suggestions[block.speakerId]) {
        suggestions[block.speakerId] = block.speakerName;
      }
    });
    return suggestions;
  }, [speakerBlocks]);

  // Get unique speakers with stats
  const speakerStats = useMemo(() => {
    const stats: Record<string, { 
      count: number; 
      totalDuration: number; 
      wordCount: number;
      firstAppearance: number;
    }> = {};
    
    speakerBlocks.forEach(block => {
      const id = block.speakerId;
      if (!stats[id]) {
        stats[id] = { 
          count: 0, 
          totalDuration: 0, 
          wordCount: 0,
          firstAppearance: block.start ?? Infinity,
        };
      }
      stats[id].count++;
      if (block.start != null && block.end != null) {
        stats[id].totalDuration += block.end - block.start;
      }
      stats[id].wordCount += block.text.split(/\s+/).filter(Boolean).length;
      if (block.start != null && block.start < stats[id].firstAppearance) {
        stats[id].firstAppearance = block.start;
      }
    });
    
    return stats;
  }, [speakerBlocks]);

  // Get sorted unique speakers (by first appearance)
  const uniqueSpeakers = useMemo(() => {
    const ids = Object.keys(speakerStats);
    return ids.sort((a, b) => speakerStats[a].firstAppearance - speakerStats[b].firstAppearance);
  }, [speakerStats]);

  // Create stable color map based on speaker order
  const speakerStyleMap = useMemo(() => {
    const map: Record<string, typeof SPEAKER_STYLES[0]> = {};
    uniqueSpeakers.forEach((id, index) => {
      map[id] = SPEAKER_STYLES[index % SPEAKER_STYLES.length];
    });
    return map;
  }, [uniqueSpeakers]);

  /**
   * Display name resolution priority (per backend docs):
   * 1) speakerNames[label] - User-edited names (highest priority)
   * 2) block.speakerName - AI-suggested from cleanup ("Hej, jag heter...")
   * 3) Formatted label - "Talare X" fallback
   */
  const getSpeakerDisplayName = useCallback((speakerId: string): string => {
    // 1) Check user-edited names first
    if (speakerNames[speakerId] && !isGenericName(speakerNames[speakerId])) {
      return speakerNames[speakerId];
    }
    // 2) Check block-level suggested names from AI cleanup
    if (blockSuggestedNames[speakerId]) {
      return blockSuggestedNames[speakerId];
    }
    // 3) Check initial speaker names (may contain suggestions from backend)
    if (initialSpeakerNames[speakerId] && !isGenericName(initialSpeakerNames[speakerId])) {
      return initialSpeakerNames[speakerId];
    }
    // 4) Fallback to formatted label
    const num = getSpeakerNumber(speakerId);
    return `Talare ${num + 1}`;
  }, [speakerNames, blockSuggestedNames, initialSpeakerNames]);

  // Check if name is AI-suggested (not user-edited)
  const isAISuggested = useCallback((speakerId: string): boolean => {
    // If user has edited this speaker, not AI suggested
    if (localSpeakerNames[speakerId]) return false;
    // Check if there's a block-level suggestion
    return !!blockSuggestedNames[speakerId];
  }, [localSpeakerNames, blockSuggestedNames]);

  // Get initials for avatar
  const getSpeakerInitials = useCallback((speakerId: string): string => {
    const name = getSpeakerDisplayName(speakerId);
    if (name.startsWith('Talare ')) {
      return name.replace('Talare ', 'T');
    }
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [getSpeakerDisplayName]);

  // Handle edit speaker
  const handleEditSpeaker = (speakerId: string) => {
    setEditingSpeaker(speakerId);
    setEditedName(getSpeakerDisplayName(speakerId));
  };

  // Save speaker name to backend
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
      // Update local state immediately for responsive UI
      setLocalSpeakerNames(prev => ({ ...prev, [speakerLabel]: newName }));
      
      // Build complete speaker names map for backend
      const updatedNames = { ...speakerNames, [speakerLabel]: newName };
      
      // Call backend PUT /meetings/:id/speaker-names
      const saveResult = await backendApi.saveSpeakerNames(meetingId, updatedNames);
      
      // Notify parent of updated names
      onSpeakerNamesUpdated?.(saveResult.speakerNames);
      
      toast.success(`Namn sparat: ${newName}`);
    } catch (error) {
      console.error('Error saving speaker name:', error);
      toast.error('Kunde inte spara namn');
      // Revert local state on error
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

  // Copy transcript
  const handleCopyTranscript = useCallback(() => {
    const text = speakerBlocks
      .map(block => {
        const name = getSpeakerDisplayName(block.speakerId);
        const time = formatTime(block.start);
        return time ? `[${time}] ${name}: ${block.text}` : `${name}: ${block.text}`;
      })
      .join('\n\n');
    navigator.clipboard.writeText(text);
    toast.success('Transkription kopierad');
  }, [speakerBlocks, getSpeakerDisplayName]);

  // Calculate total duration
  const totalDuration = useMemo(() => {
    if (speakerBlocks.length === 0) return 0;
    const lastBlock = speakerBlocks[speakerBlocks.length - 1];
    return lastBlock.end ?? 0;
  }, [speakerBlocks]);

  if (!speakerBlocks || speakerBlocks.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        Ingen transkription tillgänglig.
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with stats */}
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

      {/* Collapsible speaker panel with inline editing */}
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
          <div className="grid gap-2 pt-2">
            {uniqueSpeakers.map(speakerId => {
              const styles = speakerStyleMap[speakerId];
              const stats = speakerStats[speakerId];
              const isEditing = editingSpeaker === speakerId;
              const displayName = getSpeakerDisplayName(speakerId);
              const initials = getSpeakerInitials(speakerId);
              const isSuggested = isAISuggested(speakerId);
              const hasRealName = !isGenericName(displayName);

              return (
                <motion.div
                  key={speakerId}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border border-border/50 transition-all",
                    styles?.bg || "bg-muted/30"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0",
                    styles?.avatar || "bg-muted text-muted-foreground"
                  )}>
                    {initials}
                  </div>

                  {/* Name & Stats */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          className="h-8 text-sm"
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
                          className="h-8 w-8 p-0"
                        >
                          <Check className="h-4 w-4 text-emerald-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingSpeaker(null)}
                          className="h-8 w-8 p-0"
                        >
                          <X className="h-4 w-4" />
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
                          {/* AI suggestion indicator */}
                          {isSuggested && hasRealName && (
                            <Badge variant="outline" className="gap-1 text-[10px] h-5 px-1.5 text-amber-600 border-amber-500/30 bg-amber-500/5">
                              <Sparkles className="w-2.5 h-2.5" />
                              Förslag
                            </Badge>
                          )}
                          <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>{stats.count} inlägg</span>
                          <span>•</span>
                          <span>{stats.wordCount} ord</span>
                          {stats.totalDuration > 0 && (
                            <>
                              <span>•</span>
                              <span>{formatDuration(stats.totalDuration)}</span>
                            </>
                          )}
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Color dot indicator */}
                  <div className={cn("w-2 h-2 rounded-full shrink-0", styles?.dot)} />
                </motion.div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Transcript content */}
      <ScrollArea className="max-h-[55vh]">
        <div className="space-y-0 pr-2">
          <AnimatePresence mode="wait">
            {speakerBlocks.map((block, index) => {
              const styles = speakerStyleMap[block.speakerId];
              const displayName = getSpeakerDisplayName(block.speakerId);
              const prevBlock = index > 0 ? speakerBlocks[index - 1] : null;
              const showDivider = prevBlock && prevBlock.speakerId !== block.speakerId;
              const timestamp = formatTime(block.start);

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(index * 0.02, 0.5) }}
                >
                  {/* Divider between different speakers */}
                  {showDivider && (
                    <div className="flex items-center gap-3 py-2.5">
                      <div className="flex-1 h-px bg-border/40" />
                    </div>
                  )}

                  {/* Speaker block */}
                  <div
                    className={cn(
                      "relative pl-4 py-2.5 border-l-2 rounded-r-lg transition-colors",
                      styles?.border || "border-l-muted-foreground/30",
                      styles?.bg || "hover:bg-muted/20"
                    )}
                  >
                    {/* Speaker header */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={cn("w-2 h-2 rounded-full", styles?.dot || "bg-muted-foreground/50")} />
                      <span className={cn("text-sm font-semibold", styles?.text || "text-muted-foreground")}>
                        {displayName}
                      </span>
                      {timestamp && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground/70 border-border/50">
                          {timestamp}
                        </Badge>
                      )}
                    </div>

                    {/* Text content */}
                    <p className="text-sm leading-relaxed text-foreground pl-4 whitespace-pre-wrap">
                      {block.text}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
};

export default EnhancedSpeakerView;
