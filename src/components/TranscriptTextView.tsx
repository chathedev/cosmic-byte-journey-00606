import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SpeakerBlock {
  speakerId: string;
  speakerName: string | null;
  text: string;
}

interface TranscriptTextViewProps {
  meetingId: string;
  transcriptRaw?: string | null;
  speakerBlocksCleaned?: SpeakerBlock[] | null;
  className?: string;
}

const COLLAPSED_HEIGHT = 400; // pixels before showing "expand" button

export const TranscriptTextView: React.FC<TranscriptTextViewProps> = ({
  meetingId,
  transcriptRaw,
  speakerBlocksCleaned,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [needsExpander, setNeedsExpander] = useState(false);

  // Combine all text from speakerBlocksCleaned, or fall back to transcriptRaw
  const fullText = useMemo(() => {
    if (speakerBlocksCleaned && speakerBlocksCleaned.length > 0) {
      // Join all blocks' text with double newlines for paragraph separation
      return speakerBlocksCleaned
        .map(block => block.text.trim())
        .filter(text => text.length > 0)
        .join('\n\n');
    }
    return transcriptRaw?.trim() || '';
  }, [speakerBlocksCleaned, transcriptRaw]);

  // Check if content needs expander
  React.useEffect(() => {
    if (contentRef.current) {
      const scrollHeight = contentRef.current.scrollHeight;
      setNeedsExpander(scrollHeight > COLLAPSED_HEIGHT);
    }
  }, [fullText]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      toast.success('Transkript kopierat');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Kunde inte kopiera');
    }
  };

  if (!fullText) {
    return null;
  }

  // Split into paragraphs for better rendering
  const paragraphs = fullText
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  return (
    <div className={cn("relative", className)}>
      {/* Copy button - floating top right */}
      <div className="absolute top-0 right-0 z-10">
        <Button
          onClick={handleCopy}
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
        {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-primary" />
              <span>Kopierat</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Kopiera</span>
            </>
          )}
        </Button>
      </div>

      {/* Transcript content */}
      <div
        ref={contentRef}
        className={cn(
          "relative transition-all duration-300 ease-out pr-20",
          !isExpanded && needsExpander && "overflow-hidden"
        )}
        style={{
          maxHeight: !isExpanded && needsExpander ? `${COLLAPSED_HEIGHT}px` : 'none',
        }}
      >
        <div className="space-y-4">
          {paragraphs.map((paragraph, idx) => (
            <p
              key={idx}
              className="text-[15px] leading-[1.85] text-foreground selection:bg-primary/20"
            >
              {paragraph}
            </p>
          ))}
        </div>

        {/* Gradient fade overlay when collapsed */}
        {!isExpanded && needsExpander && (
          <div 
            className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none"
          />
        )}
      </div>

      {/* Expand/Collapse button */}
      {needsExpander && (
        <div className="flex justify-center mt-4">
          <Button
            onClick={() => setIsExpanded(!isExpanded)}
            variant="outline"
            size="sm"
            className="gap-2 text-xs rounded-full px-4 border-border/50 hover:border-border hover:bg-muted/50"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Visa mindre</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Visa hela transkriptet</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

export default TranscriptTextView;
