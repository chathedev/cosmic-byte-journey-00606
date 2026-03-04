import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, Users, Building2, Zap, RotateCcw, Play, Search,
  CheckCircle2, AlertTriangle, AlertCircle, ArrowLeft, Trash2,
  Clock, Mail, Video, Hash, FileText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import googleMeetLogo from '@/assets/google-meet-logo.png';
import {
  adminGoogleMeetImportApi,
  type GoogleMeetAdminInsightsResponse,
  type GoogleMeetAdminUserRow,
} from '@/lib/googleMeetImportApi';

export default function AdminGoogleMeetInsights() {
  const navigate = useNavigate();
  const [data, setData] = useState<GoogleMeetAdminInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<GoogleMeetAdminUserRow | null>(null);
  const [selectedUser, setSelectedUser] = useState<GoogleMeetAdminUserRow | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await adminGoogleMeetImportApi.getInsights();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Kunde inte hämta data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    if (!userSearch.trim()) return data.users;
    const q = userSearch.toLowerCase();
    return data.users.filter(u =>
      u.email.toLowerCase().includes(q) ||
      u.displayName?.toLowerCase().includes(q) ||
      u.accountEmail?.toLowerCase().includes(q)
    );
  }, [data, userSearch]);

  const handleToggleAutoImport = async (email: string, enabled: boolean) => {
    setActionLoading(email);
    try {
      await adminGoogleMeetImportApi.toggleAutoImport(email, enabled);
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
      await adminGoogleMeetImportApi.resetUser(email);
      toast({ title: 'Användare resetad', description: email });
      setResetTarget(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTriggerRun = async () => {
    setActionLoading('run');
    try {
      await adminGoogleMeetImportApi.triggerAutoImportRun();
      toast({ title: 'Auto-import körning startad' });
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 mx-auto text-destructive" />
          <p className="text-sm text-muted-foreground">{error || 'Ingen data'}</p>
          <Button variant="outline" size="sm" onClick={fetchData}>Försök igen</Button>
        </div>
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin/integrations')} className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden p-1">
              <img src={googleMeetLogo} alt="Google Meet" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Google Meet Insights</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Admin-överblick · {data.users.length} användare
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleTriggerRun} disabled={actionLoading === 'run'}>
              {actionLoading === 'run' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span className="ml-1.5 hidden sm:inline">Kör auto-import</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={fetchData} className="h-9 w-9">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={Users} label="Anslutna användare" value={s.connectedUsers} sub={`av ${s.totalUsers}`} />
          <SummaryCard icon={Zap} label="Auto-import aktiv" value={s.usersWithAutoImportEnabled} sub="användare" />
          <SummaryCard icon={Building2} label="Företag med anslutna" value={s.companiesWithConnectedUsers} sub={`av ${s.companies}`} />
          <SummaryCard icon={FileText} label="Aktiva importerade" value={s.activeImportedMeetings} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat label="Auto-importerade" value={s.activeAutoImportedMeetings} accent icon={Zap} />
          <MiniStat label="Manuellt importerade" value={s.activeManualImportedMeetings} icon={Hash} />
          <MiniStat label="I papperskorgen" value={s.trashedImportedMeetings} icon={Trash2} />
          <MiniStat label="Reconnect krävs" value={s.reconnectRequiredUsers} warn={s.reconnectRequiredUsers > 0} icon={AlertCircle} />
        </div>

        {/* Companies */}
        {data.companies.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-medium">Företag</CardTitle>
                <Badge variant="secondary" className="text-[10px]">{data.companies.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Företag</TableHead>
                    <TableHead className="text-xs text-right">Anslutna</TableHead>
                    <TableHead className="text-xs text-right">Auto-import</TableHead>
                    <TableHead className="text-xs text-right">Auto</TableHead>
                    <TableHead className="text-xs text-right">Manuella</TableHead>
                    <TableHead className="text-xs text-right">Papperskorg</TableHead>
                    <TableHead className="text-xs text-right">Totalt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.companies.map((c) => {
                    const gi = c.googleMeetImport;
                    return (
                      <TableRow key={c.company.id}>
                        <TableCell><span className="text-sm font-medium">{c.company.name}</span></TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{gi.connectedUserCount}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{gi.autoImportEnabledUserCount}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{gi.imports.activeAuto}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{gi.imports.activeManual}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{gi.imports.trashedTotal}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums font-medium">{gi.imports.activeTotal}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Users */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-medium">Användare</CardTitle>
                <Badge variant="secondary" className="text-[10px]">{data.users.length}</Badge>
              </div>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Sök e-post, namn…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[650px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Användare</TableHead>
                  <TableHead className="text-xs">Koppling</TableHead>
                  <TableHead className="text-xs">Auto-import</TableHead>
                  <TableHead className="text-xs text-right">Auto / Manuell</TableHead>
                  <TableHead className="text-xs">Senaste fel</TableHead>
                  <TableHead className="text-xs text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow key={u.email} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedUser(u)}>
                    <TableCell>
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{u.displayName || u.email}</span>
                        {u.displayName && <span className="block text-xs text-muted-foreground truncate">{u.email}</span>}
                        {u.accountEmail && u.accountEmail !== u.email && (
                          <span className="block text-[10px] text-muted-foreground/60 truncate">
                            <Video className="w-2.5 h-2.5 inline mr-0.5" />
                            {u.accountEmail}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ConnectionBadge connected={u.connected} reconnectRequired={u.reconnectRequired} />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.autoImportEnabled}
                        disabled={actionLoading === u.email || !u.connected}
                        onCheckedChange={(val) => handleToggleAutoImport(u.email, val)}
                        onClick={(e) => e.stopPropagation()}
                        className="scale-75"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs tabular-nums">{u.imports.activeAuto} / {u.imports.activeManual}</span>
                    </TableCell>
                    <TableCell>
                      {u.lastError ? (
                        <span className="text-xs text-destructive truncate max-w-[120px] block" title={u.lastError.message}>
                          {u.lastError.code}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => { e.stopPropagation(); setResetTarget(u); }}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Reset
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      {userSearch ? 'Inga användare matchar sökningen.' : 'Inga användare har kopplat Google Meet.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <p className="text-[10px] text-muted-foreground text-right">
          Senast uppdaterad: {new Date(data.timestamp).toLocaleString('sv-SE')}
        </p>
      </div>

      {/* Reset Confirm */}
      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetta Google Meet-koppling?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta rensar Google Meet-kopplingen och stänger av auto-import för <strong>{resetTarget?.email}</strong>.
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

      {/* User Detail Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(o) => !o && setSelectedUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{selectedUser?.displayName || selectedUser?.email}</DialogTitle>
            <DialogDescription>{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Koppling</p>
                <div className="grid grid-cols-2 gap-2">
                  <DetailItem icon={Mail} label="E-post" value={selectedUser.email} />
                  <DetailItem icon={Video} label="Google-konto" value={selectedUser.accountEmail || '–'} />
                  <DetailItem icon={CheckCircle2} label="Ansluten" value={selectedUser.connected ? 'Ja' : 'Nej'} />
                  <DetailItem icon={AlertCircle} label="Reconnect" value={selectedUser.reconnectRequired ? 'Ja' : 'Nej'} />
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Import</p>
                <div className="grid grid-cols-2 gap-2">
                  <DetailItem icon={Zap} label="Auto-import" value={selectedUser.autoImportEnabled ? 'Aktiv' : 'Av'} />
                  <DetailItem icon={FileText} label="Totalt" value={String(selectedUser.imports.total)} />
                  {selectedUser.connectedAt && (
                    <DetailItem icon={Clock} label="Kopplad sedan" value={new Date(selectedUser.connectedAt).toLocaleDateString('sv-SE')} />
                  )}
                  {selectedUser.lastImportAt && (
                    <DetailItem icon={Clock} label="Senaste import" value={new Date(selectedUser.lastImportAt).toLocaleString('sv-SE')} />
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <MicroStat label="Auto (aktiva)" value={selectedUser.imports.activeAuto} />
                  <MicroStat label="Manuella (aktiva)" value={selectedUser.imports.activeManual} />
                  <MicroStat label="Auto (trash)" value={selectedUser.imports.trashedAuto} />
                  <MicroStat label="Manuella (trash)" value={selectedUser.imports.trashedManual} />
                </div>
              </div>
              {selectedUser.lastError && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Senaste fel</p>
                  <div className="p-3 rounded-lg bg-destructive/10 text-xs space-y-1">
                    <p className="font-semibold text-destructive">{selectedUser.lastError.code}</p>
                    <p className="text-destructive/80 break-words">{selectedUser.lastError.message}</p>
                    {selectedUser.lastError.updatedAt && (
                      <p className="text-destructive/60 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(selectedUser.lastError.updatedAt).toLocaleString('sv-SE')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedUser(null)}>Stäng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4 flex items-center gap-3">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold tabular-nums">{value}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight truncate">{label}{sub ? ` ${sub}` : ''}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, accent, warn, icon: Icon }: { label: string; value: number; accent?: boolean; warn?: boolean; icon?: any }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${accent ? 'bg-primary/5 border-primary/20' : warn ? 'bg-destructive/5 border-destructive/20' : 'bg-card'}`}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className={`w-3.5 h-3.5 ${warn ? 'text-destructive' : 'text-muted-foreground'}`} />}
        <p className={`text-lg font-semibold tabular-nums ${warn ? 'text-destructive' : ''}`}>{value}</p>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ConnectionBadge({ connected, reconnectRequired }: { connected: boolean; reconnectRequired: boolean }) {
  if (reconnectRequired) {
    return (
      <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 gap-1">
        <AlertCircle className="w-2.5 h-2.5" /> Reconnect
      </Badge>
    );
  }
  if (connected) {
    return (
      <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
        <CheckCircle2 className="w-2.5 h-2.5" /> Ansluten
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">Ej ansluten</Badge>
  );
}

function DetailItem({ icon: Icon, label, value }: { icon?: any; label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3 text-muted-foreground" />}
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function MicroStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 text-center">
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
