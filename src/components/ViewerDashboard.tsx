import { useState, useEffect, useCallback } from "react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Building2, Users, Shield, Crown, User, Mail, BarChart3, Loader2, FileText } from "lucide-react";

interface TeamMember {
  email: string;
  preferredName?: string;
  role: string;
  verified: boolean;
  meetingUsage: {
    meetingCount: number;
    meetingLimit: number | null;
  };
  lastLoginAt?: string;
  lastMeetingAt?: string;
}

interface TeamStats {
  memberCount: number;
  totalMeetingCount: number;
  activeMemberCount: number;
  averageMeetingsPerMember: number;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Ägare",
  admin: "Admin",
  member: "Medlem",
  viewer: "Läsare",
};

const ROLE_ICON: Record<string, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: User,
  viewer: Eye,
};

export const ViewerDashboard = () => {
  const { user } = useAuth();
  const { enterpriseMembership } = useSubscription();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [loading, setLoading] = useState(true);

  const company = enterpriseMembership?.company;
  const companyId = company?.id;

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await apiClient.getEnterpriseCompanyStats(companyId);
      setStats(data.totals);
      setMembers(
        (data.scoreboard || [])
          .filter((m: any) => m.role !== "viewer")
          .map((m: any) => ({
            email: m.email,
            preferredName: m.preferredName,
            role: m.role,
            verified: m.verified,
            meetingUsage: m.meetingUsage || { meetingCount: 0, meetingLimit: null },
            lastLoginAt: m.lastLoginAt,
            lastMeetingAt: m.lastMeetingAt,
          }))
      );
    } catch (err) {
      // Fallback: try members endpoint
      try {
        const data = await apiClient.getEnterpriseMembers(companyId);
        setMembers(
          (data.members || [])
            .filter((m: any) => m.role !== "viewer")
            .map((m: any) => ({
              email: m.email,
              preferredName: m.preferredName,
              role: m.role,
              verified: m.verified !== false,
              meetingUsage: { meetingCount: 0, meetingLimit: null },
              lastLoginAt: m.lastLoginAt,
            }))
        );
      } catch {
        // silent
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "–";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("sv-SE", { month: "short", day: "numeric" });
    } catch {
      return "–";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border flex items-center px-4 gap-3 bg-card shadow-sm">
        <Building2 className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{company?.name || "Organisation"}</h1>
        <Badge variant="outline" className="ml-auto text-xs bg-muted/50 gap-1">
          <Eye className="w-3 h-3" />
          Läsläge
        </Badge>
      </header>

      <main className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 animate-fade-in">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Medlemmar</p>
              </div>
              <p className="text-2xl font-bold">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : stats?.memberCount ?? members.length}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Totala möten</p>
              </div>
              <p className="text-2xl font-bold">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : stats?.totalMeetingCount ?? "–"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Snitt/medlem</p>
              </div>
              <p className="text-2xl font-bold">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : stats?.averageMeetingsPerMember !== undefined ? (
                  stats.averageMeetingsPerMember.toFixed(1)
                ) : (
                  "–"
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Status</p>
              </div>
              <Badge
                variant={company?.status === "active" ? "default" : "destructive"}
                className="mt-1"
              >
                {company?.status === "active" ? "Aktiv" : company?.status || "–"}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Team List */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4" />
              Teammedlemmar
              {!loading && (
                <span className="text-xs text-muted-foreground font-normal">
                  ({members.length})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {loading ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Inga teammedlemmar att visa.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* Table header */}
                <div className="hidden md:grid grid-cols-[1fr_100px_80px_80px] gap-2 px-4 py-2 text-[11px] text-muted-foreground font-medium uppercase tracking-wide bg-muted/30">
                  <span>Medlem</span>
                  <span className="text-right">Möten</span>
                  <span className="text-right">Roll</span>
                  <span className="text-right">Senast aktiv</span>
                </div>

                {members.map((member) => {
                  const RoleIcon = ROLE_ICON[member.role] || User;
                  return (
                    <div
                      key={member.email}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors md:grid md:grid-cols-[1fr_100px_80px_80px] md:gap-2"
                    >
                      {/* Member info */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-primary uppercase">
                            {(member.preferredName || member.email).charAt(0)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {member.preferredName || member.email.split("@")[0]}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                            <Mail className="w-2.5 h-2.5 shrink-0" />
                            {member.email}
                          </p>
                        </div>
                      </div>

                      {/* Meeting count */}
                      <div className="text-right shrink-0">
                        <span className="text-sm font-semibold tabular-nums">
                          {member.meetingUsage.meetingCount}
                        </span>
                        {member.meetingUsage.meetingLimit !== null && (
                          <span className="text-[11px] text-muted-foreground">
                            /{member.meetingUsage.meetingLimit}
                          </span>
                        )}
                      </div>

                      {/* Role */}
                      <div className="text-right shrink-0 hidden md:block">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                          <RoleIcon className="w-2.5 h-2.5" />
                          {ROLE_LABEL[member.role] || member.role}
                        </Badge>
                      </div>

                      {/* Last active */}
                      <div className="text-right shrink-0 hidden md:block">
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(member.lastLoginAt || member.lastMeetingAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-4">
            <Eye className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Läsbehörighet</p>
              <p className="text-xs text-muted-foreground">
                Du ser teamets aktivitet och medlemmar. Kontakta en administratör om du behöver
                utökad behörighet.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};
