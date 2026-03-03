import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Monitor, Link2, Unlink, Loader2, AlertTriangle, RefreshCw, CheckCircle2, Shield, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useDigitalImport } from "@/hooks/useDigitalImport";

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
};

const IntegrationTeams = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const digitalImport = useDigitalImport();

  const isConnected = digitalImport.importStatus?.connected === true;
  const isEnabled = digitalImport.importStatus?.enabled === true;
  const isConfigured = digitalImport.importStatus?.configured === true;
  const account = digitalImport.importStatus?.account;
  const lastError = digitalImport.importStatus?.lastError;
  const scopes = digitalImport.importStatus?.scopes;

  // Handle OAuth callback redirect
  useEffect(() => {
    const integration = searchParams.get('integration');
    const status = searchParams.get('status');
    if (integration === 'microsoft' && status) {
      const url = new URL(window.location.href);
      url.searchParams.delete('status');
      url.searchParams.delete('integration');
      window.history.replaceState({}, '', url.toString());

      if (status === 'success') {
        toast({ title: 'Microsoft-konto kopplat', description: 'Du kan nu importera möten från Teams.' });
        digitalImport.checkStatus();
      } else {
        toast({ title: 'Kopplingen misslyckades', description: 'Försök igen.', variant: 'destructive' });
      }
    }
  }, [searchParams]);

  const handleConnect = async () => {
    await digitalImport.connect();
  };

  const handleDisconnect = async () => {
    await digitalImport.disconnect();
    toast({ title: 'Microsoft-konto bortkopplat', description: 'Du kan koppla ett nytt konto när du vill.' });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate('/integrations')}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Microsoft Teams</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Importera transkript från Teams-möten</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <section>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Status header */}
              <div className="p-5 sm:p-6 flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">Anslutningsstatus</h2>
                {isConnected ? (
                  <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Kopplad
                  </Badge>
                ) : isEnabled && isConfigured ? (
                  <Badge variant="secondary" className="text-xs">Ej kopplad</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">Ej tillgänglig</Badge>
                )}
              </div>

              <Separator />

              {/* Not enabled / not configured */}
              {(!isEnabled || !isConfigured) && (
                <div className="p-5 sm:p-6">
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/40 border border-border/50">
                    <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {!isEnabled ? 'Teams-import är inte aktiverat' : 'Microsoft Graph inte konfigurerat'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {!isEnabled
                          ? 'Kontakta din administratör för att aktivera Teams-import.'
                          : 'Backend saknar nödvändig Microsoft Graph-konfiguration. Kontakta support.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Connected state */}
              {isEnabled && isConfigured && isConnected && account && (
                <div className="p-5 sm:p-6 space-y-5">
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Kopplat konto</h3>
                    <div className="rounded-lg border border-border bg-muted/20 divide-y divide-border">
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-muted-foreground">E-post</span>
                        <span className="text-sm font-medium text-foreground">{account.email}</span>
                      </div>
                      {account.displayName && (
                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-sm text-muted-foreground">Namn</span>
                          <span className="text-sm text-foreground">{account.displayName}</span>
                        </div>
                      )}
                      {account.connectedAt && (
                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-sm text-muted-foreground">Kopplad sedan</span>
                          <span className="text-sm text-foreground">{formatDate(account.connectedAt)}</span>
                        </div>
                      )}
                      {account.lastImportAt && (
                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-sm text-muted-foreground">Senaste import</span>
                          <span className="text-sm text-foreground">{formatDate(account.lastImportAt)}</span>
                        </div>
                      )}
                      {account.lastAuthorizedAt && (
                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-sm text-muted-foreground">Senaste auktorisering</span>
                          <span className="text-sm text-foreground">{formatDate(account.lastAuthorizedAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {scopes && scopes.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Behörigheter</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {scopes.map((scope) => (
                          <Badge key={scope} variant="outline" className="text-[10px] font-mono">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-1.5">
                      <Unlink className="w-3.5 h-3.5" />
                      Koppla bort
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => digitalImport.checkStatus()} className="gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Uppdatera status
                    </Button>
                  </div>
                </div>
              )}

              {/* Not connected state */}
              {isEnabled && isConfigured && !isConnected && (
                <div className="p-5 sm:p-6 space-y-5">
                  {lastError && (
                    <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-1.5">
                      <p className="text-sm font-medium text-destructive flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {lastError.code === 'microsoft_token_request_failed'
                          ? 'Microsoft-autentiseringen misslyckades'
                          : 'Kopplingen misslyckades'}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {lastError.message?.includes('AADSTS7000215')
                          ? 'Felaktig klienthemlighet i backend. Kontrollera att MICROSOFT_CLIENT_SECRET är satt till secret Value (inte secret ID) i Azure-appregistreringen.'
                          : lastError.message || 'Ett okänt fel uppstod. Försök koppla kontot igen.'}
                      </p>
                      {lastError.updatedAt && (
                        <p className="text-[10px] text-muted-foreground/60 mt-1">
                          {formatDate(lastError.updatedAt)}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground">Så fungerar det</h3>
                    <div className="space-y-2">
                      {[
                        'Koppla ditt Microsoft 365-konto med ett klick',
                        'Välj ett Teams-möte med färdigt transkript',
                        'Importera transkriptet och skapa protokoll i Tivly',
                      ].map((step, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-primary">{i + 1}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={handleConnect}
                    disabled={digitalImport.state === 'connecting'}
                    className="w-full sm:w-auto h-11 gap-2 rounded-xl text-sm font-semibold"
                  >
                    {digitalImport.state === 'connecting' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                    Koppla Microsoft-konto
                  </Button>

                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/20 border border-border/30">
                    <Shield className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <span className="font-medium text-foreground">Krav:</span> Teams-transkribering måste vara aktiverat för mötet 
                      och du behöver vara organisatör. Stödjer både arbets-/skolkonton och personliga Microsoft-konton.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default IntegrationTeams;
