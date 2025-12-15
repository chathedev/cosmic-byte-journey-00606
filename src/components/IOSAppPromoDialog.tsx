import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Smartphone, Sparkles, Zap, Shield } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { isWebBrowser } from '@/utils/environment';
import appStoreBadge from '@/assets/app-store-badge-black.svg';

const IOS_APP_STORE_URL = 'https://apps.apple.com/se/app/tivly/id6755223770';
const PROMO_DISMISSED_KEY = 'ios_app_promo_dismissed';
const PROMO_SHOW_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days

export const IOSAppPromoDialog = () => {
  const [open, setOpen] = useState(false);
  const { enterpriseMembership, isLoading } = useSubscription();
  
  useEffect(() => {
    // Only show for enterprise users on web
    if (isLoading) return;
    if (!enterpriseMembership) return;
    if (!isWebBrowser()) return;
    
    // Check if dismissed recently
    const dismissedAt = localStorage.getItem(PROMO_DISMISSED_KEY);
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10);
      if (Date.now() - dismissedTime < PROMO_SHOW_INTERVAL) {
        return;
      }
    }
    
    // Show after a short delay
    const timer = setTimeout(() => setOpen(true), 3000);
    return () => clearTimeout(timer);
  }, [enterpriseMembership, isLoading]);
  
  const handleDismiss = () => {
    localStorage.setItem(PROMO_DISMISSED_KEY, Date.now().toString());
    setOpen(false);
  };
  
  const handleDownload = () => {
    window.open(IOS_APP_STORE_URL, '_blank');
    handleDismiss();
  };
  
  if (!enterpriseMembership) return null;
  
  const companyName = enterpriseMembership?.company?.name || 'ditt företag';
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleDismiss()}>
      <DialogContent className="sm:max-w-md bg-gradient-to-br from-background via-background to-primary/5 border-primary/20">
        <DialogHeader className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
            <Smartphone className="w-8 h-8 text-primary-foreground" />
          </div>
          <DialogTitle className="text-xl font-semibold">
            Ladda ner Tivly för iOS
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Som en del av <span className="font-medium text-foreground">{companyName}</span> har du tillgång till vår exklusiva iOS-app!
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Features */}
          <div className="grid gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Snabbare inspelning</p>
                <p className="text-xs text-muted-foreground">Starta mötesinspelning med ett tryck</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Offline-läge</p>
                <p className="text-xs text-muted-foreground">Spela in även utan internet</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Push-notiser</p>
                <p className="text-xs text-muted-foreground">Få meddelanden när protokoll är klara</p>
              </div>
            </div>
          </div>
          
          {/* App Store Badge */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <button 
              onClick={handleDownload}
              className="transition-transform hover:scale-105 active:scale-95"
            >
              <img 
                src={appStoreBadge} 
                alt="Ladda ner i App Store" 
                className="h-12"
              />
            </button>
            <p className="text-xs text-muted-foreground text-center">
              Gratis för alla {companyName}-medarbetare
            </p>
          </div>
        </div>
        
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleDismiss}
          className="w-full text-muted-foreground hover:text-foreground"
        >
          Kanske senare
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default IOSAppPromoDialog;
