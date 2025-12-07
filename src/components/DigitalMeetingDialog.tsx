import { useState, useRef } from "react";
import { Upload, FileAudio, X, AlertCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { transcribeAndSave } from "@/lib/asrService";
import { convertToMp3, needsConversion } from "@/lib/audioConverter";
import { useNavigate } from "react-router-dom";
import { debugLog, debugError } from "@/lib/debugLogger";

interface DigitalMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTranscriptReady: (transcript: string) => void;
  selectedLanguage: 'sv-SE' | 'en-US';
}

export const DigitalMeetingDialog = ({ 
  open, 
  onOpenChange, 
  onTranscriptReady,
  selectedLanguage 
}: DigitalMeetingDialogProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { userPlan, incrementMeetingCount, isAdmin } = useSubscription();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Check if user has upload access (Pro, Enterprise, Unlimited, or Admin)
  const hasUploadAccess = userPlan && (
    userPlan.plan === 'pro' || 
    userPlan.plan === 'enterprise' || 
    userPlan.plan === 'unlimited' ||
    userPlan.plan === 'plus' ||
    isAdmin
  );

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type (audio only)
    const validAudioTypes = [
      'audio/mpeg', // mp3
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/m4a',
      'audio/mp4',
      'audio/x-m4a',
      'audio/webm',
      'audio/ogg'
    ];

    if (!validAudioTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|ogg|webm)$/i)) {
      toast({
        title: "Ogiltigt filformat",
        description: "Endast ljudfiler är tillåtna (MP3, WAV, M4A, OGG, WebM). Videofiler stöds inte.",
        variant: "destructive",
      });
      return;
    }

    // Check file size (max 500MB)
    const maxSizeMB = 500;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast({
        title: "Filen är för stor",
        description: `Filen får max vara ${maxSizeMB}MB. Din fil är ${(file.size / 1024 / 1024).toFixed(1)}MB`,
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !user) return;

    // Immediately close dialog and redirect - don't wait for upload
    const file = selectedFile;
    const languageCode = selectedLanguage === 'sv-SE' ? 'sv' : 'en';
    const meetingId = crypto.randomUUID();
    const meetingTitle = file.name.replace(/\.[^/.]+$/, '') || 'Uppladdat möte';
    
    debugLog('📤 Upload: Starting instant redirect flow', {
      fileName: file.name,
      fileType: file.type,
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
      meetingId
    });

    const token = localStorage.getItem('authToken');
    if (!token) {
      toast({
        title: "Autentisering krävs",
        description: "Ladda om sidan och logga in igen.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Step 1: Create meeting placeholder with 'processing' status
      await fetch('https://api.tivly.se/meetings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: meetingId,
          title: meetingTitle,
          transcript: '',
          transcriptionStatus: 'processing',
          folder: 'general',
          source: 'upload',
        }),
      });

      // Increment meeting count
      await incrementMeetingCount(meetingId);

      // Save pending meeting to sessionStorage for instant display
      const pendingMeeting = {
        id: meetingId,
        title: meetingTitle,
        transcript: '',
        transcriptionStatus: 'processing',
        folder: 'general',
        source: 'upload',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      sessionStorage.setItem('pendingMeeting', JSON.stringify(pendingMeeting));

      // Close dialog and redirect IMMEDIATELY
      onOpenChange(false);
      setSelectedFile(null);
      
      toast({
        title: 'Möte sparat',
        description: 'Transkribering pågår i bakgrunden.',
      });

      // Redirect to library (not specific meeting URL)
      navigate('/library', { state: { fromRecording: true, pendingMeetingId: meetingId } });

      // Step 2: Convert audio in background (if needed) and transcribe
      processUploadInBackground(file, meetingId, meetingTitle, languageCode, token);

    } catch (error: any) {
      debugError('Upload initialization error:', error);
      toast({
        title: "Kunde inte starta uppladdning",
        description: error.message || "Försök igen.",
        variant: "destructive",
      });
    }
  };

  // Background processing function - runs after redirect
  const processUploadInBackground = async (
    file: File,
    meetingId: string,
    meetingTitle: string,
    languageCode: string,
    token: string
  ) => {
    try {
      // Convert audio if needed (backend accepts MP3/WAV)
      let audioBlob: Blob = file;
      if (needsConversion(file)) {
        debugLog('🔄 Background: Converting audio format...');
        audioBlob = await convertToMp3(file);
        debugLog('✅ Background: Conversion complete');
      }

      // Get user display name safely
      const userName = (user as any)?.displayName || (user as any)?.name || undefined;

      // Send to ASR and save transcript
      debugLog('🎤 Background: Sending to ASR service...');
      
      const result = await transcribeAndSave(audioBlob, meetingId, {
        language: languageCode,
        meetingTitle,
        userEmail: user?.email || undefined,
        userName,
        authToken: token,
        onProgress: (stage, percent) => {
          debugLog(`🎤 Background ASR: ${stage} ${percent}%`);
        },
        onTranscriptReady: (transcript) => {
          debugLog('✅ Background: Transcript received, length:', transcript.length);
          
          // Extract clean text if JSON
          let cleanTranscript = transcript;
          try {
            const parsed = JSON.parse(transcript);
            if (parsed.text) cleanTranscript = parsed.text;
          } catch { /* not JSON */ }
          
          // Dispatch event to update Library UI
          window.dispatchEvent(new CustomEvent('transcriptionComplete', { 
            detail: { meetingId, transcript: cleanTranscript } 
          }));
        }
      });

      if (!result.success) {
        debugError('Background ASR failed:', result.error);
        // Update meeting status to failed
        await fetch(`https://api.tivly.se/meetings/${meetingId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transcriptionStatus: 'failed',
          }),
        });
      }

    } catch (error: any) {
      debugError('Background processing error:', error);
      // Update meeting status to failed
      const token = localStorage.getItem('authToken');
      if (token) {
        await fetch(`https://api.tivly.se/meetings/${meetingId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transcriptionStatus: 'failed',
          }),
        });
      }
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Show upgrade prompt if user doesn't have access
  if (!hasUploadAccess) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Uppladdning av möten
            </DialogTitle>
            <DialogDescription>
              Denna funktion kräver Pro eller Enterprise-plan
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Uppgradera för att ladda upp möten</p>
                  <p className="text-sm text-muted-foreground">
                    Med Pro eller Enterprise kan du ladda upp inspelade ljudfiler (MP3, WAV, M4A) 
                    och få dem automatiskt transkriberade med hög kvalitet.
                  </p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground mt-2">
                    <li>Stöd för MP3, WAV, M4A och fler format</li>
                    <li>Automatisk konvertering</li>
                    <li>Sparas i ditt bibliotek</li>
                    <li>E-postnotifikation när klart</li>
                  </ul>
                </div>
              </AlertDescription>
            </Alert>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Stäng
              </Button>
              <Button onClick={() => {
                onOpenChange(false);
                // Trigger upgrade dialog - handled by parent
              }}>
                Uppgradera till Pro
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Ladda upp digitalt möte</DialogTitle>
          <DialogDescription>
            Transkribera en inspelad ljudfil från ditt digitala möte
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
        {/* Instructions */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-3">
              <p className="font-medium">Så här går du tillväga:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Spela in ditt digitala möte med din dators eller telefonens ljudinspelare</li>
                <li>Spara filen som MP3, WAV, M4A eller annat ljudformat</li>
                <li>Ladda upp filen här för automatisk transkribering</li>
              </ol>
              
              <div className="bg-primary/5 border border-primary/20 rounded-md p-3 mt-2">
                <p className="font-medium text-sm text-primary mb-1">💡 Tips för digitala möten med högtalare</p>
                <p className="text-xs text-muted-foreground">
                  Ladda ner en röst-/ljudinspelningsapp på din iPhone eller Android (t.ex. "Röstmemon" på iPhone eller "Röstinspelning" på Android). 
                  Lägg mobilen bredvid högtalaren under mötet för bästa ljudkvalitet.
                </p>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Max filstorlek: 500MB. MP3-filer konverteras automatiskt. Du får ett mejl när transkriberingen är klar.
              </p>
            </div>
          </AlertDescription>
        </Alert>

          {/* File upload area */}
          {!selectedFile ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-accent/5 transition-colors"
            >
              <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">
                Klicka för att välja ljudfil
              </p>
              <p className="text-xs text-muted-foreground">
                MP3, WAV, M4A, OGG, WebM (max 500MB)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileAudio className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    {needsConversion(selectedFile) && (
                        <span className="ml-2 text-amber-600">• Kommer konverteras automatiskt</span>
                      )}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRemoveFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Upload button */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile}
            >
              <Upload className="mr-2 h-4 w-4" />
              Ladda upp och transkribera
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
