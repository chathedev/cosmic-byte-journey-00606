import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, CheckCircle2, Puzzle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDigitalImport } from "@/hooks/useDigitalImport";
import { useZoomImport } from "@/hooks/useZoomImport";
import { useGoogleMeetImport } from "@/hooks/useGoogleMeetImport";
import teamsLogo from "@/assets/teams-logo.png";
import zoomLogo from "@/assets/zoom-logo.png";
import googleMeetLogo from "@/assets/google-meet-logo.png";

const Integrations = () => {
  const navigate = useNavigate();
  const digitalImport = useDigitalImport();
  const zoomImport = useZoomImport();
  const googleMeetImport = useGoogleMeetImport();

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
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0 overflow-hidden">
                <img src={teamsLogo} alt="Microsoft Teams" className="w-7 h-7 object-contain" />
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
              <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center shrink-0 overflow-hidden">
                <img src={zoomLogo} alt="Zoom" className="w-11 h-11 object-contain scale-110" />
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
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center shrink-0 overflow-hidden">
                <img src={googleMeetLogo} alt="Google Meet" className="w-7 h-7 object-contain" />
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
                <p className="text-xs text-muted-foreground/60 mt-0.5">Slack, Google Calendar, Outlook, Notion och mer</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Integrations;
