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
  Loader2, RefreshCw, Users, CheckCircle2, XCircle, RotateCcw, AlertTriangle, Send, Hash,
} from 'lucide-react';
import {
  orgSlackIntegrationApi,
  type SlackOrgInsights,
  type SlackOrgMemberRow,
} from '@/lib/slackIntegrationApi';

interface OrgSlackInsightsProps {
  companyId: string;
}

export function OrgSlackInsights({ companyId }: OrgSlackInsightsProps) {
  const [data, setData] = useState<SlackOrgInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<SlackOrgMemberRow | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await orgSlackIntegrationApi.getInsights(companyId);
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Kunde inte hämta data');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggleAutoShare = async (email: string, enabled: boolean) => {
    setActionLoading(email);
    try {
      await orgSlackIntegrationApi.toggleAutoShare(companyId, email, enabled);
      toast({ title: `Auto-delning ${enabled ? 'aktiverad' : 'inaktiverad'}`, description: email });
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
      await orgSlackIntegrationApi.resetUser(companyId, email);
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

  const si = data.slackIntegration ?? {
    connectedUserCount: 0,
    autoShareEnabledUserCount: 0,
    shares: { manualSharesCount: 0, autoSharesCount: 0, totalShares: 0 },
  };
  const canManage = data.viewer?.canManageMembers ?? false;

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={Users} label="Anslutna medlemmar" value={si.connectedUserCount ?? 0} />
        <MiniStat icon={Send} label="Auto-delning aktiv" value={si.autoShareEnabledUserCount ?? 0} />
        <MiniStat label="Auto-delningar" value={si.shares?.autoSharesCount ?? 0} accent />
        <MiniStat label="Manuella delningar" value={si.shares?.manualSharesCount ?? 0} />
      </div>

      {/* Members table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-medium">Medlemmar ({data.members.length})</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Individuell Slack-koppling per medlem.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Medlem</TableHead>
                <TableHead className="text-xs">Koppling</TableHead>
                <TableHead className="text-xs">Auto-delning</TableHead>
                <TableHead className="text-xs text-right">Auto / Manuell</TableHead>
                <TableHead className="text-xs">Senast delad</TableHead>
                <TableHead className="text-xs">Fel</TableHead>
                {canManage && <TableHead className="text-xs text-right">Åtgärd</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.members.map((m) => (
                <TableRow key={m.email}>
                  <TableCell>
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{m.email}</span>
                      {m.workspaceName && (
                        <span className="block text-xs text-muted-foreground truncate">{m.workspaceName}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.reconnectRequired ? (
                      <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> Reconnect
                      </Badge>
                    ) : m.connected ? (
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
                        checked={m.autoShareEnabled}
                        disabled={actionLoading === m.email || !m.connected}
                        onCheckedChange={(val) => handleToggleAutoShare(m.email, val)}
                        className="scale-75"
                      />
                    ) : (
                      <span className="text-xs">{m.autoShareEnabled ? 'Ja' : 'Nej'}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {m.shares?.autoSharesCount ?? 0} / {m.shares?.manualSharesCount ?? 0}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.lastSharedAt ? new Date(m.lastSharedAt).toLocaleDateString('sv-SE') : '–'}
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
                    Inga medlemmar har kopplat Slack ännu.
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
            <AlertDialogTitle>Resetta Slack-koppling?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta rensar Slack-kopplingen och stänger av auto-delning för <strong>{resetTarget?.email}</strong>.
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
