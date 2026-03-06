import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mic, Upload, ClipboardPaste, CheckCircle2, Circle,
  ArrowRight, Loader2, ChevronDown, ChevronUp,
  Users, FileText, TrendingUp, Library
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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

  const companyName = enterpriseMembership?.company?.name || (enterpriseMembership?.company?.planType === 'enterprise' ? "Enterprise" : "Team");
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
        if (data.checklist.completed) setChecklistExpanded(false);
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

  const importActions = [
    { key: "microsoftConnected", label: "Teams", logo: teamsLogo, onImport: onOpenTeamsImport },
    { key: "zoomConnected", label: "Zoom", logo: zoomLogo, onImport: onOpenZoomImport },
    { key: "googleMeetConnected", label: "Meet", logo: googleMeetLogo, onImport: onOpenGoogleMeetImport },
  ];

  const slackConnected = integrations?.slackConnected;

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">

        {/* Header row */}
        <div className="mb-8 sm:mb-10">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">
            {companyName}
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
            {displayName ? `${getGreeting()}, ${displayName}` : getGreeting()}
          </h1>
        </div>

        {/* Two-column layout on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">

          {/* Left column — primary actions (3/5) */}
          <div className="lg:col-span-3 space-y-6">

            {/* Record CTA */}
            <div className="rounded-lg border border-border bg-card p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-foreground mb-1">Nytt möte</h2>
                  <p className="text-xs text-muted-foreground">
                    Spela in live, ladda upp en fil eller klistra in text
                  </p>
                </div>
                <Button
                  onClick={onRecord}
                  disabled={isStartingRecording}
                  className="h-10 px-5 gap-2 text-sm shrink-0"
                >
                  {isStartingRecording ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                  {isStartingRecording ? "Startar…" : "Spela in"}
                </Button>
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                <Button
                  onClick={onUpload}
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-xs gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Ladda upp
                </Button>
                <Button
                  onClick={onTextPaste}
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-xs gap-1.5"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  Klistra in
                </Button>
              </div>
            </div>

            {/* Checklist */}
            {checklist && checklist.enabled && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setChecklistExpanded(!checklistExpanded)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
                      checklist.completed ? "bg-primary/10" : "bg-muted"
                    }`}>
                      {checklist.completed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <span className="text-xs font-bold text-foreground">
                          {checklist.completedSteps}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {checklist.completed ? "Onboarding klar" : "Kom igång"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {checklist.completedSteps}/{checklist.totalSteps} steg
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Progress value={checklist.progressPercent} className="w-16 h-1" />
                    {checklistExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {checklistExpanded && (
                  <div className="px-5 pb-4 space-y-0.5">
                    {checklist.steps.map((step) => (
                      <div
                        key={step.id}
                        className={`flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors ${
                          step.completed ? "opacity-50" : "hover:bg-muted/20"
                        }`}
                      >
                        {step.completed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-border mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] leading-snug ${
                            step.completed
                              ? "line-through text-muted-foreground"
                              : "text-foreground"
                          }`}>
                            {step.title}
                          </p>
                          {!step.completed && step.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                              {step.description}
                            </p>
                          )}
                        </div>
                        {!step.completed && step.cta && (
                          <button
                            onClick={() => {
                              // Remap invalid routes from backend
                              let path = step.cta!.path;
                              if (path === "/meetings" || path === "/meetings/") path = "/library";
                              navigate(path);
                            }}
                            className="shrink-0 text-[11px] text-primary hover:underline flex items-center gap-0.5 mt-0.5"
                          >
                            {step.cta.label}
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {checklistLoading && (
              <div className="rounded-lg border border-border bg-card p-8 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Right column — stats + integrations (2/5) */}
          <div className="lg:col-span-2 space-y-6">

            {/* Stats */}
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              <button
                onClick={() => navigate("/org/settings")}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-muted/20 transition-colors"
              >
                <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground flex-1">Teammedlemmar</span>
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {stats?.memberCount ?? 0}
                </span>
              </button>
              <div className="flex items-center gap-3 px-5 py-3.5">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-foreground">Dina möten</span>
                  <p className="text-[10px] text-muted-foreground leading-tight">Historiskt antal</p>
                </div>
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {userPlan?.meetingsUsed ?? 0}
                </span>
              </div>
              {stats && (
                <div className="flex items-center gap-3 px-5 py-3.5">
                  <TrendingUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground">Org. möten</span>
                    <p className="text-[10px] text-muted-foreground leading-tight">Aktiva i organisationen</p>
                  </div>
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {stats.totalMeetingCount ?? 0}
                  </span>
                </div>
              )}
            </div>

            {/* Integrations */}
            <div className="rounded-lg border border-border bg-card">
              <div className="px-5 py-3 border-b border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Integrationer
                </p>
              </div>
              <div className="divide-y divide-border">
                {importActions.map((int) => {
                  const connected = integrations?.[int.key as keyof typeof integrations];
                  return (
                    <button
                      key={int.key}
                      onClick={connected ? int.onImport : () => navigate("/integrations")}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors"
                    >
                      <img src={int.logo} alt={int.label} className="w-5 h-5 object-contain shrink-0" />
                      <span className="text-sm text-foreground flex-1 text-left">{int.label}</span>
                      {connected ? (
                        <span className="text-[11px] text-primary font-medium">Importera →</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Koppla</span>
                      )}
                    </button>
                  );
                })}
                {slackConnected && (
                  <div className="flex items-center gap-3 px-5 py-3">
                    <img src={slackLogo} alt="Slack" className="w-5 h-5 object-contain shrink-0" />
                    <span className="text-sm text-foreground flex-1">Slack</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  </div>
                )}
              </div>
            </div>

            {/* Quick library link */}
            <button
              onClick={() => navigate("/library")}
              className="w-full rounded-lg border border-border bg-card px-5 py-3.5 flex items-center gap-3 hover:bg-muted/20 transition-colors"
            >
              <Library className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground flex-1 text-left">Bibliotek</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
