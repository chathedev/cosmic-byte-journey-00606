import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2, Activity, Users, Sparkles, TrendingUp, TrendingDown, DollarSign, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AnalyticsData {
  timestamp: string;
  windowDays: number;
  userGrowth: {
    totalUsers: number;
    signupsLastWindow: number;
    activeUsersLastWindow: number;
    retentionRate: number;
    signupsTimeSeries: Array<{ date: string; signups: number }>;
    activeUsersTimeSeries: Array<{ date: string; activeUsers: number }>;
  };
  usage: {
    totalMeetings: number;
    meetingsLastWindow: number;
    averageMeetingsPerUser: number;
    averageMeetingsPerActiveUser: number;
    usersWithMeetings: number;
    activeMeetingUsers: number;
    meetingsTimeSeries: Array<{ date: string; meetings: number }>;
    meetingStatusBreakdown: Record<string, number>;
    featureUsage: {
      protocolsGenerated: number;
      notesUsed: number;
      transcriptsGenerated: number;
      actionItemsUsed: number;
      attachmentsUsed: number;
      agendasUsed: number;
    };
    protocolShare: number;
  };
  trends: {
    lastSevenSignups: number;
    previousSevenSignups: number;
  };
  insights: {
    highlights: string[];
    recommendations: string[];
  };
  stripe?: {
    enabled: boolean;
    fetchedAt?: string;
    windowDays?: number;
    activeSubscriptions?: number;
    newSubscriptionsLastWindow?: number;
    churnedSubscriptionsLastWindow?: number;
    estimatedMonthlyRecurringRevenue?: number;
    currency?: string;
    sampleSizeLimited?: boolean;
  };
}

const AdminAnalytics = () => {
  const { toast } = useToast();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState("30");

  const fetchAnalytics = async (days: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`https://api.tivly.se/admin/analytics?windowDays=${days}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-JWT-Secret': import.meta.env.VITE_JWT_SECRET || '',
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch analytics');
      
      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
      toast({
        title: "Fel",
        description: "Kunde inte hämta analysdata",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(windowDays);
  }, [windowDays]);

  if (loading) {
    return (
      <>
        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Analytics</h1>
        </div>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Analytics</h1>
        </div>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <p className="text-muted-foreground">Ingen data tillgänglig</p>
        </div>
      </>
    );
  }

  const signupTrend = data.trends.lastSevenSignups - data.trends.previousSevenSignups;
  const isSignupGrowth = signupTrend >= 0;

  return (
    <>
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Analytics</h1>
        </div>
        <Select value={windowDays} onValueChange={setWindowDays}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dagar</SelectItem>
            <SelectItem value="14">14 dagar</SelectItem>
            <SelectItem value="30">30 dagar</SelectItem>
            <SelectItem value="60">60 dagar</SelectItem>
            <SelectItem value="90">90 dagar</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
        {/* User Growth Section */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="hover-scale">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Total användare
              </CardDescription>
              <CardTitle className="text-3xl">{data.userGrowth.totalUsers}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                +{data.userGrowth.signupsLastWindow} senaste {windowDays} dagarna
              </p>
            </CardContent>
          </Card>

          <Card className="hover-scale">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Aktiva användare
              </CardDescription>
              <CardTitle className="text-3xl">{data.userGrowth.activeUsersLastWindow}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {(data.userGrowth.retentionRate * 100).toFixed(1)}% retention
              </p>
            </CardContent>
          </Card>

          <Card className="hover-scale">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                {isSignupGrowth ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
                7-dagars trend
              </CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                {data.trends.lastSevenSignups}
                <Badge variant={isSignupGrowth ? "default" : "secondary"} className="text-xs">
                  {isSignupGrowth ? "+" : ""}{signupTrend}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">vs förra veckan</p>
            </CardContent>
          </Card>

          <Card className="hover-scale">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4" />
                Möten totalt
              </CardDescription>
              <CardTitle className="text-3xl">{data.usage.totalMeetings}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {data.usage.averageMeetingsPerUser.toFixed(1)} per användare
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Stripe Section */}
        {data.stripe?.enabled && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="hover-scale">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  MRR
                </CardDescription>
                <CardTitle className="text-3xl">
                  {data.stripe.estimatedMonthlyRecurringRevenue?.toFixed(0)} {data.stripe.currency?.toUpperCase()}
                </CardTitle>
              </CardHeader>
               <CardContent>
                <p className="text-xs text-muted-foreground">
                  {data.stripe.activeSubscriptions || 0} aktiva prenumerationer
                </p>
                {data.stripe.sampleSizeLimited && (
                  <p className="text-xs text-yellow-600 mt-1">Begränsat urval</p>
                )}
              </CardContent>
            </Card>

            <Card className="hover-scale">
              <CardHeader className="pb-2">
                <CardDescription>Nya prenumerationer</CardDescription>
                <CardTitle className="text-3xl text-green-600">
                  +{data.stripe.newSubscriptionsLastWindow}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Senaste {windowDays} dagarna</p>
              </CardContent>
            </Card>

            <Card className="hover-scale">
              <CardHeader className="pb-2">
                <CardDescription>Churn</CardDescription>
                <CardTitle className="text-3xl text-red-600">
                  -{data.stripe.churnedSubscriptionsLastWindow}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Senaste {windowDays} dagarna</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Feature Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Funktionsanvändning
            </CardTitle>
            <CardDescription>Översikt över vilka funktioner som används mest</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(data.usage.featureUsage).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-md bg-muted/40">
                  <span className="text-sm capitalize">
                    {key.replace(/([A-Z])/g, " $1").toLowerCase()}
                  </span>
                  <Badge variant="secondary">{value}</Badge>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                <strong>{(data.usage.protocolShare * 100).toFixed(1)}%</strong> av möten har protokoll
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Insights */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Highlights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {data.insights.highlights.map((highlight, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Rekommendationer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {data.insights.recommendations.map((rec, idx) => (
                  <li key={idx} className="text-sm flex items-start gap-2">
                    <span className="text-primary mt-0.5">→</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default AdminAnalytics;

