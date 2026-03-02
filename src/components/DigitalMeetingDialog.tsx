import { useState, useRef, useEffect } from "react";
import { Upload, FileAudio, X, AlertCircle, Lock, Loader2, Coffee, Sparkles, Heart, Users, Plus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SubscribeDialog } from "./SubscribeDialog";
import { startBackgroundUpload } from "@/lib/backgroundUploader";
import { meetingStorage } from "@/utils/meetingStorage";
interface DigitalMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTranscriptReady: (transcript: string) => void;
  selectedLanguage: 'sv-SE' | 'en-US';
  teamId?: string | null;
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

// Format long file names with smart truncation
const formatFileName = (name: string, maxLength: number = 30): string => {
  if (name.length <= maxLength) return name;
  
  const lastDotIndex = name.lastIndexOf('.');
  const ext = lastDotIndex > 0 ? name.slice(lastDotIndex) : '';
  const baseName = lastDotIndex > 0 ? name.slice(0, lastDotIndex) : name;
  
  // Reserve space for extension and ellipsis
  const availableLength = maxLength - ext.length - 3;
  if (availableLength <= 0) return name.slice(0, maxLength - 3) + '...';
  
  // Show start and end of filename
  const startLength = Math.ceil(availableLength * 0.6);
  const endLength = availableLength - startLength;
  
  return baseName.slice(0, startLength) + '...' + baseName.slice(-endLength) + ext;
};

export const DigitalMeetingDialog = ({ 
  open, 
  onOpenChange, 
  onTranscriptReady,
  selectedLanguage,
  teamId,
}: DigitalMeetingDialogProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showSubscribeDialog, setShowSubscribeDialog] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStep, setUploadStep] = useState<'file' | 'participants'>('file');
  const [participants, setParticipants] = useState<string[]>([""]);
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

  const validateAndSetFile = (file: File) => {
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    validateAndSetFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSubmitting) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (isSubmitting) return;
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !user || isSubmitting) return;

    setIsSubmitting(true);
    
    const file = selectedFile;
    const languageCode = selectedLanguage === 'sv-SE' ? 'sv' : 'en';
    const meetingTitle = file.name.replace(/\.[^/.]+$/, '') || 'Uppladdat möte';
    
    console.log('📤 Starting instant redirect upload flow');
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

    try {
      // Create meeting immediately with processing status
      // IMPORTANT: isCompleted must be true to get a real backend ID (not a temp draft ID)
      const now = new Date().toISOString();
      const filledParticipants = participants.map(p => p.trim()).filter(p => p.length > 0);
      const meetingData = {
        title: meetingTitle,
        folder: 'Allmänt',
        transcript: '',
        protocol: '',
        createdAt: now,
        updatedAt: now,
        userId: user.uid,
        isCompleted: true,
        source: 'upload' as const,
        transcriptionStatus: 'uploading' as const,
        forceCreate: true,
        ...(filledParticipants.length > 0 ? { participants: filledParticipants } : {}),
        ...(teamId ? { teamId, enterpriseTeamId: teamId, accessScope: 'team' as const } : {}),
      };

      // Save meeting to get an ID
      const meetingId = await meetingStorage.saveMeeting(meetingData as any);
      console.log('✅ Meeting created with ID:', meetingId);

      // Save pending meeting to sessionStorage for instant display on meeting page
      const pendingMeeting = {
        ...meetingData,
        id: meetingId,
        transcriptionStatus: 'uploading',
      };
      sessionStorage.setItem('pendingMeeting', JSON.stringify(pendingMeeting));

      // Close dialog immediately and redirect
      onOpenChange(false);
      setSelectedFile(null);
      setIsSubmitting(false);
      setUploadProgress(0);

      // Navigate to meeting detail page - upload progress will show there
      navigate(`/meetings/${meetingId}`);

      // Start background upload - this happens after redirect
      console.log('🎤 Starting background upload for file...');
      startBackgroundUpload(file, meetingId, languageCode);

      toast({
        title: 'Uppladdning startar',
        description: 'Du kan följa framstegen på mötessidan.',
      });

    } catch (error: any) {
      console.error('Upload error:', error);
      setIsSubmitting(false);
      toast({
        title: 'Något gick fel',
        description: error?.message || 'Försök igen.',
        variant: 'destructive',
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setUploadStep('file'); setParticipants([""]); } onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[600px]">
        {uploadStep === 'file' ? (
          <>
            <DialogHeader>
              <DialogTitle>Ladda upp mötesinspelning</DialogTitle>
              <DialogDescription>
                Transkribera en ljudfil från ditt digitala möte
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
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

              {!selectedFile ? (
                <div 
                  onClick={() => !isSubmitting && fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
                    isDragging 
                      ? 'border-primary bg-primary/10 scale-[1.02]' 
                      : 'border-border hover:border-primary hover:bg-accent/5'
                  }`}
                >
                  <Upload className={`w-12 h-12 mx-auto mb-4 transition-colors ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="text-sm font-medium text-foreground mb-1">
                    {isDragging ? 'Släpp filen här' : 'Dra och släpp eller klicka för att välja'}
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
                        <FileAudio className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0 max-w-[200px] sm:max-w-[300px]">
                        <p className="text-sm font-medium text-foreground truncate" title={selectedFile.name}>
                          {formatFileName(selectedFile.name, 30)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fileSizeMB.toFixed(2)} MB
                          {isLargeFile && (
                            <span className="ml-2 text-primary">• Stor fil</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleRemoveFile}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Avbryt
                </Button>
                <Button
                  onClick={() => setUploadStep('participants')}
                  disabled={!selectedFile}
                >
                  Nästa
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Mötesdeltagare
              </DialogTitle>
              <DialogDescription>
                Ange deltagarnas namn för bättre transkribering
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {participants.map((name, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>
                    </div>
                    <input
                      placeholder="Förnamn Efternamn"
                      value={name}
                      onChange={(e) => {
                        const updated = [...participants];
                        updated[index] = e.target.value;
                        setParticipants(updated);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && participants[index].trim()) {
                          e.preventDefault();
                          setParticipants(prev => [...prev, ""]);
                        }
                      }}
                      className="flex-1 h-10 px-3 rounded-xl border border-border/50 bg-muted/30 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
                      autoFocus={index === participants.length - 1}
                    />
                    {participants.length > 1 && (
                      <button
                        onClick={() => setParticipants(prev => prev.filter((_, i) => i !== index))}
                        className="w-7 h-7 rounded-full hover:bg-destructive/10 flex items-center justify-center shrink-0 transition-colors"
                      >
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={() => setParticipants(prev => [...prev, ""])}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Lägg till deltagare
              </button>

              <p className="text-xs text-muted-foreground/60 text-center">
                Fullständiga namn ger bättre namnigenkänning i transkriptet
              </p>

              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={() => setUploadStep('file')} className="gap-1">
                  <ArrowLeft className="h-4 w-4" />
                  Tillbaka
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setParticipants([""]); handleUpload(); }}
                    disabled={isSubmitting}
                  >
                    Hoppa över
                  </Button>
                  <Button
                    onClick={handleUpload}
                    disabled={isSubmitting}
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
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};