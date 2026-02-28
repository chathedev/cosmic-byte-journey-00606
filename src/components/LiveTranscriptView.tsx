import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, FileText } from 'lucide-react';

interface LiveTranscriptViewProps {
  liveTranscript: string;
  progress: number;
  stage: string | null;
  totalChunks: number;
  completedChunks: number;
  isConnected: boolean;
  meetingTitle?: string;
}

const stageLabels: Record<string, string> = {
  uploading: 'Laddar upp',
  queued: 'Förbereder',
  transcribing: 'Transkriberar',
  sis_processing: 'Identifierar talare',
  processing_speakers: 'Identifierar talare',
  done: 'Klar',
};

const getStageLabel = (stage: string | null, progress: number) => {
  if (!stage && progress === 0) return 'Ansluter';
  if (stage && stageLabels[stage]) return stageLabels[stage];
  return 'Bearbetar';
};

/**
 * Word-buffer approach: incoming text is diffed against what we've already queued.
 * New words go into a queue that drains at a fixed rate for a smooth typewriter effect.
 */
export const LiveTranscriptView = memo(({
  liveTranscript,
  progress,
  stage,
  totalChunks,
  completedChunks,
  isConnected,
}: LiveTranscriptViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const userScrolledUpRef = useRef(false);

  // Word buffer state
  const allWordsRef = useRef<string[]>([]);
  const [visibleWords, setVisibleWords] = useState<string[]>([]);
  const drainTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetCountRef = useRef(0);

  const isDone = stage === 'done' || progress >= 100;
  const stageLabel = getStageLabel(stage, progress);

  // When liveTranscript changes, compute new words and push to buffer
  useEffect(() => {
    if (!liveTranscript) return;

    const incomingWords = liveTranscript.split(/\s+/).filter(Boolean);
    const prevLen = allWordsRef.current.length;

    if (incomingWords.length <= prevLen) return;

    allWordsRef.current = incomingWords;
    targetCountRef.current = incomingWords.length;

    if (!drainTimerRef.current) {
      drainTimerRef.current = setInterval(() => {
        setVisibleWords(prev => {
          const next = prev.length + 1;
          if (next >= targetCountRef.current) {
            if (drainTimerRef.current) {
              clearInterval(drainTimerRef.current);
              drainTimerRef.current = null;
            }
            return allWordsRef.current.slice(0, targetCountRef.current);
          }
          return allWordsRef.current.slice(0, next);
        });
      }, 12);
    }
  }, [liveTranscript]);

  // When done, show everything immediately
  useEffect(() => {
    if (isDone && allWordsRef.current.length > 0) {
      if (drainTimerRef.current) {
        clearInterval(drainTimerRef.current);
        drainTimerRef.current = null;
      }
      setVisibleWords([...allWordsRef.current]);
    }
  }, [isDone]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (drainTimerRef.current) clearInterval(drainTimerRef.current);
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (isDone || visibleWords.length === 0) return;
    const el = scrollRef.current;
    if (!el || userScrolledUpRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [visibleWords.length, isDone]);

  // Smooth scroll interval
  useEffect(() => {
    if (isDone || visibleWords.length === 0) return;
    const interval = setInterval(() => {
      if (!userScrolledUpRef.current && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isDone, visibleWords.length]);

  // When done scroll to top
  useEffect(() => {
    if (isDone && visibleWords.length > 0) {
      userScrolledUpRef.current = false;
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 600);
      return () => clearTimeout(t);
    }
  }, [isDone, visibleWords.length]);

  // Detect user scroll-up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (isDone) return;
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      const near = dist < 100;
      userScrolledUpRef.current = !near;
      setShowScrollDown(!near);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isDone]);

  const scrollToBottom = useCallback(() => {
    userScrolledUpRef.current = false;
    setShowScrollDown(false);
    scrollRef.current && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight);
  }, []);

  const hasContent = visibleWords.length > 0;

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Minimal status chip */}
      <div className="flex items-center gap-2 px-1">
        {!isDone && (
          <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse flex-shrink-0" />
        )}
        <p className="text-xs text-muted-foreground">
          {stageLabel}
          {totalChunks > 0 && !isDone && (
            <span className="ml-1 tabular-nums text-muted-foreground/60">{completedChunks}/{totalChunks}</span>
          )}
        </p>
      </div>

      {/* Transcript area */}
      {hasContent ? (
        <div className="relative">
          <div
            ref={scrollRef}
            className="max-h-[55vh] overflow-y-auto rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm px-4 py-3"
            style={{ overscrollBehavior: 'contain' }}
          >
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {visibleWords.join(' ')}
            </p>

            {/* Typing cursor */}
            {isConnected && !isDone && (
              <span className="inline-block w-[2px] h-[14px] bg-primary/60 animate-pulse ml-0.5 align-middle" />
            )}
          </div>

          <AnimatePresence>
            {showScrollDown && !isDone && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                onClick={scrollToBottom}
                className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:bg-primary/90 transition-colors"
                aria-label="Scrolla till botten"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* Empty / waiting state */
        <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-xl border border-dashed border-border/40 bg-card/40">
          <FileText className="w-5 h-5 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            Transkriptet visas här i realtid
          </p>
        </div>
      )}
    </div>
  );
});
LiveTranscriptView.displayName = 'LiveTranscriptView';
