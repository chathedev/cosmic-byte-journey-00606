import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Building2, Lock, Users, Video, Link2, FileText, Palette, Loader2, Globe } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import {
  getEnterpriseSettings, updateEnterpriseSettings, testSSO, connectSSO,
  type EnterpriseSettingsResponse,
} from '@/lib/enterpriseSettingsApi';
import { EnterpriseSettingsIdentity } from '@/components/enterprise/EnterpriseSettingsIdentity';
import { EnterpriseSettingsSecurity } from '@/components/enterprise/EnterpriseSettingsSecurity';
import { EnterpriseSettingsRoles } from '@/components/enterprise/EnterpriseSettingsRoles';
import { EnterpriseSettingsAudit } from '@/components/enterprise/EnterpriseSettingsAudit';
import { EnterpriseSettingsWorkspace } from '@/components/enterprise/EnterpriseSettingsWorkspace';
import { EnterpriseSettingsMeeting } from '@/components/enterprise/EnterpriseSettingsMeeting';
import { EnterpriseSettingsIntegrations } from '@/components/enterprise/EnterpriseSettingsIntegrations';
import { EnterpriseSettingsDomains } from '@/components/enterprise/EnterpriseSettingsDomains';

export default function EnterpriseSettingsPage() {
  const navigate = useNavigate();
  const { enterpriseMembership } = useSubscription();
  const { toast } = useToast();
  const [data, setData] = useState<EnterpriseSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const companyId = enterpriseMembership?.company?.id;
  const planType = enterpriseMembership?.company?.planType || (enterpriseMembership?.company as any)?.plan;
  const isEnterprise = planType === 'enterprise';

  const loadSettings = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await getEnterpriseSettings(companyId);
      setData(res);
    } catch (err: any) {
      if (err.code === 'enterprise_only_feature') {
        toast({ title: 'Ej tillgängligt', description: 'Enterprise-inställningar är bara tillgängliga för Enterprise-planen.', variant: 'destructive' });
        navigate('/org/settings');
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  if (!isEnterprise) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <Shield className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">Enterprise-inställningar är bara tillgängliga för Enterprise-planen.</p>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const canEdit = data.viewer?.canManageEnterpriseSettings ?? false;
  const hasLocks = Object.keys(data.locks || {}).length > 0;

  const handleUpdate = async (patch: Record<string, any>) => {
    if (!companyId) return;
    try {
      const res = await updateEnterpriseSettings(companyId, patch);
      setData(res);
      toast({ title: 'Inställningar sparade' });
    } catch (err: any) {
      if (err.status === 423) {
        toast({ title: 'Låst inställning', description: 'Denna inställning är låst av en administratör.', variant: 'destructive' });
      } else {
        toast({ title: 'Fel', description: err.message, variant: 'destructive' });
      }
    }
  };

  const handleTestSSO = async (provider: string) => {
    if (!companyId) return;
    try {
      const result = await testSSO(companyId, provider);
      toast({ title: result.ready ? `${provider} är redo` : `${provider} saknar konfiguration` });
    } catch (err: any) {
      toast({ title: 'SSO-test misslyckades', description: err.message, variant: 'destructive' });
    }
  };

  const handleConnectSSO = async (provider: string) => {
    if (!companyId) return;
    try {
      const result = await connectSSO(companyId, provider);
      if (result.authorizationUrl) window.location.href = result.authorizationUrl;
    } catch (err: any) {
      toast({ title: 'Anslutning misslyckades', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/org/settings')} className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold">Enterprise-inställningar</h1>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{data.company?.name}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="bg-primary/15 text-primary text-xs gap-1">
              <Building2 className="w-3 h-3" />Enterprise
            </Badge>
            {hasLocks && (
              <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                <Lock className="w-3 h-3" />Låsta fält
              </Badge>
            )}
          </div>
        </div>

        {!canEdit && (
          <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs text-amber-700 dark:text-amber-300">
            Du har läsbehörighet men kan inte ändra enterprise-inställningar.
          </div>
        )}

        <Tabs defaultValue="identity" className="w-full">
          <TabsList className="w-full justify-start bg-muted/50 border border-border rounded-xl p-1 h-auto flex-wrap gap-1">
            <TabsTrigger value="identity" className="rounded-lg gap-1.5 text-xs px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Shield className="w-3.5 h-3.5" />Identitet
            </TabsTrigger>
            <TabsTrigger value="workspace" className="rounded-lg gap-1.5 text-xs px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Palette className="w-3.5 h-3.5" />Arbetsyta
            </TabsTrigger>
            <TabsTrigger value="security" className="rounded-lg gap-1.5 text-xs px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Lock className="w-3.5 h-3.5" />Säkerhet
            </TabsTrigger>
            <TabsTrigger value="meeting" className="rounded-lg gap-1.5 text-xs px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Video className="w-3.5 h-3.5" />Möten
            </TabsTrigger>
            <TabsTrigger value="integrations" className="rounded-lg gap-1.5 text-xs px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Link2 className="w-3.5 h-3.5" />Integrationer
            </TabsTrigger>
            <TabsTrigger value="roles" className="rounded-lg gap-1.5 text-xs px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <Users className="w-3.5 h-3.5" />Roller
            </TabsTrigger>
            <TabsTrigger value="audit" className="rounded-lg gap-1.5 text-xs px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <FileText className="w-3.5 h-3.5" />Historik
            </TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="mt-6">
            <EnterpriseSettingsIdentity
              settings={data.settings.identityAccess}
              locks={data.locks}
              canEdit={canEdit}
              onUpdate={handleUpdate}
              onTestSSO={handleTestSSO}
              onConnectSSO={handleConnectSSO}
              providerReadiness={data.settingsSummary?.providerReadiness}
            />
          </TabsContent>
          <TabsContent value="workspace" className="mt-6">
            <EnterpriseSettingsWorkspace settings={data.settings.adminWorkspace} locks={data.locks} canEdit={canEdit} onUpdate={handleUpdate} />
          </TabsContent>
          <TabsContent value="security" className="mt-6">
            <EnterpriseSettingsSecurity settings={data.settings.securityCompliance} locks={data.locks} canEdit={canEdit} onUpdate={handleUpdate} />
          </TabsContent>
          <TabsContent value="meeting" className="mt-6">
            <EnterpriseSettingsMeeting settings={data.settings.meetingContentControls} locks={data.locks} canEdit={canEdit} onUpdate={handleUpdate} />
          </TabsContent>
          <TabsContent value="integrations" className="mt-6">
            <EnterpriseSettingsIntegrations settings={data.settings.integrations} locks={data.locks} canEdit={canEdit} onUpdate={handleUpdate} />
          </TabsContent>
          <TabsContent value="roles" className="mt-6">
            <EnterpriseSettingsRoles companyId={companyId!} canEdit={canEdit} initialRoles={data.settings.customRoles} />
          </TabsContent>
          <TabsContent value="audit" className="mt-6">
            <EnterpriseSettingsAudit companyId={companyId!} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
