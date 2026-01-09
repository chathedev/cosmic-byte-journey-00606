import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Link2, AlertCircle, FileText, CheckCircle2, LogIn } from "lucide-react";
import { apiClient } from "@/lib/api";

const TIVLY_API_BASE_URL = "https://api.tivly.se";
const ATTRIBR_APP_BASE_URL = "https://app.attribr.com"; // Attribr frontend (for returnUrl validation)
const AUTH_HANDOFF_URL = "https://app.tivly.se/auth/handoff";

/**
 * AttribrConnect - Secure Attribr organization connection flow
 *
 * Tivly auth happens via a postMessage handshake:
 * 1. Opens app.tivly.se/auth/handoff as a popup
 * 2. Receives Tivly JWT via postMessage (never in URL)
 * 3. Token stored in memory only
 * 4. On connect, performs a FULL browser navigation to Attribr's returnUrl with ?token=<tivlyToken>
 */

export default function AttribrConnect() {
  const [searchParams] = useSearchParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isWaitingForAuth, setIsWaitingForAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Store tokens in memory only (never in localStorage on connect.tivly.se)
  const tivlyTokenRef = useRef<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  const attribrOrgId = searchParams.get("attribrOrgId");
  const returnUrl = searchParams.get("returnUrl");
  const hasRequiredParams = !!attribrOrgId && !!returnUrl;

  // Handle incoming postMessage from auth handoff popup
  const handleMessage = useCallback((event: MessageEvent) => {
    // Verify origin
    const allowedOrigins = [
      'https://app.tivly.se',
      'https://d6dd0efa-1798-4d07-aaa8-544f61f29b34.lovableproject.com',
    ];

    if (!allowedOrigins.some(o => event.origin === o || event.origin.endsWith('.tivly.se'))) {
      console.log('[AttribrConnect] Ignoring message from:', event.origin);
      return;
    }

    if (event.data?.type === 'tivly-auth' && event.data?.token) {
      console.log('[AttribrConnect] Received Tivly auth token via postMessage');
      tivlyTokenRef.current = event.data.token;
      setIsAuthenticated(true);
      setIsWaitingForAuth(false);

      // Close popup if still open
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    }
  }, []);

  // Set up postMessage listener
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Check if user already has a Tivly token (from previous session on this domain)
  useEffect(() => {
    const checkAuth = async () => {
      // Check if Tivly token was passed via URL (fallback for old flow)
      const urlTivlyAuthToken = searchParams.get('authToken');

      if (urlTivlyAuthToken) {
        tivlyTokenRef.current = urlTivlyAuthToken;
        // Clean URL
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('authToken');
        window.history.replaceState({}, '', cleanUrl.toString());
      }

      // Also check localStorage as fallback (for same-domain case)
      const storedToken = apiClient.getAuthToken();
      if (storedToken && !tivlyTokenRef.current) {
        tivlyTokenRef.current = storedToken;
      }

      if (tivlyTokenRef.current) {
        try {
          // Verify Tivly token is valid by calling /me
          const response = await fetch(`${TIVLY_API_BASE_URL}/me`, {
            headers: { 'Authorization': `Bearer ${tivlyTokenRef.current}` },
          });
          if (response.ok) {
            setIsAuthenticated(true);
          } else {
            tivlyTokenRef.current = null;
          }
        } catch {
          tivlyTokenRef.current = null;
        }
      }

      setIsCheckingAuth(false);
    };

    checkAuth();
  }, [searchParams]);

  const handleLogin = () => {
    setIsWaitingForAuth(true);
    setError(null);

    // Open auth handoff popup
    const width = 450;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      `${AUTH_HANDOFF_URL}?origin=${encodeURIComponent(window.location.origin)}`,
      'tivly-auth-handoff',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );

    if (!popup) {
      setError('Popup blocked. Please allow popups for this site and try again.');
      setIsWaitingForAuth(false);
      return;
    }

    popupRef.current = popup;

    // Monitor popup close
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        if (!tivlyTokenRef.current) {
          setIsWaitingForAuth(false);
        }
      }
    }, 500);
  };

  const handleConnect = async () => {
    if (!attribrOrgId || !returnUrl) {
      setError("Invalid connect request. Please restart the connect flow from Attribr.");
      return;
    }

    if (!tivlyTokenRef.current) {
      setError("Not authenticated with Tivly. Please log in first.");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // IMPORTANT: Full browser navigation back to app.attribr.com so Attribr auth cookies are included.
      const url = new URL(returnUrl);

      if (url.origin !== ATTRIBR_APP_BASE_URL) {
        throw new Error("Invalid returnUrl. Please restart the connect flow from Attribr.");
      }

      url.searchParams.set("token", tivlyTokenRef.current);

      window.location.assign(url.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to continue. Please try again.");
      setIsConnecting(false);
    }
  };

  // Loading state
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Checking authentication...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
            <Link2 className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-semibold">
            Connect to Attribr
          </CardTitle>
          <CardDescription className="text-base">
            {attribrOrgId ? (
              <>Organization <span className="font-medium text-foreground">{attribrOrgId}</span> is requesting access</>
            ) : (
              "An Attribr organization is requesting access"
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Permission explanation */}
          <div className="bg-muted/50 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Meeting Transcripts Access</p>
                <p className="text-sm text-muted-foreground">
                  Your meeting transcripts will be used to draft decisions for this organization.
                </p>
              </div>
            </div>
          </div>

          {/* What this enables */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              This enables
            </p>
            <div className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <span>Automatic decision drafts from your meetings</span>
            </div>
          </div>

          {/* Not authenticated - show login prompt */}
          {!isAuthenticated && (
            <div className="space-y-4">
              <Alert>
                <LogIn className="h-4 w-4" />
                <AlertDescription>
                  Please log in to your Tivly account to connect this organization.
                </AlertDescription>
              </Alert>
              <Button
                onClick={handleLogin}
                className="w-full h-12 text-base font-medium"
                size="lg"
                disabled={!hasRequiredParams || isWaitingForAuth}
              >
                {isWaitingForAuth ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Waiting for login...
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    Log in to Tivly
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Error state */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Missing params error */}
          {!hasRequiredParams && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Invalid request. Missing organization ID or return URL.
              </AlertDescription>
            </Alert>
          )}

          {/* Connect button - only show when authenticated */}
          {isAuthenticated && (
            <Button
              onClick={handleConnect}
              disabled={isConnecting || !hasRequiredParams}
              className="w-full h-12 text-base font-medium"
              size="lg"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 className="w-5 h-5" />
                  Connect Organization
                </>
              )}
            </Button>
          )}

          {/* Cancel link */}
          {returnUrl && (
            <p className="text-center text-sm text-muted-foreground">
              <button
                onClick={() => window.location.href = returnUrl}
                className="underline hover:text-foreground transition-colors"
              >
                Cancel and return to Attribr
              </button>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
