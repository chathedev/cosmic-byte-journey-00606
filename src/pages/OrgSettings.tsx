import { useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Users, Link2, Settings2, Lock } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { EnterpriseTeamManager } from "@/components/EnterpriseTeamManager";
import { MemberRoleManager } from "@/components/MemberRoleManager";
import { OrgTeamsInsights } from "@/components/OrgTeamsInsights";
import { OrgZoomInsights } from "@/components/OrgZoomInsights";
import { OrgGoogleMeetInsights } from "@/components/OrgGoogleMeetInsights";
import { OrgSlackInsights } from "@/components/OrgSlackInsights";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import teamsLogo from "@/assets/teams-logo.png";
import zoomLogo from "@/assets/zoom-logo.png";
import googleMeetLogo from "@/assets/google-meet-logo.png";
import slackLogo from "@/assets/slack-logo.png";

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
  const roleName = role === 'owner' ? 'Ägare' : role === 'admin' ? 'Admin' : role === 'viewer' ? 'Läsare' : 'Medlem';
  const isAdminOrOwner = role === 'owner' || role === 'admin';
  const isViewerRole = role === 'viewer';
  const companyId = enterpriseMembership.company?.id;
  const planTier = enterpriseMembership.company?.planTier;
  const planType = enterpriseMembership.company?.planType;
  const isEnterprisePlan = planTier === 'enterprise' && planType !== 'enterprise_small';
  const defaultIntegrationTab = isEnterprisePlan ? 'teams' : 'zoom';

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold">Organisation</h1>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {enterpriseMembership.company?.name || 'Enterprise'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="bg-primary/15 text-primary text-xs gap-1">
              <Building2 className="w-3 h-3" />
              {roleName}
            </Badge>
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="team" className="w-full">
          <TabsList className="w-full justify-start bg-muted/50 border border-border rounded-xl p-1 h-auto flex-wrap gap-1">
            <TabsTrigger value="team" className="rounded-lg gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Users className="w-3.5 h-3.5" />
              <span>Team</span>
            </TabsTrigger>
            {isAdminOrOwner && (
              <TabsTrigger value="invite" className="rounded-lg gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Settings2 className="w-3.5 h-3.5" />
                <span>Medlemmar</span>
              </TabsTrigger>
            )}
            {isAdminOrOwner && companyId && (
              <TabsTrigger value="integrations" className="rounded-lg gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Link2 className="w-3.5 h-3.5" />
                <span>Integrationer</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* Team tab */}
          <TabsContent value="team" className="mt-6 space-y-6">
            <EnterpriseTeamManager />
          </TabsContent>

          {/* Invite tab */}
          {isAdminOrOwner && (
            <TabsContent value="invite" className="mt-6 space-y-6">
              <MemberRoleManager />
            </TabsContent>
          )}

          {/* Integrations tab */}
          {isAdminOrOwner && companyId && (
            <TabsContent value="integrations" className="mt-6 space-y-6">
              {/* Sub-tabs for each integration */}
              <Tabs defaultValue={defaultIntegrationTab} className="w-full">
                <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none p-0 h-auto gap-0">
                  {isEnterprisePlan && (
                    <TabsTrigger
                      value="teams"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 gap-2 text-xs sm:text-sm"
                    >
                      <img src={teamsLogo} alt="" className="w-4 h-4 object-contain" />
                      Teams
                    </TabsTrigger>
                  )}
                  <TabsTrigger
                    value="zoom"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 gap-2 text-xs sm:text-sm"
                  >
                    <img src={zoomLogo} alt="" className="w-4 h-4 object-contain" />
                    Zoom
                  </TabsTrigger>
                  <TabsTrigger
                    value="google-meet"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 gap-2 text-xs sm:text-sm"
                  >
                    <img src={googleMeetLogo} alt="" className="w-4 h-4 object-contain" />
                    Google Meet
                  </TabsTrigger>
                  <TabsTrigger
                    value="slack"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 gap-2 text-xs sm:text-sm"
                  >
                    <img src={slackLogo} alt="" className="w-5 h-5 object-contain" />
                    Slack
                  </TabsTrigger>
                </TabsList>

                {isEnterprisePlan && (
                  <TabsContent value="teams" className="mt-4">
                    <OrgTeamsInsights companyId={companyId} />
                  </TabsContent>
                )}
                <TabsContent value="zoom" className="mt-4">
                  <OrgZoomInsights companyId={companyId} />
                </TabsContent>
                <TabsContent value="google-meet" className="mt-4">
                  <OrgGoogleMeetInsights companyId={companyId} />
                </TabsContent>
                <TabsContent value="slack" className="mt-4">
                  <OrgSlackInsights companyId={companyId} />
                </TabsContent>
              </Tabs>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
