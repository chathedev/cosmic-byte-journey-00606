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
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Marketing Dashboard</h1>
              <p className="text-muted-foreground mt-1">
                Real-time email outreach monitoring
              </p>
            </div>
            <Button
              onClick={handleSendTest}
              disabled={sendingTest}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {sendingTest ? 'Sending...' : 'Send Test Emails'}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
            <span className="ml-2 text-primary">• Live updates via SSE</span>
          </div>
        </div>

        {/* Status Banner */}
        <Alert>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`} />
            <AlertDescription className="font-medium">{getStatusText()}</AlertDescription>
          </div>
        </Alert>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                Master Database
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{status?.statistics.totalMaster || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Verified emails</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Sent Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{status?.statistics.sentToday || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Out of 300 daily limit</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{status?.statistics.totalPending || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Ready to send</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                Next Send
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{status?.statistics.totalInvalid || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Bounced/Invalid</p>
            </CardContent>
          </Card>
        </div>

        {/* Domain Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Email Sending Statistics</CardTitle>
            <CardDescription>Daily sending limits per domain (resets at midnight)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {status?.sender.domainSends &&
              Object.entries(status.sender.domainSends).map(([domain, stats]) => {
                const percentage = (stats.sent / stats.limit) * 100;
                const isPaused = status.sender.pausedSenders?.[domain];

                return (
                  <div key={domain} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{domain}</span>
                        {isPaused && (
                          <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">
                            Paused
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {stats.sent} / {stats.limit} ({stats.remaining} remaining)
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
          </CardContent>
        </Card>

        {/* System Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              System Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Scheduler Status:</span>
              <span className="font-medium">
                {status?.scheduler.isRunning ? 'Running' : 'Stopped'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active Jobs:</span>
              <span className="font-medium">
                {status?.scheduler.jobs.filter(j => j.running).length || 0} / {status?.scheduler.jobs.length || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active Sender Domains:</span>
              <span className="font-medium">
                {(status?.sender.activeSenderDomains || []).join(', ') || 'None'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Daily Limit Total:</span>
              <span className="font-medium">300 emails</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sending Hours:</span>
              <span className="font-medium">06:00 - 22:00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Batch Delay:</span>
              <span className="font-medium">4-12 seconds</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paused Senders:</span>
              <span className="font-medium">
                {Object.keys(status?.sender.pausedSenders || {}).length || 'None'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Update:</span>
              <span className="font-medium">
                {status?.timestamp ? new Date(status.timestamp).toLocaleTimeString() : 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
