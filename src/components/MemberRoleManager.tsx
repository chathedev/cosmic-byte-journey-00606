import { useState, useEffect, useCallback } from 'react';
import {
  Users, Crown, Shield, Eye, User, Mail, MoreVertical,
  ArrowUpCircle, ArrowDownCircle, UserMinus, UserX, Send,
  Loader2, AlertTriangle, Check, UserPlus, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BulkInvitePanel } from '@/components/BulkInvitePanel';
import { useToast } from '@/hooks/use-toast';
import { useScrollToInputHandler } from '@/hooks/useScrollToInput';
import { apiClient } from '@/lib/api';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface MemberInfo {
  email: string;
  preferredName?: string;
  role: string;
  status: string;
  verified?: boolean;
  lastLoginAt?: string;
}

interface ViewerInfo {
  email: string;
  role: string;
  canManageMembers: boolean;
}

const ROLE_CONFIG: Record<string, { label: string; icon: typeof Crown; order: number; color: string }> = {
  owner:  { label: 'Ägare',   icon: Crown,  order: 0, color: 'text-amber-600' },
  admin:  { label: 'Admin',   icon: Shield, order: 1, color: 'text-blue-600' },
  member: { label: 'Medlem',  icon: User,   order: 2, color: 'text-foreground' },
  viewer: { label: 'Läsare',  icon: Eye,    order: 3, color: 'text-muted-foreground' },
};

