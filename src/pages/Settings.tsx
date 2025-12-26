import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { Trash2, CreditCard, CheckCircle, XCircle, LogOut, Building2, Users, Shield, User, Loader2, Headphones, Calendar, Receipt, ExternalLink, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { SupportCodeDialog } from "@/components/SupportCodeDialog";

// Helper function to format dates cleanly without timezone info
const formatSwedishDate = (dateString: string | undefined) => {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('sv-SE', { 
      day: 'numeric',
      month: 'long', 
      year: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

const Settings = () => {
  const { user, logout, refreshUser } = useAuth();
  const { userPlan, isLoading: planLoading, refreshPlan, enterpriseMembership } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);
  const [showSubscribeDialog, setShowSubscribeDialog] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [showSupportCode, setShowSupportCode] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isDowngrading, setIsDowngrading] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  
  // Preferred name editing
  const [preferredName, setPreferredName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  
  // Enterprise billing info for admin/owner
  const [enterpriseBilling, setEnterpriseBilling] = useState<{
    subscription: {
      id: string;
      status: string;
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      startedAt?: string | null;
      cancelAtPeriodEnd?: boolean;
      cancelAt?: string | null;
      autoChargeEnabled?: boolean;
    } | null;
    latestInvoice: {
      id: string;
      status: string;
      hostedInvoiceUrl?: string;
      amountPaid?: number;
      currency?: string;
      paidAt?: string | null;
    } | null;
  } | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  
  // Check if running on iOS app domain
  const isIosApp = typeof window !== 'undefined' && window.location.hostname === 'io.tivly.se';

  // Initialize preferred name from user data
  useEffect(() => {
    if (user?.preferredName !== undefined) {
      setPreferredName(user.preferredName || '');
    }
  }, [user?.preferredName]);

  // Refresh plan when page loads
  useEffect(() => {
    refreshPlan();
  }, [refreshPlan]);

  // Check if user is enterprise admin/owner
  const isEnterpriseAdminOrOwner = enterpriseMembership?.isMember && 
    (enterpriseMembership.membership?.role === 'admin' || enterpriseMembership.membership?.role === 'owner');
  
  // Load enterprise billing when page loads and user is admin/owner
  const loadEnterpriseBilling = useCallback(async () => {
    if (!enterpriseMembership?.company?.id || !isEnterpriseAdminOrOwner) return;
    
    setIsLoadingBilling(true);
    try {
      const data = await apiClient.getEnterpriseCompanyBillingSubscription(enterpriseMembership.company.id);
      setEnterpriseBilling({
        subscription: data.subscription,
        latestInvoice: data.latestInvoice,
      });
    } catch (error) {
      console.log('[Settings] Could not load enterprise billing:', error);
      setEnterpriseBilling(null);
    } finally {
      setIsLoadingBilling(false);
    }
  }, [enterpriseMembership?.company?.id, isEnterpriseAdminOrOwner]);
  
  useEffect(() => {
    if (isEnterpriseAdminOrOwner) {
      loadEnterpriseBilling();
    }
  }, [isEnterpriseAdminOrOwner, loadEnterpriseBilling]);

  const handleSavePreferredName = async () => {
    setIsSavingName(true);
    try {
      const trimmedName = preferredName.trim();
      await apiClient.updatePreferredName(trimmedName || null);
      await refreshUser();
      toast({
        title: 'Namn sparat',
        description: trimmedName ? `Ditt visningsnamn är nu "${trimmedName}"` : 'Ditt visningsnamn har tagits bort',
      });
    } catch (error: any) {
      console.error('Failed to save preferred name:', error);
      toast({
        title: 'Kunde inte spara namn',
        description: error?.message || 'Ett oväntat fel uppstod',
        variant: 'destructive',
      });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleCancelClick = () => {
    if (userPlan?.plan === 'plus') {
      setShowDowngradeConfirm(true);
    } else {
      setShowCancelConfirm(true);
    }
  };

  const handleDowngradeToStandard = async () => {
    if (!user) return;

    setIsDowngrading(true);
    try {
      await apiClient.downgradeSubscription();
      toast({
        title: "Nedgradering genomförd",
        description: "Du har nu Standard-planen. Dina möten och protokoll är säkra.",
      });
      setShowDowngradeConfirm(false);
      window.location.reload();
    } catch (error) {
      toast({
        title: "Fel",
        description: "Kunde inte nedgradera prenumerationen. Kontakta support.",
        variant: "destructive",
      });
    } finally {
      setIsDowngrading(false);
    }
  };

  const handleCancelSubscription = async (cancelImmediately: boolean = false) => {
    if (!user) return;

    setIsCanceling(true);
    try {
      const result = await apiClient.cancelSubscription(!cancelImmediately);
      const endDate = result.currentPeriodEnd 
        ? formatSwedishDate(result.currentPeriodEnd)
        : null;

      toast({
        title: cancelImmediately ? "Prenumeration avslutad" : "Prenumeration schemalagd för avslut",
        description: endDate
          ? `Din prenumeration avslutas ${endDate}`
          : "Din prenumeration har avslutats.",
      });
      
      setShowCancelConfirm(false);
      setShowDowngradeConfirm(false);
      await refreshPlan();
    } catch (error) {
      toast({
        title: "Fel",
        description: "Kunde inte avsluta prenumerationen. Kontakta support.",
        variant: "destructive",
      });
    } finally {
      setIsCanceling(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    setIsDeletingAccount(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('https://api.tivly.se/account/terminate', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete account');
      }

      toast({
        title: "Konto raderat",
        description: "Ditt konto och all data har raderats permanent. Du loggas ut nu.",
      });

      localStorage.clear();
      sessionStorage.clear();
      setShowDeleteAccountConfirm(false);
      
      setTimeout(() => {
        window.location.href = '/auth';
      }, 1000);
    } catch (error) {
      toast({
        title: "Fel",
        description: "Kunde inte radera kontot. Kontakta support.",
        variant: "destructive",
      });
      setIsDeletingAccount(false);
      setShowDeleteAccountConfirm(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast({
      title: "Utloggad",
      description: "Du har loggats ut framgångsrikt",
    });
    navigate("/auth");
  };

  const getPlanDisplayName = (plan: string) => {
    switch (plan) {
      case 'free':
        return 'Gratis';
      case 'pro':
      case 'standard':
        return 'Tivly Pro';
      case 'plus':
        return 'Tivly Plus';
      case 'unlimited':
        return 'Unlimited';
      case 'enterprise':
        return 'Enterprise';
      default:
        return 'Gratis';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-semibold">Inställningar</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card className="border-border">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base">Profil</CardTitle>
                  <CardDescription className="text-sm truncate">
                    {user?.email}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="preferredName" className="text-sm">Visningsnamn</Label>
                <div className="flex gap-2">
                  <Input
                    id="preferredName"
                    value={preferredName}
                    onChange={(e) => setPreferredName(e.target.value)}
                    placeholder="T.ex. Anna Andersson"
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSavePreferredName}
                    disabled={isSavingName || preferredName === (user?.preferredName || '')}
                    size="default"
                  >
                    {isSavingName ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Spara'
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Används för hälsningar, talaridentifiering (Lyra) och visning i möten
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Enterprise Card */}
          {userPlan?.plan === 'enterprise' && enterpriseMembership?.isMember && (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      <span className="truncate">{enterpriseMembership?.company?.name || 'Enterprise'}</span>
                      <Badge variant="secondary" className="bg-primary/20 text-primary text-xs shrink-0">
                        Enterprise
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-sm truncate">
                      {enterpriseMembership?.membership?.role === 'admin' ? 'Företagsadmin' :
                       enterpriseMembership?.membership?.role === 'owner' ? 'Företagsägare' : 
                       'Teammedlem'}
                      {enterpriseMembership?.membership?.title && ` • ${enterpriseMembership.membership.title}`}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Shield className="w-3 h-3" />
                      Status
                    </div>
                    <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      {enterpriseMembership.membership?.status === 'active' ? 'Aktiv' : 
                       enterpriseMembership.membership?.status || 'Aktiv'}
                    </div>
                  </div>
                  <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Users className="w-3 h-3" />
                      Roll
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {enterpriseMembership.membership?.role === 'admin' ? 'Admin' :
                       enterpriseMembership.membership?.role === 'owner' ? 'Ägare' : 'Medlem'}
                    </div>
                  </div>
                </div>
                
                {enterpriseMembership?.membership?.joinedAt && (
                  <p className="text-xs text-muted-foreground">
                    Medlem sedan {formatSwedishDate(enterpriseMembership.membership.joinedAt)}
                  </p>
                )}
                
                <p className="text-sm text-muted-foreground">
                  Din Enterprise-plan hanteras av din organisation.
                </p>
                <Button 
                  onClick={() => window.location.href = 'mailto:charlie.wretling@tivly.se'}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Kontakta support
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Enterprise Billing Card - Only for admin/owner */}
          {userPlan?.plan === 'enterprise' && isEnterpriseAdminOrOwner && (
            <Card className="border-border">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <CreditCard className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      Företagsfakturering
                      {enterpriseBilling?.subscription?.status === 'active' && (
                        <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-400 text-xs">
                          Aktiv
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Prenumerationsstatus och betalningar
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-3">
                {isLoadingBilling ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : enterpriseBilling?.subscription ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <Receipt className="w-3 h-3" />
                          Status
                        </div>
                        <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            enterpriseBilling.subscription.status === 'active' ? 'bg-green-500' :
                            enterpriseBilling.subscription.status === 'canceled' ? 'bg-red-500' :
                            'bg-yellow-500'
                          }`}></span>
                          {enterpriseBilling.subscription.status === 'active' ? 'Aktiv' :
                           enterpriseBilling.subscription.status === 'canceled' ? 'Avslutad' :
                           enterpriseBilling.subscription.status === 'trialing' ? 'Testperiod' :
                           enterpriseBilling.subscription.status}
                        </div>
                      </div>
                      <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <CreditCard className="w-3 h-3" />
                          Betalning
                        </div>
                        <div className="text-sm font-medium text-foreground">
                          {enterpriseBilling.subscription.autoChargeEnabled ? 'Automatisk' : 'Faktura'}
                        </div>
                      </div>
                    </div>
                    
                    {enterpriseBilling.subscription.startedAt && (
                      <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <Calendar className="w-3 h-3" />
                          Prenumeration startad
                        </div>
                        <div className="text-sm font-medium text-foreground">
                          {formatSwedishDate(enterpriseBilling.subscription.startedAt)}
                        </div>
                      </div>
                    )}
                    
                    {enterpriseBilling.subscription.currentPeriodEnd && (
                      <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <Calendar className="w-3 h-3" />
                          {enterpriseBilling.subscription.cancelAtPeriodEnd ? 'Avslutas' : 'Förnyas'}
                        </div>
                        <div className="text-sm font-medium text-foreground">
                          {formatSwedishDate(enterpriseBilling.subscription.currentPeriodEnd)}
                          {enterpriseBilling.subscription.cancelAtPeriodEnd && (
                            <span className="text-muted-foreground ml-2">(schemalagd avslutning)</span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {enterpriseBilling.latestInvoice && (
                      <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                              <Receipt className="w-3 h-3" />
                              Senaste faktura
                            </div>
                            <div className="text-sm font-medium text-foreground flex items-center gap-2">
                              {enterpriseBilling.latestInvoice.amountPaid !== undefined && (
                                <span>
                                  {(enterpriseBilling.latestInvoice.amountPaid / 100).toLocaleString('sv-SE')} {(enterpriseBilling.latestInvoice.currency || 'sek').toUpperCase()}
                                </span>
                              )}
                              <Badge variant="secondary" className={`text-xs ${
                                enterpriseBilling.latestInvoice.status === 'paid' ? 'bg-green-500/20 text-green-700 dark:text-green-400' :
                                enterpriseBilling.latestInvoice.status === 'open' ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' :
                                'bg-muted text-muted-foreground'
                              }`}>
                                {enterpriseBilling.latestInvoice.status === 'paid' ? 'Betald' :
                                 enterpriseBilling.latestInvoice.status === 'open' ? 'Öppen' :
                                 enterpriseBilling.latestInvoice.status}
                              </Badge>
                            </div>
                            {enterpriseBilling.latestInvoice.paidAt && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Betalad {formatSwedishDate(enterpriseBilling.latestInvoice.paidAt)}
                              </div>
                            )}
                          </div>
                          {enterpriseBilling.latestInvoice.hostedInvoiceUrl && (
                            <a
                              href={enterpriseBilling.latestInvoice.hostedInvoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80 transition-colors p-2"
                            >
                              <ExternalLink className="w-5 h-5" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : enterpriseBilling?.latestInvoice ? (
                  <div className="p-3 bg-background/50 rounded-lg border border-border/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                          <Receipt className="w-3 h-3" />
                          Senaste betalning
                        </div>
                        <div className="text-sm font-medium text-foreground flex items-center gap-2">
                          {enterpriseBilling.latestInvoice.amountPaid !== undefined && (
                            <span>
                              {(enterpriseBilling.latestInvoice.amountPaid / 100).toLocaleString('sv-SE')} {(enterpriseBilling.latestInvoice.currency || 'sek').toUpperCase()}
                            </span>
                          )}
                          <Badge variant="secondary" className={`text-xs ${
                            enterpriseBilling.latestInvoice.status === 'paid' ? 'bg-green-500/20 text-green-700 dark:text-green-400' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {enterpriseBilling.latestInvoice.status === 'paid' ? 'Betald' : enterpriseBilling.latestInvoice.status}
                          </Badge>
                        </div>
                        {enterpriseBilling.latestInvoice.paidAt && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatSwedishDate(enterpriseBilling.latestInvoice.paidAt)}
                          </div>
                        )}
                      </div>
                      {enterpriseBilling.latestInvoice.hostedInvoiceUrl && (
                        <a
                          href={enterpriseBilling.latestInvoice.hostedInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80 transition-colors p-2"
                        >
                          <ExternalLink className="w-5 h-5" />
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Ingen faktureringsinformation tillgänglig
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Billing Card - For non-enterprise users */}
          {userPlan?.plan !== 'enterprise' && userPlan?.plan !== 'unlimited' && (
            <Card className="border-border">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <CreditCard className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base">Din Plan</CardTitle>
                      <CardDescription className="text-sm">Fakturering och prenumeration</CardDescription>
                    </div>
                  </div>
                  <Badge variant={userPlan?.plan === 'free' ? 'secondary' : 'default'} className="shrink-0">
                    {getPlanDisplayName(userPlan?.plan || 'free')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-4">
                {planLoading ? (
                  <div className="text-center py-4 text-muted-foreground">
                    Laddar...
                  </div>
                ) : isIosApp ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/30">
                      <div>
                        <p className="text-xs text-muted-foreground">Möten</p>
                        <p className="text-base font-semibold">
                          {userPlan?.meetingsLimit === null
                            ? `${userPlan?.meetingsUsed || 0} (Obegränsat)`
                            : `${userPlan?.meetingsUsed || 0}/${userPlan?.meetingsLimit || 1}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Status</p>
                        <div className="flex items-center gap-1.5">
                          {userPlan?.plan === 'free' ? (
                            <span className="text-sm font-medium text-muted-foreground">Gratis</span>
                          ) : (
                            <>
                              <span className="w-2 h-2 rounded-full bg-green-500"></span>
                              <span className="text-sm font-medium">Aktiv</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Ändringar av din plan görs på din kontosida på webben.
                    </p>
                  </div>
                ) : (
                  <>
                    {(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (userPlan?.cancelAt || userPlan?.planCancelledAt) && new Date(userPlan.planCancelledAt || userPlan.cancelAt!) > new Date() && (
                      <div className="p-3 border border-orange-500/50 rounded-lg bg-gradient-to-br from-orange-500/10 to-orange-500/5">
                        <div className="flex items-center gap-2">
                          <XCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-orange-800 dark:text-orange-200">
                              Avslutas <strong>{formatSwedishDate(userPlan.planCancelledAt || userPlan.cancelAt)}</strong>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/30">
                      <div>
                        <p className="text-xs text-muted-foreground">Möten</p>
                        <p className="text-base font-semibold">
                          {userPlan?.meetingsLimit === null
                            ? `${userPlan?.meetingsUsed || 0} (Obegränsat)`
                            : `${userPlan?.meetingsUsed || 0}/${userPlan?.meetingsLimit || 1}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Status</p>
                        <div className="flex items-center gap-1.5">
                          {userPlan?.plan === 'free' ? (
                            <span className="text-sm font-medium text-muted-foreground">Gratis</span>
                          ) : (userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) ? (
                            <>
                              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                              <span className="text-sm font-medium text-orange-500">Avslutas</span>
                            </>
                          ) : (
                            <>
                              <span className="w-2 h-2 rounded-full bg-green-500"></span>
                              <span className="text-sm font-medium">Aktiv</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {userPlan?.renewDate && !(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (
                      <p className="text-sm text-muted-foreground">
                        Förnyas: {formatSwedishDate(userPlan.renewDate)}
                      </p>
                    )}

                    <div className="flex gap-3">
                      {userPlan?.plan !== 'free' && (
                        <Button 
                          onClick={handleCancelClick}
                          variant="outline"
                          className="flex-1"
                          disabled={!!(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt)}
                        >
                          {(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) ? 'Schemalagd' : 'Avsluta'}
                        </Button>
                      )}
                      {!(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (
                        <Button 
                          onClick={() => setShowSubscribeDialog(true)}
                          className="flex-1"
                          variant={userPlan?.plan === 'free' ? 'default' : 'outline'}
                        >
                          {userPlan?.plan === 'free' ? 'Uppgradera' : 'Byt plan'}
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Actions Card */}
          <Card className="border-border lg:col-span-2 xl:col-span-1">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base">Kontoåtgärder</CardTitle>
              <CardDescription className="text-sm">Logga ut eller hantera ditt konto</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-3">
              <div className="p-3 border border-border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <LogOut className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium">Logga ut</span>
                  </div>
                  <Button onClick={handleLogout} variant="outline" size="sm">
                    Logga ut
                  </Button>
                </div>
              </div>
              
              <div className="p-3 border border-destructive/50 rounded-lg bg-destructive/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Trash2 className="w-5 h-5 text-destructive" />
                    <span className="font-medium text-destructive">Radera konto</span>
                  </div>
                  <Button onClick={() => setShowDeleteAccountConfirm(true)} variant="destructive" size="sm">
                    Radera
                  </Button>
                </div>
              </div>
              
              <button
                onClick={() => setShowSupportCode(true)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-2"
              >
                <Headphones className="w-4 h-4" />
                <span>Behöver du hjälp? Generera supportkod</span>
              </button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <AlertDialog open={showDowngradeConfirm} onOpenChange={setShowDowngradeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vill du nedgradera till Standard istället?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Istället för att avsluta helt kan du nedgradera till vår <strong>Standard-plan</strong>:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>25 möten per månad</li>
                <li>Obegränsat med protokoll</li>
                <li>All grundläggande funktionalitet</li>
              </ul>
              <p className="text-xs text-muted-foreground">
                Du förlorar tillgång till AI-chatten och andra Plus-funktioner.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel 
              disabled={isDowngrading || isCanceling}
              onClick={() => setShowDowngradeConfirm(false)}
            >
              Behåll Plus
            </AlertDialogCancel>
            <Button
              onClick={() => {
                setShowDowngradeConfirm(false);
                setShowCancelConfirm(true);
              }}
              variant="outline"
              disabled={isDowngrading || isCanceling}
            >
              Avsluta helt
            </Button>
            <AlertDialogAction
              onClick={handleDowngradeToStandard}
              disabled={isDowngrading || isCanceling}
            >
              {isDowngrading ? "Nedgraderar..." : "Nedgradera till Standard"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-xl">
              <XCircle className="w-5 h-5 text-orange-500" />
              När vill du avsluta prenumerationen?
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              Välj när din prenumeration ska avslutas
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-4">
            <button
              onClick={() => handleCancelSubscription(false)}
              disabled={isCanceling}
              className="w-full text-left p-4 border-2 border-border hover:border-primary rounded-lg transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                  <CheckCircle className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-base mb-1">
                    Avsluta vid periodens slut
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Rekommenderat - Du behåller tillgång till alla funktioner
                  </p>
                  {userPlan?.renewDate && (
                    <div className="flex items-center gap-2 text-xs font-medium text-primary">
                      <span>Avslutas {formatSwedishDate(userPlan.renewDate)}</span>
                    </div>
                  )}
                </div>
              </div>
            </button>

            <button
              onClick={() => handleCancelSubscription(true)}
              disabled={isCanceling}
              className="w-full text-left p-4 border-2 border-destructive/30 hover:border-destructive rounded-lg transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0 group-hover:bg-destructive/20 transition-colors">
                  <XCircle className="w-5 h-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-base mb-1">
                    Avsluta omedelbart
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Förlorar tillgång till premiumfunktioner direkt
                  </p>
                  <div className="flex items-center gap-2 text-xs font-medium text-destructive">
                    <span>⚠️ Ingen återbetalning</span>
                  </div>
                </div>
              </div>
            </button>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCanceling}>
              Behåll prenumeration
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteAccountConfirm} onOpenChange={setShowDeleteAccountConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Radera konto permanent?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-semibold">
                Detta kommer att:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Avsluta och ta bort alla dina prenumerationer</li>
                <li>Radera all din data (möten, protokoll, inspelningar)</li>
                <li>Ta bort ditt Stripe-konto och betalningshistorik</li>
                <li>Permanent radera ditt användarkonto</li>
              </ul>
              <p className="text-destructive font-semibold pt-2">
                ⚠️ Denna åtgärd kan INTE ångras. All data kommer att raderas permanent.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingAccount}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={isDeletingAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingAccount ? "Raderar..." : "Ja, radera mitt konto permanent"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SubscribeDialog open={showSubscribeDialog} onOpenChange={setShowSubscribeDialog} />
      <SupportCodeDialog open={showSupportCode} onOpenChange={setShowSupportCode} />
    </div>
  );
};

export default Settings;