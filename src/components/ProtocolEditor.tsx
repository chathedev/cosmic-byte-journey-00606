import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Edit3,
  Eye,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Copy,
  Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { backendApi } from "@/lib/backendApi";

interface AIActionItem {
  title: string;
  description?: string;
  owner?: string;
  deadline?: string;
  priority: "critical" | "high" | "medium" | "low";
}

interface ProtocolData {
  title: string;
  summary: string;
  mainPoints: string[];
  decisions: string[];
  actionItems: AIActionItem[];
  nextMeetingSuggestions?: string[];
}

interface ProtocolEditorProps {
  meetingId: string;
  protocol: ProtocolData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProtocolUpdate?: (protocol: ProtocolData) => void;
  readOnly?: boolean;
  isEnterprise?: boolean;
}

/** Convert structured protocol data → plain-text markdown */
const protocolToPlainText = (data: ProtocolData): string => {
  const parts: string[] = [];
  if (data.title) parts.push(`# ${data.title}`);
  parts.push("");
  if (data.summary) {
    parts.push("## Sammanfattning");
    parts.push(data.summary);
    parts.push("");
  }
  if (data.mainPoints?.length) {
    parts.push("## Huvudpunkter");
    data.mainPoints.forEach((p, i) => parts.push(`${i + 1}. ${p}`));
    parts.push("");
  }
  if (data.decisions?.length) {
    parts.push("## Beslut");
    data.decisions.forEach((d) => parts.push(`- ${d}`));
    parts.push("");
  }
  if (data.actionItems?.length) {
    parts.push("## Åtgärdspunkter");
    data.actionItems.forEach((a) => {
      let line = `- ${a.title}`;
      if (a.owner) line += ` (${a.owner})`;
      if (a.deadline?.trim()) line += ` – ${a.deadline}`;
      if (a.priority && a.priority !== "medium") line += ` [${priorityLabel(a.priority)}]`;
      parts.push(line);
      if (a.description) parts.push(`  ${a.description}`);
    });
    parts.push("");
  }
  if (data.nextMeetingSuggestions?.length) {
    parts.push("## Nästa möte – Förslag");
    data.nextMeetingSuggestions.forEach((s) => parts.push(`- ${s}`));
    parts.push("");
  }
  return parts.join("\n");
};

/** Parse plain-text markdown back → structured protocol data */
const plainTextToProtocol = (text: string): ProtocolData => {
  const lines = text.split("\n");
  let title = "";
  let summary = "";
  const mainPoints: string[] = [];
  const decisions: string[] = [];
  const actionItems: AIActionItem[] = [];
  const nextMeetingSuggestions: string[] = [];

  let currentSection = "";
  const sectionBuffer: string[] = [];

  const flushSection = () => {
    const content = sectionBuffer.join("\n").trim();
    if (currentSection.match(/sammanfattning/i)) {
      summary = content;
    } else if (currentSection.match(/huvudpunkt/i)) {
      sectionBuffer
        .filter((l) => l.trim())
        .forEach((l) => {
          const cleaned = l.replace(/^[-•]\s*/, "").replace(/^\d+\.\s*/, "").trim();
          if (cleaned) mainPoints.push(cleaned);
        });
    } else if (currentSection.match(/beslut/i)) {
      sectionBuffer
        .filter((l) => l.trim())
        .forEach((l) => {
          const cleaned = l.replace(/^[-•]\s*/, "").trim();
          if (cleaned) decisions.push(cleaned);
        });
    } else if (currentSection.match(/åtgärd/i)) {
      sectionBuffer
        .filter((l) => l.trim() && (l.startsWith("-") || l.startsWith("•")))
        .forEach((l) => {
          const cleaned = l.replace(/^[-•]\s*/, "").trim();
          const ownerMatch = cleaned.match(/\(([^)]+)\)/);
          const deadlineMatch = cleaned.match(/–\s*(.+?)(?:\s*\[|$)/);
          const priorityMatch = cleaned.match(/\[(Kritisk|Hög|Medium|Låg)\]/i);
          const titleText = cleaned
            .replace(/\([^)]+\)/, "")
            .replace(/–\s*.+$/, "")
            .replace(/\[[^\]]+\]/, "")
            .trim();
          actionItems.push({
            title: titleText,
            owner: ownerMatch?.[1],
            deadline: deadlineMatch?.[1]?.trim(),
            priority: parsePriority(priorityMatch?.[1]),
          });
        });
    } else if (currentSection.match(/nästa möte/i)) {
      sectionBuffer
        .filter((l) => l.trim())
        .forEach((l) => {
          const cleaned = l.replace(/^[-•]\s*/, "").trim();
          if (cleaned) nextMeetingSuggestions.push(cleaned);
        });
    }
    sectionBuffer.length = 0;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      flushSection();
      title = trimmed.replace(/^#\s*/, "");
      currentSection = "";
    } else if (trimmed.startsWith("## ")) {
      flushSection();
      currentSection = trimmed.replace(/^##\s*/, "");
    } else {
      sectionBuffer.push(line);
    }
  }
  flushSection();

  if (!summary && !mainPoints.length && !decisions.length && !actionItems.length) {
    summary = text.trim();
  }

  return { title, summary, mainPoints, decisions, actionItems, nextMeetingSuggestions };
};

