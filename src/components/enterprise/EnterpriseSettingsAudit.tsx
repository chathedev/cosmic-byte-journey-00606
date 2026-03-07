import { useState, useEffect, useMemo } from 'react';
import { FileText, Loader2, Clock, User, Filter, Shield, Monitor, ChevronDown, ChevronRight, ArrowUpDown, Search, LogIn, Globe, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getEnterpriseAudit, getAdminEnterpriseAudit, type AuditEntry, type AuditResponse } from '@/lib/enterpriseSettingsApi';

interface Props {
  companyId: string;
  isAdmin?: boolean;
}

// Human-readable labels for categories and fields
const CATEGORY_LABELS: Record<string, string> = {
  identityAccess: 'Identitet & Åtkomst',
  securityCompliance: 'Säkerhet & Efterlevnad',
  adminWorkspace: 'Arbetsyta',
  meetingContentControls: 'Möten & Innehåll',
  integrations: 'Integrationer',
  customRoles: 'Roller',
  customDomains: 'Domäner',
};

const CATEGORY_ICONS: Record<string, typeof Shield> = {
  identityAccess: Shield,
  securityCompliance: Shield,
  adminWorkspace: Monitor,
  meetingContentControls: FileText,
  integrations: Globe,
  customRoles: User,
  customDomains: Globe,
};

const SOURCE_LABELS: Record<string, string> = {
  enterprise_owner_console: 'Enterprise-konsol',
  admin_console: 'Admin-konsol',
  tivly_admin: 'Tivly Admin',
  system: 'System',
  api: 'API',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Ägare',
  admin: 'Admin',
  member: 'Medlem',
  viewer: 'Läsare',
  tivly_admin: 'Tivly Admin',
};

