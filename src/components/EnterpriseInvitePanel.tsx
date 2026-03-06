import { useState, useEffect } from 'react';
import { useScrollToInputHandler } from '@/hooks/useScrollToInput';
import { UserPlus, Loader2, Check, Users, Mail, Shield, Crown, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { BulkInvitePanel } from '@/components/BulkInvitePanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MemberInfo {
  email: string;
  preferredName?: string;
  role?: string;
  verified?: boolean;
  lastLoginAt?: string;
}

export function EnterpriseInvitePanel() {
  const { enterpriseMembership } = useSubscription();
  const { toast } = useToast();
  const { handleFocus: scrollOnFocus } = useScrollToInputHandler();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [recentInvites, setRecentInvites] = useState<string[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  const company = enterpriseMembership?.company;
  const role = enterpriseMembership?.membership?.role;
  const canInvite = role === 'admin' || role === 'owner';
  const canViewMembers = role === 'admin' || role === 'owner' || role === 'member';

  useEffect(() => {
    if (!company?.id || !canViewMembers) return;
    loadMembers();
  }, [company?.id, canViewMembers]);

  const loadMembers = async () => {
    if (!company?.id) return;
    setLoadingMembers(true);
    try {
      const stats = await apiClient.getEnterpriseCompanyStats(company.id);
      if (stats.scoreboard) {
        setMembers(stats.scoreboard.map(m => ({
          email: m.email,
          preferredName: m.preferredName,
          role: m.role,
          verified: m.verified,
          lastLoginAt: m.lastLoginAt,
        })));
      }
    } catch (err) {
      console.error('[EnterpriseInvitePanel] Failed to load members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  if (!company || !canViewMembers) return null;

  const memberLimit = (company as any).memberLimit;
  const planType = (company as any).planType || (company as any).plan;
  const isTeamPlan = planType === 'team';
  const memberCount = members.length || (company as any).memberCount || 0;
  const trialObj = (company as any).trial;
  const isTrial = !!(trialObj?.enabled && !trialObj?.expired && !trialObj?.manuallyDisabled);
  const effectiveCap = isTeamPlan ? (isTrial ? 5 : 35) : (typeof memberLimit === 'number' && memberLimit > 0 ? memberLimit : undefined);
  const hasLimit = effectiveCap !== undefined;
  const atLimit = hasLimit && memberCount >= effectiveCap;

  const handleInvite = async () => {
    if (!email.trim()) return;
    if (atLimit) {
      toast({
        title: 'Platsgräns nådd',
        description: `Företaget har nått sin gräns på ${memberLimit} medlemmar.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsInviting(true);
      await apiClient.inviteEnterpriseCompanyMember(company.id, {
        email: email.trim().toLowerCase(),
        role: 'member',
        preferredName: name.trim() || undefined,
      });

      toast({
        title: 'Inbjudan skickad',
        description: `${name.trim() || email.trim()} har bjudits in till ${company.name}`,
      });

      setRecentInvites(prev => [email.trim(), ...prev.slice(0, 4)]);
      setEmail('');
      setName('');
      setShowInviteForm(false);
      loadMembers();
    } catch (error: any) {
      toast({
        title: 'Kunde inte bjuda in',
        description: error?.message || 'Ett oväntat fel uppstod',
        variant: 'destructive',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleBulkInvite = async (data: { emails: string; role: string; sendInvite: boolean; resendInvite: boolean }) => {
    return apiClient.bulkInviteEnterpriseMembers(company.id, {
      emails: data.emails,
      role: data.role,
      sendInvite: data.sendInvite,
      resendInvite: data.resendInvite,
    });
  };

  const getRoleBadge = (memberRole?: string) => {
    if (memberRole === 'owner') return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary"><Crown className="w-2.5 h-2.5 mr-0.5" />Ägare</Badge>;
    if (memberRole === 'admin') return <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-accent/30 text-accent"><Shield className="w-2.5 h-2.5 mr-0.5" />Admin</Badge>;
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Medlemmar</h3>
          {hasLimit && (
            <span className="text-xs text-muted-foreground">
              {memberCount} av {memberLimit}
            </span>
          )}
        </div>
        {canInvite && !atLimit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="h-7 text-xs gap-1"
          >
            <UserPlus className="w-3 h-3" />
            Bjud in
            {showInviteForm ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        )}
      </div>

      {/* Capacity bar */}
      {hasLimit && (
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all rounded-full ${atLimit ? 'bg-destructive' : 'bg-primary'}`}
            style={{ width: `${Math.min((memberCount / memberLimit) * 100, 100)}%` }}
          />
        </div>
      )}

      {/* Limit reached */}
      {atLimit && canInvite && (
        <div className="border border-destructive/20 bg-destructive/5 p-3 rounded-lg">
          <p className="text-xs font-medium text-destructive">Alla {memberLimit} platser är fyllda</p>
          <p className="text-[10px] text-destructive/70 mt-0.5">Kontakta support för att utöka.</p>
        </div>
      )}

      {/* Invite form - now with tabs for single/bulk */}
      {showInviteForm && !atLimit && (
        <div className="border border-border rounded-lg p-4 bg-muted/30">
          <Tabs defaultValue="single" className="w-full">
            <TabsList className="w-full h-8 mb-3">
              <TabsTrigger value="single" className="text-xs flex-1">En person</TabsTrigger>
              <TabsTrigger value="bulk" className="text-xs flex-1">Flera samtidigt</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-3 mt-0">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email" className="text-xs text-muted-foreground">E-postadress</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="kollega@företag.se"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  onFocus={scrollOnFocus}
                  className="h-9 text-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-name" className="text-xs text-muted-foreground">Namn (valfritt)</Label>
                <Input
                  id="invite-name"
                  placeholder="Förnamn Efternamn"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  onFocus={scrollOnFocus}
                  className="h-9 text-sm"
                />
              </div>
              <Button
                onClick={handleInvite}
                disabled={!email.trim() || isInviting}
                className="w-full h-9 text-xs"
                size="sm"
              >
                {isInviting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5 mr-1.5" />}
                Skicka inbjudan
              </Button>

              {recentInvites.length > 0 && (
                <div className="pt-2 border-t border-border/50 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium">Nyligen inbjudna</p>
                  {recentInvites.map((invite, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Check className="w-3 h-3 text-green-500" />
                      <span className="truncate">{invite}</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bulk" className="mt-0">
              <BulkInvitePanel
                onSubmit={handleBulkInvite}
                onSuccess={loadMembers}
                maxMembers={hasLimit ? memberLimit : undefined}
                currentMembers={memberCount}
                isTrialActive={isTrial}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Members list */}
      <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
        {loadingMembers ? (
          <div className="p-6 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Inga medlemmar hittades</p>
          </div>
        ) : (
          members.map((member) => (
            <div key={member.email} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-semibold text-primary uppercase">
                  {(member.preferredName || member.email).charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground truncate">
                    {member.preferredName || member.email.split('@')[0]}
                  </p>
                  {getRoleBadge(member.role)}
                </div>
                <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                  <Mail className="w-2.5 h-2.5" />
                  {member.email}
                </p>
              </div>
              <div className="shrink-0">
                {member.verified !== false ? (
                  <span className="w-2 h-2 rounded-full bg-green-500 block" title="Verifierad" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/30 block" title="Ej verifierad" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
