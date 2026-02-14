import { useRef, useEffect, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Mic } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface LiveTranscriptViewProps {
  liveTranscript: string;
  progress: number;
  stage: string | null;
  totalChunks: number;
  completedChunks: number;
  isConnected: boolean;
  meetingTitle?: string;
}

/** Split transcript into paragraphs/lines for animated rendering */
function splitLines(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean);
}

const TranscriptLine = memo(({ text, index }: { text: string; index: number }) => (
  <motion.p
    key={`${index}-${text.slice(0, 20)}`}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.18, ease: 'easeOut' }}
    className="text-sm leading-relaxed text-foreground"
  >
    {text}
  </motion.p>
));
TranscriptLine.displayName = 'TranscriptLine';

const getStageLabel = (stage: string | null, progress: number): string => {
  if (!stage && progress === 0) return 'Ansluter...';
  if (stage === 'uploading') return 'Laddar upp...';
  if (stage === 'queued') return 'I kö...';
  if (stage === 'transcribing') return 'Transkriberar...';
  if (stage === 'sis_processing') return 'Identifierar talare...';
  if (stage === 'done') return 'Klar!';
  return 'Bearbetar...';
};

export const LiveTranscriptView = memo(({
  liveTranscript,
  progress,
  stage,
  totalChunks,
  completedChunks,
  isConnected,
}: LiveTranscriptViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  const lines = useMemo(() => splitLines(liveTranscript), [liveTranscript]);

  // Auto-scroll to bottom, but only if user hasn't scrolled up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || userScrolledRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  // Track user scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledRef.current = distFromBottom > 120;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const hasTranscript = lines.length > 0;
  const stageLabel = getStageLabel(stage, progress);
  const chunkInfo = totalChunks > 0 ? `${completedChunks}/${totalChunks}` : null;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            ) : (
              <Loader2 className="w-3 h-3 animate-spin" />
            )}
            <span className="font-medium">{stageLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            {chunkInfo && <span className="font-mono text-[10px]">{chunkInfo} delar</span>}
            <span className="font-mono">{Math.round(progress)}%</span>
          </div>
        </div>
        <Progress value={progress} className="h-1" />
      </div>

      {/* Live transcript area */}
      {hasTranscript ? (
        <div
          ref={scrollRef}
          className="relative max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-card p-4 sm:p-5 space-y-3"
        >
          {/* Transcript lines with staggered animation */}
          {lines.map((line, i) => {
            const isRecent = i >= lines.length - 2;
            return (
              <div key={i} className={isRecent ? 'text-foreground' : 'text-foreground/80'}>
                <TranscriptLine text={line} index={i} />
              </div>
            );
          })}

          {/* Live typing indicator */}
          {isConnected && progress < 100 && (
            <div className="flex items-center gap-2 pt-1">
              <div className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Waiting state before first chunk arrives */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 gap-4"
        >
          <div className="relative">
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="absolute inset-0 bg-primary/20 rounded-full blur-xl"
            />
            <div className="relative w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Mic className="w-6 h-6 text-primary" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">{stageLabel}</p>
            <p className="text-xs text-muted-foreground">Transkriptet visas live här</p>
          </div>
        </motion.div>
      )}
    </div>
  );
});
LiveTranscriptView.displayName = 'LiveTranscriptView';
