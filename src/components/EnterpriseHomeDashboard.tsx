import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mic, Upload, ClipboardPaste, CheckCircle2, Circle,
  ArrowRight, Loader2, ChevronDown, ChevronUp,
  Users, FileText, TrendingUp, Library, PartyPopper
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
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
  messages?: string[];
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
  const planType = enterpriseMembership?.company?.planType;
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
      const data = await apiClient.getChecklist(planType);
      if (data?.checklist) {
        setChecklist(data.checklist);
        if (data.checklist.completed) setChecklistExpanded(false);
      }
    } catch (e) {
      console.warn("Failed to load checklist:", e);
    } finally {
      setChecklistLoading(false);
    }
  }, [planType]);

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
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        {/* Header */}
        <div className="mb-10 sm:mb-12">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-2">
            {companyName}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            {displayName ? `${getGreeting()}, ${displayName}` : getGreeting()}
          </h1>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-10">

          {/* Left column — primary actions (3/5) */}
          <div className="lg:col-span-3 space-y-6">

            {/* Record CTA card */}
            <div className="rounded-2xl border border-border bg-card p-6 sm:p-7">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-foreground mb-1">Nytt möte</h2>
                  <p className="text-sm text-muted-foreground">
                    Spela in live, ladda upp en fil eller klistra in text
                  </p>
                </div>
                <Button
                  onClick={onRecord}
                  disabled={isStartingRecording}
                  className="h-11 px-6 gap-2 text-sm shrink-0 rounded-xl shadow-sm"
                >
                  {isStartingRecording ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                  {isStartingRecording ? "Startar…" : "Spela in"}
                </Button>
              </div>

              <div className="flex gap-3 mt-5 pt-5 border-t border-border/60">
                <Button
                  onClick={onUpload}
                  variant="outline"
                  size="sm"
                  className="flex-1 h-10 text-sm gap-2 rounded-xl"
                >
                  <Upload className="w-4 h-4" />
                  Ladda upp
                </Button>
                <Button
                  onClick={onTextPaste}
                  variant="outline"
                  size="sm"
                  className="flex-1 h-10 text-sm gap-2 rounded-xl"
                >
                  <ClipboardPaste className="w-4 h-4" />
                  Klistra in
                </Button>
              </div>
            </div>

            {/* Checklist */}
            {checklist && checklist.enabled && (
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setChecklistExpanded(!checklistExpanded)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      checklist.completed ? "bg-primary/10" : "bg-muted"
                    }`}>
                      {checklist.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      ) : (
                        <span className="text-xs font-bold text-foreground">
                          {checklist.completedSteps}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {checklist.completed ? "Onboarding klar" : "Kom igång"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {checklist.completedSteps}/{checklist.totalSteps} steg
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
                  <div className="px-6 pb-5 space-y-1">
                    {/* Completion banner */}
                    {checklist.completed && (
                      <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-primary/5 mb-3">
                        <PartyPopper className="w-4 h-4 text-primary shrink-0" />
                        <p className="text-sm text-foreground">
                          Checklistan är klar. Teamet är redo att arbeta fullt i Tivly.
                        </p>
                      </div>
                    )}

                    {/* Next step hint */}
                    {!checklist.completed && checklist.messages?.[0] && (
                      <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-muted/40 mb-3">
                        <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />
                        <p className="text-xs text-muted-foreground">{checklist.messages[0]}</p>
                      </div>
                    )}

                    {checklist.steps.map((step) => (
                      <div
                        key={step.id}
                        className={`flex items-start gap-3 rounded-xl px-4 py-2.5 transition-colors ${
                          step.completed ? "opacity-50" : ""
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {step.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-primary" />
                          ) : (
                            <Circle className="w-4 h-4 text-border" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-snug ${
                            step.completed
                              ? "line-through text-muted-foreground"
                              : "text-foreground"
                          }`}>
                            {step.title}
                          </p>
                          {!step.completed && step.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                              {step.description}
                            </p>
                          )}
                        </div>
                        {!step.completed && step.cta && (
                          <button
                            onClick={() => {
                              let path = step.cta!.path;
                              if (path === "/meetings" || path === "/meetings/") path = "/library";
                              navigate(path);
                            }}
                            className="shrink-0 text-xs text-primary hover:underline flex items-center gap-0.5 mt-0.5 font-medium"
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
              <div className="rounded-2xl border border-border bg-card p-10 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Right column — stats + integrations (2/5) */}
          <div className="lg:col-span-2 space-y-6">

            {/* Stats */}
            <div className="rounded-2xl border border-border bg-card divide-y divide-border/60">
              <button
                onClick={() => navigate("/org/settings")}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/20 transition-colors rounded-t-2xl"
              >
                <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="text-sm text-foreground flex-1">Teammedlemmar</span>
                <span className="text-lg font-semibold text-foreground tabular-nums">
                  {stats?.memberCount ?? 0}
                </span>
              </button>
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-foreground">Dina möten</span>
                  <p className="text-[10px] text-muted-foreground leading-tight">Historiskt antal</p>
                </div>
                <span className="text-lg font-semibold text-foreground tabular-nums">
                  {userPlan?.meetingsUsed ?? 0}
                </span>
              </div>
              {stats && (
                <div className="flex items-center gap-3 px-5 py-4 rounded-b-2xl">
                  <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground">Org. möten</span>
                    <p className="text-[10px] text-muted-foreground leading-tight">Aktiva i organisationen</p>
                  </div>
                  <span className="text-lg font-semibold text-foreground tabular-nums">
                    {stats.totalMeetingCount ?? 0}
                  </span>
                </div>
              )}
            </div>

            {/* Integrations */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border/60">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
                  Integrationer
                </p>
              </div>
              <div className="divide-y divide-border/60">
                {importActions.map((int) => {
                  const connected = integrations?.[int.key as keyof typeof integrations];
                  return (
                    <button
                      key={int.key}
                      onClick={connected ? int.onImport : () => navigate("/integrations")}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/20 transition-colors"
                    >
                      <img src={int.logo} alt={int.label} className="w-5 h-5 object-contain shrink-0" />
                      <span className="text-sm text-foreground flex-1 text-left">{int.label}</span>
                      {connected ? (
                        <span className="text-xs text-primary font-medium">Importera →</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Koppla</span>
                      )}
                    </button>
                  );
                })}
                {slackConnected && (
                  <div className="flex items-center gap-3 px-5 py-3.5">
                    <img src={slackLogo} alt="Slack" className="w-5 h-5 object-contain shrink-0" />
                    <span className="text-sm text-foreground flex-1">Slack</span>
                    <span className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                )}
              </div>
            </div>

            {/* Library link */}
            <button
              onClick={() => navigate("/library")}
              className="w-full rounded-2xl border border-border bg-card px-5 py-4 flex items-center gap-3 hover:bg-muted/20 transition-colors"
            >
              <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Library className="w-4 h-4 text-muted-foreground" />
              </div>
              <span className="text-sm text-foreground flex-1 text-left">Bibliotek</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
