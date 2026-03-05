import { useSubscription, EnterpriseMembership } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Building2, Users, Shield } from "lucide-react";

export const ViewerDashboard = () => {
  const { user } = useAuth();
  const { enterpriseMembership } = useSubscription();

  const company = enterpriseMembership?.company;
  const membership = enterpriseMembership?.membership;

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border flex items-center px-4 gap-3 bg-card shadow-sm">
        <Eye className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Översikt</h1>
        <Badge variant="outline" className="ml-auto text-xs bg-muted/50">
          Läsläge
        </Badge>
      </header>

      <main className="p-6 md:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Welcome */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">
            Välkommen, {(user as any)?.preferredName || user?.email?.split('@')[0] || 'Läsare'}
          </h2>
          <p className="text-muted-foreground text-sm">
            Du har läsbehörighet i {company?.name || 'organisationen'}.
          </p>
        </div>

        {/* Company Info Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="w-4 h-4" />
              Organisation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Företag</p>
                <p className="font-medium">{company?.name || '–'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Plan</p>
                <Badge variant="secondary" className="mt-0.5">
                  {company?.planTier === 'enterprise' ? 'Enterprise' : company?.planTier || '–'}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant={company?.status === 'active' ? 'default' : 'destructive'} className="mt-0.5">
                  {company?.status === 'active' ? 'Aktiv' : company?.status || '–'}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Din roll</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">Läsare</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Read-only notice */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-4">
            <Eye className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Läsbehörighet</p>
              <p className="text-xs text-muted-foreground">
                Som läsare kan du se organisationens teammedlemmar och grundläggande information. 
                Du kan inte skapa möten, redigera protokoll eller ändra inställningar. 
                Kontakta en administratör om du behöver utökad behörighet.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};
