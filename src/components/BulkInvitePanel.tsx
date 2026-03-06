import { useState } from 'react';
import { Users, Loader2, CheckCircle2, XCircle, AlertTriangle, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface BulkInviteResult {
  success: boolean;
  email: string;
  action?: string;
  error?: string;
  message?: string;
  invite?: { attempted: boolean; sent: boolean; reason: string };
}

interface BulkInviteSummary {
  requested: number;
  accepted: number;
  succeeded: number;
  failed: number;
  invalid: number;
  duplicates: number;
  truncated: boolean;
  maxEntries: number;
}

interface BulkInviteResponse {
  results: BulkInviteResult[];
  summary: BulkInviteSummary;
  subscriptionSync?: {
    synced: boolean;
    reason?: string;
    pricing?: any;
    error?: string;
  };
}

interface BulkInvitePanelProps {
  onSubmit: (data: {
    emails: string;
    role: string;
    sendInvite: boolean;
    resendInvite: boolean;
  }) => Promise<BulkInviteResponse>;
  onSuccess?: () => void;
  maxMembers?: number;
  currentMembers?: number;
  isTrialActive?: boolean;
  planType?: 'team' | 'enterprise' | string;
}

const TEAM_TRIAL_CAP = 5;
const TEAM_ABSOLUTE_CAP = 35;

export function BulkInvitePanel({ onSubmit, onSuccess, maxMembers, currentMembers, isTrialActive, planType }: BulkInvitePanelProps) {
  const { toast } = useToast();
  const [emailText, setEmailText] = useState('');
  const [role, setRole] = useState('member');
  const [sendInvite, setSendInvite] = useState(true);
  const [resendInvite, setResendInvite] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<BulkInviteResponse | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const parsedEmails = emailText.trim()
    ? emailText.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.length > 0)
    : [];
  const parsedCount = parsedEmails.length;

  // Calculate effective cap
  const isTeamPlan = planType === 'team';
  const effectiveCap = isTeamPlan
    ? (isTrialActive ? TEAM_TRIAL_CAP : TEAM_ABSOLUTE_CAP)
    : maxMembers;
  const currentCount = currentMembers ?? 0;
  const remainingSlots = effectiveCap ? Math.max(0, effectiveCap - currentCount) : undefined;
  const wouldExceed = remainingSlots !== undefined && parsedCount > remainingSlots;
  const atLimit = remainingSlots !== undefined && remainingSlots <= 0;

  const handleSubmit = async () => {
    if (!emailText.trim()) return;

    setIsSubmitting(true);
    setResults(null);
    try {
      const response = await onSubmit({
        emails: emailText,
        role,
        sendInvite,
        resendInvite,
      });
      setResults(response);

      const { summary } = response;
      if (summary.failed === 0 && summary.succeeded > 0) {
        toast({
          title: `${summary.succeeded} inbjudna`,
          description: summary.duplicates > 0
            ? `${summary.duplicates} duplicerade hoppades över`
            : 'Alla inbjudningar skickade',
        });
        setEmailText('');
        onSuccess?.();
      } else if (summary.succeeded > 0) {
        toast({
          title: `${summary.succeeded} av ${summary.requested} lyckades`,
          description: `${summary.failed} misslyckades – se detaljer nedan`,
          variant: 'destructive',
        });
        // Keep failed emails for retry
        const failedEmails = response.results
          .filter(r => !r.success)
          .map(r => r.email)
          .join('\n');
        setEmailText(failedEmails);
        onSuccess?.();
      } else {
        toast({
          title: 'Inga inbjudningar skickade',
          description: summary.invalid > 0
            ? `${summary.invalid} ogiltiga e-postadresser`
            : 'Kontrollera felen nedan',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      const errorCode = error.code || '';
      if (errorCode === 'team_trial_member_limit_reached') {
        toast({
          title: 'Trialgräns nådd',
          description: 'Max 5 medlemmar under trial. Aktivera planen för att bjuda in fler.',
          variant: 'destructive',
        });
      } else if (errorCode === 'team_member_limit_reached') {
        toast({
          title: 'Platsgräns nådd',
          description: error.details?.limit
            ? `Max ${error.details.limit} aktiva medlemmar i Team-planen.`
            : 'Organisationen har nått maxgränsen för aktiva medlemmar.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Fel',
          description: error.message || 'Kunde inte skicka inbjudningar',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Capacity info */}
      {effectiveCap && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {currentCount} av {effectiveCap} platser använda
              {isTeamPlan && !isTrialActive && (
                <span className="text-muted-foreground/60"> (5 ingår + max 30 extra)</span>
              )}
            </span>
            {remainingSlots !== undefined && remainingSlots > 0 && (
              <span className="font-medium text-foreground">{remainingSlots} kvar</span>
            )}
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all rounded-full ${atLimit ? 'bg-destructive' : wouldExceed ? 'bg-amber-500' : 'bg-primary'}`}
              style={{ width: `${Math.min((currentCount / effectiveCap) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Trial warning */}
      {isTrialActive && isTeamPlan && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Trial: max {TEAM_TRIAL_CAP} medlemmar
            </p>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70 mt-0.5">
              Aktivera planen för att lägga till upp till {TEAM_ABSOLUTE_CAP} medlemmar (199 kr/extra användare/mån).
            </p>
          </div>
        </div>
      )}

      {/* At limit */}
      {atLimit && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/5">
          <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-destructive">Alla {effectiveCap} platser är fyllda</p>
            <p className="text-[11px] text-destructive/70 mt-0.5">
              {isTeamPlan && !isTrialActive
                ? 'Team-planen stödjer max 35 aktiva medlemmar.'
                : isTrialActive
                  ? 'Aktivera planen för att lägga till fler.'
                  : 'Kontakta support för att utöka.'}
            </p>
          </div>
        </div>
      )}

      {/* Textarea */}
      <div className="space-y-2">
        <Label htmlFor="bulk-emails" className="text-xs text-muted-foreground">
          Klistra in e-postadresser (en per rad, eller separerade med komma)
        </Label>
        <Textarea
          id="bulk-emails"
          placeholder={"anna@bolag.se\nbertil@bolag.se\ncecilia@bolag.se"}
          value={emailText}
          onChange={e => setEmailText(e.target.value)}
          className="min-h-[100px] text-sm font-mono resize-y"
          disabled={isSubmitting || atLimit}
        />
        <div className="flex items-center justify-between">
          <span className={`text-[11px] ${wouldExceed ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}`}>
            {parsedCount > 0
              ? wouldExceed
                ? `${parsedCount} adresser – överskrider med ${parsedCount - (remainingSlots ?? 0)}`
                : `${parsedCount} adress${parsedCount === 1 ? '' : 'er'} hittade`
              : 'Inga adresser'}
            {parsedCount > 200 && ' (max 200 per omgång)'}
          </span>
        </div>
      </div>

      {/* Advanced settings toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Avancerat
      </button>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Roll</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Medlem</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="viewer">Läsare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Skicka inbjudan</Label>
                  <Switch checked={sendInvite} onCheckedChange={setSendInvite} className="scale-75" />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Skicka igen</Label>
                  <Switch checked={resendInvite} onCheckedChange={setResendInvite} className="scale-75" />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={parsedCount === 0 || isSubmitting}
        className="w-full h-10 text-sm"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Bjuder in {parsedCount} person{parsedCount === 1 ? '' : 'er'}…
          </>
        ) : (
          <>
            <Users className="w-4 h-4 mr-2" />
            Bjud in {parsedCount > 0 ? `${parsedCount} person${parsedCount === 1 ? '' : 'er'}` : ''}
          </>
        )}
      </Button>

      {/* Results */}
      <AnimatePresence>
        {results && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {/* Summary */}
            <div className="flex flex-wrap gap-2">
              {results.summary.succeeded > 0 && (
                <Badge variant="outline" className="text-[11px] border-green-300 text-green-700 dark:border-green-800 dark:text-green-400">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {results.summary.succeeded} lyckades
                </Badge>
              )}
              {results.summary.failed > 0 && (
                <Badge variant="outline" className="text-[11px] border-destructive/30 text-destructive">
                  <XCircle className="w-3 h-3 mr-1" />
                  {results.summary.failed} misslyckades
                </Badge>
              )}
              {results.summary.duplicates > 0 && (
                <Badge variant="outline" className="text-[11px] border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                  <Copy className="w-3 h-3 mr-1" />
                  {results.summary.duplicates} dubbletter
                </Badge>
              )}
              {results.summary.invalid > 0 && (
                <Badge variant="outline" className="text-[11px] border-muted-foreground/30 text-muted-foreground">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {results.summary.invalid} ogiltiga
                </Badge>
              )}
            </div>

            {/* Subscription sync info */}
            {results.subscriptionSync?.synced && results.subscriptionSync.pricing && (
              <div className="p-2.5 rounded-lg border border-primary/20 bg-primary/5 text-xs text-primary">
                Prenumeration uppdaterad – {results.subscriptionSync.reason || 'antal platser synkat'}
              </div>
            )}

            {/* Per-email results */}
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden max-h-[240px] overflow-y-auto">
              {results.results.map((r, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
                  {r.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                  )}
                  <span className="font-mono truncate flex-1">{r.email}</span>
                  <span className="text-muted-foreground shrink-0">
                    {r.success
                      ? r.action === 'created' ? 'Skapad' : r.action === 'updated' ? 'Uppdaterad' : r.action || 'OK'
                      : r.message || r.error || 'Fel'}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
