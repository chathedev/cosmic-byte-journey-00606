import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Plus, Edit, Trash2, Users, Building2, Mail, ArrowLeft, Calendar, FileText, TrendingUp, Volume2, CheckCircle2, XCircle, RotateCcw, RefreshCw, Clock, Globe, Shield, Database, Sparkles, CreditCard, AlertTriangle, Lock, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserDetailDialog } from '@/components/UserDetailDialog';
import { CompanyBillingSection } from '@/components/CompanyBillingSection';

interface SISSample {
  status: 'ready' | 'processing' | 'error' | 'missing' | null;
  speakerName?: string | null;
  uploadedAt?: string | null;
  lastTranscribedAt?: string | null;
  lastCheckedAt?: string | null;
  lastMatchScore?: number | null;
  matchCount?: number;
}

interface CompanyMember {
  email: string;
  role: string;
  status: string;
  notes?: string;
  title?: string;
  preferredName?: string;
  addedAt: string;
  joinedAt?: string;
  updatedAt: string;
  addedBy: string;
  updatedBy: string;
  sisSample?: SISSample;
}

interface BillingRecord {
  id: string;
  billingType: 'one_time' | 'recurring';
  amountSek: number;
  oneTimeAmountSek?: number | null;
  combineOneTime?: boolean;
  status: string;
  invoiceId?: string;
  invoiceUrl?: string;
  subscriptionId?: string | null;
  portalUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
  planTier: string;
  contactEmail?: string;
  domains?: string[];
  notes?: string;
  metadata?: any;
  dataAccessMode?: 'shared' | 'individual';
  adminFullAccessEnabled?: boolean;
  trial?: {
    enabled: boolean;
    startsAt: string;
    endsAt: string;
    daysTotal: number;
    daysRemaining?: number | null;
    expired?: boolean;
    configuredBy: string;
    manuallyDisabled?: boolean;
    disabledAt?: string | null;
    disabledBy?: string | null;
  };
  preferences?: {
    meetingCreatorVisibility?: 'shared_only' | 'always' | 'hidden';
    storageRegion?: 'eu' | 'us' | 'auto';
    dataRetentionDays?: number;
    allowAdminFolderLock?: boolean;
    speakerIdentificationEnabled?: boolean;
  };
  billingCustomerId?: string;
  billingHistory?: BillingRecord[];
  billingStatus?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  members: CompanyMember[];
}

