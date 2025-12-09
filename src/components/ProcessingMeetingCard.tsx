import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, AlertCircle, RefreshCw, Mail } from 'lucide-react';
import { getUploadStatus, subscribeToUpload, retryUpload, isUploadStale } from '@/lib/backgroundUploader';
import { cn } from '@/lib/utils';

interface ProcessingMeetingCardProps {
  meetingId: string;
  title: string;
  transcriptionStatus: 'uploading' | 'processing' | 'failed';
  createdAt: string;
  onRetry?: () => void;
}

export function ProcessingMeetingCard({
  meetingId,
  title,
  transcriptionStatus,
  createdAt,
}: ProcessingMeetingCardProps) {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'pending' | 'uploading' | 'complete' | 'error'>('pending');
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    // Check initial upload status
    const status = getUploadStatus(meetingId);
    if (status) {
      setUploadProgress(status.progress);
      setUploadStatus(status.status);
      setUploadError(status.error);
    }
    
    // Check if stale
    setIsStale(isUploadStale(meetingId));

    // Subscribe to upload updates
    const unsubscribe = subscribeToUpload((id, newStatus) => {
      if (id === meetingId) {
        setUploadProgress(newStatus.progress);
        setUploadStatus(newStatus.status);
        setUploadError(newStatus.error);
        setIsStale(false); // Reset stale flag on any update
      }
    });

    // Check for staleness periodically
    const staleCheck = setInterval(() => {
      if (isUploadStale(meetingId)) {
        setIsStale(true);
        const status = getUploadStatus(meetingId);
        if (status) {
          setUploadStatus(status.status);
          setUploadError(status.error);
        }
      }
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(staleCheck);
    };
  }, [meetingId]);

  const handleRetry = () => {
    setIsStale(false);
    retryUpload(meetingId);
  };

  // Don't show if stale and stuck at 0%
  if (isStale && uploadProgress === 0 && !uploadError) {
    return null;
  }

  const isUploading = uploadStatus === 'uploading' || uploadStatus === 'pending';
  const isUploadComplete = uploadStatus === 'complete';
  const isUploadError = uploadStatus === 'error';
  const isFailed = transcriptionStatus === 'failed' || isUploadError;
  const isProcessing = isUploadComplete || transcriptionStatus === 'processing';

  const getStatusText = () => {
    if (isFailed) return uploadError || 'Uppladdning misslyckades';
    if (isUploading && uploadProgress > 0) return `Laddar upp... ${uploadProgress}%`;
    if (isUploading) return 'Förbereder uppladdning...';
    if (isProcessing) return 'Analyserar ljudfil...';
    return 'Bearbetar...';
  };

  return (
    <Card className={cn(
      "border-2 transition-all duration-300 overflow-hidden",
      isFailed ? "border-destructive/50 bg-destructive/5" : "border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10"
    )}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon with animation */}
          <div className={cn(
            "w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 relative",
            isFailed ? "bg-destructive/10" : "bg-primary/15"
          )}>
            {isFailed ? (
              <AlertCircle className="w-7 h-7 text-destructive" />
            ) : isUploading ? (
              <>
                <Upload className="w-7 h-7 text-primary" />
                <div className="absolute inset-0 rounded-xl border-2 border-primary/30 animate-ping" style={{ animationDuration: '2s' }} />
              </>
            ) : (
              <>
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
                <div className="absolute -inset-1 rounded-xl bg-primary/10 animate-pulse" />
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground truncate text-lg">{title}</h3>
              <span className="text-xs text-muted-foreground flex-shrink-0 bg-background/50 px-2 py-1 rounded">
                {new Date(createdAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* Status text with icon */}
            <div className="flex items-center gap-2">
              {!isFailed && isUploading && uploadProgress > 0 && (
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              )}
              <p className={cn(
                "text-sm font-medium",
                isFailed ? "text-destructive" : "text-primary"
              )}>
                {getStatusText()}
              </p>
            </div>

            {/* Progress bar - only show when uploading with progress */}
            {!isFailed && isUploading && uploadProgress > 0 && (
              <div className="space-y-1">
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {/* Processing shimmer animation */}
            {!isFailed && isProcessing && (
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-transparent via-primary/40 to-transparent w-1/2"
                  style={{ 
                    animation: 'shimmer 1.5s ease-in-out infinite',
                  }} 
                />
              </div>
            )}

            {/* Email notification hint for processing */}
            {!isFailed && isProcessing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background/50 rounded-lg px-3 py-2">
                <Mail className="w-4 h-4 text-primary" />
                <span>Du får ett mejl när det är klart</span>
              </div>
            )}

            {/* Retry button for failed uploads */}
            {isFailed && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRetry}
                className="mt-1"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Försök igen
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      {/* Add shimmer keyframes */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </Card>
  );
}
