import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Hash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSlackIntegration } from "@/hooks/useSlackIntegration";
import slackLogo from "@/assets/slack-logo.png";

interface SlackShareButtonProps {
  meetingId: string;
  /** Compact icon-only mode for tight button rows */
  compact?: boolean;
  className?: string;
}

export function SlackShareButton({ meetingId, compact = false, className = "" }: SlackShareButtonProps) {
  const sl = useSlackIntegration();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);

  // Pre-select auto-share channel
  useEffect(() => {
    if (sl.importStatus?.autoShare?.channelId && !selectedChannel) {
      setSelectedChannel(sl.importStatus.autoShare.channelId);
    }
  }, [sl.importStatus?.autoShare?.channelId]);

  // Don't render if Slack is not connected
  if (!sl.isFullyConnected) return null;

  const handleOpen = () => {
    setOpen(true);
    if (sl.channels.length === 0 && sl.state !== 'loading_channels') {
      sl.loadChannels();
    }
  };

  const handleShare = async () => {
    if (!selectedChannel) {
      toast({ title: "Välj en kanal", description: "Du måste välja vilken Slack-kanal protokollet ska delas till.", variant: "destructive" });
      return;
    }
    setSharing(true);
    const result = await sl.shareToSlack(meetingId, selectedChannel);
    setSharing(false);
    if (result?.shared) {
      setShared(true);
      setOpen(false);
      const channelName = sl.channels.find(c => c.id === selectedChannel)?.name || "kanal";
      toast({ title: "Delat till Slack", description: `Protokollet har delats till #${channelName}.` });
    } else if (sl.error) {
      toast({ title: "Kunde inte dela", description: sl.error, variant: "destructive" });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className={`gap-1.5 h-9 text-xs no-hover-lift ${className}`}
        disabled={shared}
      >
        {shared ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
        ) : (
          <img src={slackLogo} alt="" className="w-4 h-4 object-contain" />
        )}
        {!compact && (
          <span>{shared ? "Delat" : "Dela via Slack"}</span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <img src={slackLogo} alt="Slack" className="w-6 h-6 object-contain" />
              <DialogTitle className="text-base">Dela till Slack</DialogTitle>
            </div>
            <DialogDescription>
              Välj vilken kanal protokollet ska delas till.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">Kanal</span>
            </div>
            <Select value={selectedChannel || ''} onValueChange={setSelectedChannel}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={sl.state === 'loading_channels' ? 'Laddar kanaler...' : 'Välj kanal...'} />
              </SelectTrigger>
              <SelectContent>
                {sl.channels.map(ch => (
                  <SelectItem key={ch.id} value={ch.id}>
                    <span className="flex items-center gap-1.5">
                      <Hash className="w-3 h-3 text-muted-foreground" />
                      {ch.name}
                      {ch.isPrivate && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">Privat</Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
                {sl.channels.length === 0 && sl.state !== 'loading_channels' && (
                  <SelectItem value="_empty" disabled>Inga kanaler hittades</SelectItem>
                )}
              </SelectContent>
            </Select>

            {sl.importStatus?.account?.workspaceName && (
              <p className="text-[10px] text-muted-foreground">
                Workspace: {sl.importStatus.account.workspaceName}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button
              size="sm"
              onClick={handleShare}
              disabled={!selectedChannel || sharing}
              className="gap-1.5"
            >
              {sharing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <img src={slackLogo} alt="" className="w-3.5 h-3.5 object-contain" />
              )}
              {sharing ? "Delar..." : "Dela till Slack"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
