import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, RefreshCw, Users, Zap, CheckCircle2, XCircle, RotateCcw, AlertTriangle, Shield, Monitor,
  ExternalLink, Copy,
} from 'lucide-react';
import {
  orgDigitalImportApi,
  isCompanyConsentAccepted,
  type OrgDigitalImportInsights,
  type OrgMemberRow,
} from '@/lib/adminDigitalImportApi';

interface OrgTeamsInsightsProps {
  companyId: string;
}

export function OrgTeamsInsights({ companyId }: OrgTeamsInsightsProps) {
  const [data, setData] = useState<OrgDigitalImportInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<OrgMemberRow | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await orgDigitalImportApi.getInsights(companyId);
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Kunde inte hämta data');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggleAutoImport = async (email: string, enabled: boolean) => {
    setActionLoading(email);
    try {
      await orgDigitalImportApi.toggleAutoImport(companyId, email, enabled);
      toast({ title: `Auto-import ${enabled ? 'aktiverad' : 'inaktiverad'}`, description: email });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReset = async (email: string) => {
    setActionLoading(email);
    try {
      await orgDigitalImportApi.resetUser(companyId, email);
      toast({ title: 'Koppling resetad', description: email });
      setResetTarget(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyConsentUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      toast({ title: 'Admin consent-länk kopierad', description: 'Skicka den till din IT-administratör.' });
      setTimeout(() => setCopiedUrl(false), 3000);
    } catch {
      toast({ title: 'Kunde inte kopiera', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-8 space-y-2">
        <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
        <p className="text-sm text-muted-foreground">{error || 'Ingen data'}</p>
        <Button variant="outline" size="sm" onClick={fetchData}>Försök igen</Button>
      </div>
    );
  }

  const di = data.digitalImport;
  const canManage = data.viewer.canManageMembers;
  const orgConsentAccepted = isCompanyConsentAccepted(di.adminConsent);
  const consentUrl = di.adminConsent.adminConsentUrl;

  return (
    <div className="space-y-5">
      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={Users} label="Anslutna medlemmar" value={di.connectedUserCount} />
        <MiniStat icon={Zap} label="Auto-import aktiv" value={di.autoImportEnabledUserCount} />
        <MiniStat label="Auto-importerade" value={di.imports.activeAuto} accent />
        <MiniStat label="Manuellt importerade" value={di.imports.activeManual} />
      </div>

      {/* ── Org-level consent banner ── */}
      <div className={`rounded-xl border p-4 flex items-start gap-3 ${
        orgConsentAccepted
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : 'border-amber-500/20 bg-amber-500/5'
      }`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
          orgConsentAccepted ? 'bg-emerald-500/15' : 'bg-amber-500/15'
        }`}>
          <Shield className={`w-4.5 h-4.5 ${orgConsentAccepted ? 'text-emerald-600' : 'text-amber-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">
              Organisationens admin consent
            </p>
            {orgConsentAccepted ? (
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> Godkänd
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 gap-1">
                <XCircle className="w-2.5 h-2.5" /> Väntar
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {orgConsentAccepted
              ? 'IT-administratören har godkänt Tivly för organisationen. Varje medlem måste fortfarande koppla sitt eget Microsoft-konto individuellt.'
              : 'IT-administratören har inte godkänt Tivly ännu. Medlemmar kan eventuellt inte importera Teams-transkript förrän godkännandet är klart.'}
          </p>
          {di.adminConsent.acceptedTenants?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {di.adminConsent.acceptedTenants.map((t) => (
                <Badge key={t.tenantId} variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                  {t.tenantId.slice(0, 8)}… godkänd {new Date(t.acceptedAt).toLocaleDateString('sv-SE')}
                </Badge>
              ))}
            </div>
          )}
          {/* Admin consent URL from backend – not hardcoded */}
          {!orgConsentAccepted && consentUrl && (
            <div className="mt-3 p-3 rounded-lg border border-border bg-background/50 space-y-2">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-primary" />
                Skicka denna länk till er IT-admin
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[10px] bg-muted border rounded px-2 py-1.5 break-all text-muted-foreground select-all">
                  {consentUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyConsentUrl(consentUrl)}
                  className="shrink-0 gap-1.5 h-8"
                >
                  {copiedUrl ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUrl ? 'Kopierad!' : 'Kopiera'}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                IT-admins klickar på länken, loggar in i Microsoft Entra och godkänner behörigheterna. Därefter kan varje medlem koppla sitt eget konto.
              </p>
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={fetchData} className="h-7 w-7 shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* ── Members table (individual connections — NO consent column) ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-medium">Medlemmar ({data.members.length})</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Individuell Microsoft-koppling per medlem. Admin consent gäller hela organisationen ovan.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Medlem</TableHead>
                <TableHead className="text-xs">Koppling</TableHead>
                <TableHead className="text-xs">Auto-import</TableHead>
                <TableHead className="text-xs text-right">Auto / Manuell</TableHead>
                <TableHead className="text-xs">Senaste import</TableHead>
                <TableHead className="text-xs">Fel</TableHead>
                {canManage && <TableHead className="text-xs text-right">Åtgärd</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.members.map((m) => (
                <TableRow key={m.email}>
                  <TableCell>
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{m.displayName || m.email}</span>
                      {m.displayName && <span className="block text-xs text-muted-foreground truncate">{m.email}</span>}
                      {m.accountEmail && m.accountEmail !== m.email && (
                        <span className="block text-[10px] text-muted-foreground/60 truncate">
                          <Monitor className="w-2.5 h-2.5 inline mr-0.5" />
                          {m.accountEmail}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.connected ? (
                      <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Ansluten
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Ej ansluten</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <Switch
                        checked={m.autoImportEnabled}
                        disabled={actionLoading === m.email || !m.connected}
                        onCheckedChange={(val) => handleToggleAutoImport(m.email, val)}
                        className="scale-75"
                      />
                    ) : (
                      <span className="text-xs">{m.autoImportEnabled ? 'Ja' : 'Nej'}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {m.imports.activeAuto} / {m.imports.activeManual}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.lastImportAt ? new Date(m.lastImportAt).toLocaleDateString('sv-SE') : '–'}
                  </TableCell>
                  <TableCell>
                    {m.lastError ? (
                      <span className="text-xs text-destructive truncate max-w-[100px] block" title={m.lastError.message}>
                        {m.lastError.code}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">–</span>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!m.connected || actionLoading === m.email}
                        onClick={() => setResetTarget(m)}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Reset
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {data.members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 7 : 6} className="text-center text-sm text-muted-foreground py-8">
                    Inga medlemmar har kopplat Microsoft Teams ännu.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reset Confirm */}
      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetta Microsoft-koppling?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta rensar Microsoft-kopplingen och stänger av auto-import för <strong>{resetTarget?.email}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetTarget && handleReset(resetTarget.email)}>
              Resetta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, accent }: { icon?: any; label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${accent ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