const priorityLabel = (p: string) => {
  switch (p) {
    case "critical": return "Kritisk";
    case "high": return "Hög";
    case "low": return "Låg";
    default: return "Medium";
  }
};

const parsePriority = (label?: string): "critical" | "high" | "medium" | "low" => {
  if (!label) return "medium";
  switch (label.toLowerCase()) {
    case "kritisk": return "critical";
    case "hög": return "high";
    case "låg": return "low";
    default: return "medium";
  }
};

export const ProtocolEditor = ({
  meetingId,
  protocol,
  open,
  onOpenChange,
  onProtocolUpdate,
  readOnly = false,
  isEnterprise = false,
}: ProtocolEditorProps) => {
  const [plainText, setPlainText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize plain text when dialog opens
  useEffect(() => {
    if (open && protocol) {
      setPlainText(protocolToPlainText(protocol));
      setHasChanges(false);
      setLastSaved(null);
    }
  }, [open, protocol]);

  // Focus textarea when dialog opens
  useEffect(() => {
    if (open && !readOnly) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [open, readOnly]);

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setHasChanges(true);
    autosaveTimer.current = setTimeout(() => {
      performSave();
    }, 2000);
  }, [meetingId, plainText]);

  const performSave = async () => {
    if (isSaving || readOnly) return;
    setIsSaving(true);
    try {
      const parsed = plainTextToProtocol(plainText);
      await backendApi.saveProtocolDraft(meetingId, {
        fullText: plainText,
        title: parsed.title,
        summary: parsed.summary,
        mainPoints: parsed.mainPoints,
        decisions: parsed.decisions,
        actionItems: parsed.actionItems,
      });
      setLastSaved(new Date());
      setHasChanges(false);
      onProtocolUpdate?.(parsed);
    } catch (error) {
      console.error("Failed to autosave protocol draft:", error);
      toast({
        title: "Kunde inte spara",
        description: "Försök igen om en stund.",
        variant: "destructive",
        duration: 2000,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTextChange = (value: string) => {
    setPlainText(value);
    scheduleAutosave();
  };

  const handleClose = async () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (hasChanges && !readOnly) {
      await performSave();
    }
    onOpenChange(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Kopierat", description: "Protokollet har kopierats till urklipp.", duration: 1500 });
    } catch {
      toast({ title: "Kunde inte kopiera", variant: "destructive", duration: 1500 });
    }
  };

  const wordCount = plainText.trim().split(/\s+/).filter(Boolean).length;
  const lineCount = plainText.split("\n").length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent
        className="max-w-4xl w-[95vw] h-[90vh] p-0 gap-0 flex flex-col overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Edit3 className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground truncate">
                {readOnly ? "Visa protokoll" : "Redigera protokoll"}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {wordCount} ord · {lineCount} rader
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Save status */}
            <AnimatePresence mode="wait">
              <motion.div
                key={isSaving ? "saving" : hasChanges ? "unsaved" : lastSaved ? "saved" : "idle"}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-1.5 text-xs mr-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground hidden sm:inline">Sparar...</span>
                  </>
                ) : hasChanges ? (
                  <>
                    <AlertCircle className="w-3 h-3 text-amber-500" />
                    <span className="text-amber-600 dark:text-amber-400 hidden sm:inline">Osparad</span>
                  </>
                ) : lastSaved ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span className="text-muted-foreground hidden sm:inline">
                      Sparad {lastSaved.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </>
                ) : null}
              </motion.div>
            </AnimatePresence>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5 h-8 text-xs text-muted-foreground"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? "Kopierat" : "Kopiera"}</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Editor body */}
        <div className="flex-1 overflow-hidden">
          <Textarea
            ref={textareaRef}
            value={plainText}
            onChange={(e) => handleTextChange(e.target.value)}
            readOnly={readOnly}
            className="w-full h-full resize-none border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 p-5 sm:p-8 text-sm leading-relaxed font-mono bg-background"
            style={{ minHeight: "100%" }}
            placeholder="Protokolltext..."
          />
        </div>

        {/* Footer */}
        {!isEnterprise && (
          <div className="px-5 py-2 border-t border-border/40 shrink-0">
            <p className="text-center text-[10px] text-muted-foreground/40">
              dokumenterat av{" "}
              <a
                href="https://tivly.se"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-muted-foreground/60 transition-colors"
              >
                tivly.se
              </a>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
