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
  Loader2, RefreshCw, Users, Zap, CheckCircle2, XCircle, RotateCcw, AlertTriangle, Video,
} from 'lucide-react';
import {
  orgZoomImportApi,
  type ZoomOrgInsights,
  type ZoomOrgMemberRow,
} from '@/lib/zoomImportApi';

interface OrgZoomInsightsProps {
  companyId: string;
}

export function OrgZoomInsights({ companyId }: OrgZoomInsightsProps) {
  const [data, setData] = useState<ZoomOrgInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<ZoomOrgMemberRow | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await orgZoomImportApi.getInsights(companyId);
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
      await orgZoomImportApi.toggleAutoImport(companyId, email, enabled);
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
      await orgZoomImportApi.resetUser(companyId, email);
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

  const zi = data.zoomImport ?? {
    connectedUserCount: 0,
    autoImportEnabledUserCount: 0,
    imports: { activeAuto: 0, activeManual: 0 },
  };
  const canManage = data.viewer?.canManageMembers ?? false;

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={Users} label="Anslutna medlemmar" value={zi.connectedUserCount ?? 0} />
        <MiniStat icon={Zap} label="Auto-import aktiv" value={zi.autoImportEnabledUserCount ?? 0} />
        <MiniStat label="Auto-importerade" value={zi.imports?.activeAuto ?? 0} accent />
        <MiniStat label="Manuellt importerade" value={zi.imports?.activeManual ?? 0} />
      </div>

      {/* Members table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-medium">Medlemmar ({data.members.length})</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Individuell Zoom-koppling per medlem.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[600px]">
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
              {data.members.map((m) => {
                const zm = m.zoomImport ?? { connected: false, reconnectRequired: false, accountEmail: null, displayName: null, autoImportEnabled: false, lastImportAt: null, lastError: null, autoImportLastError: null, imports: { activeAuto: 0, activeManual: 0 } };
                return (
                <TableRow key={m.email}>
                  <TableCell>
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{zm.displayName || m.email}</span>
                      {zm.displayName && <span className="block text-xs text-muted-foreground truncate">{m.email}</span>}
                      {zm.accountEmail && zm.accountEmail !== m.email && (
                        <span className="block text-[10px] text-muted-foreground/60 truncate">
                          <Video className="w-2.5 h-2.5 inline mr-0.5" />
                          {zm.accountEmail}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {zm.reconnectRequired ? (
                      <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> Reconnect
                      </Badge>
                    ) : zm.connected ? (
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
                        checked={zm.autoImportEnabled}
                        disabled={actionLoading === m.email || !zm.connected}
                        onCheckedChange={(val) => handleToggleAutoImport(m.email, val)}
                        className="scale-75"
                      />
                    ) : (
                      <span className="text-xs">{zm.autoImportEnabled ? 'Ja' : 'Nej'}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {zm.imports?.activeAuto ?? 0} / {zm.imports?.activeManual ?? 0}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {zm.lastImportAt ? new Date(zm.lastImportAt).toLocaleDateString('sv-SE') : '–'}
                  </TableCell>
                  <TableCell>
                    {(zm.lastError || zm.autoImportLastError) ? (
                      <span className="text-xs text-destructive truncate max-w-[100px] block" title={(zm.lastError as any)?.message || (zm.autoImportLastError as any)?.message}>
                        {(zm.lastError as any)?.code || (zm.autoImportLastError as any)?.code || 'Fel'}
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
                        disabled={!zm.connected || actionLoading === m.email}
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
                  <TableCell colSpan={canManage ? 7 : 6} className="text-center text-sm text-muted-foreground py-8">
                    Inga medlemmar har kopplat Zoom ännu.
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
            <AlertDialogTitle>Resetta Zoom-koppling?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta rensar Zoom-kopplingen och stänger av auto-import för <strong>{resetTarget?.email}</strong>.
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
    <div className={`rounded-lg border px-4 py-3 ${accent ? 'bg-blue-500/5 border-blue-500/20' : 'bg-card'}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
