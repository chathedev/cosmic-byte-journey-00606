import { useRef, useEffect, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, FileText, Users } from 'lucide-react';

interface LiveTranscriptViewProps {
  liveTranscript: string;
  progress: number;
  stage: string | null;
  totalChunks: number;
  completedChunks: number;
  isConnected: boolean;
  meetingTitle?: string;
}

function splitLines(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean);
}

const TranscriptLine = memo(({ text, index }: { text: string; index: number }) => (
  <motion.p
    initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
    transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
    className="text-sm leading-relaxed text-foreground"
  >
    {text}
  </motion.p>
));
TranscriptLine.displayName = 'TranscriptLine';

const stageConfig: Record<string, { label: string; icon: typeof Mic }> = {
  uploading: { label: 'Laddar upp ljudfil...', icon: FileText },
  queued: { label: 'Förbereder transkription...', icon: FileText },
  transcribing: { label: 'Transkriberar ljudet...', icon: Mic },
  sis_processing: { label: 'Identifierar talare...', icon: Users },
  done: { label: 'Transkription klar', icon: Mic },
};

const getStageInfo = (stage: string | null, progress: number) => {
  if (!stage && progress === 0) return { label: 'Ansluter...', icon: Mic };
  if (stage && stageConfig[stage]) return stageConfig[stage];
  return { label: 'Bearbetar...', icon: Mic };
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || userScrolledRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

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
  const stageInfo = getStageInfo(stage, progress);
  const StageIcon = stageInfo.icon;
  const isDone = stage === 'done' || progress >= 100;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Stage indicator */}
      <div className="flex items-center gap-3 px-1">
        <div className="relative flex-shrink-0">
          {!isDone && (
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.15, 0.35, 0.15] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-full bg-primary/20 blur-md"
            />
          )}
          <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center ${
            isDone ? 'bg-green-500/10' : 'bg-primary/10'
          }`}>
            <StageIcon className={`w-4 h-4 ${isDone ? 'text-green-600' : 'text-primary'}`} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.p
              key={stageInfo.label}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.15 }}
              className="text-sm font-medium text-foreground"
            >
              {stageInfo.label}
            </motion.p>
          </AnimatePresence>
          {totalChunks > 0 && !isDone && (
            <p className="text-[11px] text-muted-foreground">
              Del {completedChunks} av {totalChunks}
            </p>
          )}
        </div>

        {/* Audio bars indicator */}
        {isConnected && !isDone && (
          <div className="flex gap-[3px] items-end h-4 flex-shrink-0">
            {[0, 1, 2, 3].map(i => (
              <motion.div
                key={i}
                animate={{ scaleY: [0.3, 1, 0.3] }}
                transition={{
                  repeat: Infinity,
                  duration: 0.8,
                  delay: i * 0.12,
                  ease: 'easeInOut',
                }}
                className="w-[3px] rounded-full bg-primary origin-bottom"
                style={{ height: 14 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Live transcript area */}
      {hasTranscript ? (
        <div
          ref={scrollRef}
          className="relative max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-card p-5 space-y-3 shadow-sm"
        >
          {lines.map((line, i) => {
            const isRecent = i >= lines.length - 2;
            return (
              <div key={i} className={isRecent ? 'text-foreground' : 'text-foreground/70'}>
                <TranscriptLine text={line} index={i} />
              </div>
            );
          })}

          {/* Typing indicator */}
          {isConnected && !isDone && (
            <div className="flex items-center gap-1.5 pt-2">
              {[0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1, 0.8] }}
                  transition={{
                    repeat: Infinity,
                    duration: 1,
                    delay: i * 0.2,
                    ease: 'easeInOut',
                  }}
                  className="w-1.5 h-1.5 rounded-full bg-primary"
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Empty state */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 gap-4 rounded-lg border border-dashed border-border bg-card/50"
        >
          <div className="relative">
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
              className="absolute -inset-3 bg-primary/10 rounded-full blur-lg"
            />
            <motion.div
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
              className="relative w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/10"
            >
              <Mic className="w-6 h-6 text-primary" />
            </motion.div>
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">{stageInfo.label}</p>
            <p className="text-xs text-muted-foreground">
              Transkriptet byggs upp i realtid och visas här
            </p>
          </div>
          {/* Wave bars */}
          <div className="flex gap-1 items-end h-5 mt-1">
            {[0, 1, 2, 3, 4].map(i => (
              <motion.div
                key={i}
                animate={{ scaleY: [0.3, 1, 0.3] }}
                transition={{
                  repeat: Infinity,
                  duration: 1,
                  delay: i * 0.1,
                  ease: 'easeInOut',
                }}
                className="w-[3px] rounded-full bg-primary/40 origin-bottom"
                style={{ height: 16 }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
});
LiveTranscriptView.displayName = 'LiveTranscriptView';
