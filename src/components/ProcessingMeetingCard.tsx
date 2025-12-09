import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, AlertCircle, RefreshCw, FileAudio } from 'lucide-react';
import { getUploadStatus, subscribeToUpload, retryUpload } from '@/lib/backgroundUploader';
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

  useEffect(() => {
    // Check initial upload status
    const status = getUploadStatus(meetingId);
    if (status) {
      setUploadProgress(status.progress);
      setUploadStatus(status.status);
      setUploadError(status.error);
    }

    // Subscribe to upload updates
    const unsubscribe = subscribeToUpload((id, newStatus) => {
      if (id === meetingId) {
        setUploadProgress(newStatus.progress);
        setUploadStatus(newStatus.status);
        setUploadError(newStatus.error);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [meetingId]);

  const handleRetry = () => {
    retryUpload(meetingId);
  };

  const isUploading = uploadStatus === 'uploading' || uploadStatus === 'pending';
  const isUploadComplete = uploadStatus === 'complete';
  const isUploadError = uploadStatus === 'error';
  const isFailed = transcriptionStatus === 'failed' || isUploadError;

  const getStatusText = () => {
    if (isFailed) return 'Transkribering misslyckades';
    if (isUploading) return uploadProgress < 100 ? `Laddar upp... ${uploadProgress}%` : 'Laddar upp...';
    if (isUploadComplete || transcriptionStatus === 'processing') return 'Analyserar ljudfil...';
    return 'Bearbetar...';
  };

  const getProgressValue = () => {
    if (isFailed) return 0;
    if (isUploading) return uploadProgress;
    // After upload, show indeterminate progress for processing
    return undefined;
  };

  const progressValue = getProgressValue();

  return (
    <Card className={cn(
      "border-2 transition-all duration-300",
      isFailed ? "border-destructive/50 bg-destructive/5" : "border-primary/30 bg-primary/5"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={cn(
            "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
            isFailed ? "bg-destructive/10" : "bg-primary/10"
          )}>
            {isFailed ? (
              <AlertCircle className="w-6 h-6 text-destructive" />
            ) : isUploading ? (
              <Upload className="w-6 h-6 text-primary animate-pulse" />
            ) : (
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium text-foreground truncate">{title}</h3>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {new Date(createdAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* Status text */}
            <p className={cn(
              "text-sm",
              isFailed ? "text-destructive" : "text-muted-foreground"
            )}>
              {getStatusText()}
            </p>

            {/* Error message */}
            {isFailed && uploadError && (
              <p className="text-xs text-destructive/80">{uploadError}</p>
            )}

            {/* Progress bar */}
            {!isFailed && (
              <div className="space-y-1">
                {progressValue !== undefined ? (
                  <Progress value={progressValue} className="h-1.5" />
                ) : (
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary/50 w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite]" 
                         style={{ 
                           animation: 'shimmer 1.5s ease-in-out infinite',
                         }} />
                  </div>
                )}
              </div>
            )}

            {/* Retry button for failed uploads */}
            {isFailed && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRetry}
                className="mt-2"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Försök igen
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
