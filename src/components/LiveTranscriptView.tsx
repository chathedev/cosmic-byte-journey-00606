import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

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
  uploading: 'Laddar upp ljudfil',
  queued: 'Förbereder transkription',
  transcribing: 'Transkriberar',
  sis_processing: 'Identifierar talare',
  processing_speakers: 'Förbättrar talaridentifiering',
  done: 'Klar',
};

const getStageLabel = (stage: string | null, progress: number) => {
  if (!stage && progress === 0) return 'Ansluter';
  if (stage && stageLabels[stage]) return stageLabels[stage];
  return 'Bearbetar';
};

/**
 * Word-buffer approach: incoming text is diffed against what we've already queued.
 * New words go into a queue that drains at a fixed rate (~40ms/word) for a smooth
 * typewriter effect, regardless of how large the backend chunks are.
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

    if (incomingWords.length <= prevLen) return; // no new words

    allWordsRef.current = incomingWords;
    targetCountRef.current = incomingWords.length;

    // Start drain if not running
    if (!drainTimerRef.current) {
      drainTimerRef.current = setInterval(() => {
        setVisibleWords(prev => {
          const next = prev.length + 1;
          if (next >= targetCountRef.current) {
            // Caught up — stop draining until more words arrive
            if (drainTimerRef.current) {
              clearInterval(drainTimerRef.current);
              drainTimerRef.current = null;
            }
            return allWordsRef.current.slice(0, targetCountRef.current);
          }
          return allWordsRef.current.slice(0, next);
        });
      }, 40); // 40ms per word ≈ 25 words/sec — fast but readable
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

  // Smooth scroll interval for in-between renders
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
    <div className="flex flex-col gap-3 w-full">
      {/* Minimal status bar */}
      <div className="flex items-center gap-2 px-1">
        {!isDone && (
          <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse flex-shrink-0" />
        )}
        <p className="text-xs text-muted-foreground">
          {stageLabel}
          {totalChunks > 0 && !isDone && (
            <span className="ml-1 tabular-nums">{completedChunks}/{totalChunks}</span>
          )}
        </p>
        {!isDone && progress > 0 && (
          <div className="flex-1 h-[2px] rounded-full bg-muted overflow-hidden ml-2">
            <div
              className="h-full rounded-full bg-primary/50 transition-all duration-500 ease-out"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Transcript area */}
      {hasContent ? (
        <div className="relative">
          <div
            ref={scrollRef}
            className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-card px-5 py-4"
            style={{ overscrollBehavior: 'contain' }}
          >
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {visibleWords.map((word, i) => (
                <span
                  key={i}
                  className="inline animate-fade-in"
                  style={{
                    animationDuration: '0.25s',
                    animationFillMode: 'both',
                  }}
                >
                  {word}{i < visibleWords.length - 1 ? ' ' : ''}
                </span>
              ))}
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
        <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-lg border border-dashed border-border bg-card/50">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" />
          <p className="text-xs text-muted-foreground">
            Transkriptet visas här i realtid
          </p>
        </div>
      )}
    </div>
  );
});
LiveTranscriptView.displayName = 'LiveTranscriptView';
