import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, RefreshCw, DollarSign, Users, Layers, Clock, TrendingUp, AlertCircle, Cpu, Timer, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAdminAICosts, AdminCosts, CostHistoryEntry } from "@/lib/geminiApi";
import { useExchangeRate } from "@/hooks/useExchangeRate";

type Currency = 'USD' | 'SEK';

const SERVICE_CONFIG: Record<string, { color: string; icon: string }> = {
  gemini: { color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: "🧠" },
  groq: { color: "bg-green-500/10 text-green-600 border-green-500/20", icon: "⚡" },
  openai: { color: "bg-violet-500/10 text-violet-600 border-violet-500/20", icon: "🤖" },
  deepgram: { color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20", icon: "🎙️" },
  elevenlabs: { color: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: "🔊" },
};

function getServiceStyle(service: string) {
  return SERVICE_CONFIG[service.toLowerCase()] || { color: "bg-muted text-muted-foreground", icon: "📦" };
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function safeFormatDate(dateStr?: string | null): string {
  if (!dateStr) return '–';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '–';
    return d.toLocaleString('sv-SE', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '–';
  }
}

function getEntryDate(entry: CostHistoryEntry): string {
  return entry.recordedAt || entry.timestamp || '';
}

function ServiceBreakdownChart({ byService, total, formatAmount }: { byService: Record<string, number>; total: number; formatAmount: (n: number) => string }) {
  const sorted = Object.entries(byService).sort(([, a], [, b]) => b - a);
  return (
    <div className="space-y-3">
      {sorted.map(([service, cost]) => {
        const pct = total > 0 ? (cost / total) * 100 : 0;
        const cfg = getServiceStyle(service);
        return (
          <div key={service} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">{cfg.icon}</span>
                <Badge variant="outline" className={cfg.color}>{service}</Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                <span className="font-semibold text-sm tabular-nums">{formatAmount(cost)}</span>
              </div>
            </div>
            <Progress value={pct} className="h-2" />
          </div>
        );
      })}
    </div>
  );
}

function TransactionRow({ entry, formatAmount }: { entry: CostHistoryEntry; formatAmount: (n: number) => string }) {
  const cfg = getServiceStyle(entry.service);
  const dateStr = safeFormatDate(getEntryDate(entry));
  const desc = entry.description || '';
  const isMeeting = desc.startsWith('meeting:');
  const meetingId = isMeeting ? desc.replace('meeting:', '').slice(0, 8) : null;

  return (
    <div className="flex items-start justify-between p-3 rounded-lg bg-muted/30 border border-border/50 gap-3">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm">{cfg.icon}</span>
          <Badge variant="outline" className={`${cfg.color} text-xs`}>{entry.service}</Badge>
          {entry.model && (
            <span className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{entry.model}</span>
          )}
          {entry.engine && !entry.model && (
            <span className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{entry.engine}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          {entry.userEmail && <span className="truncate max-w-[200px]">{entry.userEmail}</span>}
          {isMeeting && meetingId && (
            <span className="font-mono opacity-60">#{meetingId}…</span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground/70">
          <span>{dateStr}</span>
          {entry.durationSec != null && (
            <span className="flex items-center gap-0.5"><Timer className="h-3 w-3" />{formatDuration(entry.durationSec)}</span>
          )}
          {entry.usage?.totalTokens != null && (
            <span className="flex items-center gap-0.5"><Cpu className="h-3 w-3" />{entry.usage.totalTokens.toLocaleString()} tokens</span>
          )}
          {entry.source && (
            <span className="opacity-60">{entry.source}</span>
          )}
        </div>
      </div>
      <span className="font-semibold text-sm whitespace-nowrap tabular-nums">{formatAmount(entry.amountUsd)}</span>
    </div>
  );
}

export default function AdminAICosts() {
  const { isAdmin } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [costsData, setCostsData] = useState<AdminCosts | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');

  const { rate, convert, loading: rateLoading, lastUpdated: rateUpdated } = useExchangeRate('USD', 'SEK');

  const fetchCosts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminAICosts();
      setCostsData(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ett fel uppstod";
      setError(message);
      toast({ title: "Fel", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) { navigate("/"); return; }
    fetchCosts();
  }, [isAdmin, navigate]);

  const formatAmount = (amountUsd: number) => {
    const amount = currency === 'SEK' ? convert(amountUsd) : amountUsd;
    return new Intl.NumberFormat(currency === 'SEK' ? 'sv-SE' : 'en-US', {
      style: 'currency', currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: currency === 'SEK' ? 2 : 4,
    }).format(amount);
  };

  const sortedUsers = useMemo(() => {
    if (!costsData?.byUser) return [];
    return Object.entries(costsData.byUser)
      .sort(([, a], [, b]) => b.totalUsd - a.totalUsd);
  }, [costsData]);

  const totalTransactions = useMemo(() => {
    return costsData?.history?.length || 0;
  }, [costsData]);

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                AI Kostnader
              </h1>
              <p className="text-xs text-muted-foreground">
                {costsData?.lastUpdated ? `Senast: ${safeFormatDate(costsData.lastUpdated)}` : 'Admin Dashboard'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
              <Label htmlFor="currency-toggle" className={`text-xs font-medium transition-colors ${currency === 'USD' ? 'text-primary' : 'text-muted-foreground'}`}>USD</Label>
              <Switch id="currency-toggle" checked={currency === 'SEK'} onCheckedChange={(c) => setCurrency(c ? 'SEK' : 'USD')} disabled={rateLoading} />
              <Label htmlFor="currency-toggle" className={`text-xs font-medium transition-colors ${currency === 'SEK' ? 'text-primary' : 'text-muted-foreground'}`}>SEK</Label>
            </div>
            <Button variant="outline" size="sm" onClick={fetchCosts} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              Uppdatera
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Exchange rate */}
        {currency === 'SEK' && (
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>Växelkurs: <span className="font-semibold text-foreground">1 USD = {rate.toFixed(2)} SEK</span></span>
            {rateUpdated && <span>Uppdaterad: {rateUpdated.toLocaleTimeString('sv-SE')}</span>}
          </div>
        )}

        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardDescription className="flex items-center gap-1.5 text-xs"><DollarSign className="h-3.5 w-3.5" />Total</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isLoading ? <Skeleton className="h-7 w-20" /> : (
                <p className="text-xl font-bold text-primary tabular-nums">{formatAmount(costsData?.totalUsd || 0)}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardDescription className="flex items-center gap-1.5 text-xs"><Layers className="h-3.5 w-3.5" />Tjänster</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isLoading ? <Skeleton className="h-7 w-10" /> : (
                <p className="text-xl font-bold">{Object.keys(costsData?.byService || {}).length}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardDescription className="flex items-center gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />Användare</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isLoading ? <Skeleton className="h-7 w-10" /> : (
                <p className="text-xl font-bold">{Object.keys(costsData?.byUser || {}).length}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardDescription className="flex items-center gap-1.5 text-xs"><TrendingUp className="h-3.5 w-3.5" />Transaktioner</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {isLoading ? <Skeleton className="h-7 w-10" /> : (
                <p className="text-xl font-bold">{totalTransactions}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="services" className="space-y-4">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="services" className="text-xs">Tjänster</TabsTrigger>
            <TabsTrigger value="users" className="text-xs">Användare</TabsTrigger>
            <TabsTrigger value="history" className="text-xs">Historik</TabsTrigger>
          </TabsList>

          {/* Services Tab */}
          <TabsContent value="services">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Layers className="h-5 w-5" />Kostnad per tjänst</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                ) : Object.keys(costsData?.byService || {}).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Inga kostnader registrerade</p>
                ) : (
                  <ServiceBreakdownChart byService={costsData!.byService} total={costsData!.totalUsd} formatAmount={formatAmount} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Users className="h-5 w-5" />Kostnad per användare</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : sortedUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Inga användare</p>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <div className="space-y-2">
                      {sortedUsers.map(([email, userData]) => {
                        const pct = costsData!.totalUsd > 0 ? (userData.totalUsd / costsData!.totalUsd) * 100 : 0;
                        return (
                          <div key={email} className="p-3 rounded-lg bg-muted/50 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{email}</p>
                                <p className="text-[11px] text-muted-foreground">{userData.history?.length || 0} transaktioner · {pct.toFixed(1)}% av total</p>
                              </div>
                              <span className="font-semibold text-primary tabular-nums">{formatAmount(userData.totalUsd)}</span>
                            </div>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Clock className="h-5 w-5" />Senaste transaktioner</CardTitle>
                <CardDescription>De senaste {totalTransactions} AI-kostnaderna</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
                ) : (costsData?.history || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Ingen historik</p>
                ) : (
                  <ScrollArea className="max-h-[600px]">
                    <div className="space-y-2">
                      {costsData!.history.map((entry, idx) => (
                        <TransactionRow key={idx} entry={entry} formatAmount={formatAmount} />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
