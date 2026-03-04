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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, Users, Building2, Zap, Shield, RotateCcw, Play,
  CheckCircle2, XCircle, AlertTriangle, AlertCircle, ExternalLink, ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  adminDigitalImportApi,
  isCompanyConsentAccepted,
  type AdminInsightsResponse,
  type AdminUserRow,
} from '@/lib/adminDigitalImportApi';

export default function AdminTeamsInsights() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await adminDigitalImportApi.getInsights();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Kunde inte hämta data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggleAutoImport = async (email: string, enabled: boolean) => {
    setActionLoading(email);
    try {
      await adminDigitalImportApi.toggleAutoImport(email, enabled);
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
      await adminDigitalImportApi.resetUser(email);
      toast({ title: 'Användare resetad', description: email });
      setResetTarget(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTenantConsent = async (tenantId: string, accepted: boolean) => {
    setActionLoading(tenantId);
    try {
      await adminDigitalImportApi.setTenantConsent(tenantId, accepted);
      toast({ title: `Tenant consent ${accepted ? 'accepterad' : 'borttagen'}` });
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
      await adminDigitalImportApi.triggerAutoImportRun();
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
            <div>
              <h1 className="text-xl font-semibold">Microsoft Teams Insights</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Global admin-överblick</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleTriggerRun} disabled={actionLoading === 'run'}>
              {actionLoading === 'run' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span className="ml-1.5">Kör auto-import</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={fetchData} className="h-9 w-9">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={Users} label="Anslutna användare" value={s.connectedUsers} sub={`av ${s.totalUsers}`} />
          <SummaryCard icon={Zap} label="Auto-import" value={s.usersWithAutoImportEnabled} sub="användare" />
          <SummaryCard icon={Building2} label="Företag" value={s.companiesWithConnectedUsers} sub={`av ${s.companies}`} />
          <SummaryCard icon={Shield} label="Tenant consent" value={s.tenantsWithAdminConsentAccepted} sub={`av ${s.tenants} accepted`} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat label="Aktiva importerade" value={s.activeImportedMeetings} />
          <MiniStat label="Auto" value={s.activeAutoImportedMeetings} accent />
          <MiniStat label="Manuella" value={s.activeManualImportedMeetings} />
          <MiniStat label="Reconnect krävs" value={s.reconnectRequiredUsers} warn={s.reconnectRequiredUsers > 0} />
        </div>

        {/* ── Tenants (org-level consent) ── */}
        {data.tenants.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-medium">Tenant Admin Consent ({data.tenants.length})</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Admin consent gäller hela organisationen/tenant – inte enskilda användare. Varje användare måste fortfarande koppla sitt eget Microsoft-konto.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tenant ID</TableHead>
                    <TableHead className="text-xs">Consent</TableHead>
                    <TableHead className="text-xs">Godkänd</TableHead>
                    <TableHead className="text-xs text-right">Anslutna</TableHead>
                    <TableHead className="text-xs text-right">Admin</TableHead>
                    <TableHead className="text-xs text-right">Företag</TableHead>
                    <TableHead className="text-xs text-right">Åtgärd</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tenants.map((t) => (
                    <TableRow key={t.tenantId}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{t.tenantId}</TableCell>
                      <TableCell>
                        <ConsentBadge accepted={t.accepted} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.acceptedAt ? new Date(t.acceptedAt).toLocaleDateString('sv-SE') : '–'}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{t.connectedUserCount}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{t.connectedAdminUserCount}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{t.companyCount}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={actionLoading === t.tenantId}
                          onClick={() => handleTenantConsent(t.tenantId, !t.accepted)}
                        >
                          {t.accepted ? 'Återkalla' : 'Acceptera'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Companies (consent is org-level) ── */}
        {data.companies.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Företag ({data.companies.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Företag</TableHead>
                    <TableHead className="text-xs">Org consent</TableHead>
                    <TableHead className="text-xs text-right">Anslutna</TableHead>
                    <TableHead className="text-xs text-right">Admin</TableHead>
                    <TableHead className="text-xs text-right">Auto-import</TableHead>
                    <TableHead className="text-xs text-right">Auto</TableHead>
                    <TableHead className="text-xs text-right">Manuella</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.companies.map((c) => {
                    const accepted = isCompanyConsentAccepted(c.digitalImport.adminConsent);
                    return (
                      <TableRow key={c.company.id}>
                        <TableCell>
                          <span className="text-sm font-medium">{c.company.name}</span>
                          {c.digitalImport.tenantIds.length > 0 && (
                            <span className="block text-[10px] font-mono text-muted-foreground truncate max-w-[150px]">
                              {c.digitalImport.tenantIds[0]}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ConsentBadge accepted={accepted} />
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{c.digitalImport.connectedUserCount}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{c.digitalImport.connectedAdminUserCount}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{c.digitalImport.autoImportEnabledUserCount}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{c.digitalImport.imports.activeAuto}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{c.digitalImport.imports.activeManual}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Users (individual connection status — NO consent column) ── */}
        <Card>
          <CardHeader className="pb-3">
            <div>
              <CardTitle className="text-sm font-medium">Användare ({data.users.length})</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Individuell koppling – varje användare kopplar sitt eget Microsoft-konto. Admin consent hanteras på tenant-/organisationsnivå ovan.
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Användare</TableHead>
                  <TableHead className="text-xs">Koppling</TableHead>
                  <TableHead className="text-xs">Tenant</TableHead>
                  <TableHead className="text-xs">Auto</TableHead>
                  <TableHead className="text-xs text-right">Auto / Man</TableHead>
                  <TableHead className="text-xs">Fel</TableHead>
                  <TableHead className="text-xs text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((u) => (
                  <TableRow key={u.email} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedUser(u)}>
                    <TableCell>
                      <div>
                        <span className="text-sm">{u.displayName || u.email}</span>
                        {u.displayName && <span className="block text-xs text-muted-foreground">{u.email}</span>}
                        {u.accountEmail && u.accountEmail !== u.email && (
                          <span className="block text-[10px] text-muted-foreground/60">MS: {u.accountEmail}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.reconnectRequired ? (
                        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 gap-1">
                          <AlertCircle className="w-2.5 h-2.5" /> Reconnect
                        </Badge>
                      ) : u.connected ? (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Ansluten
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Ej ansluten</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.tenantId ? (
                        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[100px] block">
                          {u.tenantId.slice(0, 8)}…
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">–</span>
                      )}
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
                {data.users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                      Inga användare har kopplat Microsoft Teams.
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

      {/* User Detail Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(o) => !o && setSelectedUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{selectedUser?.displayName || selectedUser?.email}</DialogTitle>
            <DialogDescription>{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          {selectedUser && <UserDetailContent user={selectedUser} />}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedUser(null)}>Stäng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserDetailContent({ user }: { user: AdminUserRow }) {
  return (
    <div className="space-y-3 text-sm">
      <DetailRow label="Microsoft-konto" value={user.accountEmail || '–'} />
      <DetailRow label="Tenant" value={user.tenantId || '–'} mono />
      <DetailRow label="Ansluten" value={user.connected ? 'Ja' : 'Nej'} />
      <DetailRow label="Reconnect krävs" value={user.reconnectRequired ? 'Ja' : 'Nej'} />
      <DetailRow label="Auto-import" value={user.autoImportEnabled ? 'Aktiv' : 'Av'} />
      <DetailRow label="Aktiva auto" value={String(user.imports.activeAuto)} />
      <DetailRow label="Aktiva manuella" value={String(user.imports.activeManual)} />
      <DetailRow label="Papperskorgen" value={String(user.imports.trashedTotal)} />
      <DetailRow label="Totalt" value={String(user.imports.total)} />

      {/* Tenant consent info — shown as org context, not user-owned */}
      {user.tenantId && (
        <div className="pt-2 border-t border-border space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Tenant consent (organisationsnivå)</p>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Status</span>
            <ConsentBadge accepted={user.adminConsent?.approved ?? user.adminConsentAcceptedForTenant ?? false} />
          </div>
          {user.adminConsent?.approvedAt && (
            <DetailRow label="Godkänd" value={new Date(user.adminConsent.approvedAt).toLocaleString('sv-SE')} />
          )}
          {user.adminConsent?.adminConsentUrl && (
            <a href={user.adminConsent.adminConsentUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Admin consent-länk <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {user.lastError && (
        <div className="p-2 rounded bg-destructive/10 text-xs text-destructive space-y-0.5">
          <strong>{user.lastError.code}</strong>
          <p className="text-destructive/80">{user.lastError.message}</p>
          {user.lastError.updatedAt && (
            <p className="text-destructive/60">{new Date(user.lastError.updatedAt).toLocaleString('sv-SE')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

function SummaryCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground leading-tight">{label}{sub ? ` ${sub}` : ''}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${accent ? 'bg-primary/5 border-primary/20' : warn ? 'bg-destructive/5 border-destructive/20' : 'bg-card'}`}>
      <p className={`text-lg font-semibold tabular-nums ${warn ? 'text-destructive' : ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ConsentBadge({ accepted }: { accepted: boolean }) {
  return accepted ? (
    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
      <CheckCircle2 className="w-2.5 h-2.5" /> Accepted
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 gap-1">
      <XCircle className="w-2.5 h-2.5" /> Pending
    </Badge>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground ${mono ? 'font-mono text-xs max-w-[200px] truncate' : ''}`}>{value}</span>
    </div>
  );
}
