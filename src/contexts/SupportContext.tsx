import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface SupportSession {
  token: string;
  expiresAt: string;
  userEmail: string;
}

interface SupportContextType {
  isSupportMode: boolean;
  supportSession: SupportSession | null;
  enterSupportMode: (session: SupportSession) => void;
  exitSupportMode: () => void;
  timeRemaining: number | null; // seconds
}

const SupportContext = createContext<SupportContextType | undefined>(undefined);

export const SupportProvider = ({ children }: { children: ReactNode }) => {
  // CRITICAL: Support token stored in memory only - never persisted
  const [supportSession, setSupportSession] = useState<SupportSession | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const isSupportMode = supportSession !== null;

  const enterSupportMode = useCallback((session: SupportSession) => {
    console.log('🔐 [Support] Entering support mode for:', session.userEmail);
    setSupportSession(session);
  }, []);

  const exitSupportMode = useCallback(() => {
    console.log('🔐 [Support] Exiting support mode');
    setSupportSession(null);
    setTimeRemaining(null);
  }, []);

  // Timer countdown effect
  useEffect(() => {
    if (!supportSession) {
      setTimeRemaining(null);
      return;
    }

    const updateTimeRemaining = () => {
      const now = new Date().getTime();
      const expires = new Date(supportSession.expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expires - now) / 1000));
      
      if (remaining <= 0) {
        console.log('🔐 [Support] Session expired automatically');
        exitSupportMode();
        return;
      }
      
      setTimeRemaining(remaining);
    };

    // Initial calculation
    updateTimeRemaining();

    // Update every second
    const interval = setInterval(updateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [supportSession, exitSupportMode]);

  return (
    <SupportContext.Provider value={{
      isSupportMode,
      supportSession,
      enterSupportMode,
      exitSupportMode,
      timeRemaining,
    }}>
      {children}
    </SupportContext.Provider>
  );
};

export const useSupport = () => {
  const context = useContext(SupportContext);
  if (context === undefined) {
    throw new Error('useSupport must be used within SupportProvider');
  }
  return context;
};
