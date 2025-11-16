import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { outreachApi, OutreachStatus } from '@/lib/outreachApi';
import { RefreshCw, Mail, Search, UserX, PlayCircle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AdminOutreach() {
  const [status, setStatus] = useState<OutreachStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [unsubscribeEmail, setUnsubscribeEmail] = useState('');
  const { toast } = useToast();

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await outreachApi.getStatus();
      setStatus(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load status',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const handleTriggerCollect = async () => {
    setActionLoading('collect');
    try {
      const result = await outreachApi.triggerCollect();
      toast({
        title: 'Lead Collection Triggered',
        description: `Discovered: ${result.result.discovered}, Validated: ${result.result.validated}, Added: ${result.result.added}`,
      });
      await loadStatus();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to trigger collection',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTriggerSend = async () => {
    setActionLoading('send');
    try {
      const result = await outreachApi.triggerSend();
      toast({
        title: 'Email Batch Sent',
        description: `Successfully sent ${result.result.sent} emails`,
      });
      await loadStatus();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to trigger send',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnsubscribe = async () => {
    if (!unsubscribeEmail.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an email address',
        variant: 'destructive',
      });
      return;
    }

    setActionLoading('unsubscribe');
    try {
      await outreachApi.unsubscribe(unsubscribeEmail);
      toast({
        title: 'Unsubscribed',
        description: `${unsubscribeEmail} has been unsubscribed`,
      });
      setUnsubscribeEmail('');
      await loadStatus();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to unsubscribe',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = () => {
    if (!status) return 'bg-muted';
    if (!status.withinSendingHours) return 'bg-yellow-500';
    if (Object.keys(status.pausedSenders).length > 0) return 'bg-red-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (!status) return 'Loading...';
    if (!status.withinSendingHours) return 'Outside Sending Hours (06:00-22:00)';
    if (Object.keys(status.pausedSenders).length > 0) return 'Some Senders Paused';
    return 'System Operational';
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">B2B Outreach System</h1>
            <p className="text-muted-foreground mt-1">
              Automated lead discovery and email outreach
            </p>
          </div>
          <Button onClick={loadStatus} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Status Banner */}
        <Alert>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
            <AlertDescription className="font-medium">{getStatusText()}</AlertDescription>
          </div>
        </Alert>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Master Database</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{status?.emailsInMaster || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Verified emails</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Sent Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{status?.emailsSentToday || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Out of 300 daily limit</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{status?.emailsPending || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Ready to send</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Next Send</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium truncate">
                {status?.nextScheduledSend || 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Scheduled time</p>
            </CardContent>
          </Card>
        </div>

        {/* Domain Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Sender Domain Statistics</CardTitle>
            <CardDescription>Daily sending limits per domain (resets at midnight)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {status?.domainSends &&
              Object.entries(status.domainSends).map(([domain, stats]) => {
                const percentage = (stats.sent / stats.limit) * 100;
                const isPaused = status.pausedSenders[domain];

                return (
                  <div key={domain} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{domain}</span>
                        {isPaused && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
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

        {/* Action Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Trigger Lead Collection
              </CardTitle>
              <CardDescription>Manually start discovering new business leads</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleTriggerCollect}
                disabled={actionLoading === 'collect'}
                className="w-full"
              >
                {actionLoading === 'collect' ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Collecting...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Start Collection
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Trigger Email Batch
              </CardTitle>
              <CardDescription>Manually send a batch of emails (respects limits)</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={handleTriggerSend}
                disabled={actionLoading === 'send' || !status?.withinSendingHours}
                className="w-full"
              >
                {actionLoading === 'send' ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <PlayCircle className="mr-2 h-4 w-4" />
                    Send Batch
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Unsubscribe Tool */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5" />
              Unsubscribe Email
            </CardTitle>
            <CardDescription>Manually remove an email address from the outreach list</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="unsubscribe-email">Email Address</Label>
                <Input
                  id="unsubscribe-email"
                  type="email"
                  placeholder="example@company.se"
                  value={unsubscribeEmail}
                  onChange={(e) => setUnsubscribeEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnsubscribe()}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleUnsubscribe}
                  disabled={actionLoading === 'unsubscribe' || !unsubscribeEmail.trim()}
                  variant="destructive"
                >
                  {actionLoading === 'unsubscribe' ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserX className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
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
              <span className="text-muted-foreground">Active Sender Domains:</span>
              <span className="font-medium">
                {status?.activeSenderDomains.join(', ') || 'None'}
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
              <span className="font-medium">45-180 seconds</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paused Senders:</span>
              <span className="font-medium">
                {Object.keys(status?.pausedSenders || {}).length || 'None'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
