import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Users, 
  BarChart3, 
  TrendingUp, 
  Crown,
  Building2,
  ArrowLeft,
  RefreshCw,
  Infinity
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
      // Handle "companyId is not defined" error gracefully
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

  const formatDate = (dateString?: string) => {
    if (!dateString) return "–";
    const date = new Date(dateString);
    return date.toLocaleDateString('sv-SE', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || '??';
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Ägare</Badge>;
      case 'admin':
        return <Badge className="bg-primary/10 text-primary border-primary/20">Admin</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Medlem</Badge>;
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
        >
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
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
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
            variant="outline"
            size="sm"
            onClick={() => loadStats(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Uppdatera
          </Button>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm"
          >
            {error}
          </motion.div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                      <Users className="h-4 w-4" />
                      <span>Medlemmar</span>
                    </div>
                    <div className="text-3xl font-bold text-foreground">
                      {stats?.totals?.memberCount ?? 0}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats?.totals?.activeMemberCount ?? 0} aktiva
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 border-emerald-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                      <BarChart3 className="h-4 w-4" />
                      <span>Möten</span>
                    </div>
                    <div className="text-3xl font-bold text-foreground">
                      {stats?.totals?.totalMeetingCount ?? 0}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Totalt skapade
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="bg-gradient-to-br from-violet-500/5 to-violet-500/10 border-violet-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                      <TrendingUp className="h-4 w-4" />
                      <span>Snitt/medlem</span>
                    </div>
                    <div className="text-3xl font-bold text-foreground">
                      {Math.round(stats?.totals?.averageMeetingsPerMember ?? 0)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Möten per medlem
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Card className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                      <Infinity className="h-4 w-4" />
                      <span>Plan</span>
                    </div>
                    <div className="text-2xl font-bold text-foreground">
                      Enterprise
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Obegränsade möten
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </>
          )}
        </div>


        {/* Scoreboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-amber-500" />
                    Topplista
                  </CardTitle>
                  <CardDescription>
                    Medlemmar sorterade efter antal möten
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  ))}
                </div>
              ) : stats?.scoreboard?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Inga medlemmar ännu</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">#</TableHead>
                        <TableHead>Medlem</TableHead>
                        <TableHead className="hidden sm:table-cell">Roll</TableHead>
                        <TableHead className="text-center pr-6">Möten</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats?.scoreboard?.map((member: any, index: number) => (
                        <TableRow key={member.email} className="group">
                          <TableCell className="pl-6 font-medium text-muted-foreground">
                            {index === 0 && <span className="text-amber-500">🥇</span>}
                            {index === 1 && <span className="text-gray-400">🥈</span>}
                            {index === 2 && <span className="text-amber-700">🥉</span>}
                            {index > 2 && <span>{index + 1}</span>}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                  {getInitials(member.preferredName, member.email)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate">
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
                          <TableCell className="text-center pr-6">
                            <span className="font-semibold text-lg">
                              {member.recordedMeetingCount ?? member.meetingUsage?.totalMeetingCount ?? 0}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Viewer Info */}
        {!isLoading && stats?.viewer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-6 text-center text-sm text-muted-foreground"
          >
            Inloggad som <span className="font-medium">{stats.viewer.preferredName || stats.viewer.email}</span>
            {stats.viewer.role && ` (${stats.viewer.role === 'owner' ? 'Ägare' : stats.viewer.role === 'admin' ? 'Admin' : 'Medlem'})`}
          </motion.div>
        )}
      </div>
    </div>
  );
}
