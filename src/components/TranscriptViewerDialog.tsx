import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, User, Clock, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker: string;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  words?: TranscriptWord[];
}

interface TranscriptViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcript: string;
  segments?: TranscriptSegment[];
  meetingTitle?: string;
}

// Generate consistent colors for speakers
const getSpeakerColor = (speaker: string): string => {
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
  
  // Convert speaker letter to index (A=0, B=1, etc.)
  const index = speaker.charCodeAt(0) - 65;
  return colors[index % colors.length];
};

const getSpeakerBgColor = (speaker: string): string => {
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
  
  const index = speaker.charCodeAt(0) - 65;
  return colors[index % colors.length];
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
}: TranscriptViewerDialogProps) {
  const { toast } = useToast();
  
  const handleCopy = async () => {
    try {
      let textToCopy = transcript;
      
      // If we have segments, format with speaker labels
      if (segments && segments.length > 0) {
        textToCopy = segments
          .map(s => `[Talare ${s.speaker}] ${s.text}`)
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

  // Get unique speakers
  const uniqueSpeakers = segments 
    ? [...new Set(segments.map(s => s.speaker))].sort()
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
                {uniqueSpeakers.length > 0 && (
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
          
          {/* Speaker legend */}
          {uniqueSpeakers.length > 1 && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {uniqueSpeakers.map(speaker => (
                <Badge
                  key={speaker}
                  variant="outline"
                  className={`${getSpeakerColor(speaker)} gap-1.5 py-1`}
                >
                  <div className={`w-2 h-2 rounded-full ${getSpeakerBgColor(speaker)}`} />
                  Talare {speaker}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="p-6 space-y-4">
            {segments && segments.length > 0 ? (
              // Show diarized transcript with speaker segments
              segments.map((segment, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02, duration: 0.2 }}
                  className="group"
                >
                  <div className={`rounded-lg border p-4 ${getSpeakerColor(segment.speaker)} transition-all hover:shadow-sm`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-6 h-6 rounded-full ${getSpeakerBgColor(segment.speaker)} flex items-center justify-center`}>
                        <span className="text-xs font-semibold text-white">
                          {segment.speaker}
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        Talare {segment.speaker}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatTime(segment.start)}
                      </span>
                      {segment.confidence && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {Math.round(segment.confidence * 100)}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed pl-8">
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
