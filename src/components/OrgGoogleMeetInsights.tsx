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
  Loader2, RefreshCw, Users, Zap, CheckCircle2, XCircle, RotateCcw, AlertTriangle,
} from 'lucide-react';
import googleMeetLogo from '@/assets/google-meet-logo.png';

const API_BASE_URL = 'https://api.tivly.se';
const getAuthToken = (): string | null => localStorage.getItem('authToken');

const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
  const token = getAuthToken();
  if (!token) throw new Error('No auth token');
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Request failed: ${res.status}`);
  }
  return res.json();
};

export interface GoogleMeetOrgMemberRow {
  email: string;
  displayName?: string;
  connected: boolean;
  reconnectRequired?: boolean;
  autoImportEnabled?: boolean;
  lastImportAt?: string | null;
  totalImported?: number;
}

export interface GoogleMeetOrgInsights {
  members: GoogleMeetOrgMemberRow[];
  totalConnected: number;
  totalAutoImport: number;
}

export const orgGoogleMeetImportApi = {
  getInsights: (companyId: string): Promise<GoogleMeetOrgInsights> =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/digital-import/insights`).then((data) => ({
      members: (data.members || []).map((m: any) => ({
        email: m.email,
        displayName: m.displayName,
        connected: m.googleMeetConnected ?? false,
        reconnectRequired: m.googleMeetReconnectRequired ?? false,
        autoImportEnabled: m.googleMeetAutoImportEnabled ?? false,
        lastImportAt: m.googleMeetLastImportAt,
        totalImported: m.googleMeetTotalImported ?? 0,
      })),
      totalConnected: data.googleMeetTotalConnected ?? 0,
      totalAutoImport: data.googleMeetTotalAutoImport ?? 0,
    })),
  resetConnection: (companyId: string, email: string) =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/google-meet-import/users/${encodeURIComponent(email)}/reset`, { method: 'POST' }),
  toggleAutoImport: (companyId: string, email: string, enabled: boolean) =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/google-meet-import/users/${encodeURIComponent(email)}/auto-import`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
};

interface OrgGoogleMeetInsightsProps {
  companyId: string;
}

export function OrgGoogleMeetInsights({ companyId }: OrgGoogleMeetInsightsProps) {
  const [data, setData] = useState<GoogleMeetOrgInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<GoogleMeetOrgMemberRow | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const insights = await orgGoogleMeetImportApi.getInsights(companyId);
      setData(insights);
    } catch (err: any) {
      setError(err.message || 'Kunde inte hämta data');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggleAutoImport = async (member: GoogleMeetOrgMemberRow, enabled: boolean) => {
    setActionLoading(member.email);
    try {
      await orgGoogleMeetImportApi.toggleAutoImport(companyId, member.email, enabled);
      setData(prev => prev ? {
        ...prev,
        members: prev.members.map(m => m.email === member.email ? { ...m, autoImportEnabled: enabled } : m),
        totalAutoImport: prev.totalAutoImport + (enabled ? 1 : -1),
      } : prev);
      toast({ title: enabled ? 'Auto-import aktiverad' : 'Auto-import inaktiverad' });
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReset = async () => {
    if (!resetTarget) return;
    setActionLoading(resetTarget.email);
    try {
      await orgGoogleMeetImportApi.resetConnection(companyId, resetTarget.email);
      toast({ title: 'Koppling återställd' });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
      setResetTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 space-y-2">
        <AlertTriangle className="w-5 h-5 text-destructive mx-auto" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchData}>Försök igen</Button>
      </div>
    );
  }

  if (!data) return null;

  const connectedMembers = data.members.filter(m => m.connected);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-lg font-semibold">{data.totalConnected}</p>
              <p className="text-xs text-muted-foreground">Kopplade</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-lg font-semibold">{data.totalAutoImport}</p>
              <p className="text-xs text-muted-foreground">Auto-import</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Members */}
      {connectedMembers.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">Inga medlemmar har kopplat Google Meet ännu.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Användare</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Auto-import</TableHead>
                  <TableHead className="text-right">Åtgärd</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectedMembers.map((member) => (
                  <TableRow key={member.email}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium truncate">{member.displayName || member.email}</p>
                        {member.displayName && <p className="text-xs text-muted-foreground truncate">{member.email}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {member.reconnectRequired ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">Omkoppling</Badge>
                      ) : member.connected ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground/30 mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={member.autoImportEnabled ?? false}
                        onCheckedChange={(v) => handleToggleAutoImport(member, v)}
                        disabled={actionLoading === member.email}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setResetTarget(member)}
                        disabled={actionLoading === member.email}
                        className="h-7 text-xs gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Refresh */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1.5 h-8 text-xs">
          <RefreshCw className="w-3.5 h-3.5" />
          Uppdatera
        </Button>
      </div>

      {/* Reset confirm */}
      <AlertDialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Återställ Google-koppling?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta kopplar bort {resetTarget?.email} från Google Meet-import. Användaren behöver koppla om sitt konto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Återställ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
