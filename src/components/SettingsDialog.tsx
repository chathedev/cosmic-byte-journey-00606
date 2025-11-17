import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { Trash2, CreditCard, CheckCircle, XCircle, LogOut } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubscribeDialog } from "./SubscribeDialog";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const { user, logout } = useAuth();
  const { userPlan, isLoading: planLoading, refreshPlan } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState(false);
  const [showSubscribeDialog, setShowSubscribeDialog] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isDowngrading, setIsDowngrading] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Refresh plan when dialog opens
  useEffect(() => {
    if (!open) return;
    refreshPlan();
  }, [open, refreshPlan]);


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
        ? new Date(result.currentPeriodEnd).toLocaleDateString('sv-SE', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })
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
      case 'standard':
        return 'Tivly Pro';
      case 'plus':
        return 'Tivly Plus';
      default:
        return 'Gratis testplan';
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Inställningar</DialogTitle>
          </DialogHeader>

          {userPlan?.plan === 'unlimited' || userPlan?.plan === 'enterprise' ? (
            <div className="space-y-4 pt-4">
              {userPlan?.plan === 'enterprise' && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      Enterprise-plan
                    </CardTitle>
                    <CardDescription>
                      Du har en Enterprise-plan som hanteras av din organisation.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      För ändringar av din prenumeration eller fakturering, kontakta din administratör.
                    </p>
                    <Button 
                      onClick={() => window.location.href = 'mailto:charlie.wretling@tivly.se'}
                      variant="outline"
                      className="w-full"
                    >
                      Kontakta administratör
                    </Button>
                  </CardContent>
                </Card>
              )}
              <div className="p-4 border border-border rounded-lg bg-muted/30">
                <div className="flex-1">
                  <h3 className="font-medium flex items-center gap-2">
                    <LogOut className="w-4 h-4" />
                    Logga ut
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Logga ut från ditt konto
                  </p>
                </div>
                <Button 
                  onClick={handleLogout}
                  variant="outline"
                  className="w-full mt-3"
                >
                  Logga ut
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 border border-destructive/50 rounded-lg bg-destructive/5">
                <div className="flex-1">
                  <h3 className="font-medium flex items-center gap-2 text-destructive">
                    <Trash2 className="w-4 h-4" />
                    Radera konto permanent
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Detta raderar ditt konto, avslutar alla prenumerationer, och tar bort all din data permanent. Denna åtgärd kan inte ångras.
                  </p>
                </div>
                <Button 
                  onClick={() => setShowDeleteAccountConfirm(true)} 
                  variant="destructive"
                >
                  Radera konto
                </Button>
              </div>
            </div>
          ) : (
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="general">Generellt</TabsTrigger>
                <TabsTrigger value="billing">Fakturering</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4 pt-4">
                <div className="space-y-4">
                  <div className="p-4 border border-border rounded-lg bg-muted/30">
                    <div className="flex-1">
                      <h3 className="font-medium flex items-center gap-2">
                        <LogOut className="w-4 h-4" />
                        Logga ut
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Logga ut från ditt konto
                      </p>
                    </div>
                    <Button 
                      onClick={handleLogout}
                      variant="outline"
                      className="w-full mt-3"
                    >
                      Logga ut
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-destructive/50 rounded-lg bg-destructive/5">
                    <div className="flex-1">
                      <h3 className="font-medium flex items-center gap-2 text-destructive">
                        <Trash2 className="w-4 h-4" />
                        Radera konto permanent
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Detta raderar ditt konto, avslutar alla prenumerationer, och tar bort all din data permanent. Denna åtgärd kan inte ångras.
                      </p>
                    </div>
                    <Button 
                      onClick={() => setShowDeleteAccountConfirm(true)} 
                      variant="destructive"
                    >
                      Radera konto
                    </Button>
                  </div>
                </div>
              </TabsContent>


              <TabsContent value="billing" className="pt-4">
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <CreditCard className="w-5 h-5" />
                            Din Plan
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Hantera din prenumeration och fakturering
                          </CardDescription>
                        </div>
                        <Badge variant={userPlan?.plan === 'free' ? 'secondary' : 'default'}>
                          {getPlanDisplayName(userPlan?.plan || 'free')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {planLoading ? (
                        <div className="text-center py-4 text-muted-foreground">
                          Laddar...
                        </div>
                      ) : (
                          <>
                            {(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (userPlan?.cancelAt || userPlan?.planCancelledAt) && (
                              <div className="p-4 border-2 border-orange-500/50 rounded-lg bg-gradient-to-br from-orange-500/10 to-orange-500/5 mb-4">
                                <div className="flex items-start gap-3">
                                  <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                                    <XCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">
                                      Prenumeration avslutas
                                    </h4>
                                    <p className="text-sm text-orange-800 dark:text-orange-200">
                                      Din prenumeration avslutas den{' '}
                                      <strong className="font-bold">
                                        {new Date(userPlan.planCancelledAt || userPlan.cancelAt!).toLocaleDateString('sv-SE', { 
                                          year: 'numeric', 
                                          month: 'long', 
                                          day: 'numeric' 
                                        })}
                                      </strong>
                                    </p>
                                    <p className="text-xs text-orange-700 dark:text-orange-300 mt-2">
                                      Du behåller full tillgång till alla funktioner fram till detta datum.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/30">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Möten denna månad</p>
                                <p className="text-lg font-bold">
                                  {userPlan?.plan !== 'free'
                                    ? 'Obegränsad'
                                    : `${userPlan?.meetingsUsed || 0} / ${userPlan?.meetingsLimit || 1}`}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Status</p>
                                <div className="flex items-center gap-1.5">
                                  {userPlan?.plan === 'free' ? (
                                    <>
                                      <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                      <span className="text-xs font-medium">Gratis</span>
                                    </>
                                  ) : (userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) ? (
                                    <>
                                      <XCircle className="w-3.5 h-3.5 text-orange-500" />
                                      <span className="text-xs font-medium text-orange-500">Avslutas snart</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                      <span className="text-xs font-medium">Aktiv</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {userPlan?.renewDate && !(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (
                              <div className="text-sm text-muted-foreground">
                                Nästa förnyelse: {new Date(userPlan.renewDate).toLocaleDateString('sv-SE')}
                              </div>
                            )}

                            <div className="flex gap-2 pt-2">
                              {userPlan?.plan !== 'free' && (
                                <Button 
                                  onClick={handleCancelClick}
                                  variant="outline"
                                  className="flex-1"
                                  disabled={!!(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt)}
                                >
                                  {(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (userPlan?.cancelAt || userPlan?.planCancelledAt)
                                    ? `Avslutas ${new Date(userPlan.planCancelledAt || userPlan.cancelAt!).toLocaleDateString('sv-SE', { 
                                        year: 'numeric', 
                                        month: 'long', 
                                        day: 'numeric' 
                                      })}`
                                    : 'Avsluta prenumeration'
                                  }
                                </Button>
                              )}
                              {!(userPlan?.cancelAtPeriodEnd || userPlan?.planCancelledAt) && (
                                <Button 
                                  onClick={() => setShowSubscribeDialog(true)}
                                  className="flex-1"
                                >
                                  {userPlan?.plan === 'free' ? 'Uppgradera plan' : 'Ändra plan'}
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
                      <span>Avslutas {new Date(userPlan.renewDate).toLocaleDateString('sv-SE', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}</span>
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
