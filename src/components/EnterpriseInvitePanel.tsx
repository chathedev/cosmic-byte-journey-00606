import { useState } from 'react';
import { UserPlus, Loader2, Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { useSubscription } from '@/contexts/SubscriptionContext';

export function EnterpriseInvitePanel() {
  const { enterpriseMembership } = useSubscription();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [recentInvites, setRecentInvites] = useState<string[]>([]);

  const company = enterpriseMembership?.company;
  const role = enterpriseMembership?.membership?.role;
  const canInvite = role === 'admin' || role === 'owner';

  if (!company || !canInvite) return null;

  const memberLimit = (company as any).memberLimit;
  const currentMembers = (company as any).memberCount;
  const hasLimit = typeof memberLimit === 'number' && memberLimit > 0;
  const atLimit = hasLimit && typeof currentMembers === 'number' && currentMembers >= memberLimit;

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
        description: `${name.trim() || email.trim()} har lagts till i ${company.name}`,
      });

      setRecentInvites(prev => [email.trim(), ...prev.slice(0, 4)]);
      setEmail('');
      setName('');
    } catch (error: any) {
      console.error('Failed to invite member:', error);
      toast({
        title: 'Kunde inte bjuda in',
        description: error?.message || 'Ett oväntat fel uppstod',
        variant: 'destructive',
      });
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Bjud in medlem</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Lägg till nya personer i {company.name}
          {hasLimit && (
            <span className="ml-1">
              ({currentMembers ?? '?'}/{memberLimit} platser)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {atLimit ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="font-medium">Platsgräns nådd</p>
            <p className="text-xs mt-1">Kontakta support för att utöka antalet platser.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="invite-email" className="text-sm">E-postadress *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="kollega@företag.se"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-name" className="text-sm">Namn (valfritt)</Label>
              <Input
                id="invite-name"
                placeholder="Förnamn Efternamn"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
              />
            </div>
            <Button
              onClick={handleInvite}
              disabled={!email.trim() || isInviting}
              className="w-full"
              size="sm"
            >
              {isInviting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4 mr-2" />
              )}
              Bjud in
            </Button>
          </>
        )}

        {recentInvites.length > 0 && (
          <div className="pt-2 border-t space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Nyligen inbjudna</p>
            {recentInvites.map((invite, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="w-3 h-3 text-green-500" />
                <span className="truncate">{invite}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
