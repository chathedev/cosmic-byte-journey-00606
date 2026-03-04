import { CheckCircle, ArrowRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const AdminConsentVerified = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full border-0 shadow-xl">
        <CardContent className="pt-8 pb-8 px-6 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle className="w-9 h-9 text-green-600 dark:text-green-400" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Admin Consent godkänt
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Din organisations IT-administratör har godkänt Tivly i Microsoft Entra. 
              Du kan nu koppla ditt Microsoft-konto och börja importera Teams-transkript.
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Vad händer nu?</p>
                <ol className="list-decimal list-inside space-y-1.5">
                  <li>Gå till <span className="font-medium text-foreground">Integrationer → Microsoft Teams</span> i Tivly</li>
                  <li>Klicka på <span className="font-medium text-foreground">Koppla Microsoft-konto</span></li>
                  <li>Logga in med ditt arbets- eller skolkonto</li>
                  <li>Godkänn behörigheterna som visas</li>
                </ol>
              </div>
            </div>
          </div>

          <Button
            className="w-full gap-2"
            onClick={() => {
              window.location.href = "https://app.tivly.se/integrations/teams";
            }}
          >
            Gå till Teams-integrationen
            <ArrowRight className="w-4 h-4" />
          </Button>

          <p className="text-xs text-muted-foreground">
            Om du fortfarande inte kan koppla kontot, kontakta din IT-avdelning 
            och be dem verifiera att Tivly är godkänd i Microsoft Entra Admin Center.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminConsentVerified;
