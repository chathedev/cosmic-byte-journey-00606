import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, User, CreditCard, FileText, Calendar, TrendingUp, ExternalLink, DollarSign, RefreshCw } from 'lucide-react';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { format } from 'date-fns';

interface UserData {
  email: string;
  plan: string;
  paymentStatus?: string;
  meetingCount: number;
  meetingLimit?: number | null;
  folderCount?: number;
  createdAt?: string;
  lastLoginAt?: string;
  isVerified?: boolean;
  googleId?: string;
  hasUnlimitedInvite?: boolean;
  unlimitedInviteNote?: string;
  meetingUsage?: {
    meetingCount: number;
    meetingLimit: number | null;
    meetingSlotsRemaining: number | null;
    override?: any;
  };
  overrides?: {
    meeting?: {
      type: 'extra' | 'unlimited';
      extraMeetings?: number;
      expiresAt?: string;
      isActive?: boolean;
    };
  };
  stripe?: {
    hasCustomer: boolean;
    hasSubscription: boolean;
    subscriptionId?: string;
    priceId?: string;
    cancelAtPeriodEnd?: boolean;
    lastSyncAt?: string;
  };
}

interface CostHistoryEntry {
  service: string;
  amountUsd: number;
  description?: string;
  timestamp: string;
}

interface UserCostData {
  totalUsd: number;
  history: CostHistoryEntry[];
}

interface UserDetailDialogProps {
  user: UserData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenStripeDashboard?: (email: string) => void;
}

const API_BASE_URL = "https://api.tivly.se";

export function UserDetailDialog({ user, open, onOpenChange, onOpenStripeDashboard }: UserDetailDialogProps) {
  const [costs, setCosts] = useState<UserCostData | null>(null);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'SEK'>('SEK');
  const { rate, loading: rateLoading } = useExchangeRate('USD', 'SEK');

  useEffect(() => {
    if (open && user?.email) {
      fetchUserCosts(user.email);
    }
  }, [open, user?.email]);

  const fetchUserCosts = async (email: string) => {
    setLoadingCosts(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/ai/costs?userEmail=${encodeURIComponent(email)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        // Check if we got admin data with byUser
        if (data.byUser && data.byUser[email.toLowerCase()]) {
          setCosts(data.byUser[email.toLowerCase()]);
        } else if (data.user) {
          setCosts(data.user);
        } else {
          setCosts({ totalUsd: 0, history: [] });
        }
      } else {
        setCosts({ totalUsd: 0, history: [] });
      }
    } catch (error) {
      console.error('Failed to fetch user costs:', error);
      setCosts({ totalUsd: 0, history: [] });
    } finally {
      setLoadingCosts(false);
    }
  };

  const formatCurrency = (usd: number) => {
    if (currency === 'SEK' && rate) {
      return `${(usd * rate).toFixed(2)} SEK`;
    }
    return `$${usd.toFixed(4)}`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), 'yyyy-MM-dd HH:mm');
    } catch {
      return dateStr;
    }
  };

  if (!user) return null;

  const effectiveLimit = user.meetingUsage?.meetingLimit ?? user.meetingLimit;
  const usedMeetings = user.meetingUsage?.meetingCount ?? user.meetingCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">
                {user.email.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold truncate">{user.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={user.plan === 'free' ? 'outline' : 'default'}>
                  {user.plan}
                </Badge>
                {user.googleId && <Badge variant="secondary">Google</Badge>}
                {user.isVerified && <Badge variant="outline" className="text-green-600">Verified</Badge>}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="costs">AI Costs</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[50vh] mt-4">
            <TabsContent value="overview" className="space-y-4 pr-4">
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Meetings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {usedMeetings}
                      <span className="text-muted-foreground font-normal text-lg">
                        /{effectiveLimit ?? '∞'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Folders
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{user.folderCount ?? 0}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Account Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>{formatDate(user.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Login</span>
                    <span>{formatDate(user.lastLoginAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment Status</span>
                    <Badge variant={user.paymentStatus === 'paid' ? 'default' : 'outline'}>
                      {user.paymentStatus || 'N/A'}
                    </Badge>
                  </div>
                  {user.hasUnlimitedInvite && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unlimited Invite</span>
                      <span className="text-green-600">Yes</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {user.overrides?.meeting?.isActive && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-amber-600">Override Active</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Type</span>
                      <Badge variant="outline">{user.overrides.meeting.type}</Badge>
                    </div>
                    {user.overrides.meeting.extraMeetings && (
                      <div className="flex justify-between">
                        <span>Extra Meetings</span>
                        <span>+{user.overrides.meeting.extraMeetings}</span>
                      </div>
                    )}
                    {user.overrides.meeting.expiresAt && (
                      <div className="flex justify-between">
                        <span>Expires</span>
                        <span>{formatDate(user.overrides.meeting.expiresAt)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="costs" className="space-y-4 pr-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">AI Usage Costs</h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrency(c => c === 'USD' ? 'SEK' : 'USD')}
                  >
                    {currency}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => user?.email && fetchUserCosts(user.email)}
                    disabled={loadingCosts}
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingCosts ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>

              {loadingCosts ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <>
                  <Card className="bg-gradient-to-br from-primary/5 to-accent/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Total AI Cost
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {formatCurrency(costs?.totalUsd || 0)}
                      </div>
                      {currency === 'SEK' && rate && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ${(costs?.totalUsd || 0).toFixed(4)} USD
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {costs?.history && costs.history.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Recent Activity</h4>
                      {costs.history.slice(0, 20).map((entry, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium">{entry.service}</span>
                            {entry.description && (
                              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {entry.description}
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="font-medium">{formatCurrency(entry.amountUsd)}</span>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(entry.timestamp)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No AI usage recorded
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="billing" className="space-y-4 pr-4">
              {user.stripe?.hasCustomer ? (
                <>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Stripe Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Customer</span>
                        <Badge variant="default">Active</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subscription</span>
                        <Badge variant={user.stripe.hasSubscription ? 'default' : 'outline'}>
                          {user.stripe.hasSubscription ? 'Active' : 'None'}
                        </Badge>
                      </div>
                      {user.stripe.subscriptionId && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subscription ID</span>
                          <span className="font-mono text-xs">{user.stripe.subscriptionId.slice(-8)}</span>
                        </div>
                      )}
                      {user.stripe.cancelAtPeriodEnd && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cancels At Period End</span>
                          <Badge variant="destructive">Yes</Badge>
                        </div>
                      )}
                      {user.stripe.lastSyncAt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last Sync</span>
                          <span>{formatDate(user.stripe.lastSyncAt)}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {onOpenStripeDashboard && (
                    <Button
                      className="w-full"
                      onClick={() => onOpenStripeDashboard(user.email)}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Stripe Dashboard
                    </Button>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No Stripe customer record</p>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
