import { useState, useRef } from "react";
import { Upload, FileAudio, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

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
    if (!selectedFile) return;

    setIsUploading(true);

    try {
      // Map language code to backend format
      const languageCode = selectedLanguage === 'sv-SE' ? 'sv' : 'en';
      
      const result = await apiClient.transcribeAudio(selectedFile, languageCode);
      
      if (!result.success) {
        throw new Error(result.error || 'transcription_failed');
      }

      const transcript = result.transcript || result.text || '';
      
      if (!transcript.trim()) {
        throw new Error('no_speech_detected');
      }
      
      toast({
        title: "Transkribering klar!",
        description: result.processing_time 
          ? `Transkriberat på ${result.processing_time.toFixed(1)}s` 
          : "Ditt möte har transkriberats.",
      });

      onTranscriptReady(transcript);
      onOpenChange(false);
      setSelectedFile(null);
    } catch (error: any) {
      console.error('Upload error:', error);
      
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
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
                  Max filstorlek: 500MB. Endast ljudfiler accepteras (inga videofiler).
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
                  Transkriberar...
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
