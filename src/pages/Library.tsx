import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate, useLocation } from "react-router-dom";
import { Play, Calendar, Trash2, FolderPlus, X, Edit2, Check, Folder, FileText, Lock, TrendingUp, MessageCircle, Mic, Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { meetingStorage, type MeetingSession } from "@/utils/meetingStorage";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { AutoProtocolGenerator } from "@/components/AutoProtocolGenerator";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { AgendaSelectionDialog } from "@/components/AgendaSelectionDialog";
import { MeetingChat } from "@/components/MeetingChat";
import { ChatUpgradeBanner } from "@/components/ChatUpgradeBanner";
import { isLibraryLocked as checkLibraryLocked, hasPlusAccess } from "@/lib/accessCheck";
import { backendApi } from "@/lib/backendApi";
import { Badge } from "@/components/ui/badge";
import { Download, Eye, RefreshCw } from "lucide-react";
import { ProtocolViewerDialog } from "@/components/ProtocolViewerDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/lib/api";

const Library = () => {
  const { user } = useAuth();
  const { userPlan, isLoading: planLoading, canGenerateProtocol, incrementProtocolCount, refreshPlan, canCreateMeeting } = useSubscription();
  const [meetings, setMeetings] = useState<MeetingSession[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("Alla");
  const [newFolderName, setNewFolderName] = useState("");
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<{ transcript: string; aiProtocol: any } | null>(null);
  const [isGeneratingProtocol, setIsGeneratingProtocol] = useState(false);
  const [generatingProtocolData, setGeneratingProtocolData] = useState<{ transcript: string; aiProtocol: any } | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState('');
  const [showSubscribeDialog, setShowSubscribeDialog] = useState(false);
  const [chatMeeting, setChatMeeting] = useState<MeetingSession | null>(null);
  const [showAgendaDialog, setShowAgendaDialog] = useState(false);
  const [pendingMeetingData, setPendingMeetingData] = useState<any>(null);
  const [protocolStatus, setProtocolStatus] = useState<Record<string, any>>({});
  const [loadingProtocol, setLoadingProtocol] = useState<string | null>(null);
  const [viewingProtocol, setViewingProtocol] = useState<{ meetingId: string; protocol: any } | null>(null);
  const [meetingToDeleteProtocol, setMeetingToDeleteProtocol] = useState<MeetingSession | null>(null);
  const [meetingToReplaceProtocol, setMeetingToReplaceProtocol] = useState<MeetingSession | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const maxProtocolsPerMeeting = userPlan?.plan === 'plus' ? 5 : 1;
  const pendingMeetingIdRef = useRef<string | null>(null);
  
  // Lock library only for free users without admin-granted unlimited access
  const isLibraryLocked = checkLibraryLocked(user, userPlan);

  // Load pending meeting from state (when navigating from recording)
  useEffect(() => {
    const fromRecording = location.state?.fromRecording === true;
    const pendingMeetingId = location.state?.pendingMeetingId;
    
    // Track meeting ID for polling
    if (pendingMeetingId) {
      pendingMeetingIdRef.current = pendingMeetingId;
      console.log('📌 Tracking pending meeting:', pendingMeetingId);
    }
    
    if (fromRecording) {
      const pendingMeetingJson = sessionStorage.getItem('pendingMeeting');
      if (pendingMeetingJson) {
        try {
          const pendingMeeting = JSON.parse(pendingMeetingJson) as MeetingSession;
          pendingMeeting.transcriptionStatus = 'processing';
          pendingMeetingIdRef.current = pendingMeeting.id;
          setMeetings([pendingMeeting]);
          setIsLoading(false);
        } catch (e) {
          console.error('Failed to parse pending meeting:', e);
        }
      }
      sessionStorage.removeItem('pendingMeeting');
      // Always use clean /library URL - never include meeting ID
      window.history.replaceState({}, document.title, '/library');
    } else {
      sessionStorage.removeItem('pendingMeeting');
    }
  }, [location.state]);

  useEffect(() => {
    loadData();
  }, [user]);

  // Poll for processing meetings via GET /meetings/:id/transcription per spec
  const meetingsRef = useRef(meetings);
  meetingsRef.current = meetings;

  // Track if transcription was completed via direct event (to stop polling)
  const transcriptionDoneRef = useRef(false);

  // Polling for transcription status - only if direct event hasn't fired
  useEffect(() => {
    if (!user) return;
    
    const pendingId = pendingMeetingIdRef.current;
    if (!pendingId) return;

    const pollInterval = setInterval(async () => {
      // Stop if transcription was completed via direct event
      if (transcriptionDoneRef.current) {
        clearInterval(pollInterval);
        return;
      }
      
      const currentPendingId = pendingMeetingIdRef.current;
      if (!currentPendingId) {
        clearInterval(pollInterval);
        return;
      }

      try {
        // Poll using meetingId
        const status = await apiClient.getTranscriptionStatus(currentPendingId);
        
        const isComplete = status.success && (status.status === 'done' || status.status === 'completed') && status.transcript;
        
        if (isComplete) {
          transcriptionDoneRef.current = true;
          pendingMeetingIdRef.current = null;
          sessionStorage.removeItem('pendingMeeting');
          clearInterval(pollInterval);
          
          // Parse transcript if it's JSON
          let cleanTranscript = status.transcript;
          try {
            const parsed = JSON.parse(status.transcript);
            if (parsed.text) cleanTranscript = parsed.text;
          } catch { /* not JSON */ }
          
          setMeetings(prev => prev.map(m => 
            m.id === currentPendingId 
              ? { ...m, transcript: cleanTranscript, transcriptionStatus: 'done' as const } 
              : m
          ));
          
          toast({
            title: 'Transkribering klar',
            description: 'Ditt möte har transkriberats.',
          });
        } else if (status.status === 'failed' || status.status === 'error') {
          transcriptionDoneRef.current = true;
          pendingMeetingIdRef.current = null;
          clearInterval(pollInterval);
          
          setMeetings(prev => prev.map(m => 
            m.id === currentPendingId ? { ...m, transcriptionStatus: 'failed' as const } : m
          ));
          
          toast({
            title: 'Transkribering misslyckades',
            description: status.error || 'Försök igen.',
            variant: 'destructive',
          });
        }
      } catch { /* silent */ }
    }, 3000); // Poll every 3 seconds per spec

    return () => clearInterval(pollInterval);
  }, [user]);

  // Listen for direct ASR completion event - immediate update
  useEffect(() => {
    const handleTranscriptionComplete = async (event: CustomEvent) => {
      const { meetingId, transcript } = event.detail || {};
      
      // Mark as done so polling stops
      transcriptionDoneRef.current = true;
      pendingMeetingIdRef.current = null;
      sessionStorage.removeItem('pendingMeeting');
      
      // If transcript was passed directly, use it
      if (transcript && meetingId) {
        let cleanTranscript = transcript;
        try {
          const parsed = JSON.parse(transcript);
          if (parsed.text) cleanTranscript = parsed.text;
        } catch { /* not JSON */ }
        
        setMeetings(prev => prev.map(m => 
          m.id === meetingId 
            ? { ...m, transcript: cleanTranscript, transcriptionStatus: 'done' as const } 
            : m
        ));
        
        toast({
          title: 'Transkribering klar',
          description: 'Ditt möte har transkriberats.',
        });
        return;
      }
      
      // Otherwise fetch from backend
      if (user && meetingId) {
        try {
          const userMeetings = await meetingStorage.getMeetings(user.uid);
          const meeting = userMeetings.find(m => m.id === meetingId);
          if (meeting?.transcript) {
            let cleanTranscript = meeting.transcript;
            try {
              const parsed = JSON.parse(meeting.transcript);
              if (parsed.text) cleanTranscript = parsed.text;
            } catch { /* not JSON */ }
            
            setMeetings(prev => prev.map(m => 
              m.id === meetingId 
                ? { ...m, transcript: cleanTranscript, transcriptionStatus: 'done' as const } 
                : m
            ));
            
            toast({
              title: 'Transkribering klar',
              description: 'Ditt möte har transkriberats.',
            });
          }
        } catch { /* silent */ }
      }
    };

    window.addEventListener('transcriptionComplete', handleTranscriptionComplete as EventListener);
    return () => {
      window.removeEventListener('transcriptionComplete', handleTranscriptionComplete as EventListener);
    };
  }, [user]);

  // Don't redirect - allow viewing library but show upgrade prompts for actions

  const loadData = async () => {
    if (!user) return;
    
    // Don't show loading spinner if we already have meetings displayed
    if (meetings.length === 0) {
      setIsLoading(true);
    }
    
    try {
      const userMeetings = await meetingStorage.getMeetings(user.uid);
      // De-duplicate by meeting ID (keep latest version)
      const map = new Map<string, MeetingSession>();
      for (const m of userMeetings) {
        const existing = map.get(m.id);
        if (!existing || new Date(m.updatedAt) > new Date(existing.updatedAt)) {
          map.set(m.id, m);
        }
      }
      
      // If we're tracking a pending meeting from recording, keep it visible until backend has it
      const pendingId = pendingMeetingIdRef.current;
      if (pendingId) {
        const loadedVersion = map.get(pendingId);
        if (loadedVersion && (loadedVersion.transcriptionStatus !== 'processing' || loadedVersion.transcript)) {
          // Transcription complete - stop tracking
          pendingMeetingIdRef.current = null;
        } else if (!loadedVersion) {
          // Backend doesn't have it yet - preserve the pending meeting from current state
          const currentPending = meetings.find(m => m.id === pendingId);
          if (currentPending) {
            currentPending.transcriptionStatus = 'processing';
            map.set(pendingId, currentPending);
          }
        }
      }
      
      const deduped = Array.from(map.values()).filter(m => !['__Trash'].includes(String(m.folder)));
      deduped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMeetings(deduped);
      
      const allFolders = await meetingStorage.getFolders(user.uid);
      setFolders(allFolders.map(f => f.name));
      
      // Load protocol status for all meetings
      const protocols: Record<string, any> = {};
      await Promise.allSettled(
        deduped.map(async (meeting) => {
          try {
            // Only count protocol if it's both in backend AND attached to meeting
            if (meeting.protocol) {
              const protocol = await backendApi.getProtocol(meeting.id);
              if (protocol?.protocol) {
                protocols[meeting.id] = protocol.protocol;
              }
            }
          } catch (error) {
            // Protocol doesn't exist or error - that's fine
          }
        })
      );
      setProtocolStatus(protocols);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast({
        title: "Laddar...",
        description: "Index byggs fortfarande. Vänta ett ögonblick.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartNewMeeting = async () => {
    const { allowed, reason } = await canGenerateProtocol('', 0).then(() => ({ allowed: true as const })).catch(() => ({ allowed: true as const })) as any; // placeholder to keep type
    // Use canCreateMeeting from context instead of canGenerateProtocol
  };
  const handleDeleteMeeting = async (id: string) => {
    if (userPlan?.plan === 'free') {
      toast({
        title: 'Kan inte ta bort',
        description: 'Gratisplanen tillåter inte att du tar bort ditt testmöte.',
        variant: 'destructive',
      });
      return;
    }
    
    // Prevent double-click
    if (deletingMeetingId === id) return;
    
    try {
      setDeletingMeetingId(id);
      
      // Soft-delete the meeting
      await meetingStorage.deleteMeeting(id);
      
      // Immediately reload data to show updated list
      await loadData();
      
      // Refresh plan from backend
      await refreshPlan();
      
      toast({
        title: 'Borttaget',
        description: 'Mötet har tagits bort',
      });
    } catch (error) {
      console.error('Failed to delete meeting:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte ta bort mötet',
        variant: 'destructive',
      });
    } finally {
      setDeletingMeetingId(null);
    }
  };

  const handleAddFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    
    const trimmedName = newFolderName.trim();
    
    if (folders.includes(trimmedName)) {
      toast({
        title: "Fel",
        description: "Mappen finns redan",
        variant: "destructive",
      });
      setNewFolderName("");
      setIsAddingFolder(false);
      return;
    }

    try {
      await meetingStorage.addFolder(trimmedName, user.uid);
      await loadData();
      setNewFolderName("");
      setIsAddingFolder(false);
      toast({
        title: "Mapp skapad",
        description: `Mappen "${trimmedName}" har skapats`,
      });
    } catch (error) {
      console.error('Failed to create folder:', error);
      toast({
        title: "Fel",
        description: "Kunde inte skapa mappen. Försök igen.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteFolder = async (folder: string) => {
    if (folder === "Allmänt" || folder === "__Trash") {
      toast({
        title: "Kan inte ta bort",
        description: "Denna mapp är skyddad och kan inte tas bort",
        variant: "destructive",
      });
      return;
    }

    if (!user) return;

    try {
      await meetingStorage.deleteFolder(folder, user.uid);
      if (selectedFolder === folder) {
        setSelectedFolder("Alla");
      }
      await loadData();
      toast({
        title: "Mapp borttagen",
        description: "Möten flyttades till Allmänt",
      });
    } catch (error) {
      console.error('Failed to delete folder:', error);
      toast({
        title: "Fel",
        description: "Kunde inte ta bort mappen. Försök igen.",
        variant: "destructive",
      });
    }
  };

  const handleStartEdit = (meeting: MeetingSession) => {
    setEditingMeetingId(meeting.id);
    setEditName(meeting.title);
  };

  const handleSaveEdit = async (meeting: MeetingSession) => {
    if (!editName.trim()) {
      setEditName(meeting.title);
      setEditingMeetingId(null);
      return;
    }

    const updated = { ...meeting, title: editName, updatedAt: new Date().toISOString() };
    await meetingStorage.saveMeeting(updated);
    setEditingMeetingId(null);
    loadData();
    toast({
      title: "Sparat",
      description: "Mötesnamnet har uppdaterats",
    });
  };

  const handleMoveToFolder = async (meeting: MeetingSession, newFolder: string) => {
    const updated = { ...meeting, folder: newFolder, updatedAt: new Date().toISOString() };
    await meetingStorage.saveMeeting(updated);
    loadData();
    toast({
      title: "Flyttat",
      description: `Mötet har flyttats till "${newFolder}"`,
    });
  };


  const handleContinueMeeting = (meeting: MeetingSession) => {
    // Free users cannot continue meetings
    if (userPlan?.plan === 'free') {
      setUpgradeReason('Funktionen "Fortsätt möte" är endast tillgänglig för Pro och Plus användare. Uppgradera för att fortsätta inspelningar!');
      setShowSubscribeDialog(true);
      return;
    }
    navigate(`/?continue=${meeting.id}`);
  };

  const handleCreateProtocol = async (meeting: MeetingSession) => {
    // If a protocol exists, offer replace flow
    if (protocolStatus[meeting.id]) {
      setMeetingToReplaceProtocol(meeting);
      return;
    }

    // Proceed with normal generation
    const latest = await meetingStorage.getMeeting(meeting.id);
    const effectiveMeeting = latest || meeting;

    const wordCount = effectiveMeeting.transcript ? effectiveMeeting.transcript.trim().split(/\s+/).filter(w => w).length : 0;
    if (!effectiveMeeting.transcript || wordCount < 20) {
      toast({
        title: "För kort transkription",
        description: `Transkriptionen innehåller ${wordCount} ord. Minst 20 ord krävs för att skapa ett protokoll.`,
        variant: "destructive",
      });
      return;
    }

    setPendingMeetingData({
      id: effectiveMeeting.id,
      transcript: effectiveMeeting.transcript,
      title: effectiveMeeting.title,
      createdAt: effectiveMeeting.createdAt,
    });
    setShowAgendaDialog(true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const filteredMeetings = selectedFolder === "Alla" 
    ? meetings 
    : meetings.filter(m => m.folder === selectedFolder);

  // Show loading state while plan is being fetched to prevent flash
  if (planLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Laddar...</p>
        </div>
      </div>
    );
  }

  // If showing protocol, display the protocol generator
  if (selectedProtocol) {
    return (
      <AutoProtocolGenerator
        transcript={selectedProtocol.transcript}
        aiProtocol={selectedProtocol.aiProtocol}
        onBack={() => setSelectedProtocol(null)}
        showWidget={false}
      />
    );
  }

  // Widget mode for background generation
  const handleProtocolReady = () => {
    setIsGeneratingProtocol(false);
    if (generatingProtocolData) {
      setSelectedProtocol(generatingProtocolData);
      setGeneratingProtocolData(null);
    }
  };

  // Show locked library screen only for free users
  if (isLibraryLocked) {
    const isIosApp = typeof window !== 'undefined' && window.location.hostname === 'io.tivly.se';
    
    return (
      <>
        <div className="flex items-center justify-center min-h-[70vh] px-4 animate-fade-in">
          <Card className="max-w-md w-full animate-scale-in">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Lock className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Biblioteket är låst</CardTitle>
              <CardDescription className="text-base mt-2">
                {isIosApp 
                  ? 'Ändringar av din plan görs på din kontosida på webben.'
                  : 'Uppgradera till Tivly Pro eller Plus för att få tillgång till biblioteket och alla dess funktioner!'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Med en prenumeration får du:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>✓ Tillgång till biblioteket</li>
                  <li>✓ Skapa fler möten</li>
                  <li>✓ Generera fler protokoll</li>
                  <li>✓ Organisera i mappar</li>
                </ul>
              </div>
              {/* iOS: Never show upgrade button - Apple compliance */}
              {!isIosApp && (
                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={() => setShowSubscribeDialog(true)}
                >
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Uppgradera till Pro
                </Button>
              )}
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => navigate('/')}
              >
                Tillbaka till start
              </Button>
            </CardContent>
          </Card>
        </div>
        <SubscribeDialog open={showSubscribeDialog} onOpenChange={setShowSubscribeDialog} />
      </>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border px-4 py-4 shadow-sm">
        <h1 className="text-lg font-semibold">Mina möten</h1>
      </div>

      {/* Loading bar */}
      {isLoading && (
        <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-primary animate-pulse">
          <div className="h-full w-full bg-gradient-to-r from-transparent via-background/20 to-transparent animate-[slide-in-right_1s_ease-in-out_infinite]" />
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
        {/* Chat Upgrade Banner - Show only for users without Plus access */}
        {!hasPlusAccess(user, userPlan) && (
          <ChatUpgradeBanner onUpgrade={() => setShowSubscribeDialog(true)} />
        )}

        {/* Folder Management */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={selectedFolder === "Alla" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedFolder("Alla")}
            >
              Alla möten ({meetings.length})
            </Button>
            {/* Always show Allmänt folder first */}
            <div className="flex items-center gap-1">
              <Button
                variant={selectedFolder === "Allmänt" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedFolder("Allmänt")}
              >
                <Folder className="w-3 h-3 mr-1" />
                Allmänt ({meetings.filter(m => !m.folder || m.folder === "Allmänt").length})
              </Button>
            </div>
            {/* Show other folders */}
            {folders.filter(f => f !== "Allmänt").map((folder, index) => (
              <div 
                key={folder} 
                className="flex items-center gap-1"
              >
                <Button
                  variant={selectedFolder === folder ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFolder(folder)}
                >
                  <Folder className="w-3 h-3 mr-1" />
                  {folder} ({meetings.filter(m => m.folder === folder).length})
                </Button>
                {folder !== "Allmänt" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteFolder(folder)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {isAddingFolder ? (
            <div className="flex gap-2">
              <Input
                placeholder="Mappnamn..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddFolder()}
                autoFocus
              />
              <Button onClick={handleAddFolder} size="sm">
                <Check className="w-4 h-4" />
              </Button>
              <Button onClick={() => {
                setIsAddingFolder(false);
                setNewFolderName("");
              }} variant="ghost" size="sm">
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button onClick={() => setIsAddingFolder(true)} variant="outline" size="sm">
              <FolderPlus className="w-4 h-4 mr-2" />
              Ny mapp
            </Button>
          )}
        </div>

        {/* Meetings List */}
          {filteredMeetings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {selectedFolder === "Alla" ? "Inga möten ännu" : `Inga möten i "${selectedFolder}"`}
              </p>
            </div>
          ) : (
          <div className="grid gap-4">
            <AnimatePresence mode="popLayout">
            {filteredMeetings.map((meeting, index) => {
              // Consider processing if explicitly marked OR if transcript is empty/missing
              const isProcessing = meeting.transcriptionStatus === 'processing' || 
                (!meeting.transcript || meeting.transcript.trim().length === 0);
              const hasTranscript = meeting.transcript && meeting.transcript.trim().length > 0;
              return (
              <motion.div
                key={meeting.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                layout
              >
              <Card 
                className="hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      {editingMeetingId === meeting.id ? (
                        <div className="flex gap-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(meeting)}
                            autoFocus
                          />
                          <Button onClick={() => handleSaveEdit(meeting)} size="sm">
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button onClick={() => setEditingMeetingId(null)} variant="ghost" size="sm">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                        {isProcessing && !hasTranscript ? (
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-lg text-muted-foreground">{meeting.title || 'Nytt möte'}</CardTitle>
                            </div>
                          ) : (
                            <>
                              <CardTitle className="text-lg">{meeting.title}</CardTitle>
                              <Button
                                onClick={() => handleStartEdit(meeting)}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                              >
                                <Edit2 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                      <CardDescription className="mt-2 flex items-center gap-4 text-xs flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(meeting.createdAt)}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">
                          Uppdaterad: {formatDate(meeting.updatedAt)}
                        </span>
                        {meeting.source && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <Badge variant={meeting.source === 'live' ? 'default' : 'secondary'} className="flex items-center gap-1 text-xs">
                              {meeting.source === 'live' ? (
                                <>
                                  <Mic className="w-3 h-3" />
                                  Live-inspelning
                                </>
                              ) : (
                                <>
                                  <Upload className="w-3 h-3" />
                                  Uppladdad fil
                                </>
                              )}
                            </Badge>
                          </>
                        )}
                        {isProcessing && !hasTranscript && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <Badge variant="outline" className="flex items-center gap-1 text-xs bg-primary/10 border-primary/30">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              Transkriberar...
                            </Badge>
                          </>
                        )}
                        {meeting.transcriptionStatus === 'failed' && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <Badge variant="destructive" className="flex items-center gap-1 text-xs">
                              Misslyckades
                            </Badge>
                          </>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <AnimatePresence mode="wait">
                    {isProcessing && !hasTranscript ? (
                      <motion.div
                        key="processing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="mb-4 space-y-3"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          <span className="text-sm text-muted-foreground">Transkribering pågår...</span>
                        </div>
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Du får ett mejl när det är klart</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Stäng gärna sidan – vi meddelar dig via e-post när transkriberingen är färdig.
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ) : meeting.transcriptionStatus === 'failed' ? (
                      <motion.div
                        key="failed"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 mb-4 text-destructive"
                      >
                        <span>✕</span>
                        <span className="text-sm">Transkribering misslyckades</span>
                      </motion.div>
                    ) : (
                      <motion.p
                        key="transcript"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-sm text-muted-foreground line-clamp-2 mb-4"
                      >
                        {meeting.transcript}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  
                  {/* Protocol Status Badge */}
                  {protocolStatus[meeting.id] && (
                    <div className="mb-3 pb-3 border-b border-border">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            Protokoll sparat
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(protocolStatus[meeting.id].storedAt).toLocaleDateString('sv-SE')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            onClick={async () => {
                              setLoadingProtocol(meeting.id);
                              try {
                                const data = await backendApi.getProtocol(meeting.id);
                                if (data?.protocol) {
                                  setViewingProtocol({
                                    meetingId: meeting.id,
                                    protocol: data.protocol
                                  });
                                }
                              } catch (error: any) {
                                toast({
                                  title: "Fel",
                                  description: error.message || "Kunde inte öppna protokoll",
                                  variant: "destructive",
                                  duration: 2500,
                                });
                              } finally {
                                setLoadingProtocol(null);
                              }
                            }}
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            disabled={loadingProtocol === meeting.id}
                          >
                            {loadingProtocol === meeting.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </Button>
                          <Button
                            onClick={async () => {
                              setLoadingProtocol(meeting.id);
                              try {
                                const data = await backendApi.getProtocol(meeting.id);
                                if (data?.protocol?.blob) {
                                  const blob = atob(data.protocol.blob.replace(/^data:.*?;base64,/, ''));
                                  const bytes = new Uint8Array(blob.length);
                                  for (let i = 0; i < blob.length; i++) {
                                    bytes[i] = blob.charCodeAt(i);
                                  }
                                  const file = new Blob([bytes], { type: data.protocol.mimeType });
                                  const url = URL.createObjectURL(file);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = data.protocol.fileName;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                  toast({
                                    title: "Protokoll nedladdat",
                                    description: data.protocol.fileName,
                                    duration: 2000,
                                  });
                                }
                              } catch (error: any) {
                                toast({
                                  title: "Fel",
                                  description: error.message || "Kunde inte ladda ner protokoll",
                                  variant: "destructive",
                                  duration: 2500,
                                });
                              } finally {
                                setLoadingProtocol(null);
                              }
                            }}
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            disabled={loadingProtocol === meeting.id}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            onClick={() => {
                              setMeetingToDeleteProtocol(meeting);
                            }}
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex gap-2 flex-wrap items-center">
                    <Button
                      onClick={() => handleContinueMeeting(meeting)}
                      size="sm"
                      variant="default"
                      disabled={userPlan?.plan === 'free' || (isProcessing && !hasTranscript)}
                      title={userPlan?.plan === 'free' ? 'Endast för betalande användare' : (isProcessing && !hasTranscript) ? 'Väntar på transkribering...' : undefined}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Fortsätt möte
                    </Button>
                    <Button
                      onClick={() => handleCreateProtocol(meeting)}
                      size="sm"
                      variant="outline"
                      disabled={!!protocolStatus[meeting.id] || isProcessing || !hasTranscript}
                      title={
                        isProcessing ? 'Väntar på transkribering...' :
                        protocolStatus[meeting.id] ? 'Protokoll redan sparat för detta möte' :
                        !hasTranscript ? 'Ingen transkription tillgänglig' :
                        undefined
                      }
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      {isProcessing && !hasTranscript ? 'Transkriberar...' : protocolStatus[meeting.id] ? 'Protokoll sparat' : (userPlan?.plan === 'free' ? 'Testa protokoll' : 'Skapa protokoll')}
                    </Button>
                    {userPlan?.plan === 'plus' && (
                      <Button
                        onClick={() => setChatMeeting(meeting)}
                        size="sm"
                        variant="outline"
                      >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        Chatta
                      </Button>
                    )}
                    <Select value={(folders.includes(meeting.folder) || meeting.folder === 'Allmänt') ? meeting.folder : undefined} onValueChange={(value) => handleMoveToFolder(meeting, value)}>
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue placeholder="Klicka för att välja mapp" />
                      </SelectTrigger>
                      <SelectContent>
                        {["Allmänt", ...folders.filter(f => f !== "Allmänt")].map(folder => (
                          <SelectItem key={folder} value={folder}>
                            <div className="flex items-center gap-2">
                              <Folder className="w-3 h-3" />
                              {folder}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => handleDeleteMeeting(meeting.id)}
                      size="sm"
                      variant="destructive"
                      disabled={userPlan?.plan === 'free' || deletingMeetingId === meeting.id}
                      title={userPlan?.plan === 'free' ? 'Inte tillåtet på gratisplanen' : deletingMeetingId === meeting.id ? 'Tar bort...' : undefined}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Ta bort
                    </Button>
                  </div>
                </CardContent>
              </Card>
              </motion.div>
              );
            })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Widget for background protocol generation */}
      {isGeneratingProtocol && generatingProtocolData && (
        <AutoProtocolGenerator
          transcript={generatingProtocolData.transcript}
          aiProtocol={generatingProtocolData.aiProtocol}
          onBack={() => {
            setIsGeneratingProtocol(false);
            setGeneratingProtocolData(null);
          }}
          showWidget={true}
          onProtocolReady={handleProtocolReady}
        />
      )}

      {/* Chat Dialog */}
      {chatMeeting && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl h-[600px]">
            <MeetingChat
              transcript={chatMeeting.transcript}
              meetingTitle={chatMeeting.title}
              onClose={() => setChatMeeting(null)}
            />
          </div>
        </div>
      )}

      {/* Agenda Selection Dialog */}
      {pendingMeetingData && (
        <AgendaSelectionDialog
          open={showAgendaDialog}
          onOpenChange={setShowAgendaDialog}
          meetingData={pendingMeetingData}
        />
      )}

      {/* Upgrade Dialog */}
      <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />
      <SubscribeDialog open={showSubscribeDialog} onOpenChange={setShowSubscribeDialog} />

      {/* Protocol Viewer Dialog */}
      <ProtocolViewerDialog
        open={!!viewingProtocol}
        onOpenChange={(open) => {
          if (!open) setViewingProtocol(null);
        }}
        protocol={viewingProtocol?.protocol || null}
      />

      <ConfirmDialog
        open={!!meetingToDeleteProtocol}
        onOpenChange={(open) => {
          if (!open) setMeetingToDeleteProtocol(null);
        }}
        title="Ersätta protokoll"
        description="Vill du ersätta det sparade protokollet? Detta går inte att ångra."
        confirmText="Ta bort"
        cancelText="Avbryt"
        variant="destructive"
        onConfirm={async () => {
          if (!meetingToDeleteProtocol) return;
          try {
            await backendApi.deleteProtocol(meetingToDeleteProtocol.id);
            const updatedStatus = { ...protocolStatus };
            delete updatedStatus[meetingToDeleteProtocol.id];
            setProtocolStatus(updatedStatus);
            const protocolKey = `protocol_generated_${meetingToDeleteProtocol.id}`;
            sessionStorage.removeItem(protocolKey);
            toast({ title: "Protokoll borttaget", description: "Du kan nu generera ett nytt protokoll", duration: 2000 });
            setMeetingToDeleteProtocol(null);
          } catch (error: any) {
            toast({ title: "Fel", description: error.message || "Kunde inte ta bort protokoll", variant: "destructive", duration: 2500 });
          }
        }}
      />

      <ConfirmDialog
        open={!!meetingToReplaceProtocol}
        onOpenChange={(open) => {
          if (!open) setMeetingToReplaceProtocol(null);
        }}
        title="Ersätt protokoll"
        description="Det finns redan ett protokoll för detta möte. Vill du ersätta det genom att skapa ett nytt?"
        confirmText="Ersätt"
        cancelText="Avbryt"
        variant="destructive"
        onConfirm={async () => {
          if (!meetingToReplaceProtocol) return;
          try {
            // Remove old
            await backendApi.deleteProtocol(meetingToReplaceProtocol.id);
            const updatedStatus = { ...protocolStatus };
            delete updatedStatus[meetingToReplaceProtocol.id];
            setProtocolStatus(updatedStatus);
            sessionStorage.removeItem(`protocol_generated_${meetingToReplaceProtocol.id}`);
            
            // Proceed to generation flow
            const latest = await meetingStorage.getMeeting(meetingToReplaceProtocol.id);
            const effectiveMeeting = latest || meetingToReplaceProtocol;
            setPendingMeetingData({
              id: effectiveMeeting.id,
              transcript: effectiveMeeting.transcript,
              title: effectiveMeeting.title,
              createdAt: effectiveMeeting.createdAt,
            });
            setShowAgendaDialog(true);
            
            toast({ title: "Protokoll ersätts", description: "Nytt protokoll kommer att genereras", duration: 2000 });
          } catch (error: any) {
            toast({ title: "Fel", description: error.message || "Kunde inte ersätta protokoll", variant: "destructive", duration: 2500 });
          } finally {
            setMeetingToReplaceProtocol(null);
          }
        }}
      />
    </div>
  );
};

export default Library;
