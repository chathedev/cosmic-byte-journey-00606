import React, { useState, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Edit2, Copy, X, Users, Clock, ChevronDown, ChevronUp, MessageSquare, Timer } from 'lucide-react';
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

// Beautiful gradient-based speaker styles
const SPEAKER_STYLES = [
  { 
    gradient: 'from-blue-500/10 to-blue-500/5',
    border: 'border-l-blue-500', 
    dot: 'bg-gradient-to-br from-blue-400 to-blue-600', 
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    avatar: 'bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-lg shadow-blue-500/25',
    ring: 'ring-blue-500/30',
  },
  { 
    gradient: 'from-emerald-500/10 to-emerald-500/5',
    border: 'border-l-emerald-500', 
    dot: 'bg-gradient-to-br from-emerald-400 to-emerald-600', 
    text: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    avatar: 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/25',
    ring: 'ring-emerald-500/30',
  },
  { 
    gradient: 'from-violet-500/10 to-violet-500/5',
    border: 'border-l-violet-500', 
    dot: 'bg-gradient-to-br from-violet-400 to-violet-600', 
    text: 'text-violet-600 dark:text-violet-400',
    badge: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    avatar: 'bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-lg shadow-violet-500/25',
    ring: 'ring-violet-500/30',
  },
  { 
    gradient: 'from-amber-500/10 to-amber-500/5',
    border: 'border-l-amber-500', 
    dot: 'bg-gradient-to-br from-amber-400 to-amber-600', 
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    avatar: 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/25',
    ring: 'ring-amber-500/30',
  },
  { 
    gradient: 'from-rose-500/10 to-rose-500/5',
    border: 'border-l-rose-500', 
    dot: 'bg-gradient-to-br from-rose-400 to-rose-600', 
    text: 'text-rose-600 dark:text-rose-400',
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    avatar: 'bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-lg shadow-rose-500/25',
    ring: 'ring-rose-500/30',
  },
  { 
    gradient: 'from-cyan-500/10 to-cyan-500/5',
    border: 'border-l-cyan-500', 
    dot: 'bg-gradient-to-br from-cyan-400 to-cyan-600', 
    text: 'text-cyan-600 dark:text-cyan-400',
    badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    avatar: 'bg-gradient-to-br from-cyan-400 to-cyan-600 text-white shadow-lg shadow-cyan-500/25',
    ring: 'ring-cyan-500/30',
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

  const speakerNames = { ...initialSpeakerNames, ...localSpeakerNames };

  // Speaker stats
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

  const uniqueSpeakers = useMemo(() => {
    const ids = Object.keys(speakerStats);
    return ids.sort((a, b) => speakerStats[a].firstAppearance - speakerStats[b].firstAppearance);
  }, [speakerStats]);

  const speakerStyleMap = useMemo(() => {
    const map: Record<string, typeof SPEAKER_STYLES[0]> = {};
    uniqueSpeakers.forEach((id, index) => {
      map[id] = SPEAKER_STYLES[index % SPEAKER_STYLES.length];
    });
    return map;
  }, [uniqueSpeakers]);

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

  const handleEditSpeaker = (speakerId: string) => {
    setEditingSpeaker(speakerId);
    setEditedName(getSpeakerDisplayName(speakerId));
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
      const updatedNames = { ...speakerNames, [speakerLabel]: newName };
      setLocalSpeakerNames(prev => ({ ...prev, [speakerLabel]: newName }));
      
      const saveResult = await backendApi.saveSpeakerNames(meetingId, updatedNames);
      onSpeakerNamesUpdated?.(saveResult.speakerNames);
      
      toast.success(`Namn sparat: ${newName}`);
    } catch (error) {
      console.error('Error saving speaker name:', error);
      toast.error('Kunde inte spara namn');
    } finally {
      setSavingName(false);
      setEditingSpeaker(null);
    }
  };

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

  const totalDuration = useMemo(() => {
    if (speakerBlocks.length === 0) return 0;
    const lastBlock = speakerBlocks[speakerBlocks.length - 1];
    return lastBlock.end ?? 0;
  }, [speakerBlocks]);

  const totalWords = useMemo(() => {
    return Object.values(speakerStats).reduce((sum, s) => sum + s.wordCount, 0);
  }, [speakerStats]);

  if (!speakerBlocks || speakerBlocks.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        Ingen transkription tillgänglig.
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {/* Beautiful Header Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border/50">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="gap-1.5 h-7 px-3 font-medium">
            <Users className="w-3.5 h-3.5" />
            {uniqueSpeakers.length} {uniqueSpeakers.length === 1 ? 'talare' : 'talare'}
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

      {/* Speaker Cards Panel */}
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
                {uniqueSpeakers.length > 4 && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-muted text-muted-foreground ring-2 ring-background">
                    +{uniqueSpeakers.length - 4}
                  </div>
                )}
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3"
          >
            {uniqueSpeakers.map(speakerId => {
              const styles = speakerStyleMap[speakerId];
              const stats = speakerStats[speakerId];
              const isEditing = editingSpeaker === speakerId;
              const displayName = getSpeakerDisplayName(speakerId);
              const initials = getSpeakerInitials(speakerId);
              const percentage = totalWords > 0 
                ? Math.round((stats.wordCount / totalWords) * 100) 
                : 0;

              return (
                <motion.div
                  key={speakerId}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "relative overflow-hidden rounded-2xl border border-border/50 p-4 transition-all hover:border-border hover:shadow-sm",
                    `bg-gradient-to-br ${styles?.gradient || 'from-muted/50 to-muted/30'}`
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0",
                      styles?.avatar || "bg-muted text-muted-foreground"
                    )}>
                      {initials}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            className="h-8 text-sm"
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
                            className="h-8 w-8 p-0 shrink-0"
                          >
                            <Check className="h-4 w-4 text-emerald-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingSpeaker(null)}
                            className="h-8 w-8 p-0 shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEditSpeaker(speakerId)}
                          className="w-full text-left group/name"
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn("font-semibold text-sm truncate", styles?.text)}>
                              {displayName}
                            </span>
                            <Edit2 className="h-3 w-3 opacity-0 group-hover/name:opacity-60 transition-opacity shrink-0" />
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-muted-foreground">
                              {stats.wordCount} ord
                            </span>
                            <span className="text-muted-foreground/50">•</span>
                            <span className="text-xs text-muted-foreground">
                              {stats.count} inlägg
                            </span>
                          </div>
                        </button>
                      )}
                    </div>

                    {/* Percentage badge */}
                    {!isEditing && (
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] h-5 px-1.5 font-semibold shrink-0",
                          styles?.badge
                        )}
                      >
                        {percentage}%
                      </Badge>
                    )}
                  </div>

                  {/* Progress bar */}
                  {!isEditing && (
                    <div className="mt-3 h-1 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className={cn("h-full rounded-full", styles?.dot)}
                      />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </CollapsibleContent>
      </Collapsible>

      {/* Transcript content with enhanced styling */}
      <ScrollArea className="max-h-[55vh]">
        <div className="space-y-1 pr-2">
          <AnimatePresence mode="sync">
            {speakerBlocks.map((block, index) => {
              const styles = speakerStyleMap[block.speakerId];
              const displayName = getSpeakerDisplayName(block.speakerId);
              const initials = getSpeakerInitials(block.speakerId);
              const prevBlock = index > 0 ? speakerBlocks[index - 1] : null;
              const showDivider = prevBlock && prevBlock.speakerId !== block.speakerId;
              const timestamp = formatTime(block.start);

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.015, 0.4) }}
                >
                  {/* Speaker change divider */}
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
                          <span className="text-[11px] text-muted-foreground/60 tabular-nums">
                            {timestamp}
                          </span>
                        )}
                      </div>

                      {/* Text bubble */}
                      <div className={cn(
                        "rounded-2xl rounded-tl-md px-4 py-2.5 transition-colors",
                        `bg-gradient-to-br ${styles?.gradient || 'from-muted/50 to-muted/30'}`,
                        "border border-border/30"
                      )}>
                        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                          {block.text}
                        </p>
                      </div>
                    </div>
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
