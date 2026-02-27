import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Globe } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export function AdminOnboardingAutoToggle() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      const data = await apiClient.getEnterpriseOnboardingAuto();
      setEnabled(data.enabled);
      setUpdatedAt(data.updatedAt || null);
    } catch (err) {
      console.error('Failed to load onboarding auto state:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    try {
      setToggling(true);
      const data = await apiClient.toggleEnterpriseOnboardingAuto();
      setEnabled(data.enabled);
      setUpdatedAt(data.updatedAt || null);
      toast({
        title: data.enabled ? 'Onboarding aktiverad' : 'Onboarding inaktiverad',
        description: data.enabled
          ? 'Self-serve enterprise-onboarding är nu synlig'
          : 'Self-serve enterprise-onboarding är nu dold',
      });
    } catch (err) {
      console.error('Failed to toggle:', err);
      toast({
        title: 'Fel',
        description: 'Kunde inte ändra onboarding-status',
        variant: 'destructive',
      });
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">Self-Serve Onboarding</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Styr om den publika enterprise-onboarding-sidan (/enterprise/onboarding) ska vara tillgänglig
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="onboarding-auto" className="text-sm font-medium">
              {enabled ? 'Aktiverad' : 'Inaktiverad'}
            </Label>
            {updatedAt && (
              <p className="text-xs text-muted-foreground">
                Uppdaterad: {new Date(updatedAt).toLocaleString('sv-SE')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {toggling && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch
              id="onboarding-auto"
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={toggling}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
