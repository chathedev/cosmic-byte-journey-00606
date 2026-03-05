import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, CheckCircle2, Puzzle, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDigitalImport } from "@/hooks/useDigitalImport";
import { useZoomImport } from "@/hooks/useZoomImport";
import { useGoogleMeetImport } from "@/hooks/useGoogleMeetImport";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useSlackIntegration } from "@/hooks/useSlackIntegration";
import { ConnectionSuccessOverlay } from "@/components/ConnectionSuccessOverlay";
import teamsLogo from "@/assets/teams-logo.png";
import zoomLogo from "@/assets/zoom-logo.png";
import googleMeetLogo from "@/assets/google-meet-logo.png";
import slackLogo from "@/assets/slack-logo.png";

const INTEGRATION_MAP: Record<string, { route: string; name: string; logo: string; description: string }> = {
  microsoft: { route: '/integrations/teams', name: 'Microsoft Teams', logo: '', description: 'Microsoft-kontot har kopplats. Du kan nu importera Teams-möten.' },
  zoom: { route: '/integrations/zoom', name: 'Zoom', logo: '', description: 'Zoom-kontot har kopplats. Du kan nu importera inspelningar med transkript.' },
  google_meet: { route: '/integrations/google-meet', name: 'Google Meet', logo: '', description: 'Google-kontot har kopplats. Du kan nu importera möten med transkript.' },
  slack: { route: '/integrations/slack', name: 'Slack', logo: '', description: 'Du kan nu dela protokoll till Slack-kanaler.' },
};

