import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Link2, AlertCircle, FileText, CheckCircle2 } from "lucide-react";

const API_BASE_URL = 'https://api.tivly.se';

export default function AttribrConnect() {
  const [searchParams] = useSearchParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attribrOrgId = searchParams.get("attribrOrgId");
  const returnUrl = searchParams.get("returnUrl");

  const handleConnect = async () => {
    if (!attribrOrgId || !returnUrl) {
      setError("Missing required parameters");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/integrations/attribr/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ attribrOrgId }),
      });

      if (!response.ok) {
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
      setError("Failed to connect. Please try again.");
      setIsConnecting(false);
    }
  };

  // Validate required params
  const hasRequiredParams = attribrOrgId && returnUrl;

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

          {/* Connect button */}
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
