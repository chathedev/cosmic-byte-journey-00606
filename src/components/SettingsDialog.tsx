import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { Trash2, CreditCard, CheckCircle, XCircle, LogOut, Building2, Users, Shield, User, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubscribeDialog } from "./SubscribeDialog";

// Helper function to format dates cleanly without timezone info
const formatSwedishDate = (dateString: string | undefined) => {
  if (!dateString) return '';
  
  try {
    // Parse the date and format it cleanly
    const date = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) return '';
    
    // Format: "21 november 2025"
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

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const { user, logout, refreshUser } = useAuth();
  const { userPlan, isLoading: planLoading, refreshPlan, enterpriseMembership } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);
  const [showSubscribeDialog, setShowSubscribeDialog] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isDowngrading, setIsDowngrading] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  
  // Preferred name editing (enterprise-only)
  const [preferredName, setPreferredName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  
  // Check if running on iOS app domain
  const isIosApp = typeof window !== 'undefined' && window.location.hostname === 'io.tivly.se';

  // Initialize preferred name from user data
  useEffect(() => {
    if (user?.preferredName !== undefined) {
      setPreferredName(user.preferredName || '');
    }
  }, [user?.preferredName]);

  // Refresh plan when dialog opens
  useEffect(() => {
    if (!open) return;
    refreshPlan();
  }, [open, refreshPlan]);

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
    // For Plus plan users, show downgrade option first
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
      // atPeriodEnd: true = cancel at period end (scheduled), false = cancel immediately
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

      // Clear everything and force logout
      localStorage.clear();
      sessionStorage.clear();
      
      // Close dialog and reload to clear all state
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
    onOpenChange(false);
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
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Inställningar</DialogTitle>
          </DialogHeader>

          {userPlan?.plan === 'unlimited' || userPlan?.plan === 'enterprise' ? (
            <div className="space-y-3">
              {/* Profile Card for Enterprise Users */}
              {userPlan?.plan === 'enterprise' && (
                <Card className="border-border">
                  <CardHeader className="p-3 sm:p-4 pb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm sm:text-base">Profil</CardTitle>
                        <CardDescription className="text-xs mt-0.5 truncate">
                          {user?.email}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 pt-2 space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="preferredName" className="text-xs">Visningsnamn</Label>
                      <div className="flex gap-2">
                        <Input
                          id="preferredName"
                          value={preferredName}
                          onChange={(e) => setPreferredName(e.target.value)}
                          placeholder="T.ex. Johan"
                          className="flex-1 h-9 text-sm"
                        />
                        <Button
                          onClick={handleSavePreferredName}
                          disabled={isSavingName || preferredName === (user?.preferredName || '')}
                          size="sm"
                          className="h-9 px-3"
                        >
                          {isSavingName ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Spara'
                          )}
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Används för hälsningar, talaridentifiering (SIS) och visning i möten
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {userPlan?.plan === 'enterprise' && (
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
                  <CardHeader className="p-3 sm:p-4 pb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm sm:text-base flex items-center gap-2 flex-wrap">
                          <span className="truncate">{enterpriseMembership?.company?.name || 'Enterprise'}</span>
                          <Badge variant="secondary" className="bg-primary/20 text-primary text-[10px] shrink-0">
                            Enterprise
                          </Badge>
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5 truncate">
                          {enterpriseMembership?.membership?.role === 'admin' ? 'Företagsadmin' :
                           enterpriseMembership?.membership?.role === 'owner' ? 'Företagsägare' : 
                           'Teammedlem'}
                          {enterpriseMembership?.membership?.title && ` • ${enterpriseMembership.membership.title}`}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 pt-2 space-y-2.5">
                    {enterpriseMembership?.isMember && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 bg-background/50 rounded-md border border-border/50">
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
                            <Shield className="w-2.5 h-2.5" />
                            Status
                          </div>
                          <div className="text-xs font-medium text-foreground flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                            {enterpriseMembership.membership?.status === 'active' ? 'Aktiv' : 
                             enterpriseMembership.membership?.status || 'Aktiv'}
                          </div>
                        </div>
                        <div className="p-2 bg-background/50 rounded-md border border-border/50">
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
                            <Users className="w-2.5 h-2.5" />
                            Roll
                          </div>
                          <div className="text-xs font-medium text-foreground">
                            {enterpriseMembership.membership?.role === 'admin' ? 'Admin' :
                             enterpriseMembership.membership?.role === 'owner' ? 'Ägare' : 'Medlem'}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {enterpriseMembership?.membership?.joinedAt && (
                      <p className="text-[10px] text-muted-foreground">
                        Medlem sedan {formatSwedishDate(enterpriseMembership.membership.joinedAt)}
                      </p>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      Din Enterprise-plan hanteras av din organisation.
                    </p>
                    <Button 
                      onClick={() => window.location.href = 'mailto:charlie.wretling@tivly.se'}
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                    >
                      Kontakta support
                    </Button>
                  </CardContent>
                </Card>
              )}
              <div className="p-3 border border-border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LogOut className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Logga ut</span>
                  </div>
                  <Button onClick={handleLogout} variant="outline" size="sm">
                    Logga ut
                  </Button>
                </div>
              </div>
              <div className="p-3 border border-destructive/50 rounded-lg bg-destructive/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">Radera konto</span>
                  </div>
                  <Button onClick={() => setShowDeleteAccountConfirm(true)} variant="destructive" size="sm">
                    Radera
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-9">
                <TabsTrigger value="general" className="text-xs sm:text-sm">Generellt</TabsTrigger>
                <TabsTrigger value="billing" className="text-xs sm:text-sm">Fakturering</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-3 pt-3">
                <div className="space-y-3">
                  <div className="p-3 border border-border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <LogOut className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Logga ut</span>
                      </div>
                      <Button onClick={handleLogout} variant="outline" size="sm">
                        Logga ut
                      </Button>
                    </div>
                  </div>
                  <div className="p-3 border border-destructive/50 rounded-lg bg-destructive/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Trash2 className="w-4 h-4 text-destructive" />
                        <span className="text-sm font-medium text-destructive">Radera konto</span>
                      </div>
                      <Button onClick={() => setShowDeleteAccountConfirm(true)} variant="destructive" size="sm">
                        Radera
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>


              <TabsContent value="billing" className="pt-3">
                <div className="space-y-3">
                  <Card>
                    <CardHeader className="p-3 sm:p-4 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium truncate">Din Plan</span>
                        </div>
                        <Badge variant={userPlan?.plan === 'free' ? 'secondary' : 'default'} className="shrink-0 text-xs">
                          {getPlanDisplayName(userPlan?.plan || 'free')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 pt-0 space-y-3">
                      {planLoading ? (
                        <div className="text-center py-3 text-muted-foreground text-sm">
                          Laddar...
                        </div>
                      ) : isIosApp ? (
                        // iOS app: Apple-compliant neutral message - no payment buttons/links
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-2.5 border border-border rounded-lg bg-muted/30">
                            <div>
                              <p className="text-[10px] text-muted-foreground">Möten</p>
                              <p className="text-sm font-semibold">
                                {userPlan?.meetingsLimit === null
                                  ? '∞'
                                  : `${userPlan?.meetingsUsed || 0}/${userPlan?.meetingsLimit || 1}`}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-muted-foreground">Status</p>
                              <div className="flex items-center gap-1">
                                {userPlan?.plan === 'free' ? (
                                  <span className="text-xs font-medium text-muted-foreground">Gratis</span>
                                ) : (
                                  <>
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    <span className="text-xs font-medium">Aktiv</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground text-center py-2">
                            Ändringar av din plan görs på din kontosida på webben.
                          </p>
                        </div>
                      ) : (
                          <>
                            {(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (userPlan?.cancelAt || userPlan?.planCancelledAt) && new Date(userPlan.planCancelledAt || userPlan.cancelAt!) > new Date() && (
                              <div className="p-2.5 border border-orange-500/50 rounded-lg bg-gradient-to-br from-orange-500/10 to-orange-500/5">
                                <div className="flex items-center gap-2">
                                  <XCircle className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs text-orange-800 dark:text-orange-200">
                                      Avslutas <strong>{formatSwedishDate(userPlan.planCancelledAt || userPlan.cancelAt)}</strong>
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between p-2.5 border border-border rounded-lg bg-muted/30">
                              <div>
                                <p className="text-[10px] text-muted-foreground">Möten</p>
                                <p className="text-sm font-semibold">
                                  {userPlan?.meetingsLimit === null
                                    ? '∞'
                                    : `${userPlan?.meetingsUsed || 0}/${userPlan?.meetingsLimit || 1}`}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-muted-foreground">Status</p>
                                <div className="flex items-center gap-1">
                                  {userPlan?.plan === 'free' ? (
                                    <span className="text-xs font-medium text-muted-foreground">Gratis</span>
                                  ) : (userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) ? (
                                    <>
                                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                      <span className="text-xs font-medium text-orange-500">Avslutas</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                      <span className="text-xs font-medium">Aktiv</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {userPlan?.renewDate && !(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (
                              <p className="text-xs text-muted-foreground">
                                Förnyas: {formatSwedishDate(userPlan.renewDate)}
                              </p>
                            )}

                            <div className="flex gap-2">
                              {userPlan?.plan !== 'free' && (
                                <Button 
                                  onClick={handleCancelClick}
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 text-xs"
                                  disabled={!!(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt)}
                                >
                                  {(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) ? 'Schemalagd' : 'Avsluta'}
                                </Button>
                              )}
                              {!(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (
                                <Button 
                                  onClick={() => setShowSubscribeDialog(true)}
                                  size="sm"
                                  className="flex-1 text-xs"
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
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

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
            {/* Option 1: Cancel at period end */}
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

            {/* Option 2: Cancel immediately */}
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
    </>
  );
};
