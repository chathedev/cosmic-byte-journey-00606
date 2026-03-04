import { CheckCircle, ArrowRight, Shield, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const AdminConsentVerified = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        <Card className="border-0 shadow-2xl overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500" />
          <CardContent className="pt-10 pb-8 px-8 text-center space-y-7">
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center ring-4 ring-green-500/10">
              <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-widest text-primary">Microsoft Entra</span>
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Admin Consent godkänt!
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
                Din organisations IT-administratör har godkänt Tivly. 
                Du kan nu koppla ditt Microsoft-konto och börja importera Teams-transkript automatiskt.
              </p>
            </div>

            <div className="bg-muted/50 rounded-xl p-5 text-left space-y-3 border border-border/50">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground mb-2">Nästa steg</p>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>Öppna <span className="font-medium text-foreground">Integrationer → Microsoft Teams</span> i Tivly</li>
                    <li>Klicka på <span className="font-medium text-foreground">Koppla Microsoft-konto</span></li>
                    <li>Logga in med ditt arbets- eller skolkonto</li>
                    <li>Godkänn behörigheterna som visas</li>
                  </ol>
                </div>
              </div>
            </div>

            <Button
              size="lg"
              className="w-full gap-2 font-semibold"
              onClick={() => {
                window.location.href = "https://app.tivly.se/integrations/teams";
              }}
            >
              Gå till Teams-integrationen
              <ArrowRight className="w-4 h-4" />
            </Button>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Om du fortfarande inte kan koppla kontot, kontakta din IT-avdelning 
              och be dem verifiera att Tivly är godkänd i Microsoft Entra Admin Center.
            </p>
          </CardContent>
        </Card>

        <div className="text-center">
          <a
            href="https://www.tivly.se/for-foretag"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Läs mer om Tivly för företag
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};

export default AdminConsentVerified;
