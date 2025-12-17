import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, RefreshCw, DollarSign, Users, Layers, Clock, TrendingUp, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ServiceBreakdown {
  [service: string]: number;
}

interface UserCostData {
  totalUsd: number;
  history: Array<{
    service: string;
    costUsd: number;
    description?: string;
    timestamp: string;
  }>;
}

interface AdminCostsData {
  totalUsd: number;
  byService: ServiceBreakdown;
  byUser: Record<string, UserCostData>;
  history: Array<{
    service: string;
    costUsd: number;
    userEmail?: string;
    description?: string;
    timestamp: string;
  }>;
  lastUpdated: string;
}

export default function AdminAICosts() {
  const { user } = useAuth();
  const { isAdmin } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [costsData, setCostsData] = useState<AdminCostsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCosts = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get auth token from Supabase session or localStorage
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseToken = session?.access_token;
      const localToken = localStorage.getItem('authToken');
      const token = localToken || supabaseToken;

      if (!token) {
        throw new Error("Inte inloggad");
      }

      const response = await fetch("https://api.tivly.se/admin/ai-costs", {
        method: "GET",
        credentials: "include",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Inte behörig");
        }
        if (response.status === 403) {
          throw new Error("Admin-behörighet krävs");
        }
        throw new Error("Kunde inte hämta kostnadsdata");
      }

      const data = await response.json();
      setCostsData({
        totalUsd: data.totalUsd || 0,
        byService: data.byService || {},
        byUser: data.byUser || {},
        history: data.history || [],
        lastUpdated: data.lastUpdated || new Date().toISOString(),
      });
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

  const formatUsd = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
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

      <div className="max-w-6xl mx-auto p-4 space-y-6">
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
                  {formatUsd(costsData?.totalUsd || 0)}
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
                      <span className="font-semibold">{formatUsd(cost)}</span>
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
                        <span className="font-semibold text-primary">{formatUsd(userData.totalUsd)}</span>
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
                  {(costsData?.history || []).map((entry, idx) => (
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
                        {formatUsd(entry.costUsd)}
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
