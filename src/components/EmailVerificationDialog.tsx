import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import { Mail } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface EmailVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const EmailVerificationDialog = ({ 
  open, 
  onOpenChange,
  onSuccess
}: EmailVerificationDialogProps) => {
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const { toast } = useToast();

  // Check for existing cooldown on mount
  useEffect(() => {
    const storedCooldown = localStorage.getItem('emailVerificationCooldown');
    if (storedCooldown) {
      const endTime = parseInt(storedCooldown);
      const now = Date.now();
      const remaining = Math.ceil((endTime - now) / 1000);
      
      if (remaining > 0) {
        setCooldown(remaining);
      } else {
        localStorage.removeItem('emailVerificationCooldown');
      }
    }
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => {
        setCooldown(cooldown - 1);
        if (cooldown - 1 === 0) {
          localStorage.removeItem('emailVerificationCooldown');
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleSendVerification = async () => {
    setSending(true);
    
    try {
      const result = await apiClient.resendVerificationEmail();
      
      // Backend handles cooldown, use retryAfterMs if present
      if (result.retryAfterMs) {
        const cooldownSeconds = Math.ceil(result.retryAfterMs / 1000);
        const cooldownEndTime = Date.now() + result.retryAfterMs;
        
        localStorage.setItem('emailVerificationCooldown', cooldownEndTime.toString());
        setCooldown(cooldownSeconds);
        
        toast({
          title: "Vänta lite",
          description: result.message || `Vänligen vänta ${cooldownSeconds} sekunder innan du försöker igen.`,
          variant: "destructive",
        });
      } else if (result.sent) {
        toast({
          title: "E-post skickad!",
          description: result.message || "Kontrollera din inkorg för verifieringskoden.",
        });
        
        // Set 60 second cooldown (backend enforces this)
        const cooldownSeconds = 60;
        const cooldownEndTime = Date.now() + (cooldownSeconds * 1000);
        
        localStorage.setItem('emailVerificationCooldown', cooldownEndTime.toString());
        setCooldown(cooldownSeconds);
      }
      
    } catch (error: any) {
      toast({
        title: "Fel",
        description: error.message || "Kunde inte skicka e-post",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      toast({
        title: "Fel",
        description: "Ange en giltig 6-siffrig kod",
        variant: "destructive",
      });
      return;
    }

    setVerifying(true);
    
    try {
      await apiClient.verifyEmail(code);
      
      toast({
        title: "Verifierad!",
        description: "Din e-post har verifierats.",
      });
      
      localStorage.removeItem('emailVerificationCooldown');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Fel",
        description: error.message || "Felaktig verifieringskod",
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Verifiera din e-post</DialogTitle>
          <DialogDescription className="text-center">
            Ange den 6-ställiga verifieringskod som skickats till din e-post.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 mt-4">
          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(value) => setCode(value.replace(/\s/g, '').toUpperCase())}
              pattern="^[A-Za-z0-9]+$"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          
          <Button
            onClick={handleVerifyCode}
            disabled={verifying || code.length !== 6}
            className="w-full"
          >
            {verifying ? "Verifierar..." : "Verifiera"}
          </Button>
          
          <Button
            onClick={handleSendVerification}
            disabled={sending || cooldown > 0}
            variant="outline"
            className="w-full"
          >
            {sending ? (
              "Skickar..."
            ) : cooldown > 0 ? (
              `Vänta ${cooldown}s innan nästa försök`
            ) : (
              "Skicka ny kod"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
