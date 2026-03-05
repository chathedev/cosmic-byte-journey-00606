import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mic, Upload, ClipboardPaste, CheckCircle2, Circle, Building2,
  ArrowRight, Loader2, ChevronDown, ChevronUp, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api";
import teamsLogo from "@/assets/teams-logo.png";
import zoomLogo from "@/assets/zoom-logo.png";
import googleMeetLogo from "@/assets/google-meet-logo.png";
import slackLogo from "@/assets/slack-logo.png";

interface ChecklistStep {
  id: string;
  title: string;
  description: string;
  hint?: string;
  cta?: { label: string; path: string };
  completed: boolean;
  completedAt?: string;
  autoCompleted?: boolean;
}

interface ChecklistData {
  enabled: boolean;
  completed: boolean;
  completedSteps: number;
  totalSteps: number;
  progressPercent: number;
  nextStep?: ChecklistStep;
  steps: ChecklistStep[];
  integrations?: {
    microsoftConnected?: boolean;
    zoomConnected?: boolean;
    googleMeetConnected?: boolean;
    slackConnected?: boolean;
    anyMeetingIntegrationConnected?: boolean;
  };
  metrics?: {
    meetingsTotal?: number;
    hasAnyMeeting?: boolean;
    hasTranscript?: boolean;
    hasProtocol?: boolean;
    hasAutomationEnabled?: boolean;
  };
}

interface EnterpriseHomeDashboardProps {
  onRecord: () => void;
  onUpload: () => void;
  onTextPaste: () => void;
  onOpenTeamsImport: () => void;
  onOpenZoomImport: () => void;
  onOpenGoogleMeetImport: () => void;
  isStartingRecording: boolean;
}

