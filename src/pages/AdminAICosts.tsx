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
import {
  ArrowLeft, RefreshCw, DollarSign, Users, Layers, Clock,
  TrendingUp, AlertCircle, Cpu, Timer, Zap, Brain, AudioLines,
  Mic, Volume2, Bot, Hash, ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAdminAICosts, AdminCosts, CostHistoryEntry } from "@/lib/geminiApi";
import { useExchangeRate } from "@/hooks/useExchangeRate";

type Currency = 'USD' | 'SEK';

const SERVICE_CONFIG: Record<string, { icon: typeof Brain; label: string }> = {
  gemini: { icon: Brain, label: "Gemini" },
  groq: { icon: Zap, label: "Groq" },
  openai: { icon: Bot, label: "OpenAI" },
  deepgram: { icon: Mic, label: "Deepgram" },
  elevenlabs: { icon: Volume2, label: "ElevenLabs" },
};

function getServiceConfig(service: string) {
  return SERVICE_CONFIG[service.toLowerCase()] || { icon: Cpu, label: service };
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
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

function safeFormatDateShort(dateStr?: string | null): string {
  if (!dateStr) return '–';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '–';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return `Idag ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
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
    <div className="space-y-4">
      {sorted.map(([service, cost]) => {
        const pct = total > 0 ? (cost / total) * 100 : 0;
        const cfg = getServiceConfig(service);
        const Icon = cfg.icon;
        return (
          <div key={service} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-sm bg-muted flex items-center justify-center">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium leading-none">{cfg.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{pct.toFixed(1)}% av total</p>
                </div>
              </div>
              <span className="font-semibold text-sm tabular-nums">{formatAmount(cost)}</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-foreground/70 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TransactionRow({ entry, formatAmount }: { entry: CostHistoryEntry; formatAmount: (n: number) => string }) {
  const cfg = getServiceConfig(entry.service);
  const Icon = cfg.icon;
  const dateStr = safeFormatDateShort(getEntryDate(entry));
  const desc = entry.description || '';
  const isMeeting = desc.startsWith('meeting:');
  const meetingId = isMeeting ? desc.replace('meeting:', '').slice(0, 8) : null;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
      <div className="h-8 w-8 rounded-sm bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{cfg.label}</span>
          {entry.model && (
            <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded-sm text-muted-foreground border border-border/50">{entry.model}</span>
          )}
          {entry.engine && !entry.model && (
            <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded-sm text-muted-foreground border border-border/50">{entry.engine}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
          {entry.userEmail && <span className="truncate max-w-[160px]">{entry.userEmail}</span>}
          {isMeeting && meetingId && (
            <>
              <span className="text-border">·</span>
              <span className="font-mono flex items-center gap-0.5"><Hash className="h-2.5 w-2.5" />{meetingId}</span>
            </>
          )}
          {entry.durationSec != null && (
            <>
              <span className="text-border">·</span>
              <span className="flex items-center gap-0.5"><Timer className="h-2.5 w-2.5" />{formatDuration(entry.durationSec)}</span>
            </>
          )}
          {entry.usage?.totalTokens != null && (
            <>
              <span className="text-border">·</span>
              <span>{entry.usage.totalTokens.toLocaleString()} tok</span>
            </>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <span className="font-semibold text-sm tabular-nums">{formatAmount(entry.amountUsd)}</span>
        <p className="text-[10px] text-muted-foreground mt-0.5">{dateStr}</p>
      </div>
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
    return Object.entries(costsData.byUser).sort(([, a], [, b]) => b.totalUsd - a.totalUsd);
  }, [costsData]);

  const totalTransactions = costsData?.history?.length || 0;

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-sm font-semibold uppercase tracking-wider">AI Kostnader</h1>
              <p className="text-[11px] text-muted-foreground">
                {costsData?.lastUpdated ? safeFormatDate(costsData.lastUpdated) : '–'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 border rounded-sm px-2.5 py-1">
              <Label htmlFor="currency-toggle" className={`text-[11px] font-medium transition-colors cursor-pointer ${currency === 'USD' ? 'text-foreground' : 'text-muted-foreground'}`}>USD</Label>
              <Switch id="currency-toggle" checked={currency === 'SEK'} onCheckedChange={(c) => setCurrency(c ? 'SEK' : 'USD')} disabled={rateLoading} className="scale-75" />
              <Label htmlFor="currency-toggle" className={`text-[11px] font-medium transition-colors cursor-pointer ${currency === 'SEK' ? 'text-foreground' : 'text-muted-foreground'}`}>SEK</Label>
            </div>
            <Button variant="outline" size="sm" onClick={fetchCosts} disabled={isLoading} className="rounded-sm h-8 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              Uppdatera
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-5">
        {/* Exchange rate bar */}
        {currency === 'SEK' && (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b pb-3">
            <span>Växelkurs: <span className="text-foreground font-medium">1 USD = {rate.toFixed(2)} SEK</span></span>
            {rateUpdated && <span>{rateUpdated.toLocaleTimeString('sv-SE')}</span>}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive border border-destructive/30 rounded-sm px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Top stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total kostnad", icon: DollarSign, value: isLoading ? null : formatAmount(costsData?.totalUsd || 0), primary: true },
            { label: "Tjänster", icon: Layers, value: isLoading ? null : String(Object.keys(costsData?.byService || {}).length) },
            { label: "Användare", icon: Users, value: isLoading ? null : String(Object.keys(costsData?.byUser || {}).length) },
            { label: "Transaktioner", icon: TrendingUp, value: isLoading ? null : String(totalTransactions) },
          ].map((stat) => {
            const StatIcon = stat.icon;
            return (
              <div key={stat.label} className="border rounded-sm p-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <StatIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{stat.label}</span>
                </div>
                {stat.value === null ? (
                  <Skeleton className="h-6 w-16" />
                ) : (
                  <p className={`text-lg font-bold tabular-nums ${stat.primary ? 'text-foreground' : ''}`}>{stat.value}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="services" className="space-y-4">
          <TabsList className="w-full grid grid-cols-3 rounded-sm h-9">
            <TabsTrigger value="services" className="rounded-sm text-xs">Tjänster</TabsTrigger>
            <TabsTrigger value="users" className="rounded-sm text-xs">Användare</TabsTrigger>
            <TabsTrigger value="history" className="rounded-sm text-xs">Historik</TabsTrigger>
          </TabsList>

          {/* Services */}
          <TabsContent value="services">
            <Card className="rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <Layers className="h-4 w-4" />Kostnad per tjänst
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : Object.keys(costsData?.byService || {}).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Inga kostnader registrerade</p>
                ) : (
                  <ServiceBreakdownChart byService={costsData!.byService} total={costsData!.totalUsd} formatAmount={formatAmount} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users */}
          <TabsContent value="users">
            <Card className="rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <Users className="h-4 w-4" />Kostnad per användare
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
                ) : sortedUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Inga användare</p>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <div className="divide-y divide-border/50">
                      {sortedUsers.map(([email, userData]) => {
                        const pct = costsData!.totalUsd > 0 ? (userData.totalUsd / costsData!.totalUsd) * 100 : 0;
                        return (
                          <div key={email} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{email}</p>
                                <p className="text-[11px] text-muted-foreground">{userData.history?.length || 0} transaktioner</p>
                              </div>
                              <div className="text-right shrink-0 ml-3">
                                <span className="font-semibold text-sm tabular-nums">{formatAmount(userData.totalUsd)}</span>
                                <p className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</p>
                              </div>
                            </div>
                            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-foreground/60 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* History */}
          <TabsContent value="history">
            <Card className="rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <Clock className="h-4 w-4" />Senaste transaktioner
                </CardTitle>
                <CardDescription className="text-xs">{totalTransactions} poster</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : (costsData?.history || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Ingen historik</p>
                ) : (
                  <ScrollArea className="max-h-[600px]">
                    <div>
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
