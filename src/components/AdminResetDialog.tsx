import { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, RotateCcw, MessageCircle, FileText } from 'lucide-react';

interface UserData {
  email: string;
  meetingUsage?: {
    meetingCount: number;
    meetingLimit: number | null;
  };
  chatMessageCount?: number;
  chatMessageLimit?: number | null;
}

interface AdminResetDialogProps {
  user: UserData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReset: (options: {
    resetMeetings: boolean;
    resetChat: boolean;
    note?: string;
  }) => Promise<void>;
  isResetting: boolean;
  getUsedMeetings: (user: UserData) => number;
  getEffectiveMeetingLimit: (user: UserData) => number | null;
}

export function AdminResetDialog({
  user,
  open,
  onOpenChange,
  onReset,
  isResetting,
  getUsedMeetings,
  getEffectiveMeetingLimit,
}: AdminResetDialogProps) {
  const [resetMeetings, setResetMeetings] = useState(true);
  const [resetChat, setResetChat] = useState(false);
  const [resetNote, setResetNote] = useState('');

  const handleReset = async () => {
    if (!resetMeetings && !resetChat) return;
    
    await onReset({
      resetMeetings,
      resetChat,
      note: resetNote || undefined,
    });
    
    // Reset state after successful reset
    setResetMeetings(true);
    setResetChat(false);
    setResetNote('');
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setResetMeetings(true);
      setResetChat(false);
      setResetNote('');
    }
    onOpenChange(isOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-orange-500" />
            Reset Usage
          </AlertDialogTitle>
          <AlertDialogDescription>
            Choose what to reset for <span className="font-semibold text-foreground">{user?.email}</span>.
            This sets counters back to zero without deleting any data.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* Reset Options */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">What to reset:</Label>
            
            {/* Meetings Reset */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
              <Checkbox
                id="reset-meetings"
                checked={resetMeetings}
                onCheckedChange={(checked) => setResetMeetings(checked === true)}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="reset-meetings"
                  className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-primary" />
                  Meeting Counter
                </label>
                {user && (
                  <p className="text-xs text-muted-foreground">
                    Currently: {getUsedMeetings(user)}{getEffectiveMeetingLimit(user) !== null ? ` / ${getEffectiveMeetingLimit(user)}` : ''} meetings
                  </p>
                )}
              </div>
            </div>

            {/* Chat Reset */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
              <Checkbox
                id="reset-chat"
                checked={resetChat}
                onCheckedChange={(checked) => setResetChat(checked === true)}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="reset-chat"
                  className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4 text-accent" />
                  Chat Message Counter
                </label>
                <p className="text-xs text-muted-foreground">
                  Currently: {user?.chatMessageCount ?? 0}{user?.chatMessageLimit !== null && user?.chatMessageLimit !== undefined ? ` / ${user.chatMessageLimit}` : ''} messages
                </p>
              </div>
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="reset-note">Admin Note (optional)</Label>
            <Textarea
              id="reset-note"
              placeholder="e.g., Manual reset per customer request"
              value={resetNote}
              onChange={(e) => setResetNote(e.target.value.slice(0, 500))}
              className="resize-none"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              {resetNote.length}/500 characters
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReset}
            disabled={isResetting || (!resetMeetings && !resetChat)}
            className="bg-orange-600 text-white hover:bg-orange-700"
          >
            {isResetting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              <>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset Selected
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
