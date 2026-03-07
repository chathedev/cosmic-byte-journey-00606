import { useState, useEffect } from 'react';
import { FileText, Loader2, Clock, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getEnterpriseAudit, getAdminEnterpriseAudit, type AuditEntry, type AuditResponse } from '@/lib/enterpriseSettingsApi';

interface Props {
  companyId: string;
  isAdmin?: boolean;
}

export function EnterpriseSettingsAudit({ companyId, isAdmin }: Props) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const audit = data?.audit || [];
  const loginHistory = data?.loginHistory || [];

  return (
    <div className="space-y-6">
      {/* Settings Audit Log */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          Ändringshistorik
        </h3>
        <div className="border border-border rounded-lg overflow-hidden">
          {audit.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Inga ändringar registrerade</div>
          ) : (
            <ScrollArea className="h-[520px]">
              <div className="divide-y divide-border">
                {audit.map(entry => (
                  <div key={entry.id} className="px-4 py-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{entry.category}</Badge>
                        <span className="font-medium">{entry.field}</span>
                      </div>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(entry.createdAt).toLocaleString('sv-SE')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="w-3 h-3" />
                      <span>{entry.changedBy}</span>
                      <Badge variant="secondary" className="text-[10px]">{entry.changedByRole}</Badge>
                      <span className="text-muted-foreground/60">{entry.source}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="text-destructive line-through">{JSON.stringify(entry.oldValue)}</span>
                      <span>→</span>
                      <span className="text-green-600 dark:text-green-400">{JSON.stringify(entry.newValue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Login History */}
      {loginHistory.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            SSO-inloggningar
          </h3>
          <div className="border border-border rounded-lg overflow-hidden">
            <ScrollArea className="max-h-[300px]">
              <div className="divide-y divide-border">
                {loginHistory.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${entry.success ? 'bg-green-500' : 'bg-destructive'}`} />
                    <span className="font-medium flex-1 truncate">{entry.email}</span>
                    <Badge variant="outline" className="text-[10px]">{entry.provider}</Badge>
                    <span className="text-muted-foreground">{new Date(entry.timestamp).toLocaleString('sv-SE')}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
