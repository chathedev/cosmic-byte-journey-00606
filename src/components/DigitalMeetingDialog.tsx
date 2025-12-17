import { useState, useRef, useEffect } from "react";
import { Upload, FileAudio, X, AlertCircle, Lock, Loader2, Coffee, Sparkles, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SubscribeDialog } from "./SubscribeDialog";
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

// Friendly messages for large file uploads
const LARGE_FILE_MESSAGES = [
  { icon: Coffee, text: "Perfekt tillfälle för en kaffe ☕", subtext: "Vi bearbetar din inspelning med omsorg" },
  { icon: Sparkles, text: "Ditt möte är i goda händer", subtext: "Vi jobbar på det medan du tar en paus" },
  { icon: Heart, text: "Tack för ditt tålamod!", subtext: "Bra saker tar lite tid" },
];

const UPLOAD_TIPS = [
  "Tips: Större filer innehåller mer ljuddetaljer för bättre noggrannhet",
  "Visste du? Vi bearbetar tusentals mötestimmar varje dag",
  "Visste du? Tydligt ljud ger 98% transkriptionsnoggrannhet",
  "Tips: Granska din transkription direkt när den är klar",
];

export const DigitalMeetingDialog = ({ 
  open, 
  onOpenChange, 
  onTranscriptReady,
  selectedLanguage 
}: DigitalMeetingDialogProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showSubscribeDialog, setShowSubscribeDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { userPlan, isAdmin } = useSubscription();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Check if file is large (>50MB)
  const isLargeFile = selectedFile && selectedFile.size > 50 * 1024 * 1024;
  const fileSizeMB = selectedFile ? selectedFile.size / 1024 / 1024 : 0;

  // Rotate messages and tips during upload
  useEffect(() => {
    if (!isSubmitting || !isLargeFile) return;
    
    const messageInterval = setInterval(() => {
      setCurrentMessageIndex(prev => (prev + 1) % LARGE_FILE_MESSAGES.length);
    }, 5000);

    const tipInterval = setInterval(() => {
      setCurrentTipIndex(prev => (prev + 1) % UPLOAD_TIPS.length);
    }, 7000);

    return () => {
      clearInterval(messageInterval);
      clearInterval(tipInterval);
    };
  }, [isSubmitting, isLargeFile]);

  // Check if user has upload access (Pro, Enterprise, or Admin)
  const hasUploadAccess = userPlan && (
    userPlan.plan === 'pro' || 
    userPlan.plan === 'enterprise' || 
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

    // Check file size (max 500MB for background upload)
    const maxSizeMB = 500;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast({
        title: "Filen är för stor",
        description: `Maximal filstorlek är ${maxSizeMB}MB. Din fil är ${(file.size / 1024 / 1024).toFixed(1)}MB`,
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !user || isSubmitting) return;

    setIsSubmitting(true);
    
    const file = selectedFile;
    const languageCode = selectedLanguage === 'sv-SE' ? 'sv' : 'en';
    const meetingTitle = file.name.replace(/\.[^/.]+$/, '') || 'Uppladdat möte';
    
    console.log('📤 Starting upload flow - POST to /transcribe first');
    console.log('  - File:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    
    if (file.size < 1000) {
      toast({
        title: "Filen verkar tom",
        description: "Den valda filen verkar vara tom. Välj en annan fil.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    const token = localStorage.getItem('authToken');
    if (!token) {
      toast({
        title: "Autentisering krävs",
        description: "Ladda om sidan och logga in igen.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      // Step 1: POST audio to /asr/transcribe - backend starts transcription and returns server-generated meetingId
      const formData = new FormData();
      formData.append('audio', file, file.name);
      formData.append('language', languageCode);
      formData.append('title', meetingTitle);

      console.log('📤 Step 1: Uploading to /asr/transcribe...');

      const transcribeResponse = await fetch('https://api.tivly.se/asr/transcribe', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!transcribeResponse.ok) {
        const errorText = await transcribeResponse.text();
        console.error('Transcribe error:', errorText);
        throw new Error('Failed to start transcription');
      }

      // Get the server-generated meetingId from response
      const transcribeResult = await transcribeResponse.json();
      const meetingId = transcribeResult.meetingId || transcribeResult.meeting_id || transcribeResult.id;
      
      if (!meetingId) {
        console.error('No meetingId in response:', transcribeResult);
        throw new Error('No meeting ID returned from transcription service');
      }
      
      console.log('✅ Upload complete - meetingId:', meetingId);

      // Save pending meeting to sessionStorage for instant display on meeting page
      const pendingMeeting = {
        id: meetingId,
        title: meetingTitle,
        transcript: '',
        transcriptionStatus: 'processing',
        folder: 'General',
        source: 'upload',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      sessionStorage.setItem('pendingMeeting', JSON.stringify(pendingMeeting));

      // Close dialog and redirect immediately (do not wait for any extra checks)
      onOpenChange(false);
      setSelectedFile(null);
      setIsSubmitting(false);

      toast({
        title: 'Uppladdning klar! 🎉',
        description: 'Transkription har startat. Vi har den klar åt dig snart.',
      });

      navigate(`/meetings/${meetingId}`);


    } catch (error: any) {
      console.error('Upload error:', error);
      setIsSubmitting(false);
      toast({
        title: "Något gick fel",
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
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-muted-foreground" />
                Ladda upp möten
              </DialogTitle>
              <DialogDescription>
                Denna funktion kräver Pro- eller Enterprise-plan
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
                      och få dem automatiskt transkriberade med hög noggrannhet.
                    </p>
                    <ul className="list-disc list-inside text-sm text-muted-foreground mt-2">
                      <li>Stöd för MP3, WAV och M4A</li>
                      <li>Sparas i ditt bibliotek</li>
                      <li>E-postnotifiering när det är klart</li>
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Stäng
                </Button>
                <Button onClick={() => {
                  setShowSubscribeDialog(true);
                }}>
                  Uppgradera till Pro
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <SubscribeDialog open={showSubscribeDialog} onOpenChange={setShowSubscribeDialog} />
      </>
    );
  }

  const currentMessage = LARGE_FILE_MESSAGES[currentMessageIndex];
  const CurrentIcon = currentMessage.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Ladda upp mötesinspelning</DialogTitle>
          <DialogDescription>
            Transkribera en ljudfil från ditt digitala möte
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
                  Stöder MP3, WAV och M4A. Max 500MB. Uppladdning sker i bakgrunden.
                </p>
              </div>
            </AlertDescription>
          </Alert>

          {/* File upload area */}
          {!selectedFile ? (
            <div 
              onClick={() => !isSubmitting && fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-accent/5 transition-colors"
            >
              <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">
                Klicka för att välja en ljudfil
              </p>
              <p className="text-xs text-muted-foreground">
                MP3, WAV eller M4A (max 500MB)
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
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    ) : (
                      <FileAudio className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fileSizeMB.toFixed(2)} MB
                      {isLargeFile && !isSubmitting && (
                        <span className="ml-2 text-primary">• Stor fil</span>
                      )}
                    </p>
                  </div>
                </div>
                {!isSubmitting && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRemoveFile}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              {/* Enhanced upload state for large files */}
              <AnimatePresence mode="wait">
                {isSubmitting && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 pt-4 border-t border-border"
                  >
                    {isLargeFile ? (
                      <div className="space-y-4">
                        {/* Friendly large file message */}
                        <motion.div 
                          key={currentMessageIndex}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/10"
                        >
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <CurrentIcon className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {currentMessage.text}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {currentMessage.subtext}
                            </p>
                          </div>
                        </motion.div>

                        {/* Animated progress bar */}
                        <div className="space-y-2">
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <motion.div 
                              className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full"
                              initial={{ width: "0%" }}
                              animate={{ width: "100%" }}
                              transition={{ 
                                duration: 30,
                                ease: "linear"
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Laddar upp {fileSizeMB.toFixed(0)}MB...</span>
                            <span>Detta kan ta några minuter</span>
                          </div>
                        </div>

                        {/* Rotating tips */}
                        <motion.p 
                          key={currentTipIndex}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="text-xs text-center text-muted-foreground italic"
                        >
                          💡 {UPLOAD_TIPS[currentTipIndex]}
                        </motion.p>
                      </div>
                    ) : (
                      <div className="text-center space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Laddar upp din inspelning...
                        </p>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden max-w-xs mx-auto">
                          <motion.div 
                            className="h-full bg-primary rounded-full"
                            initial={{ width: "0%" }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 8, ease: "linear" }}
                          />
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Upload button */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Avbryt
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Laddar upp...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Ladda upp
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};