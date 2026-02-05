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
  transcript?: string | null; // Primary: cleaned transcript from top-level field
  transcriptRaw?: string | null;
  speakerBlocksCleaned?: SpeakerBlock[] | null;
  speakerNames?: Record<string, string>; // User-edited speaker names
  className?: string;
}

const COLLAPSED_HEIGHT = 400; // pixels before showing "expand" button

// Helper to normalize speaker IDs to consistent format for lookup
const normalizeSpeakerId = (id: string): string => {
  if (/^speaker_\d+$/.test(id)) return id;
  const match = id.match(/(?:speaker|talare)[_\s-]?(\d+)/i);
  if (match) return `speaker_${match[1]}`;
  const numMatch = id.match(/(\d+)/);
  if (numMatch) return `speaker_${numMatch[1]}`;
  return id.toLowerCase().replace(/\s+/g, '_');
};

// Check if a name is a generic placeholder
const isGenericName = (name: string): boolean => {
  if (!name) return true;
  const lower = name.toLowerCase().trim();
  return /^(talare|speaker)[_\s-]?\d*$/i.test(lower) || lower === 'unknown' || lower === 'okänd';
};

export const TranscriptTextView: React.FC<TranscriptTextViewProps> = ({
  meetingId,
  transcript,
  transcriptRaw,
  speakerBlocksCleaned,
  speakerNames = {},
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [needsExpander, setNeedsExpander] = useState(false);

  // Helper to lookup speaker name with normalization fallback
  const getSpeakerDisplayName = (speakerId: string, blockSpeakerName?: string | null): string | null => {
    // Priority 1: User-edited names from speakerNames prop
    if (speakerNames[speakerId] && !isGenericName(speakerNames[speakerId])) {
      return speakerNames[speakerId];
    }
    // Try normalized version
    const normalized = normalizeSpeakerId(speakerId);
    if (speakerNames[normalized] && !isGenericName(speakerNames[normalized])) {
      return speakerNames[normalized];
    }
    // Try all keys with same normalized form
    for (const [key, value] of Object.entries(speakerNames)) {
      if (normalizeSpeakerId(key) === normalized && !isGenericName(value)) {
        return value;
      }
    }
    // Priority 2: Block's embedded speakerName
    if (blockSpeakerName && !isGenericName(blockSpeakerName)) {
      return blockSpeakerName;
    }
    return null;
  };

  // Priority: 
  // 1. Top-level `transcript` field (contains AI-cleaned text with corrections)
  // 2. speakerBlocksCleaned combined text
  // 3. transcriptRaw as fallback
  const fullText = useMemo(() => {
    // PRIORITY 1: Use top-level transcript field (AI-cleaned, corrected text)
    if (transcript && transcript.trim().length > 0) {
      let text = transcript.trim();
      // Apply speaker name replacements if available
      if (Object.keys(speakerNames).length > 0) {
        Object.entries(speakerNames).forEach(([label, name]) => {
          if (!isGenericName(name)) {
            const patterns = [
              new RegExp(`\\[${label}\\]:?\\s*`, 'gi'),
              new RegExp(`\\[${normalizeSpeakerId(label)}\\]:?\\s*`, 'gi'),
              new RegExp(`(?:^|\\n)${label}:?\\s*`, 'gi'),
            ];
            patterns.forEach(pattern => {
              text = text.replace(pattern, (match) => {
                const prefix = match.startsWith('\n') ? '\n' : '';
                return `${prefix}${name}: `;
              });
            });
          }
        });
      }
      return text;
    }
    
    // PRIORITY 2: Use speakerBlocksCleaned if available
    if (speakerBlocksCleaned && speakerBlocksCleaned.length > 0) {
      return speakerBlocksCleaned
        .map(block => {
          let text = block.text.trim();
          const realName = getSpeakerDisplayName(block.speakerId, block.speakerName);
          if (realName) {
            text = text.replace(/^\[?(talare|speaker)[_\s-]?\d+\]?:?\s*/i, `${realName}: `);
          }
          return text;
        })
        .filter(text => text.length > 0)
        .join('\n\n');
    }
    
    // PRIORITY 3: Fall back to transcriptRaw
    let text = transcriptRaw?.trim() || '';
    if (text && Object.keys(speakerNames).length > 0) {
      Object.entries(speakerNames).forEach(([label, name]) => {
        if (!isGenericName(name)) {
          const patterns = [
            new RegExp(`\\[${label}\\]:?\\s*`, 'gi'),
            new RegExp(`\\[${normalizeSpeakerId(label)}\\]:?\\s*`, 'gi'),
            new RegExp(`(?:^|\\n)${label}:?\\s*`, 'gi'),
          ];
          patterns.forEach(pattern => {
            text = text.replace(pattern, (match) => {
              const prefix = match.startsWith('\n') ? '\n' : '';
              return `${prefix}${name}: `;
            });
          });
        }
      });
    }
    return text;
  }, [transcript, speakerBlocksCleaned, transcriptRaw, speakerNames]);

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
