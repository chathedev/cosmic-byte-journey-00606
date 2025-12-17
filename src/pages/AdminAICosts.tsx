import { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, Zap, Bot, Mic } from "lucide-react";
import { toast } from 'sonner';

const BACKEND_URL = 'https://api.tivly.se';

interface ProviderCost {
  usd: number | null;
  sek: number | null;
  error: string | null;
  raw: Record<string, unknown> | null;
}

interface AICostsResponse {
  success: boolean;
  fetchedAt: string;
  usdToSekRate: number;
  groq: ProviderCost;
  googleAi: ProviderCost;
}

const AdminAICosts = () => {
  const [data, setData] = useState<AICostsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchCosts = async (showToast = false) => {
    if (showToast) setIsRefreshing(true);
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${BACKEND_URL}/admin/ai-costs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result = await response.json();
      setData(result);
      
      if (showToast) {
        toast.success('Uppdaterad');
      }
    } catch (error) {
      console.error('Failed to fetch AI costs:', error);
      if (showToast) {
        toast.error('Kunde inte hämta data');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCosts();
    const interval = setInterval(() => fetchCosts(), 60000);
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (value: number | null, currency: 'USD' | 'SEK') => {
    if (value === null) return '—';
    return currency === 'USD' 
      ? `$${value.toFixed(2)}` 
      : `${value.toFixed(2)} kr`;
  };

  const totalUsd = (data?.groq.usd ?? 0) + (data?.googleAi.usd ?? 0);
  const totalSek = (data?.groq.sek ?? 0) + (data?.googleAi.sek ?? 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-muted-foreground">Laddar...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted/50">
                <Zap className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-medium">AI Kostnader</h1>
                <p className="text-xs text-muted-foreground">
                  {data?.fetchedAt 
                    ? new Date(data.fetchedAt).toLocaleString('sv-SE', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        day: 'numeric',
                        month: 'short'
                      })
                    : '—'}
                </p>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchCosts(true)}
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Uppdatera
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        
        {/* Total */}
        <Card className="border-0 bg-muted/30">
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Totalt</p>
            <div className="flex items-baseline gap-4">
              <span className="text-3xl font-semibold tabular-nums">
                {formatCurrency(totalSek, 'SEK')}
              </span>
              <span className="text-lg text-muted-foreground tabular-nums">
                {formatCurrency(totalUsd, 'USD')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Växelkurs: 1 USD = {data?.usdToSekRate?.toFixed(2) ?? '—'} SEK
            </p>
          </CardContent>
        </Card>

        {/* Providers */}
        <div className="grid gap-4 md:grid-cols-2">
          
          {/* Groq */}
          <Card className="border-0 bg-muted/30">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Groq Whisper</span>
                </div>
                {data?.groq.error ? (
                  <Badge variant="destructive" className="font-normal gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Fel
                  </Badge>
                ) : (
                  <Badge variant="default" className="font-normal">OK</Badge>
                )}
              </div>
              
              {data?.groq.error ? (
                <p className="text-sm text-destructive">{data.groq.error}</p>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">SEK</span>
                    <span className="font-medium tabular-nums">{formatCurrency(data?.groq.sek ?? null, 'SEK')}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">USD</span>
                    <span className="tabular-nums">{formatCurrency(data?.groq.usd ?? null, 'USD')}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Google AI */}
          <Card className="border-0 bg-muted/30">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Google Gemini</span>
                </div>
                {data?.googleAi.error ? (
                  <Badge variant="destructive" className="font-normal gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Fel
                  </Badge>
                ) : (
                  <Badge variant="default" className="font-normal">OK</Badge>
                )}
              </div>
              
              {data?.googleAi.error ? (
                <p className="text-sm text-destructive">{data.googleAi.error}</p>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">SEK</span>
                    <span className="font-medium tabular-nums">{formatCurrency(data?.googleAi.sek ?? null, 'SEK')}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">USD</span>
                    <span className="tabular-nums">{formatCurrency(data?.googleAi.usd ?? null, 'USD')}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Raw Data (collapsible for debugging) */}
        {(data?.groq.raw || data?.googleAi.raw) && (
          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
              Visa rådata
            </summary>
            <div className="mt-3 space-y-3">
              {data?.groq.raw && (
                <Card className="border-0 bg-muted/20">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium mb-2">Groq</p>
                    <pre className="text-xs text-muted-foreground overflow-x-auto">
                      {JSON.stringify(data.groq.raw, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
              {data?.googleAi.raw && (
                <Card className="border-0 bg-muted/20">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium mb-2">Google AI</p>
                    <pre className="text-xs text-muted-foreground overflow-x-auto">
                      {JSON.stringify(data.googleAi.raw, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
};

export default AdminAICosts;