function formatFieldName(field: string): string {
  // Turn "identityAccess.providers.microsoft.enabled" → "Microsoft – aktiverad"
  const parts = field.split('.');
  // Remove category prefix
  if (parts.length > 1 && CATEGORY_LABELS[parts[0]]) parts.shift();
  
  const readable = parts.map(p => {
    const map: Record<string, string> = {
      enabled: 'aktiverad',
      ssoEnabled: 'SSO aktiverat',
      ssoOnlyLogin: 'Kräv SSO-inloggning',
      primaryProvider: 'Primär provider',
      fallbackPolicy: 'Reservåtkomst',
      providers: '',
      microsoft: 'Microsoft',
      google: 'Google',
      oidc: 'OIDC',
      saml: 'SAML',
      okta: 'Okta',
      jitProvisioningEnabled: 'JIT-provisioning',
      groupSyncEnabled: 'Gruppsynk',
      scimEnabled: 'SCIM',
      domainRestrictions: 'Domänbegränsningar',
      allowedProviders: 'Tillåtna providers',
      defaultRoleId: 'Standardroll',
      defaultAnchorRole: 'Standard ankarroll',
      auditLogsEnabled: 'Auditloggar',
      loginHistoryEnabled: 'Inloggningshistorik',
      retentionDays: 'Lagringsdagar',
      autoDeleteEnabled: 'Automatisk radering',
      restrictExport: 'Begränsa export',
      restrictDownload: 'Begränsa nedladdning',
      restrictExternalSharing: 'Begränsa extern delning',
      ipAllowlistingEnabled: 'IP-vitlista',
      recordingAllowed: 'Inspelning tillåten',
      transcriptionAllowed: 'Transkribering tillåten',
      aiSummaryAllowed: 'AI-sammanfattning',
      speakerIdentificationAllowed: 'Talaridentifiering',
      tenantMode: 'Klientläge',
      tenantId: 'Klient-ID',
      clientIdConfigured: 'Client ID konfigurerat',
      clientSecretConfigured: 'Client Secret konfigurerat',
      redirectUri: 'Redirect URI',
      hostedDomain: 'Hosted domain',
      enforceOrganizationAccountOnly: 'Kräv organisationskonto',
      adminConsentRequired: 'Admin-samtycke krävs',
      workspaceDisplayName: 'Arbetsytans namn',
      logoUrl: 'Logotyp',
      emailBrandingEnabled: 'E-postbranding',
    };
    return map[p] ?? p;
  }).filter(Boolean);
  
  return readable.join(' → ');
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return '–';
  if (val === true) return 'Ja';
  if (val === false) return 'Nej';
  if (typeof val === 'string' && val.length === 0) return '(tom)';
  if (Array.isArray(val)) return val.length === 0 ? '(tom lista)' : val.join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just nu';
  if (mins < 60) return `${mins} min sedan`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} tim sedan`;
  const days = Math.floor(hours / 24);
  return `${days} dag${days > 1 ? 'ar' : ''} sedan`;
}

type SortOrder = 'newest' | 'oldest';

export function EnterpriseSettingsAudit({ companyId, isAdmin }: Props) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAudit();
  }, [companyId]);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const res = isAdmin
        ? await getAdminEnterpriseAudit(companyId)
        : await getEnterpriseAudit(companyId);
      setData(res);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  };

  // API returns oldest-first; reverse to get newest-first as base order
  const audit = useMemo(() => [...(data?.audit || [])].reverse(), [data]);
  const loginHistory = (data?.loginHistory || []) as any[];

  const categories = useMemo(() => {
    const cats = new Set(audit.map(e => e.category));
    return Array.from(cats).sort();
  }, [audit]);

  const filteredAudit = useMemo(() => {
    let items = [...audit];
    if (categoryFilter) items = items.filter(e => e.category === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(e =>
        e.field.toLowerCase().includes(q) ||
        e.changedBy.toLowerCase().includes(q) ||
        formatFieldName(e.field).toLowerCase().includes(q) ||
        formatValue(e.oldValue).toLowerCase().includes(q) ||
        formatValue(e.newValue).toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return sortOrder === 'newest' ? diff : -diff;
    });
    return items;
  }, [audit, categoryFilter, search, sortOrder]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-foreground">{audit.length}</div>
          <div className="text-[11px] text-muted-foreground">Ändringar totalt</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-foreground">{loginHistory.length}</div>
          <div className="text-[11px] text-muted-foreground">SSO-inloggningar</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <div className="text-2xl font-bold text-foreground">{categories.length}</div>
          <div className="text-[11px] text-muted-foreground">Kategorier</div>
        </div>
      </div>

      {/* Audit Log */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Ändringshistorik
          </h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setSortOrder(s => s === 'newest' ? 'oldest' : 'newest')}
            >
              <ArrowUpDown className="w-3 h-3" />
              {sortOrder === 'newest' ? 'Senaste först' : 'Äldsta först'}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Sök i ändringar…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <Button
              variant={categoryFilter === null ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-[11px] px-2.5"
              onClick={() => setCategoryFilter(null)}
            >
              Alla
            </Button>
            {categories.map(cat => (
              <Button
                key={cat}
                variant={categoryFilter === cat ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-[11px] px-2.5 gap-1"
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              >
                {CATEGORY_LABELS[cat] || cat}
              </Button>
            ))}
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          {filteredAudit.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {search || categoryFilter ? 'Inga ändringar matchar filtret' : 'Inga ändringar registrerade'}
            </div>
          ) : (
            <ScrollArea className="h-[520px]">
              <div className="divide-y divide-border">
                {filteredAudit.map(entry => {
                  const expanded = expandedIds.has(entry.id);
                  const CatIcon = CATEGORY_ICONS[entry.category] || FileText;
                  return (
                    <div
                      key={entry.id}
                      className="px-4 py-3 text-xs hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(entry.id)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 shrink-0">
                          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <CatIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span className="font-medium truncate">{formatFieldName(entry.field)}</span>
                            </div>
                            <span className="text-muted-foreground text-[11px] shrink-0" title={new Date(entry.createdAt).toLocaleString('sv-SE')}>
                              {timeAgo(entry.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {CATEGORY_LABELS[entry.category] || entry.category}
                            </Badge>
                            <div className="flex items-center gap-1.5 font-mono text-[11px] min-w-0">
                              <span className="text-destructive/80 truncate max-w-[140px]" title={formatValue(entry.oldValue)}>
                                {formatValue(entry.oldValue)}
                              </span>
                              <span className="text-muted-foreground shrink-0">→</span>
                              <span className="text-green-600 dark:text-green-400 truncate max-w-[140px] font-semibold" title={formatValue(entry.newValue)}>
                                {formatValue(entry.newValue)}
                              </span>
                            </div>
                          </div>
                          {expanded && (
                            <div className="mt-2 p-2.5 rounded-md bg-muted/50 space-y-1.5 text-[11px]">
                              <div className="flex items-center gap-2">
                                <User className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="font-medium">{entry.changedBy}</span>
                                <Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[entry.changedByRole] || entry.changedByRole}</Badge>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Monitor className="w-3 h-3 shrink-0" />
                                <span>{SOURCE_LABELS[entry.source] || entry.source}</span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>{new Date(entry.createdAt).toLocaleString('sv-SE')}</span>
                              </div>
                              <div className="pt-1 border-t border-border/50 space-y-0.5 font-mono text-[10px]">
                                <div><span className="text-muted-foreground">Fält:</span> {entry.field}</div>
                                <div><span className="text-muted-foreground">Före:</span> <span className="text-destructive/70">{formatValue(entry.oldValue)}</span></div>
                                <div><span className="text-muted-foreground">Efter:</span> <span className="text-green-600 dark:text-green-400">{formatValue(entry.newValue)}</span></div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground text-right">
          Visar {filteredAudit.length} av {audit.length} ändringar
        </div>
      </div>

      {/* Login History */}
      {loginHistory.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <LogIn className="w-4 h-4 text-primary" />
            SSO-inloggningar
          </h3>
          <div className="border border-border rounded-lg overflow-hidden">
            <ScrollArea className="h-[360px]">
              <div className="divide-y divide-border">
                {loginHistory.map((entry: any, i: number) => {
                  const isSuccess = entry.success === true || entry.status === 'success';
                  const email = entry.email || '';
                  const provider = entry.provider || '';
                  const timestamp = entry.createdAt || entry.timestamp || '';
                  return (
                    <div key={entry.id || i} className="px-4 py-3 text-xs hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        {isSuccess ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-destructive shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{email}</span>
                            <Badge variant="outline" className="text-[10px] capitalize shrink-0">{provider}</Badge>
                            {entry.ssoOnlyEnforced && (
                              <Badge variant="secondary" className="text-[10px] shrink-0">SSO-krav</Badge>
                            )}
                          </div>
                          {entry.ip && (
                            <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5">
                              <Globe className="w-3 h-3" />
                              <span>{entry.ip}</span>
                            </div>
                          )}
                        </div>
                        <span className="text-muted-foreground text-[11px] shrink-0" title={timestamp ? new Date(timestamp).toLocaleString('sv-SE') : ''}>
                          {timestamp ? timeAgo(timestamp) : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
