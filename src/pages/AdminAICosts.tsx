import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, RefreshCw, DollarSign, Users, Layers, Clock, TrendingUp, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAdminAICosts, AdminCosts } from "@/lib/geminiApi";
import { useExchangeRate } from "@/hooks/useExchangeRate";

type Currency = 'USD' | 'SEK';

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
      toast({
        title: "Fel",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      navigate("/");
      return;
    }
    fetchCosts();
  }, [isAdmin, navigate]);

  const formatAmount = (amountUsd: number) => {
    const amount = currency === 'SEK' ? convert(amountUsd) : amountUsd;
    return new Intl.NumberFormat(currency === 'SEK' ? 'sv-SE' : 'en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: currency === 'SEK' ? 2 : 4,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const serviceColors: Record<string, string> = {
    gemini: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    groq: "bg-green-500/10 text-green-600 border-green-500/20",
    protokoll: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    ai: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  };

  const getServiceColor = (service: string) => {
    return serviceColors[service.toLowerCase()] || "bg-muted text-muted-foreground";
  };

  if (!isAdmin) {
    return null;
  }

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
                <DollarSign className="h-5 w-5 text-primary" />
                AI Kostnader
              </h1>
              <p className="text-xs text-muted-foreground">Admin Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Currency Toggle */}
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
              <Label htmlFor="currency-toggle" className={`text-sm font-medium transition-colors ${currency === 'USD' ? 'text-primary' : 'text-muted-foreground'}`}>
                USD
              </Label>
              <Switch
                id="currency-toggle"
                checked={currency === 'SEK'}
                onCheckedChange={(checked) => setCurrency(checked ? 'SEK' : 'USD')}
                disabled={rateLoading}
              />
              <Label htmlFor="currency-toggle" className={`text-sm font-medium transition-colors ${currency === 'SEK' ? 'text-primary' : 'text-muted-foreground'}`}>
                SEK
              </Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCosts}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Uppdatera
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Exchange Rate Info */}
        {currency === 'SEK' && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-center justify-between py-3">
              <p className="text-sm text-muted-foreground">
                Växelkurs: <span className="font-semibold text-foreground">1 USD = {rate.toFixed(2)} SEK</span>
              </p>
              {rateUpdated && (
                <p className="text-xs text-muted-foreground">
                  Uppdaterad: {rateUpdated.toLocaleTimeString('sv-SE')}
                </p>
              )}
            </CardContent>
          </Card>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Total Spend */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total kostnad
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold text-primary">
                  {formatAmount(costsData?.totalUsd || 0)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Services Count */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Tjänster
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">
                  {Object.keys(costsData?.byService || {}).length}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Users Count */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Användare
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">
                  {Object.keys(costsData?.byUser || {}).length}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Last Updated */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Senast uppdaterad
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <p className="text-sm font-medium">
                  {costsData?.lastUpdated ? formatDate(costsData.lastUpdated) : '-'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Service Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Kostnad per tjänst
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : Object.keys(costsData?.byService || {}).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Inga kostnader registrerade</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(costsData?.byService || {})
                  .sort(([, a], [, b]) => b - a)
                  .map(([service, cost]) => (
                    <div key={service} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className={getServiceColor(service)}>
                          {service}
                        </Badge>
                      </div>
                      <span className="font-semibold">{formatAmount(cost)}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              Kostnad per användare
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : Object.keys(costsData?.byUser || {}).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Inga användare med kostnader</p>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {Object.entries(costsData?.byUser || {})
                    .sort(([, a], [, b]) => b.totalUsd - a.totalUsd)
                    .map(([email, userData]) => (
                      <div key={email} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{email}</p>
                          <p className="text-xs text-muted-foreground">
                            {userData.history?.length || 0} transaktioner
                          </p>
                        </div>
                        <span className="font-semibold text-primary">{formatAmount(userData.totalUsd)}</span>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Recent History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Senaste transaktioner
            </CardTitle>
            <CardDescription>De senaste 100 AI-kostnaderna</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : (costsData?.history || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Ingen historik</p>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {costsData?.history.map((entry, idx) => (
                    <div key={idx} className="flex items-start justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={getServiceColor(entry.service)}>
                            {entry.service}
                          </Badge>
                          {entry.userEmail && (
                            <span className="text-xs text-muted-foreground truncate">
                              {entry.userEmail}
                            </span>
                          )}
                        </div>
                        {entry.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {entry.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {formatDate(entry.timestamp)}
                        </p>
                      </div>
                      <span className="font-semibold text-sm whitespace-nowrap ml-2">
                        {formatAmount(entry.amountUsd)}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
