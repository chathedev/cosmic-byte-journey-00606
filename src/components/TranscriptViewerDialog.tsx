import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, User, Clock, Edit3, Save, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { backendApi } from "@/lib/backendApi";

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker: string;
}

export interface TranscriptSegment {
  speaker?: string;      // Legacy field
  speakerId?: string;    // ElevenLabs uses speakerId
  text: string;
  start: number;
  end: number;
  confidence?: number;
  words?: TranscriptWord[];
}

// Helper to get speaker identifier from segment (handles both speakerId and speaker)
const getSpeakerFromSegment = (segment: TranscriptSegment): string => {
  return segment.speakerId || segment.speaker || 'unknown';
};

interface TranscriptViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcript: string;
  segments?: TranscriptSegment[];
  meetingTitle?: string;
  meetingId?: string;
  initialSpeakerNames?: Record<string, string>;
  onSpeakerNamesChange?: (names: Record<string, string>) => void;
  speakerIdentificationEnabled?: boolean; // Controls whether to show individual speaker segments
}

// Generate consistent colors for speakers
const getSpeakerColor = (speaker: string | undefined | null): string => {
  const colors = [
    "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
    "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
    "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
    "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
    "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  ];
  
  // Handle undefined/null/empty speaker
  if (!speaker || speaker.length === 0) {
    return colors[0];
  }
  
  // Convert speaker letter to index (A=0, B=1, etc.)
  const index = speaker.charCodeAt(0) - 65;
  return colors[Math.abs(index) % colors.length];
};

const getSpeakerBgColor = (speaker: string | undefined | null): string => {
  const colors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-purple-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-orange-500",
    "bg-indigo-500",
  ];
  
  // Handle undefined/null/empty speaker
  if (!speaker || speaker.length === 0) {
    return colors[0];
  }
  
  const index = speaker.charCodeAt(0) - 65;
  return colors[Math.abs(index) % colors.length];
};

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export function TranscriptViewerDialog({
  open,
  onOpenChange,
  transcript,
  segments,
  meetingTitle,
  meetingId,
  initialSpeakerNames,
  onSpeakerNamesChange,
  speakerIdentificationEnabled = false,
}: TranscriptViewerDialogProps) {
  const { toast } = useToast();
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>(initialSpeakerNames || {});
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync with initial speaker names when dialog opens
  useEffect(() => {
    if (open && initialSpeakerNames) {
      setSpeakerNames(initialSpeakerNames);
      setHasChanges(false);
    }
  }, [open, initialSpeakerNames]);

  const handleCopy = async () => {
    try {
      let textToCopy = transcript;
      
      // If we have segments, format with speaker labels (using custom names if available)
      if (segments && segments.length > 0) {
        textToCopy = segments
          .map(s => {
            const speakerKey = getSpeakerFromSegment(s);
            const name = speakerNames[speakerKey] || `Talare ${speakerKey}`;
            return `[${name}] ${s.text}`;
          })
          .join('\n\n');
      }
      
      await navigator.clipboard.writeText(textToCopy);
      toast({
        title: "Kopierat!",
        description: "Transkriptet har kopierats till urklipp.",
        duration: 2000,
      });
    } catch (err) {
      toast({
        title: "Kunde inte kopiera",
        description: "Försök igen.",
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  const handleStartEdit = (speaker: string) => {
    setEditingSpeaker(speaker);
    setEditValue(speakerNames[speaker] || "");
  };

  const handleCancelEdit = () => {
    setEditingSpeaker(null);
    setEditValue("");
  };

  const handleSaveEdit = (speaker: string) => {
    const trimmedValue = editValue.trim();
    if (trimmedValue) {
      setSpeakerNames(prev => ({ ...prev, [speaker]: trimmedValue }));
      setHasChanges(true);
    } else {
      // If empty, remove the custom name
      setSpeakerNames(prev => {
        const updated = { ...prev };
        delete updated[speaker];
        return updated;
      });
      setHasChanges(true);
    }
    setEditingSpeaker(null);
    setEditValue("");
  };

  const handleSaveToBackend = async () => {
    if (!meetingId) {
      toast({
        title: "Kunde inte spara",
        description: "Mötes-ID saknas.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await backendApi.saveSpeakerNames(meetingId, speakerNames);
      setHasChanges(false);
      onSpeakerNamesChange?.(speakerNames);
      toast({
        title: "Sparat!",
        description: "Talarnamn har sparats.",
        duration: 2000,
      });
    } catch (error) {
      console.error('Failed to save speaker names:', error);
      toast({
        title: "Kunde inte spara",
        description: "Försök igen senare.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getSpeakerDisplayName = (speaker: string): string => {
    if (speakerNames[speaker]) return speakerNames[speaker];
    // Format "speaker_0" to "Talare 1", "speaker_1" to "Talare 2", etc.
    const match = speaker.match(/speaker_(\d+)/i);
    if (match) {
      return `Talare ${parseInt(match[1], 10) + 1}`;
    }
    return `Talare ${speaker}`;
  };

  // Get unique speakers
  const uniqueSpeakers = segments 
    ? [...new Set(segments.map(s => getSpeakerFromSegment(s)))].filter(s => s !== 'unknown').sort()
    : [];

  // Calculate total duration
  const totalDuration = segments && segments.length > 0
    ? Math.max(...segments.map(s => s.end))
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-semibold">
                {meetingTitle || "Transkript"}
              </DialogTitle>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {speakerIdentificationEnabled && uniqueSpeakers.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span>{uniqueSpeakers.length} talare</span>
                  </div>
                )}
                {totalDuration > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatTime(totalDuration)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {speakerIdentificationEnabled && hasChanges && meetingId && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveToBackend}
                  disabled={isSaving}
                  className="gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? "Sparar..." : "Spara namn"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                Kopiera
              </Button>
            </div>
          </div>
          
          {/* Speaker legend with editable names */}
          {speakerIdentificationEnabled && uniqueSpeakers.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Klicka för att redigera talarnamn
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {uniqueSpeakers.map(speaker => (
                  <AnimatePresence key={speaker} mode="wait">
                    {editingSpeaker === speaker ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-center gap-1"
                      >
                        <div className={`w-3 h-3 rounded-full ${getSpeakerBgColor(speaker)} shrink-0`} />
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(speaker);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          placeholder={`Talare ${speaker}`}
                          className="h-7 w-32 text-sm"
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleSaveEdit(speaker)}
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={handleCancelEdit}
                        >
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                      >
                        <Badge
                          variant="outline"
                          className={`${getSpeakerColor(speaker)} gap-1.5 py-1.5 px-3 cursor-pointer hover:opacity-80 transition-opacity group`}
                          onClick={() => handleStartEdit(speaker)}
                        >
                          <div className={`w-2.5 h-2.5 rounded-full ${getSpeakerBgColor(speaker)}`} />
                          <span className="font-medium">{getSpeakerDisplayName(speaker)}</span>
                          <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-70 transition-opacity ml-1" />
                        </Badge>
                      </motion.div>
                    )}
                  </AnimatePresence>
                ))}
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="p-6 space-y-4">
            {speakerIdentificationEnabled && segments && segments.length > 0 ? (
              // Show diarized transcript with speaker segments
              segments.map((segment, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02, duration: 0.2 }}
                  className="group"
                >
                  <div className={`rounded-xl border p-4 ${getSpeakerColor(getSpeakerFromSegment(segment))} transition-all hover:shadow-md`}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-8 h-8 rounded-full ${getSpeakerBgColor(getSpeakerFromSegment(segment))} flex items-center justify-center shadow-sm`}>
                        <span className="text-xs font-bold text-white">
                          {speakerNames[getSpeakerFromSegment(segment)]?.charAt(0)?.toUpperCase() || getSpeakerFromSegment(segment).replace('speaker_', '').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">
                          {getSpeakerDisplayName(getSpeakerFromSegment(segment))}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(segment.start)} - {formatTime(segment.end)}
                        </span>
                      </div>
                      {segment.confidence && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
                          {Math.round(segment.confidence * 100)}% säkerhet
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed pl-10">
                      {segment.text}
                    </p>
                  </div>
                </motion.div>
              ))
            ) : (
              // Show plain transcript
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                  {transcript}
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {transcript.split(/\s+/).filter(Boolean).length} ord
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Stäng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
