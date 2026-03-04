import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, Users, Building2, Zap, Shield, RotateCcw, Play, Search,
  CheckCircle2, XCircle, AlertTriangle, AlertCircle, ExternalLink, ArrowLeft, Trash2,
  Calendar, Clock, Mail, Monitor, Hash, FileText, Copy,
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
  const [resetPreserveAutoImport, setResetPreserveAutoImport] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [consentConfirm, setConsentConfirm] = useState<{ tenantId: string; accepted: boolean } | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
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

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    if (!userSearch.trim()) return data.users;
    const q = userSearch.toLowerCase();
    return data.users.filter(u =>
      u.email.toLowerCase().includes(q) ||
      u.displayName?.toLowerCase().includes(q) ||
      u.accountEmail?.toLowerCase().includes(q) ||
      u.tenantId?.toLowerCase().includes(q)
    );
  }, [data, userSearch]);

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

  const handleReset = async (email: string, preserveAutoImport: boolean) => {
    setActionLoading(email);
    try {
      await adminDigitalImportApi.resetUser(email, preserveAutoImport);
      toast({ title: 'Användare resetad', description: email });
      setResetTarget(null);
      setResetPreserveAutoImport(false);
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
      toast({
        title: accepted ? 'Tenant consent accepterad' : 'Tenant consent borttagen',
        description: `Tenant ${tenantId.slice(0, 8)}…`,
      });
      setConsentConfirm(null);
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

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast({ title: 'Länk kopierad' });
      setTimeout(() => setCopiedUrl(null), 3000);
    } catch {
      toast({ title: 'Kunde inte kopiera', variant: 'destructive' });
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
              <p className="text-sm text-muted-foreground mt-0.5">Global admin-överblick · {data.users.length} användare</p>
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

        {/* ── 1. Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={Users} label="Anslutna användare" value={s.connectedUsers} sub={`av ${s.totalUsers}`} />
          <SummaryCard icon={Zap} label="Auto-import aktiv" value={s.usersWithAutoImportEnabled} sub="användare" />
          <SummaryCard icon={Building2} label="Företag med anslutna" value={s.companiesWithConnectedUsers} sub={`av ${s.companies}`} />
          <SummaryCard icon={Shield} label="Tenants accepted" value={s.tenantsWithAdminConsentAccepted} sub={`av ${s.tenants}`} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <MiniStat label="Aktiva importerade" value={s.activeImportedMeetings} icon={FileText} />
          <MiniStat label="Auto-importerade" value={s.activeAutoImportedMeetings} accent icon={Zap} />
          <MiniStat label="Manuellt importerade" value={s.activeManualImportedMeetings} icon={Hash} />
          <MiniStat label="I papperskorgen" value={s.trashedImportedMeetings} icon={Trash2} />
          <MiniStat label="Reconnect krävs" value={s.reconnectRequiredUsers} warn={s.reconnectRequiredUsers > 0} icon={AlertCircle} />
        </div>

        {/* ── 2. Tenant Admin Consent (org-level) ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-medium">Tenant Admin Consent</CardTitle>
                <Badge variant="secondary" className="text-[10px]">{data.tenants.length}</Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Admin consent gäller hela organisationen/tenant – inte per användare.
              Varje användare måste fortfarande koppla sitt eget Microsoft-konto.
              {' '}<span className="font-medium">Att ta bort consent raderar tenant-posten helt</span> – den sätts inte till "avslagen".
            </p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {data.tenants.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Inga tenants registrerade ännu.
              </div>
            ) : (
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tenant ID</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Godkänd</TableHead>
                    <TableHead className="text-xs text-right">Användare</TableHead>
                    <TableHead className="text-xs text-right">Admin-användare</TableHead>
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
                        {t.acceptedAt ? new Date(t.acceptedAt).toLocaleString('sv-SE') : '–'}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{t.connectedUserCount}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{t.connectedAdminUserCount}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{t.companyCount}</TableCell>
                      <TableCell className="text-right">
                        {t.accepted ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            disabled={actionLoading === t.tenantId}
                            onClick={() => setConsentConfirm({ tenantId: t.tenantId, accepted: false })}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Ta bort
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={actionLoading === t.tenantId}
                            onClick={() => setConsentConfirm({ tenantId: t.tenantId, accepted: true })}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Acceptera
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ── 3. Companies (org-level consent status) ── */}
        {data.companies.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-medium">Företag</CardTitle>
                <Badge variant="secondary" className="text-[10px]">{data.companies.length}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Admin consent visas på organisationsnivå. Använd backendens admin consent-länk – inte en hårdkodad global URL.
              </p>
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
                    <TableHead className="text-xs text-right">Papperskorg</TableHead>
                    <TableHead className="text-xs text-right">Totalt</TableHead>
                    <TableHead className="text-xs">Consent-länk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.companies.map((c) => {
                    const accepted = isCompanyConsentAccepted(c.digitalImport.adminConsent);
                    const consentUrl = c.digitalImport.adminConsent.adminConsentUrl;
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
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{c.digitalImport.imports.trashedTotal}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums font-medium">{c.digitalImport.imports.activeTotal}</TableCell>
                        <TableCell>
                          {consentUrl ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleCopyUrl(consentUrl)}
                            >
                              {copiedUrl === consentUrl ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              {copiedUrl === consentUrl ? 'Kopierad' : 'Kopiera'}
                            </Button>
                          ) : accepted ? (
                            <span className="text-[10px] text-muted-foreground">–</span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Ej tillgänglig</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── 4. Users (individual connections) ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-medium">Användare</CardTitle>
                  <Badge variant="secondary" className="text-[10px]">{data.users.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Individuell Microsoft-koppling per användare. Admin consent hanteras på tenant-nivå ovan.
                </p>
              </div>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Sök e-post, namn, tenant…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Användare</TableHead>
                  <TableHead className="text-xs">Koppling</TableHead>
                  <TableHead className="text-xs">Tenant</TableHead>
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
                            <Monitor className="w-2.5 h-2.5 inline mr-0.5" />
                            {u.accountEmail}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ConnectionBadge connected={u.connected} reconnectRequired={u.reconnectRequired} />
                    </TableCell>
                    <TableCell>
                      {u.tenantId ? (
                        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[100px] block" title={u.tenantId}>
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
                        onClick={(e) => { e.stopPropagation(); setResetTarget(u); setResetPreserveAutoImport(false); }}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Reset
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                      {userSearch ? 'Inga användare matchar sökningen.' : 'Inga användare har kopplat Microsoft Teams.'}
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

      {/* ── Reset Confirm ── */}
      <AlertDialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setResetPreserveAutoImport(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetta Microsoft-koppling?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Detta rensar Microsoft-kopplingen, senaste fel och scopes för{' '}
                  <strong>{resetTarget?.email}</strong>.
                </p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="preserveAutoImport"
                    checked={resetPreserveAutoImport}
                    onCheckedChange={(val) => setResetPreserveAutoImport(val === true)}
                  />
                  <label htmlFor="preserveAutoImport" className="text-sm cursor-pointer">
                    Behåll auto-import-inställning
                  </label>
                </div>
                {!resetPreserveAutoImport && (
                  <p className="text-xs text-muted-foreground">
                    Auto-import kommer att stängas av och nollställas.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetTarget && handleReset(resetTarget.email, resetPreserveAutoImport)}>
              Resetta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Consent Confirm ── */}
      <AlertDialog open={!!consentConfirm} onOpenChange={(o) => !o && setConsentConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {consentConfirm?.accepted ? 'Acceptera tenant consent?' : 'Ta bort tenant consent?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {consentConfirm?.accepted
                    ? 'Detta markerar tenanten som godkänd i Tivly. Det ersätter inte Microsofts riktiga permissionsmodell.'
                    : 'Detta tar bort tenant-posten helt ur Tivlys interna consent-register. Tenanten behandlas sedan som okänd/ej registrerad – inte som explicit avslagen.'}
                </p>
                <p className="font-mono text-xs">{consentConfirm?.tenantId}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => consentConfirm && handleTenantConsent(consentConfirm.tenantId, consentConfirm.accepted)}
              className={consentConfirm?.accepted ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
            >
              {consentConfirm?.accepted ? 'Acceptera' : 'Ta bort'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── User Detail Dialog ── */}
      <Dialog open={!!selectedUser} onOpenChange={(o) => !o && setSelectedUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{selectedUser?.displayName || selectedUser?.email}</DialogTitle>
            <DialogDescription>{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          {selectedUser && <UserDetailContent user={selectedUser} onCopyUrl={handleCopyUrl} copiedUrl={copiedUrl} />}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedUser(null)}>Stäng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   User Detail Dialog Content
   ═══════════════════════════════════════════════════ */

function UserDetailContent({ user, onCopyUrl, copiedUrl }: { user: AdminUserRow; onCopyUrl: (url: string) => void; copiedUrl: string | null }) {
  return (
    <div className="space-y-4">
      {/* Connection section */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Koppling</p>
        <div className="grid grid-cols-2 gap-2">
          <DetailItem icon={Mail} label="E-post" value={user.email} />
          <DetailItem icon={Monitor} label="Microsoft-konto" value={user.accountEmail || '–'} />
          <DetailItem icon={CheckCircle2} label="Ansluten" value={user.connected ? 'Ja' : 'Nej'} />
          <DetailItem icon={AlertCircle} label="Reconnect" value={user.reconnectRequired ? 'Ja' : 'Nej'} />
        </div>
      </div>

      {/* Tenant & consent section — org-level context */}
      <div className="space-y-2 pt-2 border-t border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tenant & Org Consent</p>
        <div className="grid grid-cols-2 gap-2">
          <DetailItem icon={Shield} label="Tenant ID" value={user.tenantId || '–'} mono />
          <DetailItem icon={CheckCircle2} label="Tenant consent"
            value={user.adminConsent?.approved ? 'Godkänd' : user.adminConsentAcceptedForTenant ? 'Godkänd' : 'Ej godkänd'} />
        </div>
        {user.adminConsent?.approvedAt && (
          <DetailItem icon={Calendar} label="Consent godkänd" value={new Date(user.adminConsent.approvedAt).toLocaleString('sv-SE')} />
        )}
        {user.adminConsent?.adminConsentUrl && (
          <div className="flex items-center gap-2 mt-1">
            <a href={user.adminConsent.adminConsentUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Admin consent-länk <ExternalLink className="w-3 h-3" />
            </a>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1 px-2"
              onClick={() => onCopyUrl(user.adminConsent!.adminConsentUrl!)}
            >
              {copiedUrl === user.adminConsent.adminConsentUrl ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
          Consent hanteras på tenant/organisationsnivå – inte per användare. Använd backendens consent-länk med signerad state.
        </p>
      </div>

      {/* Auto-import section */}
      <div className="space-y-2 pt-2 border-t border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Import</p>
        <div className="grid grid-cols-2 gap-2">
          <DetailItem icon={Zap} label="Auto-import" value={user.autoImportEnabled ? 'Aktiv' : 'Av'} />
          <DetailItem icon={FileText} label="Totalt" value={String(user.imports.total)} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <MicroStat label="Auto (aktiva)" value={user.imports.activeAuto} />
          <MicroStat label="Manuella (aktiva)" value={user.imports.activeManual} />
          <MicroStat label="Auto (trash)" value={user.imports.trashedAuto} />
          <MicroStat label="Manuella (trash)" value={user.imports.trashedManual} />
        </div>
      </div>

      {/* Error section */}
      {user.lastError && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Senaste fel</p>
          <div className="p-3 rounded-lg bg-destructive/10 text-xs space-y-1">
            <p className="font-semibold text-destructive">{user.lastError.code}</p>
            <p className="text-destructive/80 break-words">{user.lastError.message}</p>
            {user.lastError.updatedAt && (
              <p className="text-destructive/60 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(user.lastError.updatedAt).toLocaleString('sv-SE')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Shared sub-components
   ═══════════════════════════════════════════════════ */

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

function ConsentBadge({ accepted }: { accepted: boolean }) {
  return accepted ? (
    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
      <CheckCircle2 className="w-2.5 h-2.5" /> Accepted
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground gap-1">
      <XCircle className="w-2.5 h-2.5" /> Ej registrerad
    </Badge>
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

function DetailItem({ icon: Icon, label, value, mono }: { icon?: any; label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3 text-muted-foreground" />}
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-sm ${mono ? 'font-mono text-xs break-all' : ''}`}>{value}</p>
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
