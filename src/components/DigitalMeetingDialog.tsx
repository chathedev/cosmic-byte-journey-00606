import { useState, useRef } from "react";
import { Upload, FileAudio, X, Loader2, AlertCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { transcribeAndSave, saveTranscriptToBackend } from "@/lib/asrService";
import { convertToWav, needsConversion } from "@/lib/audioConverter";
import { meetingStorage } from "@/utils/meetingStorage";
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
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

    setIsUploading(true);

    try {
      // Map language code to ASR format
      const languageCode = selectedLanguage === 'sv-SE' ? 'sv' : 'en';
      
      debugLog('📤 Upload: Starting upload flow', {
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        fileSize: `${(selectedFile.size / 1024 / 1024).toFixed(2)}MB`
      });

      // Step 1: Convert to WAV if needed
      let audioBlob: Blob = selectedFile;
      if (needsConversion(selectedFile)) {
        setUploadProgress('Konverterar ljud...');
        debugLog('🔄 Converting audio to WAV...');
        audioBlob = await convertToWav(selectedFile);
        debugLog('✅ Conversion complete');
      }

      // Step 2: Create meeting in library with 'processing' status
      const meetingId = crypto.randomUUID();
      const meetingTitle = selectedFile.name.replace(/\.[^/.]+$/, '') || 'Uppladdat möte';
      
      debugLog('📝 Creating meeting placeholder', { meetingId, meetingTitle });
      setUploadProgress('Skapar möte...');

      // Get user display name safely
      const userName = (user as any).displayName || (user as any).name || undefined;

      // Save meeting placeholder to backend
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('Authentication required');
      }

      // Create meeting with processing status
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

      // Step 3: Send to ASR and save transcript (same flow as Enterprise recording)
      setUploadProgress('Transkriberar...');
      debugLog('🎤 Sending to ASR service...');

      const result = await transcribeAndSave(audioBlob, meetingId, {
        language: languageCode,
        meetingTitle,
        userEmail: user.email || undefined,
        userName,
        authToken: token,
        onProgress: (stage, percent) => {
          debugLog(`🎤 ASR Progress: ${stage} ${percent}%`);
          if (stage === 'uploading') setUploadProgress('Laddar upp...');
          else if (stage === 'processing') setUploadProgress('Transkriberar...');
          else setUploadProgress('');
        },
        onTranscriptReady: (transcript) => {
          debugLog('✅ Transcript received, length:', transcript.length);
        }
      });

      if (!result.success) {
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
        throw new Error(result.error || 'transcription_failed');
      }

      const transcript = result.transcript || '';
      
      if (!transcript.trim()) {
        throw new Error('no_speech_detected');
      }

      debugLog('✅ Upload complete, redirecting to library');
      
      toast({
        title: "Transkribering klar!",
        description: "Ditt möte har sparats i biblioteket.",
      });

      // Close dialog and redirect to library
      onOpenChange(false);
      setSelectedFile(null);
      navigate(`/library/${meetingId}`);

    } catch (error: any) {
      debugError('Upload error:', error);
      
      let errorMessage = "Ett fel uppstod vid transkribering av filen.";
      let errorDetails = "";
      
      if (error.message?.includes('no_speech_detected')) {
        errorMessage = "Inget tal kunde detekteras i ljudfilen.";
        errorDetails = "Kontrollera att filen innehåller tal och att rätt språk är valt.";
      } else if (error.message?.includes('file_too_large') || error.message?.includes('250MB')) {
        errorMessage = "Filen är för stor.";
        errorDetails = "Maximal filstorlek är 250MB.";
      } else if (error.message?.includes('transcription_backend_missing')) {
        errorMessage = "Transkriptionstjänsten är inte tillgänglig just nu.";
        errorDetails = "Försök igen om en stund eller kontakta support.";
      } else if (error.message?.includes('transcription_failed') || error.message?.includes('asr_failed')) {
        errorMessage = "Transkriberingen misslyckades.";
        errorDetails = "Kontrollera att filen är ett giltigt ljudformat och innehåller tydligt tal. Försök igen.";
      } else if (error.message?.includes('Authentication required')) {
        errorMessage = "Du måste vara inloggad.";
        errorDetails = "Ladda om sidan och logga in igen.";
      } else if (error.message?.includes('Could not convert audio')) {
        errorMessage = "Kunde inte konvertera ljudfilen.";
        errorDetails = "Prova att konvertera filen till WAV-format manuellt.";
      } else {
        errorDetails = error.message || "Ett okänt fel uppstod.";
      }

      toast({
        title: errorMessage,
        description: errorDetails,
        variant: "destructive",
        duration: 6000,
      });
    } finally {
      setIsUploading(false);
      setUploadProgress('');
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
              <div className="space-y-2">
                <p className="font-medium">Så här går du tillväga:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Spela in ditt digitala möte med din dators eller telefonens ljudinspelare</li>
                  <li>Spara filen som MP3, WAV, M4A eller annat ljudformat</li>
                  <li>Ladda upp filen här för automatisk transkribering</li>
                </ol>
                <p className="text-xs text-muted-foreground mt-2">
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
                        <span className="ml-2 text-amber-600">• Kommer konverteras till WAV</span>
                      )}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRemoveFile}
                  disabled={isUploading}
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
              disabled={isUploading}
            >
              Avbryt
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {uploadProgress || 'Transkriberar...'}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Ladda upp och transkribera
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
