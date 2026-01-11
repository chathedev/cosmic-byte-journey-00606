import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useSupport } from "@/contexts/SupportContext";
import { Shield, Eye, RefreshCw, LogOut, Clock, User, FileText, Calendar, AlertTriangle, Building2, Mic, CreditCard, Activity, CheckCircle2, XCircle } from "lucide-react";
import { apiClient } from "@/lib/api";

interface AdminSupportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SupportUserData {
  user: {
    email: string;
    displayName?: string;
    preferredName?: string;
    plan?: string | { plan?: string };
    meetingCount?: number;
    meetingUsageBaseline?: number;
    paymentStatus?: string;
    planCancelledAt?: string | null;
    googleId?: string | null;
    createdAt?: string;
    updatedAt?: string;
    lastLoginAt?: string;
    isVerified?: boolean;
    verifiedAt?: string | null;
    primaryIp?: string;
    lastIp?: string;
    ipAddresses?: string[];
    primaryDevice?: string;
    lastDevice?: string;
    deviceIds?: string[];
    primaryBrowserId?: string;
    lastBrowserId?: string;
    browserIds?: string[];
    folders?: Array<{
      id: string;
      name: string;
      color?: string | null;
      icon?: string | null;
      sortOrder?: number;
      metadata?: { systemFolder?: boolean };
      createdAt?: string;
      updatedAt?: string;
    }>;
    meetings?: Array<{
      id: string;
      folderId?: string | null;
      title: string;
      subtitle?: string | null;
      notes?: string | null;
      summary?: string | null;
      transcript?: string;
      language?: string;
      status?: string;
      durationSeconds?: number;
      meetingAt?: string;
      createdAt: string;
      updatedAt?: string;
      metadata?: {
        sourceFileName?: string;
        emails?: Record<string, any>;
        attribr?: {
          orgIds?: string[];
          notified?: Record<string, string>;
        };
      };
      participants?: any[];
      agenda?: any;
      actionItems?: Array<{
        id: string;
        meetingId: string;
        userId: string;
        title: string;
        description?: string;
        owner?: string;
        deadline?: string | null;
        priority: string;
        status: string;
        createdAt: string;
        updatedAt: string;
      }>;
      attachments?: any[];
      speakerNames?: Record<string, string>;
      protocol?: {
        id: string;
        meetingId: string;
        encoding?: string;
        blob?: string;
        digest?: string;
        fileName?: string;
        mimeType?: string;
        size?: number;
        storedAt?: string;
        updatedAt?: string;
        jws?: string;
        ownerEmail?: string;
        uploadedBy?: string;
      } | null;
      createdByEmail?: string;
    }>;
    enterprise?: {
      companyId: string;
      companyName: string;
      role: string;
      dataAccessMode: string;
      joinedAt: string;
    };
    sisSample?: {
      status: string;
      speakerName?: string;
      uploadedAt?: string;
      lastMatchScore?: number;
    };
    meetingLimit?: number;
    meetingSlotsRemaining?: number;
    meetingUsage?: {
      meetingCount: number;
      meetingLimit: number;
      meetingSlotsRemaining: number;
      totalMeetingCount: number;
      lastResetAt?: string;
    };
    lastAuthMethod?: string;
    lastAuthPlatform?: string;
  };
  meetings?: any[];
  meetingCount?: number;
}

