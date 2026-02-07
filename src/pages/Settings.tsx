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
import { Trash2, CheckCircle, XCircle, LogOut, Building2, Loader2, Headphones, ExternalLink, ArrowLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { SupportCodeDialog } from "@/components/SupportCodeDialog";
import { Separator } from "@/components/ui/separator";

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
  
  const [preferredName, setPreferredName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  
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
  
  const isIosApp = typeof window !== 'undefined' && window.location.hostname === 'io.tivly.se';

  useEffect(() => {
    if (user?.preferredName !== undefined) {
      setPreferredName(user.preferredName || '');
    }
  }, [user?.preferredName]);

  useEffect(() => {
    refreshPlan();
  }, [refreshPlan]);

  const isEnterpriseAdminOrOwner = enterpriseMembership?.isMember && 
    (enterpriseMembership.membership?.role === 'admin' || enterpriseMembership.membership?.role === 'owner');
  
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
      case 'free': return 'Gratis';
      case 'pro':
      case 'standard': return 'Tivly Pro';
      case 'plus': return 'Tivly Plus';
      case 'unlimited': return 'Unlimited';
      case 'enterprise': return 'Enterprise';
      default: return 'Gratis';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'canceled': return 'bg-red-500';
      case 'trialing': return 'bg-blue-500';
      default: return 'bg-yellow-500';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-semibold">Inställningar</h1>
        </div>

        <div className="space-y-8">
          {/* Profile Section */}
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">Profil</h2>
            <div className="space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground">E-post</Label>
                <p className="text-base mt-1">{user?.email}</p>
              </div>
              <div>
                <Label htmlFor="preferredName" className="text-sm text-muted-foreground">Visningsnamn</Label>
                <div className="flex gap-3 mt-1">
                  <Input
                    id="preferredName"
                    value={preferredName}
                    onChange={(e) => setPreferredName(e.target.value)}
                    placeholder="T.ex. Anna Andersson"
                    className="max-w-sm"
                  />
                  <Button
                    onClick={handleSavePreferredName}
                    disabled={isSavingName || preferredName === (user?.preferredName || '')}
                    variant="outline"
                  >
                    {isSavingName ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Spara'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Används för hälsningar och talaridentifiering
                </p>
              </div>
            </div>
          </section>

          <Separator />

          {/* Enterprise Section */}
          {userPlan?.plan === 'enterprise' && enterpriseMembership?.isMember && (
            <>
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">Företag</h2>
                <div className="flex items-start gap-4 p-4 rounded-xl bg-primary/5 border border-primary/10">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{enterpriseMembership?.company?.name || 'Enterprise'}</h3>
                      <Badge variant="secondary" className="bg-primary/20 text-primary text-xs">Enterprise</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {enterpriseMembership?.membership?.role === 'admin' ? 'Admin' :
                       enterpriseMembership?.membership?.role === 'owner' ? 'Ägare' : 'Medlem'}
                      {enterpriseMembership?.membership?.title && ` • ${enterpriseMembership.membership.title}`}
                    </p>
                    {enterpriseMembership?.membership?.joinedAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Medlem sedan {formatSwedishDate(enterpriseMembership.membership.joinedAt)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-sm text-muted-foreground">Aktiv</span>
                  </div>
                </div>

                {/* Enterprise Billing for admin/owner */}
                {isEnterpriseAdminOrOwner && (
                  <div className="mt-4 space-y-3">
                    <h3 className="text-sm font-medium">Fakturering</h3>
                    {isLoadingBilling ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Laddar faktureringsinformation...
                      </div>
                    ) : enterpriseBilling?.subscription ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between py-2">
                          <span className="text-sm text-muted-foreground">Status</span>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${getStatusColor(enterpriseBilling.subscription.status)}`}></span>
                            <span className="text-sm font-medium">
                              {enterpriseBilling.subscription.status === 'active' ? 'Aktiv' :
                               enterpriseBilling.subscription.status === 'canceled' ? 'Avslutad' :
                               enterpriseBilling.subscription.status === 'trialing' ? 'Testperiod' :
                               enterpriseBilling.subscription.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <span className="text-sm text-muted-foreground">Betalningsmetod</span>
                          <span className="text-sm">{enterpriseBilling.subscription.autoChargeEnabled ? 'Automatisk' : 'Faktura'}</span>
                        </div>
                        {enterpriseBilling.subscription.startedAt && (
                          <div className="flex items-center justify-between py-2">
                            <span className="text-sm text-muted-foreground">Startad</span>
                            <span className="text-sm">{formatSwedishDate(enterpriseBilling.subscription.startedAt)}</span>
                          </div>
                        )}
                        {enterpriseBilling.subscription.currentPeriodEnd && (
                          <div className="flex items-center justify-between py-2">
                            <span className="text-sm text-muted-foreground">
                              {enterpriseBilling.subscription.cancelAtPeriodEnd ? 'Avslutas' : 'Förnyas'}
                            </span>
                            <span className="text-sm">{formatSwedishDate(enterpriseBilling.subscription.currentPeriodEnd)}</span>
                          </div>
                        )}
                        {enterpriseBilling.latestInvoice && (
                          <div className="flex items-center justify-between py-2">
                            <span className="text-sm text-muted-foreground">Senaste faktura</span>
                            <div className="flex items-center gap-2">
                              {enterpriseBilling.latestInvoice.amountPaid !== undefined && (
                                <span className="text-sm">
                                  {(enterpriseBilling.latestInvoice.amountPaid / 100).toLocaleString('sv-SE')} {(enterpriseBilling.latestInvoice.currency || 'sek').toUpperCase()}
                                </span>
                              )}
                              <Badge variant="secondary" className={`text-xs ${
                                enterpriseBilling.latestInvoice.status === 'paid' ? 'bg-green-500/20 text-green-700 dark:text-green-400' :
                                enterpriseBilling.latestInvoice.status === 'open' ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' :
                                'bg-muted'
                              }`}>
                                {enterpriseBilling.latestInvoice.status === 'paid' ? 'Betald' :
                                 enterpriseBilling.latestInvoice.status === 'open' ? 'Öppen' :
                                 enterpriseBilling.latestInvoice.status}
                              </Badge>
                              {enterpriseBilling.latestInvoice.hostedInvoiceUrl && (
                                <a
                                  href={enterpriseBilling.latestInvoice.hostedInvoiceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:text-primary/80 transition-colors"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Ingen faktureringsinformation tillgänglig</p>
                    )}
                  </div>
                )}
              </section>
              <Separator />
            </>
          )}

          {/* Plan Section - For non-enterprise users */}
          {userPlan?.plan !== 'enterprise' && userPlan?.plan !== 'unlimited' && (
            <>
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">Prenumeration</h2>
                {planLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Laddar...
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{getPlanDisplayName(userPlan?.plan || 'free')}</span>
                          {userPlan?.plan !== 'free' && (
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) ? 'bg-orange-500' : 'bg-green-500'}`}></span>
                              <span className="text-sm text-muted-foreground">
                                {(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) ? 'Avslutas' : 'Aktiv'}
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {userPlan?.meetingsLimit === null
                            ? `${userPlan?.meetingsUsed || 0} möten använda`
                            : `${userPlan?.meetingsUsed || 0} av ${userPlan?.meetingsLimit || 1} möten`}
                        </p>
                      </div>
                      {!isIosApp && !(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (
                        <Button 
                          onClick={() => setShowSubscribeDialog(true)}
                          variant={userPlan?.plan === 'free' ? 'default' : 'outline'}
                          size="sm"
                        >
                          {userPlan?.plan === 'free' ? 'Uppgradera' : 'Byt plan'}
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      )}
                    </div>

                    {(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (userPlan?.cancelAt || userPlan?.planCancelledAt) && new Date(userPlan.planCancelledAt || userPlan.cancelAt!) > new Date() && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                        <XCircle className="w-4 h-4 text-orange-500 shrink-0" />
                        <p className="text-sm">
                          Prenumerationen avslutas {formatSwedishDate(userPlan.planCancelledAt || userPlan.cancelAt)}
                        </p>
                      </div>
                    )}

                    {userPlan?.renewDate && !(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (
                      <p className="text-sm text-muted-foreground">
                        Förnyas {formatSwedishDate(userPlan.renewDate)}
                      </p>
                    )}

                    {!isIosApp && userPlan?.plan !== 'free' && !(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (
                      <Button 
                        onClick={handleCancelClick}
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        Avsluta prenumeration
                      </Button>
                    )}

                    {isIosApp && (
                      <p className="text-sm text-muted-foreground">
                        Ändringar av din plan görs på din kontosida på webben.
                      </p>
                    )}
                  </div>
                )}
              </section>
              <Separator />
            </>
          )}

          {/* Account Section */}
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">Konto</h2>
            <div className="space-y-2">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-between py-3 px-1 text-left hover:bg-muted/50 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <LogOut className="w-5 h-5 text-muted-foreground" />
                  <span>Logga ut</span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              
              <button
                onClick={() => setShowDeleteAccountConfirm(true)}
                className="w-full flex items-center justify-between py-3 px-1 text-left hover:bg-destructive/5 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Trash2 className="w-5 h-5 text-destructive" />
                  <span className="text-destructive">Radera konto</span>
                </div>
                <ChevronRight className="w-4 h-4 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </section>

          <Separator />

          {/* Support Section */}
          <section className="pb-8">
            <button
              onClick={() => setShowSupportCode(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Headphones className="w-4 h-4" />
              <span>Behöver du hjälp? Generera supportkod</span>
            </button>
          </section>
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
