import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, Shield, Mail } from 'lucide-react';
import { apiClient } from '@/lib/api';
import tivlyLogo from '@/assets/tivly-logo.png';

/**
 * AuthHandoff - Secure cross-domain auth handoff via postMessage
 * 
 * This page is opened as a popup from connect.tivly.se and handles:
 * 1. Check if user is already logged in
 * 2. If yes, send token via postMessage immediately
 * 3. If no, show login UI, then send token after successful login
 * 
 * Security:
 * - Origin is verified before sending token
 * - Token is sent via postMessage (not URL)
 * - Popup closes automatically after handoff
 */

const ALLOWED_ORIGINS = [
  'https://connect.tivly.se',
  'https://d6dd0efa-1798-4d07-aaa8-544f61f29b34.lovableproject.com', // Dev preview
];

type HandoffState = 'checking' | 'authenticated' | 'needs-login' | 'logging-in' | 'requesting-code' | 'verifying' | 'success' | 'error';

export default function AuthHandoff() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<HandoffState>('checking');
  const [email, setEmail] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openerOrigin, setOpenerOrigin] = useState<string | null>(null);

  const targetOrigin = searchParams.get('origin');

  // Validate origin on mount
  useEffect(() => {
    if (targetOrigin && ALLOWED_ORIGINS.some(o => targetOrigin.startsWith(o.replace('https://', '')))) {
      setOpenerOrigin(`https://${targetOrigin}`);
    } else if (targetOrigin) {
      // Check if it's a full URL
      try {
        const url = new URL(targetOrigin.startsWith('http') ? targetOrigin : `https://${targetOrigin}`);
        if (ALLOWED_ORIGINS.includes(url.origin) || url.hostname.endsWith('tivly.se') || url.hostname.endsWith('.lovableproject.com')) {
          setOpenerOrigin(url.origin);
        }
      } catch {
        // Invalid URL
      }
    }
  }, [targetOrigin]);

  // Check auth status and handle postMessage handshake
  useEffect(() => {
    const checkAuthAndHandoff = async () => {
      const token = apiClient.getAuthToken();
      
      if (!token) {
        setState('needs-login');
        return;
      }

      try {
        // Verify token is valid
        await apiClient.getMe();
        setState('authenticated');
        
        // Send token to opener
        sendTokenToOpener(token);
      } catch {
        setState('needs-login');
      }
    };

    checkAuthAndHandoff();
  }, []);

  const sendTokenToOpener = (token: string) => {
    if (!window.opener) {
      setError('No opener window found. Please try again from the connect page.');
      setState('error');
      return;
    }

    const origin = openerOrigin || '*';
    
    try {
      window.opener.postMessage(
        { type: 'tivly-auth', token },
        origin
      );
      setState('success');
      
      // Close popup after brief delay
      setTimeout(() => {
        window.close();
      }, 1500);
    } catch (err) {
      console.error('Failed to send token:', err);
      setError('Failed to complete handoff. Please try again.');
      setState('error');
    }
  };

  const handleRequestCode = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setState('requesting-code');
    setError(null);

    try {
      const response = await fetch('https://api.tivly.se/auth/totp/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      if (response.ok) {
        setState('verifying');
      } else {
        setError('Failed to send verification code. Please try again.');
        setState('needs-login');
      }
    } catch {
      setError('Network error. Please try again.');
      setState('needs-login');
    }
  };

  const handleVerifyCode = async () => {
    if (pinCode.length !== 6) return;

    setState('logging-in');
    setError(null);

    try {
      const response = await fetch('https://api.tivly.se/auth/totp/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim().toLowerCase(), token: pinCode }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          apiClient.applyAuthToken(data.token);
          sendTokenToOpener(data.token);
        } else {
          setError('Login succeeded but no token received.');
          setState('error');
        }
      } else {
        setError('Invalid code. Please try again.');
        setPinCode('');
        setState('verifying');
      }
    } catch {
      setError('Network error. Please try again.');
      setState('verifying');
    }
  };

  // Auto-verify when 6 digits entered
  useEffect(() => {
    if (pinCode.length === 6 && state === 'verifying') {
      handleVerifyCode();
    }
  }, [pinCode, state]);

  // Render based on state
  if (state === 'checking') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Checking authentication...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'authenticated' || state === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="text-lg font-medium">Authentication complete</p>
            <p className="text-sm text-muted-foreground">This window will close automatically...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-8 flex flex-col items-center gap-4">
            <p className="text-destructive text-center">{error}</p>
            <Button onClick={() => window.close()}>Close</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-20 h-20">
            <img src={tivlyLogo} alt="Tivly" className="w-full h-full object-contain" />
          </div>
          <CardTitle className="text-xl">Log in to Tivly</CardTitle>
          <CardDescription>
            {state === 'verifying' || state === 'logging-in'
              ? `Enter the 6-digit code sent to ${email}`
              : 'Enter your email to receive a verification code'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg text-center">
              {error}
            </div>
          )}

          {(state === 'needs-login' || state === 'requesting-code') && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={state === 'requesting-code'}
                  onKeyDown={(e) => e.key === 'Enter' && handleRequestCode()}
                />
              </div>
              <Button
                onClick={handleRequestCode}
                disabled={state === 'requesting-code' || !email}
                className="w-full"
              >
                {state === 'requesting-code' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Send verification code
                  </>
                )}
              </Button>
            </>
          )}

          {(state === 'verifying' || state === 'logging-in') && (
            <>
              <div className="space-y-2">
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                  disabled={state === 'logging-in'}
                  className="text-center text-2xl tracking-widest font-mono"
                  autoFocus
                />
              </div>
              {state === 'logging-in' && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </div>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setState('needs-login');
                  setPinCode('');
                }}
                className="w-full"
              >
                Use a different email
              </Button>
            </>
          )}

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-4">
            <Shield className="w-3 h-3" />
            Secure authentication
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