export const AdminSupportPanel = ({ open, onOpenChange }: AdminSupportPanelProps) => {
  const { toast } = useToast();
  const { isSupportMode, supportSession, enterSupportMode, exitSupportMode, timeRemaining } = useSupport();
  
  const [supportCode, setSupportCode] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);
  const [userData, setUserData] = useState<SupportUserData | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showAllMeetings, setShowAllMeetings] = useState(false);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get trash folder ID
  const getTrashFolderId = () => {
    return userData?.user?.folders?.find(f => f.name === '__Trash')?.id || null;
  };

  // Get folder name by ID
  const getFolderName = (folderId: string | null | undefined) => {
    if (!folderId) return 'Ingen mapp';
    const folder = userData?.user?.folders?.find(f => f.id === folderId);
    if (folder?.name === '__Trash') return '🗑️ Papperskorgen';
    return folder?.name || 'Okänd mapp';
  };

  // Filter meetings based on showAllMeetings toggle
  const getDisplayedMeetings = () => {
    const allMeetings = userData?.user?.meetings || [];
    if (showAllMeetings) {
      return allMeetings;
    }
    const trashFolderId = getTrashFolderId();
    return allMeetings.filter(m => m.folderId !== trashFolderId);
  };

  // Get trashed meetings count
  const getTrashedMeetingsCount = () => {
    const trashFolderId = getTrashFolderId();
    return userData?.user?.meetings?.filter(m => m.folderId === trashFolderId).length || 0;
  };

  const handleClaimCode = async () => {
    if (!supportCode.trim()) {
      toast({
        title: "Ange supportkod",
        description: "Vänligen ange en giltig supportkod.",
        variant: "destructive",
      });
      return;
    }

    setIsClaiming(true);
    try {
      const result = await apiClient.claimSupportCode(supportCode.trim());
      
      enterSupportMode({
        token: result.supportToken,
        expiresAt: result.expiresAt,
        userEmail: result.userEmail,
      });

      setSupportCode("");
      
      toast({
        title: "Supportläge aktiverat",
        description: `Du har nu läs-åtkomst till ${result.userEmail}`,
      });

      // Load user data
      await loadUserData(result.supportToken);
    } catch (error: any) {
      console.error('Failed to claim support code:', error);
      toast({
        title: "Ogiltig kod",
        description: error?.message || "Supportkoden är ogiltig eller har upphört.",
        variant: "destructive",
      });
    } finally {
      setIsClaiming(false);
    }
  };

  const loadUserData = async (token?: string) => {
    const authToken = token || supportSession?.token;
    if (!authToken) return;

    setIsLoadingData(true);
    try {
      const data = await apiClient.getSupportUserData(authToken);
      setUserData(data);
    } catch (error: any) {
      console.error('Failed to load support user data:', error);
      
      if (error?.message?.includes('expired') || error?.message?.includes('revoked')) {
        exitSupportMode();
        toast({
          title: "Sessionen avslutad",
          description: "Supportåtkomsten har upphört eller återkallats.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Kunde inte ladda data",
          description: error?.message || "Ett oväntat fel uppstod",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleExitSupportMode = () => {
    exitSupportMode();
    setUserData(null);
    setSelectedMeeting(null);
    setActiveTab("overview");
    toast({
      title: "Supportläge avslutat",
      description: "Du har lämnat supportläget.",
    });
  };

  const handleViewMeeting = async (meeting: any) => {
    if (!supportSession?.token) return;

    try {
      const response = await apiClient.getSupportMeeting(supportSession.token, meeting.id);
      // Handle response format { meeting: {...} }
      const fullMeeting = response?.meeting || response;
      setSelectedMeeting(fullMeeting);
      setActiveTab("meeting");
    } catch (error: any) {
      // Fallback to local meeting data
      setSelectedMeeting(meeting);
      setActiveTab("meeting");
    }
  };

  const formatDuration = (seconds: number | undefined): string => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getPlanString = (plan: string | { plan?: string } | undefined): string => {
    if (!plan) return 'free';
    if (typeof plan === 'string') return plan;
    return plan.plan || 'free';
  };

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan?.toLowerCase()) {
      case 'enterprise': return 'default';
      case 'pro': return 'secondary';
      case 'premium': return 'secondary';
      default: return 'outline';
    }
  };

  const displayedMeetings = getDisplayedMeetings();
  const trashedCount = getTrashedMeetingsCount();
  const activeMeetingsCount = (userData?.user?.meetings?.length || 0) - trashedCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            Support Panel
            {isSupportMode && timeRemaining !== null && (
              <Badge variant="outline" className="ml-2">
                <Clock className="h-3 w-3 mr-1" />
                {formatTime(timeRemaining)}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {isSupportMode 
              ? `Läs-åtkomst till ${supportSession?.userEmail}`
              : "Ange en supportkod för tillfällig läs-åtkomst"
            }
          </DialogDescription>
        </DialogHeader>

        {/* Support Mode Banner */}
        {isSupportMode && (
          <div className="shrink-0 px-4 py-2 bg-muted/50 border border-border rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Supportvy – endast läsläge</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleExitSupportMode}>
              <LogOut className="h-4 w-4 mr-1" />
              Avsluta
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-4">
          {!isSupportMode ? (
            /* Enter Support Code Form */
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supportCode">Supportkod</Label>
                <div className="flex gap-2">
                  <Input
                    id="supportCode"
                    value={supportCode}
                    onChange={(e) => setSupportCode(e.target.value.toUpperCase())}
                    placeholder="SUPPORT-XXXX-XXXX"
                    className="font-mono tracking-wider"
                    disabled={isClaiming}
                  />
                  <Button onClick={handleClaimCode} disabled={isClaiming || !supportCode.trim()}>
                    {isClaiming ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Verifierar...
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        Visa
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg border border-border">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Säkerhetsregler</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• Supportläget ger endast läs-åtkomst</li>
                      <li>• Token lagras endast i minnet, inte persistent</li>
                      <li>• Sessionen avslutas automatiskt vid timeout</li>
                      <li>• Alla åtgärder loggas för granskning</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Support Mode Content */
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="overview" className="flex-1">Översikt</TabsTrigger>
                <TabsTrigger value="meetings" className="flex-1">
                  Möten ({displayedMeetings.length}{showAllMeetings && trashedCount > 0 ? ` inkl. ${trashedCount} raderade` : ''})
                </TabsTrigger>
                {selectedMeeting && <TabsTrigger value="meeting" className="flex-1">Mötesdetaljer</TabsTrigger>}
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                {isLoadingData ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : userData?.user ? (
                  <>
                    {/* User Info Card */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Användarinfo
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">E-post</p>
                            <p className="text-sm font-medium">{userData.user.email}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Plan</p>
                            <Badge variant={getPlanBadgeVariant(getPlanString(userData.user.plan))}>
                              {getPlanString(userData.user.plan)}
                            </Badge>
                          </div>
                          {userData.user.preferredName && (
                            <div>
                              <p className="text-xs text-muted-foreground">Namn</p>
                              <p className="text-sm font-medium">{userData.user.preferredName}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-muted-foreground">Verifierad</p>
                            <div className="flex items-center gap-1">
                              {userData.user.isVerified ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-destructive" />
                              )}
                              <span className="text-sm">{userData.user.isVerified ? 'Ja' : 'Nej'}</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Skapad</p>
                            <p className="text-sm">{formatDate(userData.user.createdAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Senaste inloggning</p>
                            <p className="text-sm">{userData.user.lastLoginAt ? formatDate(userData.user.lastLoginAt) : '-'}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Meeting Usage Card */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          Mötesanvändning
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-4 gap-4">
                          <div className="text-center p-3 bg-muted/50 rounded-lg">
                            <p className="text-2xl font-bold">{activeMeetingsCount}</p>
                            <p className="text-xs text-muted-foreground">Aktiva möten</p>
                          </div>
                          <div className="text-center p-3 bg-muted/50 rounded-lg">
                            <p className="text-2xl font-bold">{trashedCount}</p>
                            <p className="text-xs text-muted-foreground">I papperskorgen</p>
                          </div>
                          <div className="text-center p-3 bg-muted/50 rounded-lg">
                            <p className="text-2xl font-bold">{userData.user.meetingUsage?.meetingLimit ?? userData.user.meetingLimit ?? '-'}</p>
                            <p className="text-xs text-muted-foreground">Mötesgräns</p>
                          </div>
                          <div className="text-center p-3 bg-muted/50 rounded-lg">
                            <p className="text-2xl font-bold">{userData.user.meetingUsage?.totalMeetingCount ?? userData.user.meetingCount ?? '-'}</p>
                            <p className="text-xs text-muted-foreground">Totalt antal</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Enterprise Card */}
                    {userData.user.enterprise && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Enterprise
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Företag</p>
                              <p className="text-sm font-medium">{userData.user.enterprise.companyName}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Roll</p>
                              <Badge variant="outline">{userData.user.enterprise.role}</Badge>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Dataåtkomst</p>
                              <p className="text-sm">{userData.user.enterprise.dataAccessMode}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Ansluten</p>
                              <p className="text-sm">{formatDate(userData.user.enterprise.joinedAt)}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* SIS Sample Card */}
                    {userData.user.sisSample && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Mic className="h-4 w-4" />
                            Röstprov (SIS)
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Status</p>
                              <Badge variant={userData.user.sisSample.status === 'ready' ? 'default' : 'secondary'}>
                                {userData.user.sisSample.status}
                              </Badge>
                            </div>
                            {userData.user.sisSample.speakerName && (
                              <div>
                                <p className="text-xs text-muted-foreground">Talarnamn</p>
                                <p className="text-sm font-medium">{userData.user.sisSample.speakerName}</p>
                              </div>
                            )}
                            {userData.user.sisSample.uploadedAt && (
                              <div>
                                <p className="text-xs text-muted-foreground">Uppladdad</p>
                                <p className="text-sm">{formatDate(userData.user.sisSample.uploadedAt)}</p>
                              </div>
                            )}
                            {userData.user.sisSample.lastMatchScore !== undefined && (
                              <div>
                                <p className="text-xs text-muted-foreground">Senaste matchpoäng</p>
                                <p className="text-sm">{Math.round(userData.user.sisSample.lastMatchScore * 100)}%</p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Payment Info Card */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <CreditCard className="h-4 w-4" />
                          Betalning
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Betalstatus</p>
                            <Badge variant={userData.user.paymentStatus === 'paid' ? 'default' : 'outline'}>
                              {userData.user.paymentStatus || 'Okänd'}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Senaste autentisering</p>
                            <p className="text-sm">
                              {userData.user.lastAuthMethod || '-'} ({userData.user.lastAuthPlatform || '-'})
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => loadUserData()}
                      disabled={isLoadingData}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingData ? 'animate-spin' : ''}`} />
                      Uppdatera data
                    </Button>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Ingen data tillgänglig</p>
                    <Button variant="outline" onClick={() => loadUserData()} className="mt-2">
                      Ladda data
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="meetings" className="mt-4 space-y-3">
                {/* Toggle for showing all meetings */}
                {trashedCount > 0 && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                    <span className="text-sm text-muted-foreground">
                      Visa raderade möten ({trashedCount} st)
                    </span>
                    <Button 
                      variant={showAllMeetings ? "default" : "outline"} 
                      size="sm"
                      onClick={() => setShowAllMeetings(!showAllMeetings)}
                    >
                      {showAllMeetings ? 'Dölj raderade' : 'Visa alla'}
                    </Button>
                  </div>
                )}
                
                {isLoadingData ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : displayedMeetings.length > 0 ? (
                  <div className="space-y-2">
                    {displayedMeetings.map((meeting) => {
                      const trashFolderId = getTrashFolderId();
                      const isInTrash = meeting.folderId === trashFolderId;
                      
                      return (
                        <Card 
                          key={meeting.id} 
                          className={`cursor-pointer hover:bg-accent/50 transition-colors ${isInTrash ? 'opacity-60 border-dashed' : ''}`}
                          onClick={() => handleViewMeeting(meeting)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium truncate">{meeting.title || 'Utan titel'}</p>
                                  {isInTrash && (
                                    <Badge variant="destructive" className="text-xs shrink-0">
                                      Raderat
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {formatDate(meeting.createdAt)}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {meeting.status}
                                  </Badge>
                                  {meeting.durationSeconds && (
                                    <span className="text-xs">
                                      {Math.round(meeting.durationSeconds / 60)} min
                                    </span>
                                  )}
                                  {meeting.protocol && (
                                    <Badge variant="secondary" className="text-xs">
                                      <FileText className="h-3 w-3 mr-1" />
                                      Protokoll
                                    </Badge>
                                  )}
                                  {!isInTrash && (
                                    <span className="text-xs opacity-70">
                                      {getFolderName(meeting.folderId)}
                                    </span>
                                  )}
                                </div>
                                {/* Always show transcript preview if exists, regardless of status */}
                                {meeting.transcript && meeting.transcript.length > 0 && (
                                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                                    {meeting.transcript.slice(0, 150)}{meeting.transcript.length > 150 ? '...' : ''}
                                  </p>
                                )}
                              </div>
                              <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Inga möten hittades</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="meeting" className="mt-4">
                {selectedMeeting ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{selectedMeeting.title || 'Utan titel'}</CardTitle>
                      <CardDescription className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>Skapat: {formatDate(selectedMeeting.createdAt)}</span>
                          {selectedMeeting.status && (
                            <Badge variant="outline">{selectedMeeting.status}</Badge>
                          )}
                          {selectedMeeting.language && (
                            <Badge variant="secondary">{selectedMeeting.language.toUpperCase()}</Badge>
                          )}
                        </div>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Meeting Info Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-2 bg-muted/50 rounded-lg text-center">
                          <p className="text-lg font-semibold">{formatDuration(selectedMeeting.durationSeconds)}</p>
                          <p className="text-xs text-muted-foreground">Längd</p>
                        </div>
                        <div className="p-2 bg-muted/50 rounded-lg text-center">
                          <p className="text-lg font-semibold">{selectedMeeting.protocolCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Protokoll #</p>
                        </div>
                        <div className="p-2 bg-muted/50 rounded-lg text-center">
                          <p className="text-lg font-semibold">{selectedMeeting.actionItems?.length || 0}</p>
                          <p className="text-xs text-muted-foreground">Åtgärder</p>
                        </div>
                        <div className="p-2 bg-muted/50 rounded-lg text-center">
                          <p className="text-lg font-semibold">{selectedMeeting.participants?.length || 0}</p>
                          <p className="text-xs text-muted-foreground">Deltagare</p>
                        </div>
                      </div>

                      {/* Metadata */}
                      {selectedMeeting.metadata && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Metadata</Label>
                          <div className="mt-1 p-3 bg-muted/50 rounded-lg border border-border text-xs space-y-1">
                            {selectedMeeting.metadata.sourceFileName && (
                              <p><span className="font-medium">Källfil:</span> {selectedMeeting.metadata.sourceFileName}</p>
                            )}
                            {selectedMeeting.metadata.attribr?.orgIds?.length > 0 && (
                              <p><span className="font-medium">Org-ID:</span> {selectedMeeting.metadata.attribr.orgIds.join(', ')}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Speaker Names */}
                      {selectedMeeting.speakerNames && Object.keys(selectedMeeting.speakerNames).length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Talare</Label>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {Object.entries(selectedMeeting.speakerNames).map(([key, name]) => (
                              <Badge key={key} variant="outline">
                                {name as string}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Items */}
                      {selectedMeeting.actionItems && selectedMeeting.actionItems.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Åtgärdspunkter ({selectedMeeting.actionItems.length})</Label>
                          <div className="mt-1 space-y-2 max-h-40 overflow-y-auto">
                            {selectedMeeting.actionItems.map((item: any) => (
                              <div key={item.id} className="p-2 bg-muted/50 rounded-lg border border-border">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium">{item.title}</p>
                                  <div className="flex gap-1 shrink-0">
                                    <Badge variant={item.priority === 'high' ? 'destructive' : 'outline'} className="text-xs">
                                      {item.priority}
                                    </Badge>
                                    <Badge variant={item.status === 'done' ? 'default' : 'secondary'} className="text-xs">
                                      {item.status}
                                    </Badge>
                                  </div>
                                </div>
                                {item.owner && <p className="text-xs text-muted-foreground mt-1">Ansvarig: {item.owner}</p>}
                                {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Transcript - ALWAYS show if exists, regardless of status */}
                      {selectedMeeting.transcript && selectedMeeting.transcript.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">
                              Transkription ({selectedMeeting.transcript.length} tecken)
                            </Label>
                            {selectedMeeting.status && selectedMeeting.status !== 'done' && selectedMeeting.status !== 'transcript_ready' && (
                              <Badge variant="secondary" className="text-xs animate-pulse">
                                {selectedMeeting.status}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 p-3 bg-muted/50 rounded-lg border border-border max-h-48 overflow-y-auto">
                            <p className="text-sm whitespace-pre-wrap">{selectedMeeting.transcript}</p>
                          </div>
                        </div>
                      )}

                      {/* Summary */}
                      {selectedMeeting.summary && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Sammanfattning</Label>
                          <div className="mt-1 p-3 bg-muted/50 rounded-lg border border-border max-h-32 overflow-y-auto">
                            <p className="text-sm whitespace-pre-wrap">{selectedMeeting.summary}</p>
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {selectedMeeting.notes && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Anteckningar</Label>
                          <div className="mt-1 p-3 bg-muted/50 rounded-lg border border-border max-h-32 overflow-y-auto">
                            <p className="text-sm whitespace-pre-wrap">{selectedMeeting.notes}</p>
                          </div>
                        </div>
                      )}
                      
                      {/* Protocol */}
                      {selectedMeeting.protocol && (
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Protokoll
                            {typeof selectedMeeting.protocol === 'object' && selectedMeeting.protocol.fileName && (
                              <span className="ml-2 font-normal">({selectedMeeting.protocol.fileName})</span>
                            )}
                          </Label>
                          <div className="mt-1 p-3 bg-muted/50 rounded-lg border border-border">
                            {typeof selectedMeeting.protocol === 'object' ? (
                              <div className="space-y-1 text-sm">
                                <p><span className="font-medium">Filnamn:</span> {selectedMeeting.protocol.fileName || '-'}</p>
                                <p><span className="font-medium">Typ:</span> {selectedMeeting.protocol.mimeType || '-'}</p>
                                <p><span className="font-medium">Storlek:</span> {selectedMeeting.protocol.size ? `${Math.round(selectedMeeting.protocol.size / 1024)} KB` : '-'}</p>
                                <p><span className="font-medium">Sparat:</span> {selectedMeeting.protocol.storedAt ? formatDate(selectedMeeting.protocol.storedAt) : '-'}</p>
                              </div>
                            ) : (
                              <p className="text-sm whitespace-pre-wrap">{selectedMeeting.protocol}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Attachments */}
                      {selectedMeeting.attachments && selectedMeeting.attachments.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Bilagor ({selectedMeeting.attachments.length})</Label>
                          <div className="mt-1 space-y-1">
                            {selectedMeeting.attachments.map((att: any, idx: number) => (
                              <div key={idx} className="p-2 bg-muted/50 rounded border border-border text-sm">
                                {att.name || att.fileName || `Bilaga ${idx + 1}`}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!selectedMeeting.transcript && !selectedMeeting.protocol && !selectedMeeting.summary && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Ingen transkription, protokoll eller sammanfattning tillgängligt
                        </p>
                      )}

                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setSelectedMeeting(null);
                          setActiveTab("meetings");
                        }}
                        className="w-full"
                      >
                        Tillbaka till möten
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Inget möte valt</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};