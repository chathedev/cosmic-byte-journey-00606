import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Hash, AlertTriangle, ExternalLink, Copy, Check } from "lucide-react";
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shareResult, setShareResult] = useState<{
    channelName?: string;
    shareLink?: { appUrl?: string; token?: string };
  } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

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
    setShareResult(null);
    setShared(false);
    if (sl.channels.length === 0 && sl.state !== 'loading_channels') {
      sl.loadChannels();
    }
  };

  const selectedChannelName = sl.channels.find(c => c.id === selectedChannel)?.name || "kanal";

  const handleRequestShare = () => {
    if (!selectedChannel) {
      toast({ title: "Välj en kanal", description: "Du måste välja vilken Slack-kanal protokollet ska delas till.", variant: "destructive" });
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmShare = async () => {
    setConfirmOpen(false);
    if (!selectedChannel) return;

    setSharing(true);

    // First create/ensure share link exists
    const linkResult = await sl.createShareLink(meetingId);

    // Then share to Slack
    const result = await sl.shareToSlack(meetingId, selectedChannel);
    setSharing(false);

    if (result?.shared) {
      setShared(true);
      setShareResult({
        channelName: result.channelName || selectedChannelName,
        shareLink: result.shareLink || linkResult,
      });
      toast({ title: "Delat till Slack", description: `Protokollet har delats till #${result.channelName || selectedChannelName}.` });
    } else if (sl.error) {
      toast({ title: "Kunde inte dela", description: sl.error, variant: "destructive" });
    }
  };

  const handleCopyLink = async () => {
    const url = shareResult?.shareLink?.appUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast({ title: "Kunde inte kopiera", variant: "destructive" });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className={`gap-2 h-9 text-xs font-semibold no-hover-lift border-[#611f69]/20 bg-[#611f69]/5 hover:bg-[#611f69]/10 hover:border-[#611f69]/30 text-[#611f69] dark:text-[#e8a5ef] dark:border-[#e8a5ef]/20 dark:bg-[#e8a5ef]/5 dark:hover:bg-[#e8a5ef]/10 ${className}`}
        disabled={sharing}
      >
        {shared ? (
          <CheckCircle2 className="w-4.5 h-4.5 text-green-600" />
        ) : (
          <img src={slackLogo} alt="" className="w-7 h-7 object-contain" />
        )}
        {!compact && (
          <span>{shared ? "Delat" : "Dela via Slack"}</span>
        )}
      </Button>

      {/* Channel selection / result dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <img src={slackLogo} alt="Slack" className="w-7 h-7 object-contain" />
              <DialogTitle className="text-base">
                {shareResult ? "Protokoll delat" : "Dela till Slack"}
              </DialogTitle>
            </div>
            <DialogDescription>
              {shareResult
                ? `Protokollet har skickats till #${shareResult.channelName}.`
                : "Välj vilken kanal protokollet ska delas till. En notis med länk till protokollet skickas."
              }
            </DialogDescription>
          </DialogHeader>

          {/* Success state */}
          {shareResult ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Delat till #{shareResult.channelName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Alla i kanalen kan nu se protokollet.</p>
                </div>
              </div>

              {shareResult.shareLink?.appUrl && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Publik länk</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 text-xs text-muted-foreground bg-muted/30 border border-border/50 rounded-lg px-3 py-2 truncate font-mono">
                      {shareResult.shareLink.appUrl}
                    </div>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopyLink}>
                      {linkCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
                      <a href={shareResult.shareLink.appUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Channel selection state */
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

              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/30">
                <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  En publik länk till protokollet skapas. Alla med länken kan se det.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {shareResult ? (
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Stäng</Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Avbryt</Button>
                <Button
                  size="sm"
                  onClick={handleRequestShare}
                  disabled={!selectedChannel || sharing}
                  className="gap-1.5"
                >
                  {sharing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <img src={slackLogo} alt="" className="w-4 h-4 object-contain" />
                  )}
                  {sharing ? "Delar..." : "Dela till Slack"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dela protokoll till #{selectedChannelName}?</AlertDialogTitle>
            <AlertDialogDescription>
              En notis med länk till protokollet skickas till <strong>#{selectedChannelName}</strong> i Slack. Alla i kanalen kommer kunna se det.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmShare} className="gap-1.5">
              <img src={slackLogo} alt="" className="w-4 h-4 object-contain" />
              Ja, dela
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}