export const EnterpriseHomeDashboard = ({
  onRecord,
  onUpload,
  onTextPaste,
  onOpenTeamsImport,
  onOpenZoomImport,
  onOpenGoogleMeetImport,
  isStartingRecording,
}: EnterpriseHomeDashboardProps) => {
  const { user } = useAuth();
  const { enterpriseMembership, userPlan } = useSubscription();
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState<ChecklistData | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(true);
  const [checklistExpanded, setChecklistExpanded] = useState(true);
  const [stats, setStats] = useState<any>(null);

  const companyName = enterpriseMembership?.company?.name || "Enterprise";
  const companyId = enterpriseMembership?.company?.id;
  const preferredName = (user as any)?.preferredName;
  const displayName = preferredName || user?.displayName?.split(" ")[0] || "";

  const integrations = checklist?.integrations;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 5) return "God natt";
    if (hour < 10) return "God morgon";
    if (hour < 12) return "God förmiddag";
    if (hour < 18) return "God eftermiddag";
    if (hour < 22) return "God kväll";
    return "God natt";
  };

  const loadChecklist = useCallback(async () => {
    try {
      setChecklistLoading(true);
      const data = await apiClient.getEnterpriseChecklist();
      if (data?.checklist) {
        setChecklist(data.checklist);
        // Auto-collapse if completed
        if (data.checklist.completed) {
          setChecklistExpanded(false);
        }
      }
    } catch (e) {
      console.warn("Failed to load checklist:", e);
    } finally {
      setChecklistLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await apiClient.getEnterpriseCompanyStats(companyId);
      setStats(data?.totals);
    } catch {
      // silent
    }
  }, [companyId]);

  useEffect(() => {
    loadChecklist();
    loadStats();
  }, [loadChecklist, loadStats]);

  const connectedIntegrations = [
    { key: "microsoftConnected", label: "Teams", logo: teamsLogo, onImport: onOpenTeamsImport },
    { key: "zoomConnected", label: "Zoom", logo: zoomLogo, onImport: onOpenZoomImport },
    { key: "googleMeetConnected", label: "Google Meet", logo: googleMeetLogo, onImport: onOpenGoogleMeetImport },
  ];

  const slackConnected = integrations?.slackConnected;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <div className="flex-1 flex flex-col p-5 md:p-8 max-w-2xl mx-auto w-full">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {companyName}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {displayName ? `${getGreeting()}, ${displayName}` : getGreeting()}
          </h1>
        </div>

        {/* Quick Stats Row */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Teammedlemmar</p>
              <p className="text-lg font-semibold text-foreground">{stats.memberCount ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Totala möten</p>
              <p className="text-lg font-semibold text-foreground">{stats.totalMeetingCount ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">Snitt/medlem</p>
              <p className="text-lg font-semibold text-foreground">
                {stats.averageMeetingsPerMember != null
                  ? Number(stats.averageMeetingsPerMember).toFixed(1)
                  : "0"}
              </p>
            </div>
          </div>
        )}

        {/* Quick Import Section */}
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Snabbimport
          </p>
          <div className="grid grid-cols-3 gap-2">
            {connectedIntegrations.map((int) => {
              const connected = integrations?.[int.key as keyof typeof integrations];
              return (
                <button
                  key={int.key}
                  onClick={connected ? int.onImport : () => navigate("/integrations")}
                  className={`relative flex flex-col items-center gap-2 rounded-lg border p-4 transition-all ${
                    connected
                      ? "border-border bg-card hover:border-primary/40 hover:shadow-sm cursor-pointer"
                      : "border-dashed border-border/60 bg-muted/20 hover:bg-muted/40 cursor-pointer"
                  }`}
                >
                  <div className="w-8 h-8 flex items-center justify-center">
                    <img src={int.logo} alt={int.label} className="w-7 h-7 object-contain" />
                  </div>
                  <span className="text-xs font-medium text-foreground">{int.label}</span>
                  {connected ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-0">
                      Kopplad
                    </Badge>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Koppla</span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Slack status */}
          {slackConnected && (
            <div className="mt-2 flex items-center gap-2 px-1">
              <img src={slackLogo} alt="Slack" className="w-4 h-4 object-contain" />
              <span className="text-xs text-muted-foreground">Slack kopplad</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            </div>
          )}
        </div>

        {/* Checklist Section */}
        {checklist && checklist.enabled && (
          <div className="mb-6 rounded-lg border border-border bg-card overflow-hidden">
            <button
              onClick={() => setChecklistExpanded(!checklistExpanded)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                  {checklist.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  ) : (
                    <BarChart3 className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {checklist.completed ? "Checklista klar" : "Kom igång"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {checklist.completedSteps} av {checklist.totalSteps} steg klara
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Progress value={checklist.progressPercent} className="w-20 h-1.5" />
                {checklistExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {checklistExpanded && (
              <div className="px-4 pb-4 space-y-1">
                {checklist.steps.map((step) => (
                  <div
                    key={step.id}
                    className={`flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors ${
                      step.completed ? "opacity-60" : "hover:bg-muted/30"
                    }`}
                  >
                    {step.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm ${
                          step.completed
                            ? "line-through text-muted-foreground"
                            : "text-foreground font-medium"
                        }`}
                      >
                        {step.title}
                      </p>
                      {!step.completed && step.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                      )}
                    </div>
                    {!step.completed && step.cta && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-xs h-7 px-2 text-primary hover:text-primary"
                        onClick={() => navigate(step.cta!.path)}
                      >
                        {step.cta.label}
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {checklistLoading && (
          <div className="mb-6 rounded-lg border border-border bg-card p-6 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2.5 mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Skapa nytt
          </p>
          <Button
            onClick={onRecord}
            size="lg"
            disabled={isStartingRecording}
            className="w-full h-12 text-sm gap-2.5 rounded-lg"
          >
            {isStartingRecording ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
            {isStartingRecording ? "Startar..." : "Spela in möte"}
          </Button>

          <div className="grid grid-cols-2 gap-2.5">
            <Button
              onClick={onUpload}
              variant="outline"
              size="lg"
              className="h-12 text-sm gap-2 rounded-lg"
            >
              <Upload className="w-4 h-4" />
              Ladda upp
            </Button>
            <Button
              onClick={onTextPaste}
              variant="outline"
              size="lg"
              className="h-12 text-sm gap-2 rounded-lg"
            >
              <ClipboardPaste className="w-4 h-4" />
              Klistra in
            </Button>
          </div>
        </div>

        {/* Meeting usage */}
        {userPlan && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              {userPlan.meetingsUsed ?? 0}
              {userPlan.meetingsLimit != null ? ` / ${userPlan.meetingsLimit}` : ""} möten använda
              {userPlan.renewsAt && (
                <span className="ml-1">
                  · Förnyas {new Date(userPlan.renewsAt).toLocaleDateString("sv-SE")}
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
