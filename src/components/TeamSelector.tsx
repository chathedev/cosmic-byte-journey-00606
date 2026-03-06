import { useState, useEffect } from 'react';
import { Users, Globe } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface TeamOption {
  id: string;
  name: string;
  isMember: boolean;
}

interface TeamSelectorProps {
  value?: string | null;
  onChange: (teamId: string | null) => void;
  className?: string;
  compact?: boolean;
}

export function TeamSelector({ value, onChange, className, compact }: TeamSelectorProps) {
  const { enterpriseMembership } = useSubscription();
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const companyId = enterpriseMembership?.company?.id;
  const isMember = enterpriseMembership?.isMember;
  const activeMembership = enterpriseMembership?.memberships?.find(m => m.companyId === companyId);
  const isSharedMode = (activeMembership?.dataAccessMode || 'shared') === 'shared';

  useEffect(() => {
    if (!companyId || !isMember) return;
    
    setIsLoading(true);
    apiClient.getEnterpriseTeams(companyId)
      .then(data => {
        const myTeams = (data.teams || [])
          .filter(t => t.status === 'active' && t.isMember)
          .map(t => ({ id: t.id, name: t.name, isMember: t.isMember }));
        setTeams(myTeams);
      })
      .catch(err => {
        console.warn('Failed to load teams for selector:', err);
      })
      .finally(() => setIsLoading(false));
  }, [companyId, isMember]);

  // Don't show if not enterprise member or no teams available
  if (!isMember || teams.length === 0) return null;

  const noneLabel = isSharedMode ? 'Organisationsmöte (delat)' : 'Individuellt möte (privat)';
  const noneLabelCompact = isSharedMode ? 'Organisationsmöte' : 'Individuellt möte';
  const noneHelpText = isSharedMode
    ? 'Alla aktiva medlemmar kan se detta möte'
    : 'Bara du kan se detta möte';

  if (compact) {
    return (
      <div className={className}>
        <Select
          value={value || '__none__'}
          onValueChange={(v) => onChange(v === '__none__' ? null : v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <div className="flex items-center gap-1.5">
              {isSharedMode ? <Globe className="w-3.5 h-3.5 text-muted-foreground" /> : <Users className="w-3.5 h-3.5 text-muted-foreground" />}
              <SelectValue placeholder={noneLabelCompact} />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              <span className="text-xs">{noneLabelCompact}</span>
            </SelectItem>
            {teams.map(team => (
              <SelectItem key={team.id} value={team.id}>
                <span className="text-xs">{team.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" />
        {isSharedMode ? 'Synlighet' : 'Teamdelning'}
      </label>
      <Select
        value={value || '__none__'}
        onValueChange={(v) => onChange(v === '__none__' ? null : v)}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder={noneLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="flex items-center gap-2">
              {isSharedMode && <Globe className="w-3.5 h-3.5 text-muted-foreground" />}
              {noneLabel}
            </span>
          </SelectItem>
          {teams.map(team => (
            <SelectItem key={team.id} value={team.id}>
              <span className="flex items-center gap-2">
                {team.name}
                <Badge variant="outline" className="text-[10px] px-1 py-0">Team</Badge>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[10px] text-muted-foreground">
        {value ? 'Teammedlemmar kan se detta möte' : noneHelpText}
      </p>
    </div>
  );
}

// Team badge shown on meeting cards
export function TeamBadge({ teamId, teamName, readOnly }: { teamId?: string; teamName?: string; readOnly?: boolean }) {
  if (!teamId) return null;
  
  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-accent/50 border-accent">
        <Users className="w-2.5 h-2.5 mr-0.5" />
        {teamName || 'Team'}
      </Badge>
      {readOnly && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
          Skrivskyddat
        </Badge>
      )}
    </div>
  );
}
