import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Users, 
  BarChart3, 
  TrendingUp, 
  Building2,
  ArrowLeft,
  RefreshCw
} from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface EnterpriseStatsData {
  company: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  scope: {
    type: string;
    memberCount: number;
  };
  viewer: {
    email: string;
    preferredName: string;
    role: string;
  };
  totals: {
    memberCount: number;
    missingMemberCount: number;
    limitedMemberCount: number;
    unlimitedMemberCount: number;
    totalMeetingCount: number;
    totalMeetingLimit: number;
    totalSlotsRemaining: number;
    activeMemberCount: number;
    meetingLimitCoveragePercent: number;
    averageMeetingsPerMember: number;
  };
  scoreboard: Array<{
    email: string;
    preferredName?: string;
    plan: string;
    paymentStatus: string;
    role: string;
    verified: boolean;
    meetingUsage: {
      meetingCount: number;
      meetingLimit: number | null;
      meetingSlotsRemaining: number | null;
      meetingLimitBase: number | null;
      override?: any;
    };
    usagePercent: number | null;
    lastLoginAt?: string;
    lastMeetingAt?: string;
    updatedAt?: string;
    missing?: boolean;
  }>;
}

export default function EnterpriseStats() {
  const navigate = useNavigate();
  const { enterpriseMembership } = useSubscription();
  const [stats, setStats] = useState<EnterpriseStatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const companyId = enterpriseMembership?.company?.id;

  const loadStats = async (showRefresh = false) => {
    if (!companyId) {
      setIsLoading(false);
      return;
    }
    
    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const data = await apiClient.getEnterpriseCompanyStats(companyId);
      setStats(data);
    } catch (err: any) {
      console.error('Failed to load enterprise stats:', err);
      if (err?.message?.includes('companyId')) {
        setError('Företags-ID saknas. Försök ladda om sidan.');
      } else {
        setError('Kunde inte ladda företagsstatistik');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      loadStats();
    } else {
      setIsLoading(false);
    }
  }, [companyId]);

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || '??';
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <Badge variant="outline">Ägare</Badge>;
      case 'admin':
        return <Badge variant="outline">Admin</Badge>;
      default:
        return <Badge variant="outline">Medlem</Badge>;
    }
  };

  const isOwner = enterpriseMembership?.membership?.role === 'owner';

  if (!enterpriseMembership?.isMember || !isOwner) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Ingen tillgång</h2>
            <p className="text-muted-foreground text-sm mb-4">
              {!enterpriseMembership?.isMember 
                ? "Du måste vara medlem i ett Enterprise-företag för att se denna sida."
                : "Endast företagsägare har tillgång till översikten."}
            </p>
            <Button onClick={() => navigate('/')} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate('/')}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Översikt
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {isLoading ? (
                  <Skeleton className="h-4 w-32" />
                ) : (
                  stats?.company?.name || enterpriseMembership?.company?.name
                )}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadStats(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Uppdatera
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-5 pb-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-7 w-12" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                    <Users className="h-3.5 w-3.5" />
                    <span>Medlemmar</span>
                  </div>
                  <div className="text-2xl font-semibold text-foreground">
                    {stats?.totals?.memberCount ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {stats?.totals?.activeMemberCount ?? 0} aktiva
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>Möten</span>
                  </div>
                  <div className="text-2xl font-semibold text-foreground">
                    {stats?.totals?.totalMeetingCount ?? 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Totalt
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>Snitt</span>
                  </div>
                  <div className="text-2xl font-semibold text-foreground">
                    {Math.round(stats?.totals?.averageMeetingsPerMember ?? 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Per medlem
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Scoreboard */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Medlemmar</CardTitle>
            <CardDescription className="text-xs">
              Sorterade efter antal möten
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-10" />
                  </div>
                ))}
              </div>
            ) : stats?.scoreboard?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Inga medlemmar ännu</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6 w-12">#</TableHead>
                      <TableHead>Medlem</TableHead>
                      <TableHead className="hidden sm:table-cell">Roll</TableHead>
                      <TableHead className="text-right pr-6">Möten</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats?.scoreboard?.map((member: any, index: number) => (
                      <TableRow key={member.email}>
                        <TableCell className="pl-6 text-muted-foreground tabular-nums">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                                {getInitials(member.preferredName, member.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {member.preferredName || member.email.split('@')[0]}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {member.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {getRoleBadge(member.role)}
                        </TableCell>
                        <TableCell className="text-right pr-6 tabular-nums font-medium">
                          {member.recordedMeetingCount ?? member.meetingUsage?.totalMeetingCount ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Viewer Info */}
        {!isLoading && stats?.viewer && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Inloggad som {stats.viewer.preferredName || stats.viewer.email}
            {stats.viewer.role && ` · ${stats.viewer.role === 'owner' ? 'Ägare' : stats.viewer.role === 'admin' ? 'Admin' : 'Medlem'}`}
          </p>
        )}
      </div>
    </div>
  );
}