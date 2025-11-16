import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { outreachApi, OutreachStatus } from '@/lib/outreachApi';
import { Mail, Database, Clock, AlertCircle, Send } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';

export default function Marketing() {
  const [status, setStatus] = useState<OutreachStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [sendingTest, setSendingTest] = useState(false);

  const loadStatus = async () => {
    try {
      const data = await outreachApi.getStatus();
      setStatus(data);
      setLastUpdate(new Date());
      setLoading(false);
    } catch (error) {
      console.error('Failed to load outreach status:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let fallbackInterval: NodeJS.Timeout | null = null;
    let isSSEActive = false;

    // Try to use Server-Sent Events first
    try {
      eventSource = new EventSource('https://api.tivly.se/outreach/stats-stream');
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setStatus(data);
          setLastUpdate(new Date());
          setLoading(false);
          isSSEActive = true;
        } catch (error) {
          console.error('Failed to parse SSE data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        eventSource?.close();
        
        // Fall back to polling if SSE fails
        if (!isSSEActive && !fallbackInterval) {
          console.log('Falling back to polling every 10 seconds');
          fallbackInterval = setInterval(loadStatus, 10000);
        }
      };

      // Initial load
      loadStatus();
    } catch (error) {
      console.error('SSE not supported, using polling:', error);
      // Fall back to polling if SSE is not supported
      loadStatus();
      fallbackInterval = setInterval(loadStatus, 10000);
    }

    return () => {
      eventSource?.close();
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, []);

  const isWithinSendingHours = () => {
    const now = new Date();
    const hours = now.getHours();
    return hours >= 6 && hours < 22;
  };

  const getStatusColor = () => {
    if (!status) return 'bg-muted';
    if (!status.initialized) return 'bg-yellow-500';
    const withinHours = status.sender.withinSendingHours ?? isWithinSendingHours();
    if (!withinHours) return 'bg-yellow-500';
    if (Object.keys(status.sender.pausedSenders || {}).length > 0) return 'bg-red-500';
    if (!status.scheduler.isRunning) return 'bg-red-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (!status) return 'Loading...';
    if (!status.initialized) return 'System Initializing...';
    if (!status.scheduler.isRunning) return 'Scheduler Stopped';
    const withinHours = status.sender.withinSendingHours ?? isWithinSendingHours();
    if (!withinHours) return 'Outside Sending Hours (06:00-22:00)';
    if (Object.keys(status.sender.pausedSenders || {}).length > 0) return 'Some Senders Paused';
    return 'System Operational';
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      await outreachApi.sendTest();
      toast({
        title: "Test Emails Sent",
        description: "All three email templates have been sent to the test address.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send test emails",
        variant: "destructive",
      });
    } finally {
      setSendingTest(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">Marketing Outreach Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Automated B2B outreach system · 1000 daily capacity · 5 sender domains
              </p>
            </div>
            <Button
              onClick={handleSendTest}
              disabled={sendingTest}
              variant="outline"
              size="sm"
              className="gap-2 h-9"
            >
              <Send className="h-3.5 w-3.5" />
              {sendingTest ? 'Sending...' : 'Send Test'}
            </Button>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground border-l-2 border-border pl-4">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              <span>Updated {lastUpdate.toLocaleTimeString()}</span>
            </div>
            <span>Live updates</span>
            <span>Active 06:00-22:00</span>
          </div>
        </div>

        {/* Status Banner */}
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
              <span className="text-sm font-medium text-foreground">{getStatusText()}</span>
            </div>
            {status?.scheduler.isRunning && (
              <span className="text-xs text-muted-foreground">
                {status.scheduler.jobs.filter(j => j.running).length} active jobs
              </span>
            )}
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Database className="h-3.5 w-3.5" />
                Master Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-foreground">{status?.statistics.totalMaster || 0}</div>
              <p className="text-xs text-muted-foreground mt-2">Validated contacts</p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" />
                Sent Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-foreground">{status?.statistics.sentToday || 0}</div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-muted-foreground">of 1000</p>
                <p className="text-xs font-medium">{Math.round(((status?.statistics.sentToday || 0) / 1000) * 100)}%</p>
              </div>
              <Progress value={((status?.statistics.sentToday || 0) / 1000) * 100} className="h-1 mt-3" />
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                Pending Queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-foreground">{status?.statistics.totalPending || 0}</div>
              <p className="text-xs text-muted-foreground mt-2">Awaiting delivery</p>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5" />
                Invalid
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-foreground">{status?.statistics.totalInvalid || 0}</div>
              <p className="text-xs text-muted-foreground mt-2">Blocked addresses</p>
            </CardContent>
          </Card>
        </div>

        {/* Domain Statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Sender Domains</CardTitle>
              <CardDescription className="text-xs">Daily quota per domain · Resets at midnight</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {status?.sender.domainSends &&
                Object.entries(status.sender.domainSends)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([domain, stats]) => {
                    const percentage = (stats.sent / stats.limit) * 100;
                    const isPaused = status.sender.pausedSenders?.[domain];

                    return (
                      <div key={domain} className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-medium">{domain}</span>
                            {isPaused && (
                              <span className="text-[10px] uppercase tracking-wide bg-muted text-muted-foreground px-2 py-0.5 rounded">
                                Paused
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">
                            {stats.sent}/{stats.limit}
                          </span>
                        </div>
                        <Progress value={percentage} className="h-1.5" />
                      </div>
                    );
                  })}
            </CardContent>
          </Card>

          {/* Automation Schedule */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Automation Schedule</CardTitle>
              <CardDescription className="text-xs">Daily cycle · Fully automated</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-4 p-3 border border-border rounded-md">
                <div className="text-[11px] font-mono text-muted-foreground min-w-[70px] pt-0.5">05:00</div>
                <div className="text-sm space-y-1">
                  <div className="font-medium text-sm">Queue Reset</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">Discovery initiates for 1000 validated contacts</div>
                </div>
              </div>
              <div className="flex items-start gap-4 p-3 border border-border rounded-md">
                <div className="text-[11px] font-mono text-muted-foreground min-w-[70px] pt-0.5">06:00-22:00</div>
                <div className="text-sm space-y-1">
                  <div className="font-medium text-sm">Active Sending</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">Batch delivery every ~2 minutes</div>
                </div>
              </div>
              <div className="flex items-start gap-4 p-3 border border-border rounded-md">
                <div className="text-[11px] font-mono text-muted-foreground min-w-[70px] pt-0.5">23:50</div>
                <div className="text-sm space-y-1">
                  <div className="font-medium text-sm">Queue Purge</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">Cleanup for next cycle</div>
                </div>
              </div>
              <div className="flex items-start gap-4 p-3 border border-border rounded-md bg-muted/30">
                <div className="text-[11px] font-mono text-muted-foreground min-w-[70px] pt-0.5">HOURLY</div>
                <div className="text-sm space-y-1">
                  <div className="font-medium text-sm">Discovery</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">Continuous validation & queuing</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* System Info */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold">System Configuration</CardTitle>
            <CardDescription className="text-xs">Automation status and operational parameters</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">Scheduler</span>
                <span className={`text-xs font-medium ${status?.scheduler.isRunning ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {status?.scheduler.isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">Active Jobs</span>
                <span className="text-xs font-medium font-mono">
                  {status?.scheduler.jobs.filter(j => j.running).length || 0}/{status?.scheduler.jobs.length || 0}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">Active Domains</span>
                <span className="text-xs font-medium font-mono">
                  {(status?.sender.activeSenderDomains || []).length || 0}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">Paused Senders</span>
                <span className="text-xs font-medium font-mono">
                  {Object.keys(status?.sender.pausedSenders || {}).length || 0}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">Daily Capacity</span>
                <span className="text-xs font-medium font-mono">1000</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">Sending Window</span>
                <span className="text-xs font-medium font-mono">06:00-22:00</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">Batch Interval</span>
                <span className="text-xs font-medium font-mono">~2 min</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">Message Delay</span>
                <span className="text-xs font-medium font-mono">4-12s</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
