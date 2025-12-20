import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, User, CreditCard, FileText, Calendar, TrendingUp, ExternalLink, DollarSign, RefreshCw, FolderOpen, Building2 } from 'lucide-react';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { apiClient } from '@/lib/api';
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
  preferredName?: string;
  totalMeetingCount?: number;
  meetingUsage?: {
    meetingCount: number;
    meetingLimit: number | null;
    meetingSlotsRemaining: number | null;
    totalMeetingCount?: number;
    lastResetAt?: string;
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
  enterprise?: {
    companyId: string;
    companyName: string;
    role: string;
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
  user: { email: string; plan?: string; meetingCount?: number } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenStripeDashboard?: (email: string) => void;
}

const API_BASE_URL = "https://api.tivly.se";

export function UserDetailDialog({ user, open, onOpenChange, onOpenStripeDashboard }: UserDetailDialogProps) {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [costs, setCosts] = useState<UserCostData | null>(null);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'SEK'>('SEK');
  const { rate, loading: rateLoading } = useExchangeRate('USD', 'SEK');

  useEffect(() => {
    if (open && user?.email) {
      fetchUserDetails(user.email);
      fetchUserCosts(user.email);
    } else {
      setUserData(null);
      setCosts(null);
    }
  }, [open, user?.email]);

  const fetchUserDetails = async (email: string) => {
    setLoadingUser(true);
    try {
      const response = await apiClient.getAdminUserDetail(email);
      // Handle the nested response structure: { user: {...}, summary: {...} }
      const data = response.user || response;
      const summary = response.summary || {};
      
      // Get total meeting count from meetingUsage.totalMeetingCount
      const totalMeetings = data.meetingUsage?.totalMeetingCount ?? 
                            summary.meetingUsage?.totalMeetingCount ?? 
                            summary.meetingUsage?.actualMeetingCount ??
                            data.meetings?.length ?? 0;
      
      const normalized: UserData = {
        email: data.email || email,
        plan: data.plan || summary.plan || user?.plan || 'free',
        paymentStatus: data.paymentStatus || summary.paymentStatus,
        meetingCount: data.meetingCount ?? summary.meetingCount ?? 0,
        meetingLimit: data.meetingLimit ?? summary.meetingLimit ?? null,
        folderCount: data.folders?.length ?? summary.folderCount ?? 0,
        createdAt: data.createdAt,
        lastLoginAt: data.lastLoginAt,
        isVerified: data.isVerified ?? true,
        googleId: data.googleId,
        hasUnlimitedInvite: summary.hasUnlimitedInvite || !!data.unlimitedInvite,
        unlimitedInviteNote: summary.unlimitedInviteNote,
        preferredName: data.preferredName,
        totalMeetingCount: totalMeetings,
        meetingUsage: data.meetingUsage || summary.meetingUsage || {
          meetingCount: data.meetingCount ?? 0,
          meetingLimit: data.meetingLimit ?? null,
          meetingSlotsRemaining: null,
          totalMeetingCount: totalMeetings,
        },
        overrides: summary.overrides || data.overrides,
        stripe: summary.stripe || data.stripe,
        enterprise: data.enterprise,
      };
      setUserData(normalized);
    } catch (error) {
      console.error('Failed to fetch user details:', error);
      setUserData({
        email: user?.email || '',
        plan: user?.plan || 'enterprise',
        meetingCount: user?.meetingCount ?? 0,
        meetingLimit: null,
      });
    } finally {
      setLoadingUser(false);
    }
  };

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

  const displayData = userData || {
    email: user.email,
    plan: user.plan || 'enterprise',
    meetingCount: user.meetingCount ?? 0,
    meetingLimit: null,
  };

  const effectiveLimit = displayData.meetingUsage?.meetingLimit ?? displayData.meetingLimit;
  const usedMeetings = displayData.meetingUsage?.meetingCount ?? displayData.meetingCount;
  const totalMeetings = displayData.meetingUsage?.totalMeetingCount ?? displayData.totalMeetingCount ?? usedMeetings;
  
  // Check if user has unlimited access (enterprise, unlimited plan, or null limit)
  const isUnlimitedPlan = displayData.plan === 'enterprise' || displayData.plan === 'unlimited' || effectiveLimit === null;

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
                {loadingUser ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Badge variant={displayData.plan === 'free' ? 'outline' : 'default'}>
                      {displayData.plan}
                    </Badge>
                    {displayData.googleId && <Badge variant="secondary">Google</Badge>}
                    {displayData.isVerified && <Badge variant="outline" className="text-green-600">Verifierad</Badge>}
                  </>
                )}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Översikt</TabsTrigger>
            <TabsTrigger value="costs">AI-kostnader</TabsTrigger>
            <TabsTrigger value="billing">Fakturering</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[50vh] mt-4">
            <TabsContent value="overview" className="space-y-4 pr-4">
              {loadingUser ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Möten (totalt)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {totalMeetings}
                          {isUnlimitedPlan && (
                            <span className="text-muted-foreground font-normal text-sm ml-2">
                              Obegränsat
                            </span>
                          )}
                        </div>
                        {usedMeetings !== totalMeetings && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {usedMeetings} denna period
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <FolderOpen className="h-4 w-4" />
                          Mappar
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{displayData.folderCount ?? 0}</div>
                      </CardContent>
                    </Card>
                  </div>

                  {displayData.enterprise && (
                    <Card className="bg-primary/5 border-primary/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Enterprise
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Företag</span>
                          <span className="font-medium">{displayData.enterprise.companyName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Roll</span>
                          <Badge variant="outline">{displayData.enterprise.role}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Kontodetaljer</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Skapad</span>
                        <span>{formatDate(displayData.createdAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Senast inloggad</span>
                        <span>{formatDate(displayData.lastLoginAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Betalningsstatus</span>
                        <Badge variant={displayData.paymentStatus === 'paid' ? 'default' : 'outline'}>
                          {displayData.paymentStatus === 'paid' ? 'Betald' : displayData.paymentStatus || 'Ej tillgänglig'}
                        </Badge>
                      </div>
                      {displayData.hasUnlimitedInvite && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Obegränsad inbjudan</span>
                          <span className="text-green-600">Ja</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {displayData.overrides?.meeting?.isActive && (
                    <Card className="border-amber-500/30 bg-amber-500/5">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-amber-600">Override aktiv</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span>Typ</span>
                          <Badge variant="outline">{displayData.overrides.meeting.type}</Badge>
                        </div>
                        {displayData.overrides.meeting.extraMeetings && (
                          <div className="flex justify-between">
                            <span>Extra möten</span>
                            <span>+{displayData.overrides.meeting.extraMeetings}</span>
                          </div>
                        )}
                        {displayData.overrides.meeting.expiresAt && (
                          <div className="flex justify-between">
                            <span>Utgår</span>
                            <span>{formatDate(displayData.overrides.meeting.expiresAt)}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="costs" className="space-y-4 pr-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">AI-användningskostnader</h3>
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
                        Total AI-kostnad
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
                      <h4 className="text-sm font-medium">Senaste aktivitet</h4>
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
                      Ingen AI-användning registrerad
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="billing" className="space-y-4 pr-4">
              {loadingUser ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : displayData.stripe?.hasCustomer ? (
                <>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Stripe-status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Kund</span>
                        <Badge variant="default">Aktiv</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Prenumeration</span>
                        <Badge variant={displayData.stripe.hasSubscription ? 'default' : 'outline'}>
                          {displayData.stripe.hasSubscription ? 'Aktiv' : 'Ingen'}
                        </Badge>
                      </div>
                      {displayData.stripe.subscriptionId && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Prenumerations-ID</span>
                          <span className="font-mono text-xs">{displayData.stripe.subscriptionId.slice(-8)}</span>
                        </div>
                      )}
                      {displayData.stripe.cancelAtPeriodEnd && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Avslutas vid periodens slut</span>
                          <Badge variant="destructive">Ja</Badge>
                        </div>
                      )}
                      {displayData.stripe.lastSyncAt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Senast synkad</span>
                          <span>{formatDate(displayData.stripe.lastSyncAt)}</span>
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
                      Öppna Stripe Dashboard
                    </Button>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Ingen Stripe-kundpost</p>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
