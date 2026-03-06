import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Edit3,
  Eye,
  Save,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  GripVertical,
  AlertCircle,
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
  onProtocolUpdate?: (protocol: ProtocolData) => void;
  readOnly?: boolean;
  isEnterprise?: boolean;
}

export const ProtocolEditor = ({
  meetingId,
  protocol,
  onProtocolUpdate,
  readOnly = false,
  isEnterprise = false,
}: ProtocolEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<ProtocolData>({ ...protocol });
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset edit data when protocol changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditData({ ...protocol });
    }
  }, [protocol, isEditing]);

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setHasChanges(true);
    autosaveTimer.current = setTimeout(() => {
      performSave();
    }, 2000);
  }, [meetingId]);

  const performSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const fullText = buildFullText(editData);
      await backendApi.saveProtocolDraft(meetingId, {
        fullText,
        title: editData.title,
        summary: editData.summary,
        mainPoints: editData.mainPoints,
        decisions: editData.decisions,
        actionItems: editData.actionItems,
      });
      setLastSaved(new Date());
      setHasChanges(false);
      onProtocolUpdate?.(editData);
    } catch (error) {
      console.error("Failed to autosave protocol draft:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const buildFullText = (data: ProtocolData): string => {
    const parts: string[] = [];
    if (data.title) parts.push(`# ${data.title}\n`);
    if (data.summary) parts.push(`## Sammanfattning\n${data.summary}\n`);
    if (data.mainPoints?.length) {
      parts.push(`## Huvudpunkter\n${data.mainPoints.map((p) => `- ${p}`).join("\n")}\n`);
    }
    if (data.decisions?.length) {
      parts.push(`## Beslut\n${data.decisions.map((d) => `- ${d}`).join("\n")}\n`);
    }
    if (data.actionItems?.length) {
      parts.push(
        `## Åtgärdspunkter\n${data.actionItems
          .map(
            (a) =>
              `- ${a.title}${a.owner ? ` (${a.owner})` : ""}${a.deadline ? ` – ${a.deadline}` : ""}`
          )
          .join("\n")}\n`
      );
    }
    if (data.nextMeetingSuggestions?.length) {
      parts.push(
        `## Nästa möte\n${data.nextMeetingSuggestions.map((s) => `- ${s}`).join("\n")}\n`
      );
    }
    return parts.join("\n");
  };

  const handleEnterEdit = () => {
    setEditData({ ...protocol });
    setIsEditing(true);
    setHasChanges(false);
  };

  const handleExitEdit = async () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (hasChanges) {
      await performSave();
    }
    setIsEditing(false);
  };

  const updateField = <K extends keyof ProtocolData>(key: K, value: ProtocolData[K]) => {
    setEditData((prev) => ({ ...prev, [key]: value }));
    scheduleAutosave();
  };

  const updateMainPoint = (index: number, value: string) => {
    const updated = [...editData.mainPoints];
    updated[index] = value;
    updateField("mainPoints", updated);
  };

  const addMainPoint = () => {
    updateField("mainPoints", [...editData.mainPoints, ""]);
  };

  const removeMainPoint = (index: number) => {
    updateField(
      "mainPoints",
      editData.mainPoints.filter((_, i) => i !== index)
    );
  };

  const updateDecision = (index: number, value: string) => {
    const updated = [...editData.decisions];
    updated[index] = value;
    updateField("decisions", updated);
  };

  const addDecision = () => {
    updateField("decisions", [...editData.decisions, ""]);
  };

  const removeDecision = (index: number) => {
    updateField(
      "decisions",
      editData.decisions.filter((_, i) => i !== index)
    );
  };

  const updateActionItem = (index: number, field: keyof AIActionItem, value: string) => {
    const updated = [...editData.actionItems];
    updated[index] = { ...updated[index], [field]: value };
    updateField("actionItems", updated);
  };

  const addActionItem = () => {
    updateField("actionItems", [
      ...editData.actionItems,
      { title: "", priority: "medium" as const },
    ]);
  };

  const removeActionItem = (index: number) => {
    updateField(
      "actionItems",
      editData.actionItems.filter((_, i) => i !== index)
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "text-red-600 dark:text-red-400";
      case "high": return "text-orange-600 dark:text-orange-400";
      case "medium": return "text-yellow-600 dark:text-yellow-400";
      case "low": return "text-green-600 dark:text-green-400";
      default: return "text-muted-foreground";
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case "critical": return "Kritisk";
      case "high": return "Hög";
      case "medium": return "Medium";
      case "low": return "Låg";
      default: return priority;
    }
  };

  const displayData = isEditing ? editData : protocol;

  return (
    <div className="space-y-8">
      {/* Edit toggle bar */}
      {!readOnly && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isEditing && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={isSaving ? "saving" : hasChanges ? "unsaved" : "saved"}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="flex items-center gap-1.5 text-xs"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                      <span className="text-muted-foreground">Sparar...</span>
                    </>
                  ) : hasChanges ? (
                    <>
                      <AlertCircle className="w-3 h-3 text-amber-500" />
                      <span className="text-amber-600 dark:text-amber-400">Osparade ändringar</span>
                    </>
                  ) : lastSaved ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      <span className="text-muted-foreground">
                        Sparad {lastSaved.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            onClick={isEditing ? handleExitEdit : handleEnterEdit}
            className="gap-1.5"
          >
            {isEditing ? (
              <>
                <Eye className="w-3.5 h-3.5" />
                Klar
              </>
            ) : (
              <>
                <Edit3 className="w-3.5 h-3.5" />
                Redigera
              </>
            )}
          </Button>
        </div>
      )}

      {/* Summary */}
      <section>
        <h2 className="text-xl font-semibold mb-3">Sammanfattning</h2>
        {isEditing ? (
          <Textarea
            value={editData.summary}
            onChange={(e) => updateField("summary", e.target.value)}
            className="min-h-[100px] text-sm leading-relaxed resize-none"
            placeholder="Sammanfattning av mötet..."
          />
        ) : (
          <p className="text-muted-foreground leading-relaxed">{displayData.summary}</p>
        )}
      </section>

      {/* Main Points */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Huvudpunkter</h2>
          {isEditing && (
            <Button variant="ghost" size="sm" onClick={addMainPoint} className="gap-1 text-xs h-7">
              <Plus className="w-3 h-3" /> Lägg till
            </Button>
          )}
        </div>
        <ul className="space-y-2">
          {displayData.mainPoints?.map((point, index) => (
            <li key={index} className="flex gap-3 group">
              {isEditing ? (
                <div className="flex-1 flex items-start gap-2">
                  <span className="text-primary font-medium mt-2 shrink-0">{index + 1}.</span>
                  <Input
                    value={point}
                    onChange={(e) => updateMainPoint(index, e.target.value)}
                    className="flex-1 text-sm"
                    placeholder="Huvudpunkt..."
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeMainPoint(index)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-primary font-medium">{index + 1}.</span>
                  <span className="text-muted-foreground">{String(point)}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Decisions */}
      {(isEditing || (displayData.decisions?.length > 0)) && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Beslut</h2>
            {isEditing && (
              <Button variant="ghost" size="sm" onClick={addDecision} className="gap-1 text-xs h-7">
                <Plus className="w-3 h-3" /> Lägg till
              </Button>
            )}
          </div>
          <ul className="space-y-2">
            {displayData.decisions?.map((decision, index) => (
              <li key={index} className="flex gap-3 group">
                {isEditing ? (
                  <div className="flex-1 flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-2" />
                    <Input
                      value={decision}
                      onChange={(e) => updateDecision(index, e.target.value)}
                      className="flex-1 text-sm"
                      placeholder="Beslut..."
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeDecision(index)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{String(decision)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Action Items */}
      {(isEditing || (displayData.actionItems?.length > 0)) && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Åtgärdspunkter</h2>
            {isEditing && (
              <Button variant="ghost" size="sm" onClick={addActionItem} className="gap-1 text-xs h-7">
                <Plus className="w-3 h-3" /> Lägg till
              </Button>
            )}
          </div>
          <div className="space-y-4">
            {displayData.actionItems?.map((item, index) => (
              <div key={index} className="pl-4 border-l-2 border-primary/20 group">
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Input
                        value={item.title}
                        onChange={(e) => updateActionItem(index, "title", e.target.value)}
                        className="flex-1 text-sm font-medium"
                        placeholder="Åtgärdspunkt..."
                      />
                      <select
                        value={item.priority}
                        onChange={(e) => updateActionItem(index, "priority", e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="critical">Kritisk</option>
                        <option value="high">Hög</option>
                        <option value="medium">Medium</option>
                        <option value="low">Låg</option>
                      </select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeActionItem(index)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <Input
                      value={item.description || ""}
                      onChange={(e) => updateActionItem(index, "description", e.target.value)}
                      className="text-sm"
                      placeholder="Beskrivning (valfritt)..."
                    />
                    <div className="flex gap-2">
                      <Input
                        value={item.owner || ""}
                        onChange={(e) => updateActionItem(index, "owner", e.target.value)}
                        className="text-sm flex-1"
                        placeholder="Ansvarig..."
                      />
                      <Input
                        value={item.deadline || ""}
                        onChange={(e) => updateActionItem(index, "deadline", e.target.value)}
                        className="text-sm flex-1"
                        placeholder="Deadline..."
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <h3 className="font-medium">{item.title}</h3>
                      <span className={`text-xs font-medium ${getPriorityColor(item.priority)}`}>
                        {getPriorityLabel(item.priority)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                    )}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      {item.owner && <span>Ansvarig: {item.owner}</span>}
                      {item.deadline && item.deadline.trim() !== "" && (
                        <span>Deadline: {item.deadline}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Next Meeting Suggestions */}
      {!isEditing &&
        displayData.nextMeetingSuggestions &&
        displayData.nextMeetingSuggestions.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-3">Nästa möte – Förslag</h2>
            <ul className="space-y-2">
              {displayData.nextMeetingSuggestions.map((suggestion, index) => (
                <li key={index} className="flex gap-3">
                  <span className="text-primary font-medium">•</span>
                  <span className="text-muted-foreground">{String(suggestion)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

      {/* Footer — only for non-enterprise */}
      {!isEnterprise && !isEditing && (
        <div className="mt-12 pt-6 border-t border-border/40">
          <p className="text-center text-xs text-muted-foreground/50">
            dokumenterat av{" "}
            <a
              href="https://tivly.se"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-muted-foreground/70 transition-colors"
            >
              tivly.se
            </a>
          </p>
        </div>
      )}
    </div>
  );
};