const Integrations = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const digitalImport = useDigitalImport();
  const zoomImport = useZoomImport();
  const googleMeetImport = useGoogleMeetImport();
  const slackIntegration = useSlackIntegration();
  const { enterpriseMembership } = useSubscription();
  const hasHandledCallback = useRef(false);

  // Microsoft Teams is only available for enterprise planTier, not team
  const planTier = enterpriseMembership?.company?.planTier;
  const isTeamsAvailable = planTier === 'enterprise';

  const [successOverlay, setSuccessOverlay] = useState<{
    show: boolean;
    serviceName: string;
    description: string;
    logo: string;
  } | null>(null);

  // Detect OAuth success callback and show overlay on this page
  useEffect(() => {
    if (hasHandledCallback.current) return;
    const integration = searchParams.get('integration');
    const status = searchParams.get('status');

    if (status === 'success' && integration) {
      hasHandledCallback.current = true;
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('integration');
      url.searchParams.delete('status');
      window.history.replaceState({}, '', url.toString());

      // Resolve logo
      const logoMap: Record<string, string> = { microsoft: teamsLogo, zoom: zoomLogo, google_meet: googleMeetLogo, slack: slackLogo };
      const info = INTEGRATION_MAP[integration];
      if (info) {
        setSuccessOverlay({
          show: true,
          serviceName: info.name,
          description: info.description,
          logo: logoMap[integration] || '',
        });
      }
    }
  }, [searchParams]);

  const isTeamsEnabled = digitalImport.importStatus?.enabled === true;
  const isTeamsConfigured = digitalImport.importStatus?.configured === true;
  const teamsAccount = digitalImport.importStatus?.account;

  const isZoomEnabled = zoomImport.importStatus?.enabled === true;
  const isZoomConfigured = zoomImport.importStatus?.configured === true;
  const zoomAccount = zoomImport.importStatus?.account;

  const isGoogleMeetEnabled = googleMeetImport.importStatus?.enabled === true;
  const isGoogleMeetConfigured = googleMeetImport.importStatus?.configured === true;
  const googleMeetAccount = googleMeetImport.importStatus?.account;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">Integrationer</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Koppla Tivly till dina verktyg</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Microsoft Teams card */}
          <button
            onClick={() => navigate('/integrations/teams')}
            className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors overflow-hidden"
          >
            <div className="p-4 sm:p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden p-1.5">
                <img src={teamsLogo} alt="Microsoft Teams" className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Microsoft Teams</h2>
                  {digitalImport.isFullyConnected ? (
                    <Badge variant="secondary" className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400 gap-1 px-1.5 py-0">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Kopplad
                    </Badge>
                  ) : digitalImport.needsReconnect ? (
                    <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 gap-1 px-1.5 py-0">
                      Kräver omkoppling
                    </Badge>
                  ) : isTeamsEnabled && isTeamsConfigured ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Ej kopplad</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {digitalImport.isFullyConnected && teamsAccount?.email
                    ? teamsAccount.email
                    : 'Importera transkript från Teams-möten'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            </div>
          </button>

          {/* Zoom card */}
          <button
            onClick={() => navigate('/integrations/zoom')}
            className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors overflow-hidden"
          >
            <div className="p-4 sm:p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden p-2">
                <img src={zoomLogo} alt="Zoom" className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Zoom</h2>
                  {zoomImport.isFullyConnected ? (
                    <Badge variant="secondary" className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400 gap-1 px-1.5 py-0">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Kopplad
                    </Badge>
                  ) : zoomImport.needsReconnect ? (
                    <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 gap-1 px-1.5 py-0">
                      Kräver omkoppling
                    </Badge>
                  ) : isZoomEnabled && isZoomConfigured ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Ej kopplad</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {zoomImport.isFullyConnected && zoomAccount?.email
                    ? zoomAccount.email
                    : 'Importera transkript från Zoom Cloud Recordings'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            </div>
          </button>

          {/* Google Meet card */}
          <button
            onClick={() => navigate('/integrations/google-meet')}
            className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors overflow-hidden"
          >
            <div className="p-4 sm:p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden p-1.5">
                <img src={googleMeetLogo} alt="Google Meet" className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Google Meet</h2>
                  {googleMeetImport.isFullyConnected ? (
                    <Badge variant="secondary" className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400 gap-1 px-1.5 py-0">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Kopplad
                    </Badge>
                  ) : googleMeetImport.needsReconnect ? (
                    <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 gap-1 px-1.5 py-0">
                      Kräver omkoppling
                    </Badge>
                  ) : isGoogleMeetEnabled && isGoogleMeetConfigured ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Ej kopplad</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {googleMeetImport.isFullyConnected && googleMeetAccount?.email
                    ? googleMeetAccount.email
                    : 'Importera transkript från Google Meet-möten'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            </div>
          </button>

          {/* Slack card */}
          <button
            onClick={() => navigate('/integrations/slack')}
            className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors overflow-hidden"
          >
            <div className="p-4 sm:p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden p-1.5">
                <img src={slackLogo} alt="Slack" className="w-full h-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Slack</h2>
                  {slackIntegration.isFullyConnected ? (
                    <Badge variant="secondary" className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400 gap-1 px-1.5 py-0">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Kopplad
                    </Badge>
                  ) : slackIntegration.needsReconnect ? (
                    <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 gap-1 px-1.5 py-0">
                      Kräver omkoppling
                    </Badge>
                  ) : slackIntegration.importStatus?.enabled && slackIntegration.importStatus?.configured ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Ej kopplad</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {slackIntegration.isFullyConnected && slackIntegration.importStatus?.account?.workspaceName
                    ? slackIntegration.importStatus.account.workspaceName
                    : 'Dela protokoll till Slack-kanaler'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            </div>
          </button>

          {/* Coming soon */}
          <div className="w-full rounded-lg border border-border/50 bg-card/50 opacity-60 cursor-default">
            <div className="p-4 sm:p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-muted/50 border border-border/30 flex items-center justify-center shrink-0">
                <Puzzle className="w-5 h-5 text-muted-foreground/50" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-foreground/70">Fler integrationer</h2>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-border/50">
                    Kommer snart
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Google Calendar, Outlook, Notion och mer</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success overlay - shown on this page after OAuth callback redirect */}
      {successOverlay && (
        <ConnectionSuccessOverlay
          show={successOverlay.show}
          onClose={() => setSuccessOverlay(null)}
          serviceName={successOverlay.serviceName}
          description={successOverlay.description}
          logo={successOverlay.logo}
        />
      )}
    </div>
  );
};

export default Integrations;
