import { useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Users } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { EnterpriseTeamManager } from "@/components/EnterpriseTeamManager";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function OrgSettings() {
  const navigate = useNavigate();
  const { enterpriseMembership } = useSubscription();

  if (!enterpriseMembership?.isMember) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <p className="text-muted-foreground">Du behöver vara enterprise-medlem för att se denna sida.</p>
        </div>
      </div>
    );
  }

  const role = enterpriseMembership.membership?.role;
  const roleName = role === 'owner' ? 'Ägare' : role === 'admin' ? 'Admin' : 'Medlem';

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-semibold">Organisation</h1>
        </div>

        <div className="space-y-8">
          {/* Company Info */}
          <section>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">Företag</h2>
            <div className="flex items-start gap-4 p-4 rounded-xl bg-primary/5 border border-primary/10">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{enterpriseMembership.company?.name || 'Enterprise'}</h3>
                  <Badge variant="secondary" className="bg-primary/20 text-primary text-xs">Enterprise</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {roleName}
                  {enterpriseMembership.membership?.title && ` • ${enterpriseMembership.membership.title}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-sm text-muted-foreground">Aktiv</span>
              </div>
            </div>
          </section>

          <Separator />

          {/* Teams */}
          <section>
            <EnterpriseTeamManager />
          </section>
        </div>
      </div>
    </div>
  );
}
