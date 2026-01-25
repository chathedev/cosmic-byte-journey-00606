// Audio Backup Card - Failsafe component for downloading or re-uploading audio
// Shows when audio backup is available from server, regardless of transcription status

import { useState } from "react";
import { Download, RefreshCw, Loader2, Upload, CheckCircle2, HardDrive, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { downloadAudioBackup, type AudioBackup } from "@/lib/asrService";
import { retryTranscriptionFromBackup } from "@/lib/audioRetry";

interface AudioBackupCardProps {
  meetingId: string;
  audioBackup: AudioBackup;
  transcriptionStatus: 'uploading' | 'queued' | 'processing' | 'done' | 'failed' | null;
  onRetryStarted?: () => void;
  onReuploadNeeded?: () => void;
  className?: string;
  variant?: 'compact' | 'full';
}

export function AudioBackupCard({
  meetingId,
  audioBackup,
  transcriptionStatus,
  onRetryStarted,
  onReuploadNeeded,
  className = '',
  variant = 'full'
}: AudioBackupCardProps) {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [encryptionError, setEncryptionError] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadAudioBackup(meetingId, audioBackup.downloadPath);
      toast({
        title: 'Nedladdning startad',
        description: 'Din ljudinspelning laddas ner.',
      });
    } catch (error: any) {
      toast({
        title: 'Nedladdning misslyckades',
        description: error?.message || 'Kunde inte ladda ner ljudfilen.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    setEncryptionError(false);
    try {
      const result = await retryTranscriptionFromBackup(meetingId, audioBackup.downloadPath);
      if (result.success) {
        toast({
          title: 'Transkribering startad',
          description: 'Din inspelning transkriberas på nytt.',
        });
        onRetryStarted?.();
      } else {
        // Check for encryption metadata error - suggest re-upload
        if (result.errorCode === 'audio_encryption_metadata_missing') {
          setEncryptionError(true);
          toast({
            title: 'Ljudfilen kunde inte dekrypteras',
            description: 'Ladda upp originalfilen igen för att transkribera på nytt.',
            variant: 'destructive',
          });
        } else {
          throw new Error(result.error || 'Kunde inte starta om transkribering');
        }
      }
    } catch (error: any) {
      toast({
        title: 'Kunde inte starta om',
        description: error?.message || 'Försök igen om en stund.',
        variant: 'destructive',
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const fileSizeMB = audioBackup.sizeBytes 
    ? (audioBackup.sizeBytes / 1024 / 1024).toFixed(1) 
    : null;

  const showRetryButton = transcriptionStatus === 'failed' && !encryptionError;
  const showReuploadButton = encryptionError && onReuploadNeeded;

  // Compact variant - just buttons
  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          disabled={isDownloading}
          className="gap-1.5 h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
        >
          {isDownloading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Download className="w-3 h-3" />
          )}
          Ladda ner ljud
        </Button>
        {showRetryButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRetry}
            disabled={isRetrying}
            className="gap-1.5 h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
          >
            {isRetrying ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Försök igen
          </Button>
        )}
        {showReuploadButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReuploadNeeded}
            className="gap-1.5 h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
          >
            <Upload className="w-3 h-3" />
            Ladda upp igen
          </Button>
        )}
      </div>
    );
  }

  // Full card variant
  return (
    <div className={`rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 ${className}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <HardDrive className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium text-sm">Ljudinspelning säkrad</p>
            <Badge variant="outline" className="gap-1 text-xs border-accent/30 bg-accent/5 text-accent-foreground">
              <CheckCircle2 className="w-3 h-3" />
              Säkrad
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {audioBackup.originalName || 'inspelning.wav'}
            {fileSizeMB && ` • ${fileSizeMB} MB`}
            {audioBackup.mimeType && ` • ${audioBackup.mimeType.split('/')[1]?.toUpperCase()}`}
          </p>
          {audioBackup.savedAt && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Sparad {new Date(audioBackup.savedAt).toLocaleString('sv-SE')}
            </p>
          )}
        </div>
      </div>

      {/* Encryption error warning */}
      {encryptionError && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Dekryptering misslyckades</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ljudfilen på servern kunde inte dekrypteras. Ladda upp originalfilen igen för att transkribera.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex-1 gap-2"
          variant="outline"
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Ladda ner inspelning
        </Button>

        {showRetryButton && (
          <Button
            onClick={handleRetry}
            disabled={isRetrying}
            className="flex-1 gap-2"
            variant="default"
          >
            {isRetrying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Transkribera igen
          </Button>
        )}

        {showReuploadButton && (
          <Button
            onClick={onReuploadNeeded}
            className="flex-1 gap-2"
            variant="default"
          >
            <Upload className="w-4 h-4" />
            Ladda upp originalfil
          </Button>
        )}
      </div>

      {transcriptionStatus === 'failed' && !encryptionError && (
        <p className="text-xs text-muted-foreground text-center mt-3">
          Du kan ladda ner din inspelning eller försöka transkribera igen
        </p>
      )}
    </div>
  );
}
