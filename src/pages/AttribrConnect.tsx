import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Link2, AlertCircle, FileText, CheckCircle2, LogIn } from "lucide-react";
import { apiClient } from "@/lib/api";

const API_BASE_URL = 'https://api.tivly.se';
const APP_URL = 'https://app.tivly.se';

export default function AttribrConnect() {
  const [searchParams] = useSearchParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attribrOrgId = searchParams.get("attribrOrgId");
  const returnUrl = searchParams.get("returnUrl");

  // Build the current connect URL to use as return destination after login
  const currentConnectUrl = `${window.location.origin}/connect/attribr?attribrOrgId=${encodeURIComponent(attribrOrgId || '')}&returnUrl=${encodeURIComponent(returnUrl || '')}`;

  // Check for authToken in URL (passed from app.tivly.se after login)
  useEffect(() => {
    const urlAuthToken = searchParams.get('authToken');
    if (urlAuthToken) {
      // Store the token from URL and clean up the URL
      apiClient.applyAuthToken(urlAuthToken);
      
      // Remove authToken from URL to keep it clean
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('authToken');
      window.history.replaceState({}, '', cleanUrl.toString());
      
      console.log('[AttribrConnect] Applied auth token from URL');
    }
  }, [searchParams]);

  // Check if user is authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      // First check for token in URL (cross-domain auth)
      const urlAuthToken = searchParams.get('authToken');
      if (urlAuthToken) {
        apiClient.applyAuthToken(urlAuthToken);
      }
      
      const token = apiClient.getAuthToken();
      if (!token) {
        setIsAuthenticated(false);
        setIsCheckingAuth(false);
        return;
      }

      try {
        // Verify token is valid by calling /me
        await apiClient.getMe();
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [searchParams]);

  const handleLogin = () => {
    // Redirect to app.tivly.se auth with return URL back to this connect page
    const authUrl = `${APP_URL}/auth?redirect=${encodeURIComponent(currentConnectUrl)}`;
    window.location.href = authUrl;
  };

  const handleConnect = async () => {
    if (!attribrOrgId || !returnUrl) {
      setError("Missing required parameters");
      return;
    }

    const token = apiClient.getAuthToken();
    if (!token) {
      setError("Not authenticated");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/integrations/attribr/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ attribrOrgId }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setIsAuthenticated(false);
          throw new Error("Session expired. Please log in again.");
        }
        throw new Error("Failed to create token");
      }

      const data = await response.json();

      if (data?.token) {
        // Redirect back to Attribr with the token
        const redirectUrl = new URL(returnUrl);
        redirectUrl.searchParams.set("token", data.token);
        window.location.href = redirectUrl.toString();
      } else {
        throw new Error("No token received");
      }
    } catch (err) {
      console.error("Failed to connect:", err);
      setError(err instanceof Error ? err.message : "Failed to connect. Please try again.");
      setIsConnecting(false);
    }
  };

  // Validate required params
  const hasRequiredParams = attribrOrgId && returnUrl;

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
                disabled={!hasRequiredParams}
              >
                <LogIn className="w-5 h-5" />
                Log in to Tivly
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