export default function AdminEnterpriseCompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dialogs
  const [showEditCompany, setShowEditCompany] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showEditMember, setShowEditMember] = useState(false);
  const [editingMember, setEditingMember] = useState<CompanyMember | null>(null);
  const [deletingMember, setDeletingMember] = useState<CompanyMember | null>(null);
  const [deletingCompany, setDeletingCompany] = useState(false);

  // Trial
  const [showTrialDialog, setShowTrialDialog] = useState(false);
  const [trialDays, setTrialDays] = useState<number>(7);

  // SIS reset
  const [resettingSISEmail, setResettingSISEmail] = useState<string | null>(null);

  // User detail
  const [selectedMemberDetail, setSelectedMemberDetail] = useState<{ email: string; plan: string; meetingCount: number } | null>(null);

  // Meetings
  const [showMeetings, setShowMeetings] = useState(false);
  const [companyMeetings, setCompanyMeetings] = useState<any>(null);
  const [loadingMeetings, setLoadingMeetings] = useState(false);

  const loadCompany = useCallback(async () => {
    if (!companyId) {
      toast({
        title: 'Fel',
        description: 'Inget företags-ID angivet',
        variant: 'destructive',
      });
      navigate('/admin/enterprise');
      return;
    }

    try {
      setLoading(true);
      
      // Fetch company data and SIS data in parallel
      const [companyData, sisData] = await Promise.all([
        apiClient.getEnterpriseCompany(companyId),
        apiClient.getSISCompanies().catch(() => null), // Don't fail if SIS fetch fails
      ]);
      
      let companyWithSIS = companyData.company;
      
      // Merge SIS data into company members if available
      if (sisData?.companies) {
        const sisCompany = sisData.companies.find(c => c.id === companyId);
        if (sisCompany) {
          companyWithSIS = {
            ...companyWithSIS,
            members: companyWithSIS.members.map(member => {
              const sisMember = sisCompany.members.find(m => m.email.toLowerCase() === member.email.toLowerCase());
              if (sisMember) {
                return {
                  ...member,
                  sisSample: sisMember.sisSample,
                };
              }
              return member;
            }),
          };
        }
      }
      
      setCompany(companyWithSIS);
    } catch (error: any) {
      console.error('Failed to load company:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte ladda företagsdetaljer',
        variant: 'destructive',
      });
      navigate('/admin/enterprise');
    } finally {
      setLoading(false);
    }
  }, [companyId, navigate, toast]);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  const handleUpdateCompany = async (formData: FormData) => {
    if (!company) return;

    const name = formData.get('name') as string;
    const contactEmail = formData.get('contactEmail') as string;
    const domains = (formData.get('domains') as string).split(',').map(d => d.trim()).filter(Boolean);
    const notes = formData.get('notes') as string;
    const status = formData.get('status') as string;
    const dataAccessMode = formData.get('dataAccessMode') as 'shared' | 'individual';
    const adminFullAccessEnabled = formData.get('adminFullAccessEnabled') === 'true';
    const speakerIdentificationEnabled = formData.get('speakerIdentificationEnabled') === 'true';

    try {
      setIsSubmitting(true);
      await apiClient.updateEnterpriseCompany(company.id, {
        name,
        contactEmail: contactEmail || undefined,
        domains: domains.length > 0 ? domains : undefined,
        notes: notes || undefined,
        status,
        dataAccessMode,
        adminFullAccessEnabled,
        preferences: {
          meetingCreatorVisibility: 'shared_only',
          storageRegion: 'eu',
          dataRetentionDays: 365,
          allowAdminFolderLock: false,
          speakerIdentificationEnabled,
        },
      });

      toast({
        title: 'Uppdaterat',
        description: 'Företaget har uppdaterats',
      });

      setShowEditCompany(false);
      loadCompany();
    } catch (error) {
      console.error('Failed to update company:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte uppdatera företaget',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMember = async (formData: FormData) => {
    if (!company) return;

    const email = formData.get('email') as string;
    const role = formData.get('role') as string;
    const title = formData.get('title') as string;
    const notes = formData.get('notes') as string;
    const preferredName = formData.get('preferredName') as string;

    try {
      setIsSubmitting(true);
      await apiClient.addEnterpriseCompanyMember(company.id, {
        email,
        role,
        title: title || undefined,
        notes: notes || undefined,
        preferredName: preferredName || undefined,
        status: 'active',
      });

      toast({
        title: 'Medlem tillagd',
        description: `${preferredName || email} har lagts till i företaget`,
      });

      setShowAddMember(false);
      loadCompany();
    } catch (error: any) {
      console.error('Failed to add member:', error);
      toast({
        title: 'Kunde inte lägga till medlem',
        description: error?.message || 'Ett oväntat fel uppstod',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateMember = async (formData: FormData) => {
    if (!company || !editingMember) return;

    const role = formData.get('role') as string;
    const title = formData.get('title') as string;
    const notes = formData.get('notes') as string;
    const status = formData.get('status') as string;
    const preferredName = formData.get('preferredName') as string;

    try {
      setIsSubmitting(true);
      await apiClient.updateEnterpriseCompanyMember(company.id, editingMember.email, {
        role,
        title: title || undefined,
        notes: notes || undefined,
        preferredName: preferredName || undefined,
        status,
      });

      toast({
        title: 'Medlem uppdaterad',
        description: `${preferredName || editingMember.email} har uppdaterats`,
      });

      setShowEditMember(false);
      setEditingMember(null);
      loadCompany();
    } catch (error: any) {
      console.error('Failed to update member:', error);
      toast({
        title: 'Kunde inte uppdatera medlem',
        description: error?.message || 'Ett oväntat fel uppstod',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!company || !deletingMember) return;

    try {
      setIsSubmitting(true);
      await apiClient.deleteEnterpriseCompanyMember(company.id, deletingMember.email);

      toast({
        title: 'Medlem borttagen',
        description: 'Medlemmen har tagits bort från företaget',
      });

      setDeletingMember(null);
      loadCompany();
    } catch (error) {
      console.error('Failed to remove member:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte ta bort medlemmen',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!company) return;

    try {
      setIsSubmitting(true);
      await apiClient.deleteEnterpriseCompany(company.id);

      toast({
        title: 'Företag borttaget',
        description: `${company.name} har tagits bort permanent`,
      });

      navigate('/admin/enterprise');
    } catch (error) {
      console.error('Failed to delete company:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte ta bort företaget. Kontrollera att det inte har aktiva medlemmar eller data.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setDeletingCompany(false);
    }
  };

  const handleCreateTrial = async () => {
    if (!company) return;

    const isRestoring = company.trial?.manuallyDisabled;

    try {
      setIsSubmitting(true);

      if (isRestoring) {
        await apiClient.resumeEnterpriseCompanyTrial(
          company.id,
          trialDays && trialDays > 0 ? Math.floor(trialDays) : undefined
        );

        toast({
          title: 'Testperiod återställd',
          description: `Testperioden har återställts för ${company.name}`,
        });
      } else {
        if (!trialDays || trialDays < 1) return;

        await apiClient.createEnterpriseCompanyTrial(company.id, {
          days: Math.floor(trialDays),
        });

        toast({
          title: 'Testperiod skapad',
          description: `${trialDays} dagars testperiod har startats för ${company.name}`,
        });
      }

      setShowTrialDialog(false);
      setTrialDays(7);
      loadCompany();
    } catch (error) {
      console.error('Failed to create/restore trial:', error);
      toast({
        title: 'Fel',
        description: isRestoring ? 'Kunde inte återställa testperiod' : 'Kunde inte skapa testperiod',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisableTrial = async () => {
    if (!company) return;

    try {
      setIsSubmitting(true);
      await apiClient.disableEnterpriseCompanyTrial(company.id);

      toast({
        title: 'Testperiod borttagen',
        description: `Testperioden har tagits bort och full tillgång har aktiverats för ${company.name}`,
      });

      loadCompany();
    } catch (error) {
      console.error('Failed to disable trial:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte ta bort testperiod',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadCompanyMeetings = async () => {
    if (!company) return;

    try {
      setLoadingMeetings(true);
      const data = await apiClient.getEnterpriseCompanyMeetings(company.id);
      setCompanyMeetings(data);
      setShowMeetings(true);
    } catch (error) {
      console.error('Failed to load company meetings:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte ladda företagsmöten',
        variant: 'destructive',
      });
    } finally {
      setLoadingMeetings(false);
    }
  };

  const handleToggleSIS = async (checked: boolean) => {
    if (!company) return;

    const previousValue = company.preferences?.speakerIdentificationEnabled ?? true;

    // Optimistic update
    setCompany(prev => prev ? {
      ...prev,
      preferences: {
        ...prev.preferences,
        speakerIdentificationEnabled: checked,
      },
    } : null);

    try {
      setIsSubmitting(true);
      await apiClient.updateEnterpriseCompany(company.id, {
        preferences: {
          ...company.preferences,
          speakerIdentificationEnabled: checked,
        },
      });

      toast({
        title: checked ? 'SIS aktiverad' : 'SIS inaktiverad',
        description: checked
          ? 'Talaridentifiering är nu aktiverad för företaget'
          : 'Talaridentifiering är nu inaktiverad för företaget',
      });
    } catch (error: any) {
      console.error('Failed to update SIS:', error);
      // Revert on error
      setCompany(prev => prev ? {
        ...prev,
        preferences: {
          ...prev.preferences,
          speakerIdentificationEnabled: previousValue,
        },
      } : null);
      toast({
        title: 'Fel',
        description: error?.message || 'Kunde inte uppdatera SIS-inställning',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Företaget kunde inte hittas</p>
          <Button onClick={() => navigate('/admin/enterprise')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka till företagslistan
          </Button>
        </div>
      </div>
    );
  }

  const activeMembers = company.members.filter(m => m.status === 'active').length;
  const sisEnabled = company.preferences?.speakerIdentificationEnabled ?? false;
  const sisReadyCount = company.members.filter(m => m.sisSample?.status === 'ready').length;

  // Billing status helpers
  const hasUnpaidInvoice = company.billingHistory?.some(b => b.status === 'open' || b.status === 'draft');
  const lastPaidInvoice = company.billingHistory?.find(b => b.status === 'paid');
  
  // Trial calculation - compute days remaining from endsAt
  const getTrialDaysRemaining = () => {
    if (!company.trial?.enabled || !company.trial.endsAt) return null;
    const endsAt = new Date(company.trial.endsAt);
    const now = new Date();
    const diff = Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const trialDaysRemaining = getTrialDaysRemaining();
  const isTrialExpired = company.trial?.enabled && trialDaysRemaining !== null && trialDaysRemaining <= 0;
  
  // Check if company is locked (trial expired with no payment)
  const isCompanyLocked = isTrialExpired && !lastPaidInvoice;

  // Get billing status label
  const getBillingStatusLabel = (status?: string) => {
    switch (status) {
      case 'paid': return 'Betald';
      case 'open': return 'Öppen';
      case 'draft': return 'Utkast';
      case 'void': return 'Annullerad';
      case 'uncollectible': return 'Ej indrivningsbar';
      default: return status || 'Ingen';
    }
  };

  const getBillingStatusVariant = (status?: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'paid': return 'default';
      case 'open': return 'destructive';
      case 'draft': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Locked Company Warning */}
        {isCompanyLocked && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="rounded-full p-2 bg-destructive/10">
                  <Lock className="h-6 w-6 text-destructive" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-destructive">Företaget är låst</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Testperioden har gått ut och ingen betalning har registrerats. Användare måste kontakta{' '}
                    <span className="font-medium">{company.contactEmail || 'företagsadmin'}</span> för att aktivera åtkomst.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Unpaid Invoice Warning */}
        {hasUnpaidInvoice && !isCompanyLocked && (
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="rounded-full p-2 bg-yellow-500/10">
                  <AlertTriangle className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-700">Obetald faktura</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Det finns öppna fakturor som väntar på betalning.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/admin/enterprise')}
              className="shrink-0 mt-1"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">{company.name}</h1>
                <Badge variant={company.status === 'active' ? 'default' : 'secondary'}>
                  {company.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {company.planTier}
                {company.contactEmail && (
                  <>
                    <span className="mx-1">•</span>
                    <Mail className="h-4 w-4" />
                    {company.contactEmail}
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 ml-12 lg:ml-0">
            {company.adminFullAccessEnabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={loadCompanyMeetings}
                disabled={loadingMeetings}
              >
                {loadingMeetings && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                <Calendar className="h-4 w-4 mr-1" />
                Visa möten
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditCompany(true)}
            >
              <Edit className="h-4 w-4 mr-1" />
              Redigera
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeletingCompany(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Ta bort
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Medlemmar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{company.members.length}</div>
              <p className="text-xs text-muted-foreground">{activeMembers} aktiva</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Domäner
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{company.domains?.length || 0}</div>
              <p className="text-xs text-muted-foreground truncate">{company.domains?.join(', ') || 'Inga'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Database className="h-4 w-4" />
                Dataläge
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-foreground">
                {company.dataAccessMode === 'individual' ? 'Individuell' : 'Delad'}
              </div>
              <p className="text-xs text-muted-foreground">
                {company.dataAccessMode === 'individual' ? 'Egen data per medlem' : 'Gemensamt bibliotek'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                SIS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-foreground">
                    {sisEnabled ? `${sisReadyCount}/${company.members.length}` : 'Av'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {sisEnabled ? 'Verifierade' : 'Inaktiverad'}
                  </p>
                </div>
                <Switch
                  checked={sisEnabled}
                  onCheckedChange={handleToggleSIS}
                  disabled={isSubmitting}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Trial Status - only show if trial exists */}
        {company.trial && (
          <Card className={isTrialExpired ? 'border-destructive/50' : company.trial.enabled ? 'border-yellow-500/50' : company.trial.manuallyDisabled ? 'border-green-500/50' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-yellow-500" />
                  <CardTitle className="text-base">Testperiod</CardTitle>
                </div>
                <div className="flex gap-2">
                  {company.trial.enabled && !isTrialExpired && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDisableTrial}
                      disabled={isSubmitting}
                    >
                      Ta bort test
                    </Button>
                  )}
                  {(company.trial.manuallyDisabled || !company.trial.enabled || isTrialExpired) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTrialDialog(true)}
                    >
                      {company.trial.manuallyDisabled ? 'Återställ' : isTrialExpired ? 'Förläng' : 'Skapa test'}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <Badge variant={isTrialExpired ? 'destructive' : company.trial.enabled ? 'secondary' : company.trial.manuallyDisabled ? 'default' : 'outline'}>
                  {isTrialExpired ? 'Utgången' : company.trial.enabled ? 'Aktiv' : company.trial.manuallyDisabled ? 'Full tillgång' : 'Inaktiv'}
                </Badge>
                {/* Only show days remaining when trial is enabled and not manually disabled */}
                {company.trial.enabled && !company.trial.manuallyDisabled && trialDaysRemaining !== null && (
                  <span className={`${isTrialExpired ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {isTrialExpired 
                      ? `Utgången sedan ${Math.abs(trialDaysRemaining)} dagar` 
                      : `${trialDaysRemaining} dagar kvar av ${company.trial.daysTotal}`
                    }
                  </span>
                )}
                {company.trial.manuallyDisabled && (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Full tillgång aktiverad
                  </span>
                )}
                {company.trial.endsAt && company.trial.enabled && (
                  <span className="text-muted-foreground text-xs">
                    Slutar: {new Date(company.trial.endsAt).toLocaleDateString('sv-SE')}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Billing Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Faktureringsstatus</CardTitle>
              </div>
              {company.billingCustomerId && (
                <Badge variant="outline" className="text-xs">
                  Stripe: {company.billingCustomerId.slice(0, 12)}...
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <Badge variant={getBillingStatusVariant(company.billingStatus)}>
                {getBillingStatusLabel(company.billingStatus)}
              </Badge>
              {company.billingHistory && company.billingHistory.length > 0 && (
                <span className="text-muted-foreground">
                  {company.billingHistory.length} fakturor
                </span>
              )}
              {lastPaidInvoice && (
                <span className="text-muted-foreground">
                  Senast betald: {new Date(lastPaidInvoice.updatedAt).toLocaleDateString('sv-SE')}
                </span>
              )}
              {hasUnpaidInvoice && (
                <span className="text-yellow-600 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Har obetalda fakturor
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Members and Billing */}
        <Tabs defaultValue="members" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="members">
              <Users className="h-4 w-4 mr-2" />
              Medlemmar ({company.members.length})
            </TabsTrigger>
            <TabsTrigger value="billing">
              <FileText className="h-4 w-4 mr-2" />
              Fakturering
            </TabsTrigger>
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members" className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Medlemmar</CardTitle>
                    <CardDescription>{company.members.length} totalt, {activeMembers} aktiva</CardDescription>
                  </div>
                  <Button onClick={() => setShowAddMember(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Lägg till
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medlem</TableHead>
                      <TableHead>Roll</TableHead>
                      <TableHead>Titel</TableHead>
                      <TableHead>Status</TableHead>
                      {sisEnabled && <TableHead>SIS</TableHead>}
                      <TableHead>Tillagd</TableHead>
                      <TableHead className="text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.members.map((member) => (
                      <TableRow
                        key={member.email}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedMemberDetail({
                          email: member.email,
                          plan: 'enterprise',
                          meetingCount: 0
                        })}
                      >
                        <TableCell>
                          <div className="flex flex-col">
                            {member.preferredName && (
                              <span className="font-medium">{member.preferredName}</span>
                            )}
                            <span className={member.preferredName ? "text-sm text-muted-foreground" : "font-medium"}>
                              {member.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{member.role}</Badge>
                        </TableCell>
                        <TableCell>{member.title || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={member.status === 'active' ? 'default' : 'secondary'}>
                            {member.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                          </Badge>
                        </TableCell>
                        {sisEnabled && (
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                {member.sisSample?.status === 'ready' ? (
                                  <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Verifierad
                                  </Badge>
                                ) : member.sisSample?.status === 'processing' ? (
                                  <Badge variant="secondary">
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    Bearbetas
                                  </Badge>
                                ) : member.sisSample?.status === 'error' ? (
                                  <Badge variant="destructive">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Fel
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Saknas
                                  </Badge>
                                )}
                                {member.sisSample?.status === 'ready' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    disabled={resettingSISEmail === member.email}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setResettingSISEmail(member.email);
                                      try {
                                        await apiClient.resetUserSIS(member.email);
                                        toast({
                                          title: 'SIS-prov återställt',
                                          description: `Be ${member.preferredName || member.email} ladda upp ett nytt röstprov.`,
                                        });
                                        loadCompany();
                                      } catch (error: any) {
                                        toast({
                                          title: 'Kunde inte återställa SIS',
                                          description: error?.message || 'Ett oväntat fel uppstod',
                                          variant: 'destructive',
                                        });
                                      } finally {
                                        setResettingSISEmail(null);
                                      }
                                    }}
                                    title="Återställ SIS-prov"
                                  >
                                    {resettingSISEmail === member.email ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <RotateCcw className="h-3 w-3" />
                                    )}
                                  </Button>
                                )}
                              </div>
                              {/* Show speaker name if available */}
                              {member.sisSample?.speakerName && (
                                <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={member.sisSample.speakerName}>
                                  {member.sisSample.speakerName}
                                </span>
                              )}
                              {/* Show match info if available */}
                              {member.sisSample?.status === 'ready' && member.sisSample?.matchCount !== undefined && member.sisSample.matchCount > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {member.sisSample.matchCount} matchningar
                                  {member.sisSample.lastMatchScore !== null && member.sisSample.lastMatchScore !== undefined && (
                                    <> ({Math.round(member.sisSample.lastMatchScore * 100)}%)</>
                                  )}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        )}
                        <TableCell>{new Date(member.addedAt).toLocaleDateString('sv-SE')}</TableCell>
                        <TableCell className="text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingMember(member);
                              setShowEditMember(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingMember(member);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="mt-6">
            <CompanyBillingSection
              companyId={company.id}
              companyName={company.name}
              contactEmail={company.contactEmail}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Company Dialog */}
      <Dialog open={showEditCompany} onOpenChange={setShowEditCompany}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <form onSubmit={(e) => { e.preventDefault(); handleUpdateCompany(new FormData(e.currentTarget)); }}>
            <DialogHeader>
              <DialogTitle>Redigera Företag</DialogTitle>
              <DialogDescription>Uppdatera företagsinformation</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-name">Företagsnamn *</Label>
                <Input id="edit-name" name="name" defaultValue={company.name} required />
              </div>
              <div>
                <Label htmlFor="edit-contactEmail">Kontakt E-post</Label>
                <Input id="edit-contactEmail" name="contactEmail" type="email" defaultValue={company.contactEmail} />
              </div>
              <div>
                <Label htmlFor="edit-domains">Domäner (kommaseparerade)</Label>
                <Input id="edit-domains" name="domains" defaultValue={company.domains?.join(', ')} />
              </div>
              <div>
                <Label htmlFor="edit-status">Status</Label>
                <Select name="status" defaultValue={company.status}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="inactive">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-dataAccessMode">Dataåtkomstläge</Label>
                <Select name="dataAccessMode" defaultValue={company.dataAccessMode || 'shared'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="shared">Delad - Alla medlemmar ser gemensamt bibliotek</SelectItem>
                    <SelectItem value="individual">Individuell - Medlemmar ser endast sin egen data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Admin Fullständig Åtkomst</Label>
                <Select name="adminFullAccessEnabled" defaultValue={company.adminFullAccessEnabled ? 'true' : 'false'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="false">Inaktiverad</SelectItem>
                    <SelectItem value="true">Aktiverad - Ägare/admins kan se alla möten</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Talaridentifiering (SIS)</Label>
                  <p className="text-xs text-muted-foreground">
                    Aktivera speaker diarization för att identifiera talare i möten
                  </p>
                </div>
                <input type="hidden" name="speakerIdentificationEnabled" value={company.preferences?.speakerIdentificationEnabled ? 'true' : 'false'} />
                <Switch
                  name="speakerIdentificationEnabled"
                  defaultChecked={company.preferences?.speakerIdentificationEnabled ?? false}
                  onCheckedChange={(checked) => {
                    const hidden = document.querySelector('input[name="speakerIdentificationEnabled"][type="hidden"]') as HTMLInputElement;
                    if (hidden) hidden.value = checked ? 'true' : 'false';
                  }}
                />
              </div>
              <div>
                <Label htmlFor="edit-notes">Anteckningar (valfritt)</Label>
                <Textarea id="edit-notes" name="notes" defaultValue={company.notes} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditCompany(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Spara ändringar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); handleAddMember(new FormData(e.currentTarget)); }}>
            <DialogHeader>
              <DialogTitle>Lägg till medlem</DialogTitle>
              <DialogDescription>Lägg till en ny medlem till {company.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="add-email">E-post *</Label>
                <Input id="add-email" name="email" type="email" required placeholder="namn@foretag.se" />
              </div>
              <div>
                <Label htmlFor="add-preferredName">Visningsnamn</Label>
                <Input id="add-preferredName" name="preferredName" placeholder="Anna Andersson" />
              </div>
              <div>
                <Label htmlFor="add-role">Roll</Label>
                <Select name="role" defaultValue="member">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="member">Medlem</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="owner">Ägare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="add-title">Titel</Label>
                <Input id="add-title" name="title" placeholder="VD, Projektledare, etc." />
              </div>
              <div>
                <Label htmlFor="add-notes">Anteckningar</Label>
                <Textarea id="add-notes" name="notes" placeholder="Interna noteringar..." rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddMember(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Lägg till
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={showEditMember} onOpenChange={setShowEditMember}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); handleUpdateMember(new FormData(e.currentTarget)); }}>
            <DialogHeader>
              <DialogTitle>Redigera medlem</DialogTitle>
              <DialogDescription>{editingMember?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-preferredName">Visningsnamn</Label>
                <Input id="edit-preferredName" name="preferredName" defaultValue={editingMember?.preferredName} />
              </div>
              <div>
                <Label htmlFor="edit-role">Roll</Label>
                <Select name="role" defaultValue={editingMember?.role}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="member">Medlem</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="owner">Ägare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-title">Titel</Label>
                <Input id="edit-title" name="title" defaultValue={editingMember?.title} />
              </div>
              <div>
                <Label htmlFor="edit-status">Status</Label>
                <Select name="status" defaultValue={editingMember?.status}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="inactive">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-notes">Anteckningar</Label>
                <Textarea id="edit-notes" name="notes" defaultValue={editingMember?.notes} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditMember(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Spara
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Member Dialog */}
      <AlertDialog open={!!deletingMember} onOpenChange={(open) => !open && setDeletingMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort medlem?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort {deletingMember?.preferredName || deletingMember?.email} från företaget?
              Denna åtgärd kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMember}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Company Dialog */}
      <AlertDialog open={deletingCompany} onOpenChange={setDeletingCompany}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort företaget?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort {company.name} permanent?
              Alla medlemmar och data kommer att raderas. Denna åtgärd kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCompany}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ta bort permanent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Trial Dialog */}
      <Dialog open={showTrialDialog} onOpenChange={setShowTrialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {company.trial?.manuallyDisabled ? 'Återställ testperiod' : 'Skapa testperiod'}
            </DialogTitle>
            <DialogDescription>
              {company.trial?.manuallyDisabled
                ? 'Återställ testperioden för detta företag'
                : 'Starta en ny testperiod för detta företag'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="trialDays">Antal dagar</Label>
            <Input
              id="trialDays"
              type="number"
              min="1"
              max="365"
              value={trialDays}
              onChange={(e) => setTrialDays(parseInt(e.target.value) || 7)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowTrialDialog(false)}>
              Avbryt
            </Button>
            <Button onClick={handleCreateTrial} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {company.trial?.manuallyDisabled ? 'Återställ' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Meetings Dialog */}
      <Dialog open={showMeetings} onOpenChange={setShowMeetings}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Möten - {company.name}</DialogTitle>
            <DialogDescription>
              {companyMeetings?.totalMeetings || 0} möten totalt
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            {companyMeetings?.meetings?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead>Skapare</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Protokoll</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companyMeetings.meetings.map((meeting: any) => (
                    <TableRow key={meeting.id}>
                      <TableCell className="font-medium">{meeting.title}</TableCell>
                      <TableCell>{meeting.creatorEmail || '-'}</TableCell>
                      <TableCell>{new Date(meeting.createdAt).toLocaleDateString('sv-SE')}</TableCell>
                      <TableCell>
                        <Badge variant={meeting.hasProtocol ? 'default' : 'outline'}>
                          {meeting.hasProtocol ? 'Ja' : 'Nej'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Inga möten hittades
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* User Detail Dialog */}
      <UserDetailDialog
        user={selectedMemberDetail ? {
          email: selectedMemberDetail.email,
          plan: selectedMemberDetail.plan,
          meetingCount: selectedMemberDetail.meetingCount,
        } : null}
        open={!!selectedMemberDetail}
        onOpenChange={(open) => !open && setSelectedMemberDetail(null)}
      />
    </div>
  );
}
