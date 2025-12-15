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
import { Shield, Eye, RefreshCw, LogOut, Clock, User, FileText, Calendar, AlertTriangle } from "lucide-react";
import { apiClient } from "@/lib/api";

interface AdminSupportPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SupportUserData {
  user: {
    email: string;
    displayName?: string;
    plan?: { plan?: string };
  };
  meetings: any[];
  meetingCount: number;
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
      const fullMeeting = await apiClient.getSupportMeeting(supportSession.token, meeting.id);
      setSelectedMeeting(fullMeeting);
      setActiveTab("meeting");
    } catch (error: any) {
      toast({
        title: "Kunde inte ladda möte",
        description: error?.message || "Ett oväntat fel uppstod",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Support Panel
            {isSupportMode && timeRemaining !== null && (
              <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
                <Clock className="h-3 w-3 mr-1" />
                {formatTime(timeRemaining)}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {isSupportMode 
              ? `Läs-åtkomst till ${supportSession?.userEmail} - inga ändringar kan göras`
              : "Ange en supportkod för att få tillfällig läs-åtkomst till en användares data"
            }
          </DialogDescription>
        </DialogHeader>

        {/* Support Mode Banner */}
        {isSupportMode && (
          <div className="shrink-0 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Supportvy – endast läsläge
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExitSupportMode}
              className="text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
            >
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
                <TabsTrigger value="meetings" className="flex-1">Möten</TabsTrigger>
                {selectedMeeting && <TabsTrigger value="meeting" className="flex-1">Mötesdetaljer</TabsTrigger>}
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                {isLoadingData ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : userData ? (
                  <>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Användarinfo
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">E-post</p>
                            <p className="text-sm font-medium">{userData.user.email}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Plan</p>
                            <Badge variant="outline">{userData.user.plan?.plan || 'free'}</Badge>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Antal möten</p>
                            <p className="text-sm font-medium">{userData.meetingCount}</p>
                          </div>
                          {userData.user.displayName && (
                            <div>
                              <p className="text-xs text-muted-foreground">Namn</p>
                              <p className="text-sm font-medium">{userData.user.displayName}</p>
                            </div>
                          )}
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

              <TabsContent value="meetings" className="mt-4">
                {isLoadingData ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : userData?.meetings?.length ? (
                  <div className="space-y-2">
                    {userData.meetings.map((meeting) => (
                      <Card 
                        key={meeting.id} 
                        className="cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => handleViewMeeting(meeting)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{meeting.title || 'Utan titel'}</p>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(meeting.createdAt)}
                                </span>
                                {meeting.isCompleted && (
                                  <Badge variant="secondary" className="text-xs">
                                    <FileText className="h-3 w-3 mr-1" />
                                    Protokoll
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
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
                      <CardDescription>
                        Skapat: {formatDate(selectedMeeting.createdAt)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {selectedMeeting.transcript && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Transkription</Label>
                          <div className="mt-1 p-3 bg-muted/50 rounded-lg border border-border max-h-48 overflow-y-auto">
                            <p className="text-sm whitespace-pre-wrap">{selectedMeeting.transcript}</p>
                          </div>
                        </div>
                      )}
                      
                      {selectedMeeting.protocol && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Protokoll</Label>
                          <div className="mt-1 p-3 bg-muted/50 rounded-lg border border-border max-h-48 overflow-y-auto">
                            <p className="text-sm whitespace-pre-wrap">{selectedMeeting.protocol}</p>
                          </div>
                        </div>
                      )}

                      {!selectedMeeting.transcript && !selectedMeeting.protocol && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Ingen transkription eller protokoll tillgängligt
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
