import { useState, useRef } from "react";
import { Upload, FileAudio, X, AlertCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { uploadAudioForTranscription } from "@/lib/asrService";
import { useNavigate } from "react-router-dom";
import { debugLog, debugError } from "@/lib/debugLogger";

interface DigitalMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTranscriptReady: (transcript: string) => void;
  selectedLanguage: 'sv-SE' | 'en-US';
}

// Accepted audio formats
const ACCEPTED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/x-m4a',
  'audio/m4a',
  'audio/mp4',
  'audio/aac',
];

const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac'];

export const DigitalMeetingDialog = ({ 
  open, 
  onOpenChange, 
  onTranscriptReady,
  selectedLanguage 
}: DigitalMeetingDialogProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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

  const isValidAudioFile = (file: File): boolean => {
    const hasValidType = ACCEPTED_TYPES.includes(file.type);
    const hasValidExtension = ACCEPTED_EXTENSIONS.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );
    return hasValidType || hasValidExtension;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!isValidAudioFile(file)) {
      toast({
        title: "Ogiltigt filformat",
        description: "Endast MP3, WAV och M4A-filer stöds.",
        variant: "destructive",
      });
      return;
    }

    // Check file size (max 100MB)
    const maxSizeMB = 100;
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
    setUploadProgress(0);
  };

  const handleUpload = async () => {
    if (!selectedFile || !user || isUploading) return;

    setIsUploading(true);
    setUploadProgress(0);
    
    const file = selectedFile;
    const languageCode = selectedLanguage === 'sv-SE' ? 'sv' : 'en';
    const meetingId = crypto.randomUUID();
    const meetingTitle = file.name.replace(/\.[^/.]+$/, '') || 'Uppladdat möte';
    
    console.log('📤 Upload: Starting async transcription flow');
    console.log('  - File:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    console.log('  - Meeting ID:', meetingId);
    
    if (file.size < 1000) {
      toast({
        title: "Filen är tom",
        description: "Den valda filen verkar vara tom. Välj en annan fil.",
        variant: "destructive",
      });
      setIsUploading(false);
      return;
    }

    const token = localStorage.getItem('authToken');
    if (!token) {
      toast({
        title: "Autentisering krävs",
        description: "Ladda om sidan och logga in igen.",
        variant: "destructive",
      });
      setIsUploading(false);
      return;
    }

    try {
      // Step 1: Create meeting placeholder with 'processing' status
      const createResponse = await fetch('https://api.tivly.se/meetings', {
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

      if (!createResponse.ok) {
        throw new Error('Failed to create meeting');
      }

      // Increment meeting count
      await incrementMeetingCount(meetingId);

      // Step 2: Upload audio file for transcription
      const uploadResult = await uploadAudioForTranscription(file, meetingId, {
        language: languageCode,
        onUploadProgress: (percent) => {
          setUploadProgress(percent);
          debugLog(`📤 Upload progress: ${percent}%`);
        }
      });

      if (!uploadResult.success) {
        // Update meeting status to failed
        await fetch(`https://api.tivly.se/meetings/${meetingId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ transcriptionStatus: 'failed' }),
        });
        
        throw new Error(uploadResult.error || 'Upload failed');
      }

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

      // Close dialog and redirect
      onOpenChange(false);
      setSelectedFile(null);
      setIsUploading(false);
      setUploadProgress(0);
      
      toast({
        title: 'Uppladdning klar',
        description: 'Analyserar... Du får ett mejl när det är klart.',
      });

      // Redirect to library with pending meeting info
      navigate('/library', { 
        state: { 
          fromRecording: true, 
          pendingMeetingId: meetingId,
        } 
      });

    } catch (error: any) {
      debugError('Upload error:', error);
      setIsUploading(false);
      setUploadProgress(0);
      toast({
        title: "Uppladdning misslyckades",
        description: error.message || "Försök igen.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadProgress(0);
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
                    Med Pro eller Enterprise kan du ladda upp inspelade ljudfiler 
                    och få dem automatiskt transkriberade med hög kvalitet.
                  </p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground mt-2">
                    <li>Stöd för MP3, WAV och M4A</li>
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
                <p className="font-medium">Ladda upp din ljudfil</p>
                <p className="text-sm text-muted-foreground">
                  Stöder MP3, WAV och M4A. Max 100MB.
                </p>
              </div>
            </AlertDescription>
          </Alert>

          {/* File upload area */}
          {!selectedFile ? (
            <div 
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-accent/5 transition-colors"
            >
              <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">
                Klicka för att välja ljudfil
              </p>
              <p className="text-xs text-muted-foreground">
                MP3, WAV eller M4A (max 100MB)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,.aac,audio/mpeg,audio/wav,audio/x-m4a,audio/mp4"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="border border-border rounded-lg p-4 space-y-3">
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
                    </p>
                  </div>
                </div>
                {!isUploading && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRemoveFile}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              {/* Upload progress bar */}
              {isUploading && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    {uploadProgress < 100 
                      ? `Laddar upp... ${uploadProgress}%` 
                      : 'Analyserar...'}
                  </p>
                </div>
              )}
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
                  <Upload className="mr-2 h-4 w-4 animate-pulse" />
                  {uploadProgress < 100 ? 'Laddar upp...' : 'Analyserar...'}
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
