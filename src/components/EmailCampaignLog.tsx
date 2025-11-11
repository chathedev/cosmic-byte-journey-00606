import { useState, useEffect } from 'react';
import { emailCampaignApi, ExecutionLog } from '@/lib/emailCampaignApi';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Search } from 'lucide-react';
import { format } from 'date-fns';

interface EmailCampaignLogProps {
  campaignId: string;
  onClose: () => void;
}

export function EmailCampaignLog({ campaignId, onClose }: EmailCampaignLogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [log, setLog] = useState<ExecutionLog | null>(null);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadLog = async () => {
      try {
        const data = await emailCampaignApi.getExecutionLog(campaignId);
        setLog(data);
      } catch (error) {
        console.error('Failed to load log:', error);
        toast.error('Kunde inte ladda logg');
        onClose();
      } finally {
        setIsLoading(false);
      }
    };

    loadLog();
  }, [campaignId]);

  const filteredResults = log?.results.filter((result) => {
    if (filter === 'success' && !result.success) return false;
    if (filter === 'failed' && result.success) return false;
    if (searchQuery && !result.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Utskickslogg</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : log ? (
          <div className="space-y-6">
            {/* Stats - Clean minimalistic cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-5 rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 border">
                <p className="text-xs text-muted-foreground mb-1">Totalt</p>
                <p className="text-3xl font-bold">{log.stats.totalTargets}</p>
              </div>
              <div className="p-5 rounded-xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20">
                <p className="text-xs text-muted-foreground mb-1">Skickade</p>
                <p className="text-3xl font-bold text-green-600">{log.stats.sent}</p>
              </div>
              <div className="p-5 rounded-xl bg-gradient-to-br from-destructive/10 to-destructive/5 border border-destructive/20">
                <p className="text-xs text-muted-foreground mb-1">Misslyckade</p>
                <p className="text-3xl font-bold text-destructive">{log.stats.failed}</p>
              </div>
            </div>

            <div className="text-sm text-muted-foreground px-1">
              📅 {format(new Date(log.executedAt), 'yyyy-MM-dd HH:mm:ss')}
            </div>

            {/* Search and Filter - Streamlined */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Sök email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11"
                />
              </div>
              <div className="flex gap-2">
                <Badge
                  variant={filter === 'all' ? 'default' : 'outline'}
                  className="cursor-pointer px-4 py-2"
                  onClick={() => setFilter('all')}
                >
                  Alla
                </Badge>
                <Badge
                  variant={filter === 'success' ? 'default' : 'outline'}
                  className="cursor-pointer px-4 py-2"
                  onClick={() => setFilter('success')}
                >
                  Lyckade
                </Badge>
                <Badge
                  variant={filter === 'failed' ? 'default' : 'outline'}
                  className="cursor-pointer px-4 py-2"
                  onClick={() => setFilter('failed')}
                >
                  Misslyckade
                </Badge>
              </div>
            </div>

            {/* Results Table - Clean design */}
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left p-4 font-semibold text-sm">Email</th>
                    <th className="text-left p-4 font-semibold text-sm">Status</th>
                    <th className="text-left p-4 font-semibold text-sm">Detaljer</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults?.map((result, index) => (
                    <tr key={index} className="border-t hover:bg-muted/20 transition-colors">
                      <td className="p-4 font-medium">{result.email}</td>
                      <td className="p-4">
                        {result.success ? (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-sm font-medium">Skickad</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-destructive">
                            <XCircle className="w-4 h-4" />
                            <span className="text-sm font-medium">Misslyckades</span>
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {result.success ? (
                          <code className="text-xs bg-muted px-2 py-1 rounded">{result.messageId}</code>
                        ) : (
                          <span className="text-destructive">{result.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredResults?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Inga resultat hittades
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
