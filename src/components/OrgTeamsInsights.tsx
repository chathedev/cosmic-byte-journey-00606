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
  Loader2, RefreshCw, Users, Zap, CheckCircle2, XCircle, RotateCcw, AlertTriangle, AlertCircle,
} from 'lucide-react';
import {
  orgDigitalImportApi,
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

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={Users} label="Anslutna" value={di.connectedUserCount} />
        <MiniStat icon={Zap} label="Auto-import" value={di.autoImportEnabledUserCount} />
        <MiniStat label="Auto-möten" value={di.imports.activeAuto} accent />
        <MiniStat label="Manuella" value={di.imports.activeManual} />
      </div>

      {/* Consent status */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Admin consent:</span>
        {di.adminConsent.accepted ? (
          <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" /> Accepted
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 gap-1">
            <XCircle className="w-2.5 h-2.5" /> Pending
          </Badge>
        )}
        <Button variant="ghost" size="icon" onClick={fetchData} className="h-7 w-7 ml-auto">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Members table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Medlemmar ({data.members.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Medlem</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Consent</TableHead>
                <TableHead className="text-xs">Auto</TableHead>
                <TableHead className="text-xs text-right">Auto / Man</TableHead>
                <TableHead className="text-xs">Senaste import</TableHead>
                <TableHead className="text-xs">Fel</TableHead>
                {canManage && <TableHead className="text-xs text-right">Åtgärd</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.members.map((m) => {
                const consentApproved = m.adminConsent?.approved ?? m.adminConsentAcceptedForTenant ?? false;
                return (
                  <TableRow key={m.email}>
                    <TableCell>
                      <div>
                        <span className="text-sm">{m.displayName || m.email}</span>
                        {m.displayName && <span className="block text-xs text-muted-foreground">{m.email}</span>}
                        {m.accountEmail && m.accountEmail !== m.email && (
                          <span className="block text-[10px] text-muted-foreground/60">{m.accountEmail}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {m.connected ? (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">Ansluten</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Ej ansluten</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {m.connected ? (
                        consentApproved ? (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> OK
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> Pending
                          </Badge>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
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
                );
              })}
              {data.members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canManage ? 8 : 7} className="text-center text-sm text-muted-foreground py-6">
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
