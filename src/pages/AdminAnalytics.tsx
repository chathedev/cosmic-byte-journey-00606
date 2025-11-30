import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2, Activity, Users, Sparkles, TrendingUp, TrendingDown, DollarSign, Loader2, Eye, Globe, Cloud } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { backendApi, VisitorAnalytics, CloudflareAnalytics } from "@/lib/backendApi";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  const [visitorData, setVisitorData] = useState<VisitorAnalytics | null>(null);
  const [cloudflareData, setCloudflareData] = useState<CloudflareAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState("30");

  const fetchAnalytics = async (days: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const [analyticsResponse, visitorResponse, cloudflareResponse] = await Promise.all([
        fetch(`https://api.tivly.se/admin/analytics?windowDays=${days}`, {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        backendApi.getVisitorAnalytics(parseInt(days)).catch(err => {
          console.warn("Visitor analytics not available:", err);
          return null;
        }),
        backendApi.getCloudflareVisitors(parseInt(days)).catch(err => {
          console.warn("Cloudflare analytics not available:", err);
          return { ok: false, error: "Failed to fetch analytics" };
        })
      ]);
      
      if (!analyticsResponse.ok) throw new Error('Failed to fetch analytics');
      
      const analyticsData = await analyticsResponse.json();
      setData(analyticsData);
      setVisitorData(visitorResponse);
      setCloudflareData(cloudflareResponse);
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

        {/* Visitor Analytics Section */}
        {visitorData && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="hover-scale">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Total besök
                </CardDescription>
                <CardTitle className="text-3xl">{visitorData.totalRecorded}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  All-time registrerade besök
                </p>
              </CardContent>
            </Card>

            <Card className="hover-scale">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Besök senaste perioden
                </CardDescription>
                <CardTitle className="text-3xl">{visitorData.entriesLastWindow}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Senaste {windowDays} dagarna
                </p>
              </CardContent>
            </Card>

            <Card className="hover-scale">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Unika besökare
                </CardDescription>
                <CardTitle className="text-3xl">{visitorData.uniqueVisitorsLastWindow}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {visitorData.uniqueIpsLastWindow} unika IPs
                </p>
              </CardContent>
            </Card>

            <Card className="hover-scale">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Genomsnitt/dag
                </CardDescription>
                <CardTitle className="text-3xl">
                  {(visitorData.entriesLastWindow / visitorData.windowDays).toFixed(1)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Besök per dag
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recent Visitors */}
        {visitorData && visitorData.recentEntries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Senaste besök
              </CardTitle>
              <CardDescription>De senaste besökarna på sajten</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {visitorData.recentEntries.map((entry) => (
                    <div 
                      key={entry.id} 
                      className="flex items-center justify-between p-3 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {entry.label || 'unknown'}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate">
                            {entry.page}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{entry.ip}</span>
                          <span>•</span>
                          <span>{entry.visitorKey}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                        {new Date(entry.visitedAt).toLocaleString('sv-SE', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

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

        {/* Cloudflare Analytics */}
        {cloudflareData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="w-4 h-4" />
                Cloudflare Analytics
              </CardTitle>
              <CardDescription>
                {cloudflareData.ok 
                  ? `Requests and pageviews (last ${cloudflareData.windowDays || windowDays} days)`
                  : 'Cloudflare analytics unavailable'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cloudflareData.ok ? (
                <>
                  {typeof cloudflareData.totalRequests === 'number' && typeof cloudflareData.totalPageViews === 'number' && (
                    <div className="grid gap-4 md:grid-cols-2 mb-4">
                      <div className="p-4 rounded-md bg-muted/40">
                        <p className="text-sm text-muted-foreground mb-1">Total Requests</p>
                        <p className="text-2xl font-semibold">{cloudflareData.totalRequests.toLocaleString()}</p>
                      </div>
                      <div className="p-4 rounded-md bg-muted/40">
                        <p className="text-sm text-muted-foreground mb-1">Total Pageviews</p>
                        <p className="text-2xl font-semibold">{cloudflareData.totalPageViews.toLocaleString()}</p>
                      </div>
                    </div>
                  )}
                  {(() => {
                    const days = Array.isArray(cloudflareData.days) ? cloudflareData.days : [];
                    return days.length > 0 ? (
                      <ScrollArea className="h-[400px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Datum</TableHead>
                              <TableHead className="text-right">Requests</TableHead>
                              <TableHead className="text-right">Pageviews</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {days.map((day, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-medium">
                                  {new Date(day.dimensions.date).toLocaleDateString('sv-SE', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </TableCell>
                                <TableCell className="text-right font-mono">{day.sum.requests.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-mono">{day.sum.pageViews.toLocaleString()}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Ingen data tillgänglig för vald period
                      </p>
                    );
                  })()}
                </>
              ) : (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    {cloudflareData.error || 'Cloudflare analytics unavailable. This may be due to rate limits or quota restrictions.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

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