export function MemberRoleManager() {
  const { enterpriseMembership } = useSubscription();
  const { toast } = useToast();
  const { handleFocus: scrollOnFocus } = useScrollToInputHandler();

  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [viewer, setViewer] = useState<ViewerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Invite form
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('member');
  const [isInviting, setIsInviting] = useState(false);

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState<{
    type: 'role' | 'deactivate' | 'reactivate' | 'remove';
    member: MemberInfo;
    newRole?: string;
  } | null>(null);

  const companyId = enterpriseMembership?.company?.id;
  const company = enterpriseMembership?.company;

  const loadMembers = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await apiClient.getEnterpriseMembers(companyId);
      setMembers(data.members || []);
      setViewer(data.viewer || null);
    } catch (err) {
      console.error('[MemberRoleManager] Failed to load:', err);
      // Fallback to stats endpoint
      try {
        const stats = await apiClient.getEnterpriseCompanyStats(companyId);
        setMembers((stats.scoreboard || []).map(m => ({
          email: m.email,
          preferredName: m.preferredName,
          role: m.role,
          status: 'active',
          verified: m.verified,
          lastLoginAt: m.lastLoginAt,
        })));
        setViewer({
          email: stats.viewer?.email || '',
          role: stats.viewer?.role || 'member',
          canManageMembers: stats.viewer?.role === 'owner' || stats.viewer?.role === 'admin',
        });
      } catch {
        toast({ title: 'Kunde inte ladda medlemmar', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  if (!enterpriseMembership?.isMember || !companyId) return null;

  const canManage = viewer?.canManageMembers === true;
  const viewerRole = viewer?.role || 'member';
  const viewerIsOwner = viewerRole === 'owner';

  // Sort: owners first, then admin, member, viewer
  const sortedMembers = [...members].sort((a, b) => {
    const aOrder = ROLE_CONFIG[a.role]?.order ?? 99;
    const bOrder = ROLE_CONFIG[b.role]?.order ?? 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.preferredName || a.email).localeCompare(b.preferredName || b.email);
  });

  const activeMembers = sortedMembers.filter(m => m.status !== 'inactive');
  const inactiveMembers = sortedMembers.filter(m => m.status === 'inactive');

  // Permission checks
  const canEditMember = (member: MemberInfo) => {
    if (!canManage) return false;
    if (member.email === viewer?.email) return false;
    if (member.role === 'owner' && !viewerIsOwner) return false;
    return true;
  };

  const canPromoteTo = (member: MemberInfo, targetRole: string): boolean => {
    if (!canEditMember(member)) return false;
    if (targetRole === 'owner' && !viewerIsOwner) return false;
    if (targetRole === member.role) return false;
    const currentOrder = ROLE_CONFIG[member.role]?.order ?? 99;
    const targetOrder = ROLE_CONFIG[targetRole]?.order ?? 99;
    // Admin can only promote to admin at most
    if (!viewerIsOwner && targetOrder <= 1 && targetRole === 'owner') return false;
    return targetOrder !== currentOrder;
  };

  const handleError = (error: any) => {
    if (error.status === 409 && error.code === 'last_owner_required') {
      toast({
        title: 'Sista ägaren',
        description: 'Det måste alltid finnas minst en aktiv ägare i organisationen.',
        variant: 'destructive',
      });
    } else if (error.status === 409 && error.code === 'team_trial_member_limit_reached') {
      toast({
        title: 'Maxgräns under trial',
        description: 'Under trial-perioden kan teamet ha max 5 aktiva medlemmar. Fler kan läggas till efter trialen.',
        variant: 'destructive',
      });
    } else if (error.status === 403) {
      toast({
        title: 'Åtkomst nekad',
        description: 'Du har inte behörighet att utföra denna åtgärd.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Något gick fel',
        description: error.message || 'Försök igen.',
        variant: 'destructive',
      });
    }
  };

  const executeAction = async () => {
    if (!confirmAction || !companyId) return;
    const { type, member, newRole } = confirmAction;
    setActionLoading(member.email);
    setConfirmAction(null);

    try {
      switch (type) {
        case 'role':
          await apiClient.updateEnterpriseMember(companyId, member.email, { role: newRole });
          toast({ title: `${member.preferredName || member.email} är nu ${ROLE_CONFIG[newRole!]?.label || newRole}` });
          break;
        case 'deactivate':
          await apiClient.updateEnterpriseMember(companyId, member.email, { status: 'inactive' });
          toast({ title: `${member.preferredName || member.email} har inaktiverats` });
          break;
        case 'reactivate':
          await apiClient.updateEnterpriseMember(companyId, member.email, { status: 'active' });
          toast({ title: `${member.preferredName || member.email} har aktiverats` });
          break;
        case 'remove':
          await apiClient.removeEnterpriseMember(companyId, member.email);
          toast({ title: `${member.preferredName || member.email} har tagits bort` });
          break;
      }
      await loadMembers();
    } catch (error: any) {
      handleError(error);
      await loadMembers();
    } finally {
      setActionLoading(null);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !companyId) return;
    setIsInviting(true);
    try {
      await apiClient.inviteEnterpriseCompanyMember(companyId, {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        preferredName: inviteName.trim() || undefined,
      });
      toast({
        title: 'Inbjudan skickad',
        description: `${inviteName.trim() || inviteEmail.trim()} har bjudits in som ${ROLE_CONFIG[inviteRole]?.label || inviteRole}.`,
      });
      setInviteEmail('');
      setInviteName('');
      setInviteRole('member');
      setShowInviteForm(false);
      await loadMembers();
    } catch (error: any) {
      handleError(error);
      await loadMembers();
    } finally {
      setIsInviting(false);
    }
  };

  const handleResendInvite = async (member: MemberInfo) => {
    if (!companyId) return;
    setActionLoading(member.email);
    try {
      await apiClient.sendEnterpriseMemberInvite(companyId, member.email);
      toast({ title: 'Inbjudan skickad igen', description: member.email });
    } catch (error: any) {
      if (error.code === 'member_inactive') {
        toast({ title: 'Medlemmen är inaktiv', description: 'Aktivera medlemmen först.', variant: 'destructive' });
      } else {
        handleError(error);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const getConfirmDialogProps = () => {
    if (!confirmAction) return { title: '', description: '' };
    const name = confirmAction.member.preferredName || confirmAction.member.email;
    switch (confirmAction.type) {
      case 'role':
        const roleName = ROLE_CONFIG[confirmAction.newRole!]?.label || confirmAction.newRole;
        const isPromotion = (ROLE_CONFIG[confirmAction.newRole!]?.order ?? 99) < (ROLE_CONFIG[confirmAction.member.role]?.order ?? 99);
        return {
          title: isPromotion ? `Befordra till ${roleName}?` : `Nedgradera till ${roleName}?`,
          description: confirmAction.newRole === 'owner'
            ? `${name} kommer att få fullständig kontroll över organisationen, inklusive att hantera alla medlemmar och ägare.`
            : confirmAction.member.role === 'owner'
              ? `${name} kommer att förlora ägarrättigheter. Detta kan misslyckas om det är den sista aktiva ägaren.`
              : `${name} kommer att ändras till ${roleName}.`,
        };
      case 'deactivate':
        return {
          title: `Inaktivera ${name}?`,
          description: `Medlemmen förlorar sin enterprise-åtkomst. Om personen inte har andra medlemskap återgår kontot till gratisplanen.`,
        };
      case 'reactivate':
        return {
          title: `Aktivera ${name}?`,
          description: `Medlemmen får tillbaka sin enterprise-åtkomst.`,
        };
      case 'remove':
        return {
          title: `Ta bort ${name}?`,
          description: `Medlemmen tas bort från organisationen permanent. Enterprise-åtkomst dras tillbaka omedelbart.`,
        };
      default:
        return { title: '', description: '' };
    }
  };

  const memberLimit = (company as any)?.memberLimit;
  const planType = (company as any)?.planType || (company as any)?.plan;
  const isTeamPlan = planType === 'team';
  const trialObj = (company as any)?.trial;
  const isTrial = !!(trialObj?.enabled && !trialObj?.expired && !trialObj?.manuallyDisabled);
  const TEAM_TRIAL_CAP = 5;
  const TEAM_ABSOLUTE_CAP = 35;
  const effectiveCap = isTeamPlan ? (isTrial ? TEAM_TRIAL_CAP : TEAM_ABSOLUTE_CAP) : (typeof memberLimit === 'number' && memberLimit > 0 ? memberLimit : undefined);
  const hasLimit = effectiveCap !== undefined;
  const atLimit = hasLimit && activeMembers.length >= effectiveCap;

  const RoleBadge = ({ role }: { role: string }) => {
    const config = ROLE_CONFIG[role];
    if (!config) return <Badge variant="outline" className="text-[10px]">{role}</Badge>;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-0.5 ${config.color} border-current/20`}>
        <Icon className="w-2.5 h-2.5" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Medlemmar</h3>
          <span className="text-xs text-muted-foreground">
            {activeMembers.length}{hasLimit ? ` av ${effectiveCap}` : ''}
            {isTeamPlan && !isTrial && hasLimit && <span className="text-muted-foreground/60"> (max 35)</span>}
          </span>
        </div>
        {canManage && !atLimit && (
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
            style={{ width: `${Math.min((activeMembers.length / effectiveCap!) * 100, 100)}%` }}
          />
        </div>
      )}

      {atLimit && canManage && (
        <div className="border border-destructive/20 bg-destructive/5 p-3 rounded-lg">
          <p className="text-xs font-medium text-destructive">Alla {effectiveCap} platser är fyllda</p>
          <p className="text-[10px] text-destructive/70 mt-0.5">
            {isTeamPlan && isTrial
              ? 'Aktivera planen för att lägga till upp till 35 medlemmar.'
              : isTeamPlan
                ? 'Team-planen stödjer max 35 aktiva medlemmar.'
                : 'Kontakta support för att utöka.'}
          </p>
        </div>
      )}

      {/* Invite form */}
      {showInviteForm && !atLimit && canManage && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email" className="text-xs text-muted-foreground">E-postadress</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="kollega@företag.se"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
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
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
              onFocus={scrollOnFocus}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Roll</Label>
            <div className="flex gap-1.5">
              {(['viewer', 'member', 'admin', ...(viewerIsOwner ? ['owner'] : [])] as string[]).map(r => (
                <button
                  key={r}
                  onClick={() => setInviteRole(r)}
                  className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium border transition-colors ${
                    inviteRole === r
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {ROLE_CONFIG[r]?.label || r}
                </button>
              ))}
            </div>
          </div>
          <Button
            onClick={handleInvite}
            disabled={!inviteEmail.trim() || isInviting}
            className="w-full h-9 text-xs"
            size="sm"
          >
            {isInviting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5 mr-1.5" />}
            Skicka inbjudan
          </Button>
        </div>
      )}

      {/* Read-only notice */}
      {!canManage && (
        <div className="border border-border rounded-lg p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Du kan se medlemmar men inte hantera dem.
          </p>
        </div>
      )}

      {/* Active members */}
      <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
        {loading ? (
          <div className="p-6 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : activeMembers.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Inga aktiva medlemmar</p>
          </div>
        ) : (
          activeMembers.map((member) => {
            const isCurrentUser = member.email === viewer?.email;
            const isLoading = actionLoading === member.email;
            const editable = canEditMember(member);

            return (
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
                    <RoleBadge role={member.role} />
                    {isCurrentUser && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0">Du</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                    <Mail className="w-2.5 h-2.5" />
                    {member.email}
                  </p>
                </div>

                {/* Status indicator */}
                <div className="shrink-0">
                  {member.verified !== false ? (
                    <span className="w-2 h-2 rounded-full bg-green-500 block" title="Verifierad" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-muted-foreground/30 block" title="Ej verifierad" />
                  )}
                </div>

                {/* Actions dropdown */}
                {editable && !isLoading && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 rounded hover:bg-muted transition-colors shrink-0">
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {/* Role changes */}
                      {canPromoteTo(member, 'owner') && viewerIsOwner && (
                        <DropdownMenuItem onClick={() => setConfirmAction({ type: 'role', member, newRole: 'owner' })}>
                          <ArrowUpCircle className="w-3.5 h-3.5 mr-2 text-amber-600" />
                          Gör till Ägare
                        </DropdownMenuItem>
                      )}
                      {canPromoteTo(member, 'admin') && member.role !== 'admin' && (
                        <DropdownMenuItem onClick={() => setConfirmAction({ type: 'role', member, newRole: 'admin' })}>
                          <ArrowUpCircle className="w-3.5 h-3.5 mr-2 text-blue-600" />
                          {(ROLE_CONFIG[member.role]?.order ?? 99) > 1 ? 'Befordra till Admin' : 'Ändra till Admin'}
                        </DropdownMenuItem>
                      )}
                      {canPromoteTo(member, 'member') && member.role !== 'member' && (
                        <DropdownMenuItem onClick={() => setConfirmAction({ type: 'role', member, newRole: 'member' })}>
                          {(ROLE_CONFIG[member.role]?.order ?? 99) < 2 ? (
                            <ArrowDownCircle className="w-3.5 h-3.5 mr-2 text-orange-500" />
                          ) : (
                            <ArrowUpCircle className="w-3.5 h-3.5 mr-2" />
                          )}
                          {(ROLE_CONFIG[member.role]?.order ?? 99) < 2 ? 'Nedgradera till Medlem' : 'Befordra till Medlem'}
                        </DropdownMenuItem>
                      )}
                      {canPromoteTo(member, 'viewer') && member.role !== 'viewer' && (
                        <DropdownMenuItem onClick={() => setConfirmAction({ type: 'role', member, newRole: 'viewer' })}>
                          <ArrowDownCircle className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                          Ändra till Läsare
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />

                      {/* Re-send invite */}
                      {member.verified === false && (
                        <DropdownMenuItem onClick={() => handleResendInvite(member)}>
                          <Send className="w-3.5 h-3.5 mr-2" />
                          Skicka inbjudan igen
                        </DropdownMenuItem>
                      )}

                      {/* Deactivate */}
                      <DropdownMenuItem
                        onClick={() => setConfirmAction({ type: 'deactivate', member })}
                        className="text-orange-600 focus:text-orange-600"
                      >
                        <UserMinus className="w-3.5 h-3.5 mr-2" />
                        Inaktivera
                      </DropdownMenuItem>

                      {/* Remove */}
                      <DropdownMenuItem
                        onClick={() => setConfirmAction({ type: 'remove', member })}
                        className="text-destructive focus:text-destructive"
                      >
                        <UserX className="w-3.5 h-3.5 mr-2" />
                        Ta bort
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {isLoading && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Inactive members */}
      {inactiveMembers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" />
            Inaktiva ({inactiveMembers.length})
          </p>
          <div className="border border-border rounded-lg divide-y divide-border overflow-hidden opacity-70">
            {inactiveMembers.map(member => {
              const isLoading = actionLoading === member.email;
              return (
                <div key={member.email} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                      {(member.preferredName || member.email).charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground truncate">
                      {member.preferredName || member.email.split('@')[0]}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 truncate">{member.email}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">Inaktiv</Badge>
                  {canManage && !isLoading && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setConfirmAction({ type: 'reactivate', member })}
                        className="p-1 rounded hover:bg-primary/10 text-primary"
                        title="Aktivera"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: 'remove', member })}
                        className="p-1 rounded hover:bg-destructive/10 text-destructive"
                        title="Ta bort"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={getConfirmDialogProps().title}
        description={getConfirmDialogProps().description}
        confirmText={
          confirmAction?.type === 'remove' ? 'Ta bort' :
          confirmAction?.type === 'deactivate' ? 'Inaktivera' :
          confirmAction?.type === 'reactivate' ? 'Aktivera' :
          'Bekräfta'
        }
        onConfirm={executeAction}
        variant={confirmAction?.type === 'remove' || confirmAction?.type === 'deactivate' ? 'destructive' : 'default'}
      />
    </div>
  );
}
