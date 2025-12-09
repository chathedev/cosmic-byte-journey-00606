import { useState, useRef } from "react";
import { Upload, FileAudio, X, AlertCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { submitASRJob, storeJobIdInMeeting } from "@/lib/asrService";
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

    // Validate file type - MP3 ONLY for instant upload (no conversion needed)
    const isMp3 = file.type === 'audio/mpeg' || file.type === 'audio/mp3' || file.name.toLowerCase().endsWith('.mp3');

    if (!isMp3) {
      toast({
        title: "Endast MP3-filer",
        description: "Konvertera din fil till MP3 först för snabbast uppladdning. Du kan använda gratis verktyg som CloudConvert eller Audacity.",
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
    if (!selectedFile || !user || isUploading) return;

    setIsUploading(true);
    
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

      // Step 2: Submit audio for async transcription
      const submitResult = await submitASRJob(file, meetingId, {
        language: languageCode,
        onProgress: (stage, percent) => {
          debugLog(`📤 Upload progress: ${stage} ${percent}%`);
        }
      });

      if (!submitResult.success) {
        // Update meeting status to failed
        await fetch(`https://api.tivly.se/meetings/${meetingId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ transcriptionStatus: 'failed' }),
        });
        
        throw new Error(submitResult.error || 'Upload failed');
      }

      // Step 3: Store jobId in meeting for polling resume
      if (submitResult.jobId) {
        await storeJobIdInMeeting(meetingId, submitResult.jobId);
      }

      // Save pending meeting to sessionStorage for instant display
      const pendingMeeting = {
        id: meetingId,
        title: meetingTitle,
        transcript: '',
        transcriptionStatus: 'processing',
        jobId: submitResult.jobId,
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
      
      toast({
        title: 'Uppladdning klar',
        description: 'Transkribering pågår. Du får ett mejl när det är klart.',
      });

      // Redirect to library with pending meeting info
      navigate('/library', { 
        state: { 
          fromRecording: true, 
          pendingMeetingId: meetingId,
          jobId: submitResult.jobId 
        } 
      });

    } catch (error: any) {
      debugError('Upload error:', error);
      setIsUploading(false);
      toast({
        title: "Uppladdning misslyckades",
        description: error.message || "Försök igen.",
        variant: "destructive",
      });
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
                    Med Pro eller Enterprise kan du ladda upp inspelade MP3-filer 
                    och få dem automatiskt transkriberade med hög kvalitet.
                  </p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground mt-2">
                    <li>Snabb direktuppladdning av MP3</li>
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
              <p className="font-medium">Så här går du tillväga:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Spela in ditt digitala möte</li>
                <li>Konvertera till <strong>MP3</strong> (använd gratis <a href="https://cloudconvert.com" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">CloudConvert.com</a>)</li>
                <li>Ladda upp MP3-filen här</li>
              </ol>
              
              <p className="text-xs text-muted-foreground">
                ⚡ Max 500MB. Endast MP3-filer accepteras för snabbast uppladdning. Du får ett mejl när transkriberingen är klar.
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
                Klicka för att välja MP3-fil
              </p>
              <p className="text-xs text-muted-foreground">
                ⚡ Endast MP3 (max 500MB)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,audio/mpeg,audio/mp3"
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
                      <span className="ml-2 text-green-600">⚡ Redo för uppladdning</span>
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
                  Laddar upp...
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
