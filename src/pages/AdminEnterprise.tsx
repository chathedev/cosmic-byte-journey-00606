import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
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
import { Loader2, Plus, Edit, Trash2, Users, Building2, Mail, ChevronRight, Calendar, FileText, TrendingUp, Volume2, CheckCircle2, XCircle, RotateCcw, RefreshCw, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserDetailDialog } from '@/components/UserDetailDialog';
import { CompanyBillingSection } from '@/components/CompanyBillingSection';

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
  sisSample?: {
    status: 'ready' | 'processing' | 'error' | null;
    uploadedAt?: string;
    lastMatchScore?: number;
  };
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
  memberLimit?: number | null;
  dataAccessMode?: 'shared' | 'individual';
  adminFullAccessEnabled?: boolean;
  trial?: {
    enabled: boolean;
    startsAt: string;
    endsAt: string;
    daysTotal: number;
    daysRemaining: number | null;
    expired: boolean;
    configuredBy: string;
    manuallyDisabled: boolean;
    disabledAt: string | null;
    disabledBy: string | null;
  };
  preferences?: {
    meetingCreatorVisibility?: 'shared_only' | 'always' | 'hidden';
    storageRegion?: 'eu' | 'us' | 'auto';
    dataRetentionDays?: number;
    allowAdminFolderLock?: boolean;
    speakerIdentificationEnabled?: boolean;
  };
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  members: CompanyMember[];
}

interface CompanySummary {
  id: string;
  name: string;
  memberCount: number;
  activeMemberCount: number;
  status: string;
}

interface SISCompanyOverview {
  id: string;
  name: string;
  slug: string;
  status: string;
  planTier: string;
  domains: string[];
  memberCount: number;
  sisReadyCount: number;
  members: Array<{
    email: string;
    role: string;
    status: string;
    sisSample: {
      status: 'ready' | 'processing' | 'error' | 'missing';
      speakerName: string | null;
      uploadedAt: string | null;
      lastTranscribedAt: string | null;
      lastCheckedAt: string | null;
      lastMatchScore: number | null;
      matchCount: number;
    };
  }>;
}

export default function AdminEnterprise() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [summaries, setSummaries] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  
  // Company dialogs
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [showEditCompany, setShowEditCompany] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  
  // Member dialogs
  const [showAddMember, setShowAddMember] = useState(false);
  const [showEditMember, setShowEditMember] = useState(false);
  const [editingMember, setEditingMember] = useState<CompanyMember | null>(null);
  const [deletingMember, setDeletingMember] = useState<CompanyMember | null>(null);
  
  // Company deletion
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  
  // Meetings view
  const [showMeetings, setShowMeetings] = useState(false);
  const [companyMeetings, setCompanyMeetings] = useState<any>(null);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  
  // Combined meetings view
  const [showCombinedMeetings, setShowCombinedMeetings] = useState(false);
  const [allCompanyMeetings, setAllCompanyMeetings] = useState<any[]>([]);
  const [loadingAllMeetings, setLoadingAllMeetings] = useState(false);
  
  // Trial management
  const [showTrialDialog, setShowTrialDialog] = useState(false);
  const [trialDays, setTrialDays] = useState<number>(7);
  
  // SIS reset
  const [resettingSISEmail, setResettingSISEmail] = useState<string | null>(null);
  
  // SIS Companies Overview
  const [sisOverview, setSisOverview] = useState<SISCompanyOverview[]>([]);
  const [sisTimestamp, setSisTimestamp] = useState<string | null>(null);
  const [loadingSIS, setLoadingSIS] = useState(false);
  const [selectedMemberDetail, setSelectedMemberDetail] = useState<{ email: string; plan: string; meetingCount: number } | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadCompanies();
    loadSISOverview();
  }, []);

  const loadSISOverview = async () => {
    try {
      setLoadingSIS(true);
      const data = await apiClient.getSISCompanies();
      setSisOverview(data.companies || []);
      setSisTimestamp(data.timestamp);
    } catch (error) {
      console.error('Failed to load SIS overview:', error);
      // Silently fail - SIS overview is supplementary
    } finally {
      setLoadingSIS(false);
    }
  };

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getEnterpriseCompanies();
      setCompanies(data.companies || []);
      setSummaries(data.summaries || []);
    } catch (error) {
      console.error('Failed to load companies:', error);
      toast({
        title: 'Error',
        description: 'Failed to load enterprise companies',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Helper to get SIS data for a company
  const getSISDataForCompany = (companyId: string) => {
    return sisOverview.find(c => c.id === companyId);
  };

  // Helper to get SIS data for a member from the SIS overview (more accurate than company data)
  const getMemberSISStatus = (companyId: string, memberEmail: string) => {
    const sisCompany = getSISDataForCompany(companyId);
    if (!sisCompany) return null;
    const sisMember = sisCompany.members.find(m => m.email.toLowerCase() === memberEmail.toLowerCase());
    return sisMember?.sisSample || null;
  };

  const handleCreateCompany = async (formData: FormData) => {
    const name = formData.get('name') as string;
    const contactEmail = formData.get('contactEmail') as string;
    const domains = (formData.get('domains') as string).split(',').map(d => d.trim()).filter(Boolean);
    const notes = formData.get('notes') as string;
    const dataAccessMode = formData.get('dataAccessMode') as 'shared' | 'individual';
    const adminFullAccessEnabled = formData.get('adminFullAccessEnabled') === 'true';
    const speakerIdentificationEnabled = formData.get('speakerIdentificationEnabled') === 'true';

    const memberLimitRaw = (formData.get('memberLimit') as string) || '';
    const memberLimit = memberLimitRaw.trim() === '' ? null : Number(memberLimitRaw);

    const employeeCountHint = ((formData.get('employeeCountHint') as string) || '').trim();

    try {
      setIsSubmitting(true);
      await apiClient.createEnterpriseCompany({
        name,
        contactEmail: contactEmail || undefined,
        domains: domains.length > 0 ? domains : undefined,
        notes: notes || undefined,
        planTier: 'enterprise',
        status: 'active',
        dataAccessMode: dataAccessMode || 'shared',
        adminFullAccessEnabled,
        memberLimit: Number.isFinite(memberLimit as number) ? (memberLimit as number) : memberLimit,
        metadata: employeeCountHint ? { employeeCountHint } : undefined,
        preferences: {
          meetingCreatorVisibility: 'shared_only',
          storageRegion: 'eu',
          dataRetentionDays: 365,
          allowAdminFolderLock: false,
          speakerIdentificationEnabled,
        },
      });

      toast({
        title: 'Success',
        description: 'Company created successfully',
      });

      setShowCreateCompany(false);
      loadCompanies();
    } catch (error) {
      console.error('Failed to create company:', error);
      toast({
        title: 'Error',
        description: 'Failed to create company',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateCompany = async (formData: FormData) => {
    if (!editingCompany) return;

    const name = formData.get('name') as string;
    const contactEmail = formData.get('contactEmail') as string;
    const domains = (formData.get('domains') as string).split(',').map(d => d.trim()).filter(Boolean);
    const notes = formData.get('notes') as string;
    const status = formData.get('status') as string;
    const dataAccessMode = formData.get('dataAccessMode') as 'shared' | 'individual';
    const adminFullAccessEnabled = formData.get('adminFullAccessEnabled') === 'true';
    const speakerIdentificationEnabled = formData.get('speakerIdentificationEnabled') === 'true';

    const memberLimitRaw = (formData.get('memberLimit') as string) || '';
    const memberLimit = memberLimitRaw.trim() === '' ? null : Number(memberLimitRaw);

    const employeeCountHint = ((formData.get('employeeCountHint') as string) || '').trim();
    const nextMetadata = {
      ...(editingCompany.metadata || {}),
      ...(employeeCountHint ? { employeeCountHint } : {}),
    };

    try {
      setIsSubmitting(true);
      await apiClient.updateEnterpriseCompany(editingCompany.id, {
        name,
        contactEmail: contactEmail || undefined,
        domains: domains.length > 0 ? domains : undefined,
        notes: notes || undefined,
        status,
        dataAccessMode,
        adminFullAccessEnabled,
        memberLimit: Number.isFinite(memberLimit as number) ? (memberLimit as number) : memberLimit,
        metadata: Object.keys(nextMetadata).length ? nextMetadata : undefined,
        preferences: {
          meetingCreatorVisibility: 'shared_only',
          storageRegion: 'eu',
          dataRetentionDays: 365,
          allowAdminFolderLock: false,
          speakerIdentificationEnabled,
        },
      });

      toast({
        title: 'Success',
        description: 'Company updated successfully',
      });

      setShowEditCompany(false);
      setEditingCompany(null);
      loadCompanies();
      if (selectedCompany?.id === editingCompany.id) {
        const updated = await apiClient.getEnterpriseCompany(editingCompany.id);
        setSelectedCompany(updated.company);
      }
    } catch (error) {
      console.error('Failed to update company:', error);
      toast({
        title: 'Error',
        description: 'Failed to update company',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMember = async (formData: FormData) => {
    if (!selectedCompany) return;

    const email = formData.get('email') as string;
    const role = formData.get('role') as string;
    const title = formData.get('title') as string;
    const notes = formData.get('notes') as string;
    const preferredName = formData.get('preferredName') as string;

    try {
      setIsSubmitting(true);
      await apiClient.addEnterpriseCompanyMember(selectedCompany.id, {
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
      const updated = await apiClient.getEnterpriseCompany(selectedCompany.id);
      setSelectedCompany(updated.company);
      loadCompanies();
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
    if (!selectedCompany || !editingMember) return;

    const role = formData.get('role') as string;
    const title = formData.get('title') as string;
    const notes = formData.get('notes') as string;
    const status = formData.get('status') as string;
    const preferredName = formData.get('preferredName') as string;

    try {
      setIsSubmitting(true);
      await apiClient.updateEnterpriseCompanyMember(selectedCompany.id, editingMember.email, {
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
      const updated = await apiClient.getEnterpriseCompany(selectedCompany.id);
      setSelectedCompany(updated.company);
      loadCompanies();
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

  const loadCompanyMeetings = async (companyId: string) => {
    try {
      setLoadingMeetings(true);
      const data = await apiClient.getEnterpriseCompanyMeetings(companyId);
      setCompanyMeetings(data);
      setShowMeetings(true);
    } catch (error) {
      console.error('Failed to load company meetings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load company meetings',
        variant: 'destructive',
      });
    } finally {
      setLoadingMeetings(false);
    }
  };

  const loadAllCompanyMeetings = async () => {
    try {
      setLoadingAllMeetings(true);
      const meetingsPromises = companies
        .filter(c => c.adminFullAccessEnabled && c.status === 'active')
        .map(async (company) => {
          try {
            const data = await apiClient.getEnterpriseCompanyMeetings(company.id);
            return {
              companyId: company.id,
              companyName: company.name,
              ...data
            };
          } catch (error) {
            console.error(`Failed to load meetings for ${company.name}:`, error);
            return null;
          }
        });
      
      const results = await Promise.all(meetingsPromises);
      setAllCompanyMeetings(results.filter(r => r !== null));
      setShowCombinedMeetings(true);
    } catch (error) {
      console.error('Failed to load all company meetings:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte ladda företagsmöten',
        variant: 'destructive',
      });
    } finally {
      setLoadingAllMeetings(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!selectedCompany || !deletingMember) return;

    try {
      setIsSubmitting(true);
      await apiClient.deleteEnterpriseCompanyMember(selectedCompany.id, deletingMember.email);
      
      toast({
        title: 'Success',
        description: 'Member removed successfully',
      });
      
      setDeletingMember(null);
      const updated = await apiClient.getEnterpriseCompany(selectedCompany.id);
      setSelectedCompany(updated.company);
      loadCompanies();
    } catch (error) {
      console.error('Failed to remove member:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove member',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!deletingCompany) return;

    try {
      setIsSubmitting(true);
      await apiClient.deleteEnterpriseCompany(deletingCompany.id);
      
      toast({
        title: 'Företag borttaget',
        description: `${deletingCompany.name} har tagits bort permanent`,
      });
      
      setDeletingCompany(null);
      if (selectedCompany?.id === deletingCompany.id) {
        setSelectedCompany(null);
      }
      loadCompanies();
    } catch (error) {
      console.error('Failed to delete company:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte ta bort företaget. Kontrollera att det inte har aktiva medlemmar eller data.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateTrial = async () => {
    if (!selectedCompany) return;

    const isRestoring = selectedCompany.trial?.manuallyDisabled;

    try {
      setIsSubmitting(true);
      
      if (isRestoring) {
        // Restoring a manually disabled trial - days is optional
        await apiClient.resumeEnterpriseCompanyTrial(
          selectedCompany.id,
          trialDays && trialDays > 0 ? Math.floor(trialDays) : undefined
        );
        
        toast({
          title: 'Testperiod återställd',
          description: `Testperioden har återställts för ${selectedCompany.name}`,
        });
      } else {
        // Creating a new trial
        if (!trialDays || trialDays < 1) return;
        
        await apiClient.createEnterpriseCompanyTrial(selectedCompany.id, {
          days: Math.floor(trialDays),
        });
        
        toast({
          title: 'Testperiod skapad',
          description: `${trialDays} dagars testperiod har startats för ${selectedCompany.name}`,
        });
      }
      
      setShowTrialDialog(false);
      setTrialDays(7);
      const updated = await apiClient.getEnterpriseCompany(selectedCompany.id);
      setSelectedCompany(updated.company);
      loadCompanies();
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
    if (!selectedCompany) return;

    try {
      setIsSubmitting(true);
      await apiClient.disableEnterpriseCompanyTrial(selectedCompany.id);
      
      toast({
        title: 'Testperiod borttagen',
        description: `Testperioden har tagits bort och full tillgång har aktiverats för ${selectedCompany.name}`,
      });
      
      const updated = await apiClient.getEnterpriseCompany(selectedCompany.id);
      setSelectedCompany(updated.company);
      loadCompanies();
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

  const handleResumeTrial = async () => {
    if (!selectedCompany) return;
    setShowTrialDialog(true);
  };

  const viewCompanyDetails = (companyId: string) => {
    navigate(`/admin/enterprise/${companyId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Rubrik */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Företagshantering</h1>
            <p className="text-muted-foreground mt-1">Hantera företag, medlemmar och möten</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={loadAllCompanyMeetings}
              disabled={loadingAllMeetings}
            >
              {loadingAllMeetings && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Calendar className="h-4 w-4 mr-2" />
              Möten
            </Button>
            <Button size="sm" onClick={() => setShowCreateCompany(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Företag
            </Button>
          </div>
        </div>

        {/* Statistik */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Totalt Företag</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{summaries.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Aktiva Företag</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                {summaries.filter(c => c.status === 'active').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Totalt Medlemmar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {summaries.reduce((sum, c) => sum + c.memberCount, 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Företagslista */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Företag</CardTitle>
                <CardDescription>Alla enterprise-företag i systemet</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {sisTimestamp && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Uppdaterad: {new Date(sisTimestamp).toLocaleTimeString('sv-SE')}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadSISOverview}
                  disabled={loadingSIS}
                >
                  {loadingSIS ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Företag</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Medlemmar</TableHead>
                  <TableHead>Aktiva</TableHead>
                  <TableHead>SIS-status</TableHead>
                  <TableHead className="text-right">Åtgärder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((summary) => {
                  const sisData = getSISDataForCompany(summary.id);
                  return (
                    <TableRow key={summary.id}>
                      <TableCell className="font-medium">{summary.name}</TableCell>
                      <TableCell>
                        <Badge variant={summary.status === 'active' ? 'default' : 'secondary'}>
                          {summary.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                        </Badge>
                      </TableCell>
                      <TableCell>{summary.memberCount}</TableCell>
                      <TableCell>{summary.activeMemberCount}</TableCell>
                      <TableCell>
                        {sisData ? (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              <span className="text-sm text-muted-foreground">
                                {sisData.sisReadyCount}/{sisData.memberCount}
                              </span>
                            </div>
                            {sisData.sisReadyCount === sisData.memberCount && sisData.memberCount > 0 ? (
                              <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                                Komplett
                              </Badge>
                            ) : sisData.sisReadyCount > 0 ? (
                              <Badge variant="secondary" className="text-xs">
                                Delvis
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground text-xs">
                                Ingen
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewCompanyDetails(summary.id)}
                        >
                          Visa detaljer
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create Company Dialog */}
      <Dialog open={showCreateCompany} onOpenChange={setShowCreateCompany}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <form onSubmit={(e) => { e.preventDefault(); handleCreateCompany(new FormData(e.currentTarget)); }}>
            <DialogHeader>
              <DialogTitle>Skapa Företag</DialogTitle>
              <DialogDescription>Lägg till ett nytt företag i systemet</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="name">Företagsnamn *</Label>
                <Input id="name" name="name" required placeholder="ex. Tivly AB" />
              </div>
              <div>
                <Label htmlFor="contactEmail">Kontakt E-post</Label>
                <Input id="contactEmail" name="contactEmail" type="email" placeholder="kontakt@foretag.se" />
              </div>
              <div>
                <Label htmlFor="domains">Domäner (kommaseparerade)</Label>
                <Input id="domains" name="domains" placeholder="foretag.se, foretag.com" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="memberLimit">Max teamstorlek (memberLimit)</Label>
                  <Input
                    id="memberLimit"
                    name="memberLimit"
                    type="number"
                    min={0}
                    placeholder="Lämna tomt = obegränsat"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Används som signal i AI-prisförslag och kan användas för att begränsa teamstorlek.
                  </p>
                </div>
                <div>
                  <Label htmlFor="employeeCountHint">Antal anställda (ca)</Label>
                  <Input
                    id="employeeCountHint"
                    name="employeeCountHint"
                    placeholder="t.ex. 70 eller 200-500"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Valfritt admin-hint om LinkedIn inte kan hämtas.
                  </p>
                </div>
              </div>
              <div>
                <Label htmlFor="dataAccessMode">Dataåtkomstläge</Label>
                <Select name="dataAccessMode" defaultValue="shared">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="shared">Delad - Alla medlemmar ser gemensamt bibliotek</SelectItem>
                    <SelectItem value="individual">Individuell - Medlemmar ser endast sin egen data</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Delad: samarbetande team med gemensam kunskapsbas. Individuell: isolerade bibliotek per medlem.
                </p>
              </div>
              <div>
                <Label>Admin Fullständig Åtkomst</Label>
                <Select name="adminFullAccessEnabled" defaultValue="false">
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
                <input type="hidden" name="speakerIdentificationEnabled" value="false" />
                <Switch name="speakerIdentificationEnabled" defaultChecked={false} onCheckedChange={(checked) => {
                  const hidden = document.querySelector('input[name="speakerIdentificationEnabled"][type="hidden"]') as HTMLInputElement;
                  if (hidden) hidden.value = checked ? 'true' : 'false';
                }} />
              </div>
              <div>
                <Label htmlFor="notes">Anteckningar (valfritt)</Label>
                <Textarea id="notes" name="notes" placeholder="Interna noteringar om företaget..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateCompany(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Skapa Företag
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
                <Input id="edit-name" name="name" defaultValue={editingCompany?.name} required />
              </div>
              <div>
                <Label htmlFor="edit-contactEmail">Kontakt E-post</Label>
                <Input id="edit-contactEmail" name="contactEmail" type="email" defaultValue={editingCompany?.contactEmail} />
              </div>
              <div>
                <Label htmlFor="edit-domains">Domäner (kommaseparerade)</Label>
                <Input id="edit-domains" name="domains" defaultValue={editingCompany?.domains?.join(', ')} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="edit-memberLimit">Max teamstorlek (memberLimit)</Label>
                  <Input
                    id="edit-memberLimit"
                    name="memberLimit"
                    type="number"
                    min={0}
                    defaultValue={editingCompany?.memberLimit ?? ''}
                    placeholder="Lämna tomt = obegränsat"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-employeeCountHint">Antal anställda (ca)</Label>
                  <Input
                    id="edit-employeeCountHint"
                    name="employeeCountHint"
                    defaultValue={editingCompany?.metadata?.employeeCountHint || ''}
                    placeholder="t.ex. 70 eller 200-500"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-status">Status</Label>
                <Select name="status" defaultValue={editingCompany?.status}>
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
                <Select name="dataAccessMode" defaultValue={editingCompany?.dataAccessMode || 'shared'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="shared">Delad - Alla medlemmar ser gemensamt bibliotek</SelectItem>
                    <SelectItem value="individual">Individuell - Medlemmar ser endast sin egen data</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Ändring av läge uppdaterar direkt medlemmarnas behörigheter. Innehåll tas inte bort.
                </p>
              </div>
              <div>
                <Label>Admin Fullständig Åtkomst</Label>
                <Select name="adminFullAccessEnabled" defaultValue={editingCompany?.adminFullAccessEnabled ? 'true' : 'false'}>
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
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Talaridentifiering (SIS)</Label>
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Aktivera speaker diarization för att identifiera talare i möten
                  </p>
                </div>
                <input type="hidden" name="speakerIdentificationEnabled" value={editingCompany?.preferences?.speakerIdentificationEnabled ? 'true' : 'false'} />
                <Switch 
                  name="speakerIdentificationEnabled" 
                  defaultChecked={editingCompany?.preferences?.speakerIdentificationEnabled ?? false} 
                  onCheckedChange={(checked) => {
                    const hidden = document.querySelector('input[name="speakerIdentificationEnabled"][type="hidden"]') as HTMLInputElement;
                    if (hidden) hidden.value = checked ? 'true' : 'false';
                  }} 
                />
              </div>
              <div>
                <Label htmlFor="edit-notes">Anteckningar (valfritt)</Label>
                <Textarea id="edit-notes" name="notes" defaultValue={editingCompany?.notes} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditCompany(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Uppdatera Företag
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
              <DialogDescription>Lägg till en ny medlem till {selectedCompany?.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="member-email">E-post *</Label>
                <Input id="member-email" name="email" type="email" required placeholder="namn@foretag.se" />
              </div>
              <div>
                <Label htmlFor="member-preferredName">Visningsnamn *</Label>
                <Input 
                  id="member-preferredName" 
                  name="preferredName" 
                  placeholder="Johan Andersson"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Används i profil, hälsningar och talaridentifiering (SIS)
                </p>
              </div>
              <div>
                <Label htmlFor="member-role">Roll *</Label>
                <Select name="role" defaultValue="member">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Ägare</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Medlem</SelectItem>
                    <SelectItem value="viewer">Visare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="member-title">Titel</Label>
                <Input id="member-title" name="title" placeholder="VD, Chef, etc." />
              </div>
              <div>
                <Label htmlFor="member-notes">Anteckningar</Label>
                <Textarea id="member-notes" name="notes" placeholder="Interna anteckningar om medlemmen..." />
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
              <DialogDescription>Uppdatera information för {editingMember?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-member-preferredName">Visningsnamn</Label>
                <Input 
                  id="edit-member-preferredName" 
                  name="preferredName" 
                  defaultValue={editingMember?.preferredName}
                  placeholder="Johan Andersson"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Används i profil, hälsningar och talaridentifiering (SIS)
                </p>
              </div>
              <div>
                <Label htmlFor="edit-member-role">Roll *</Label>
                <Select name="role" defaultValue={editingMember?.role}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Ägare</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Medlem</SelectItem>
                    <SelectItem value="viewer">Visare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-member-title">Titel</Label>
                <Input id="edit-member-title" name="title" defaultValue={editingMember?.title} placeholder="VD, Chef, etc." />
              </div>
              <div>
                <Label htmlFor="edit-member-status">Status</Label>
                <Select name="status" defaultValue={editingMember?.status}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="inactive">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-member-notes">Anteckningar</Label>
                <Textarea id="edit-member-notes" name="notes" defaultValue={editingMember?.notes} placeholder="Interna anteckningar..." />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditMember(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Uppdatera
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Member Confirmation */}
      <AlertDialog open={!!deletingMember} onOpenChange={() => setDeletingMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {deletingMember?.email} from {selectedCompany?.name}? 
              This will downgrade their plan to free if they don't belong to other companies.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMember} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Company Confirmation */}
      <AlertDialog open={!!deletingCompany} onOpenChange={() => setDeletingCompany(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort företag permanent</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Är du säker på att du vill ta bort <strong>{deletingCompany?.name}</strong> permanent?
              </p>
              <p className="text-destructive font-semibold">
                ⚠️ Detta tar bort:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Alla företagets medlemmar ({deletingCompany?.members?.length || 0} st)</li>
                <li>All företagsdata och inställningar</li>
                <li>Medlemmarnas tillgång till enterprise-funktioner</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Denna åtgärd kan inte ångras.
              </p>
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

      {/* Company Meetings Dialog */}
      <Dialog open={showMeetings} onOpenChange={setShowMeetings}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Företagsmöten</DialogTitle>
            <DialogDescription>
              Möten för {companyMeetings?.companyName || selectedCompany?.name}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pr-4">
              {companyMeetings?.statistics && (
                <div className="grid gap-4 md:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Totalt Möten</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{companyMeetings.statistics.totalMeetings}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Totalt Protokoll</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{companyMeetings.statistics.totalProtocols}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Unika Användare</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{companyMeetings.statistics.uniqueUsers}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Snitt Protokoll/Möte</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{companyMeetings.statistics.avgProtocolsPerMeeting}</div>
                    </CardContent>
                  </Card>
                </div>
              )}
              
              {companyMeetings?.meetings && (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Titel</TableHead>
                        <TableHead>Användare</TableHead>
                        <TableHead>Protokoll</TableHead>
                        <TableHead>Skapad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companyMeetings.meetings.map((meeting: any) => (
                        <TableRow key={meeting.id}>
                          <TableCell className="font-medium">{meeting.title}</TableCell>
                          <TableCell className="text-xs">{meeting.userId}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{meeting.protocolCount || 0}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{new Date(meeting.createdAt).toLocaleDateString('sv-SE')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Combined Meetings Dialog */}
      <Dialog open={showCombinedMeetings} onOpenChange={setShowCombinedMeetings}>
        <DialogContent className="max-w-7xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Samlade Företagsmöten & Statistik
            </DialogTitle>
            <DialogDescription>
              Omfattande översikt över {allCompanyMeetings.length} företag med aktiverad åtkomst
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Översikt</TabsTrigger>
              <TabsTrigger value="companies">Företag</TabsTrigger>
              <TabsTrigger value="users">Användare</TabsTrigger>
              <TabsTrigger value="meetings">Möten</TabsTrigger>
              <TabsTrigger value="analytics">Analys</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-4">
              <ScrollArea className="h-[55vh]">
                <div className="space-y-4 pr-4">
                  {/* Aggregate Statistics */}
                  <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Totalt Företag</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-primary">{allCompanyMeetings.length}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Totalt Möten</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">
                          {allCompanyMeetings.reduce((sum, c) => sum + (c.statistics?.totalMeetings || 0), 0)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Totalt Protokoll</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                          {allCompanyMeetings.reduce((sum, c) => sum + (c.statistics?.totalProtocols || 0), 0)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Totalt Användare</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                          {allCompanyMeetings.reduce((sum, c) => sum + (c.statistics?.uniqueUsers || 0), 0)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Company Breakdown */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Företagsöversikt</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Företag</TableHead>
                            <TableHead className="text-right">Möten</TableHead>
                            <TableHead className="text-right">Protokoll</TableHead>
                            <TableHead className="text-right">Användare</TableHead>
                            <TableHead className="text-right">Snitt Protokoll/Möte</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {allCompanyMeetings.map((company) => (
                            <TableRow key={company.companyId}>
                              <TableCell className="font-medium">{company.companyName}</TableCell>
                              <TableCell className="text-right">{company.statistics?.totalMeetings || 0}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="outline">{company.statistics?.totalProtocols || 0}</Badge>
                              </TableCell>
                              <TableCell className="text-right">{company.statistics?.uniqueUsers || 0}</TableCell>
                              <TableCell className="text-right">
                                <Badge>{company.statistics?.avgProtocolsPerMeeting || 0}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="companies" className="space-y-4">
              <ScrollArea className="h-[55vh]">
                <div className="space-y-6 pr-4">
                  {allCompanyMeetings
                    .sort((a, b) => (b.statistics?.totalMeetings || 0) - (a.statistics?.totalMeetings || 0))
                    .map((company) => (
                    <Card key={company.companyId} className="border-l-4 border-l-primary">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Building2 className="h-5 w-5" />
                              {company.companyName}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {company.statistics?.uniqueUsers || 0} aktiva användare
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-lg">
                              {company.meetings?.length || 0} möten
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Company Statistics Grid */}
                        <div className="grid gap-3 md:grid-cols-4">
                          <div className="p-3 bg-muted/50 rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">Totalt Möten</div>
                            <div className="text-2xl font-bold">{company.statistics?.totalMeetings || 0}</div>
                          </div>
                          <div className="p-3 bg-green-500/10 rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">Protokoll</div>
                            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                              {company.statistics?.totalProtocols || 0}
                            </div>
                          </div>
                          <div className="p-3 bg-blue-500/10 rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">Användare</div>
                            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                              {company.statistics?.uniqueUsers || 0}
                            </div>
                          </div>
                          <div className="p-3 bg-purple-500/10 rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">Snitt/Möte</div>
                            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                              {company.statistics?.avgProtocolsPerMeeting || 0}
                            </div>
                          </div>
                        </div>

                        {/* Recent Meetings Preview */}
                        {company.meetings && company.meetings.length > 0 && (
                          <div>
                            <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              Senaste Möten
                            </div>
                            <div className="space-y-2">
                              {company.meetings.slice(0, 3).map((meeting: any) => (
                                <div key={meeting.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{meeting.title}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {meeting.userId} · {new Date(meeting.createdAt).toLocaleDateString('sv-SE')}
                                    </div>
                                  </div>
                                  <Badge variant="outline" className="ml-2">
                                    {meeting.protocolCount || 0} protokoll
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="users" className="space-y-4">
              <ScrollArea className="h-[55vh]">
                <div className="space-y-4 pr-4">
                  {/* User Statistics */}
                  {(() => {
                    // Aggregate user statistics across all companies
                    const userStats = new Map<string, {
                      email: string;
                      meetingCount: number;
                      protocolCount: number;
                      companies: Set<string>;
                      lastActivity: Date;
                    }>();

                    allCompanyMeetings.forEach(company => {
                      company.meetings?.forEach((meeting: any) => {
                        const userId = meeting.userId;
                        if (!userStats.has(userId)) {
                          userStats.set(userId, {
                            email: userId,
                            meetingCount: 0,
                            protocolCount: 0,
                            companies: new Set(),
                            lastActivity: new Date(meeting.createdAt)
                          });
                        }
                        const stats = userStats.get(userId)!;
                        stats.meetingCount++;
                        stats.protocolCount += meeting.protocolCount || 0;
                        stats.companies.add(company.companyName);
                        const meetingDate = new Date(meeting.createdAt);
                        if (meetingDate > stats.lastActivity) {
                          stats.lastActivity = meetingDate;
                        }
                      });
                    });

                    const sortedUsers = Array.from(userStats.entries())
                      .sort((a, b) => b[1].meetingCount - a[1].meetingCount);

                    return (
                      <>
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                              <Users className="h-5 w-5" />
                              Användare Översikt
                            </CardTitle>
                            <CardDescription>
                              {sortedUsers.length} totala användare över alla företag
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="grid gap-4 md:grid-cols-3 mb-4">
                              <div className="p-4 bg-primary/10 rounded-lg">
                                <div className="text-sm text-muted-foreground mb-1">Mest Aktiv Användare</div>
                                <div className="text-lg font-bold truncate">
                                  {sortedUsers[0]?.[0] || 'N/A'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {sortedUsers[0]?.[1].meetingCount || 0} möten
                                </div>
                              </div>
                              <div className="p-4 bg-green-500/10 rounded-lg">
                                <div className="text-sm text-muted-foreground mb-1">Snitt Möten/Användare</div>
                                <div className="text-lg font-bold">
                                  {sortedUsers.length > 0
                                    ? (sortedUsers.reduce((sum, [_, s]) => sum + s.meetingCount, 0) / sortedUsers.length).toFixed(1)
                                    : 0}
                                </div>
                              </div>
                              <div className="p-4 bg-blue-500/10 rounded-lg">
                                <div className="text-sm text-muted-foreground mb-1">Snitt Protokoll/Användare</div>
                                <div className="text-lg font-bold">
                                  {sortedUsers.length > 0
                                    ? (sortedUsers.reduce((sum, [_, s]) => sum + s.protocolCount, 0) / sortedUsers.length).toFixed(1)
                                    : 0}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle>Detaljerad Användarstatistik</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Användare</TableHead>
                                  <TableHead className="text-right">Möten</TableHead>
                                  <TableHead className="text-right">Protokoll</TableHead>
                                  <TableHead className="text-right">Företag</TableHead>
                                  <TableHead>Senaste Aktivitet</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sortedUsers.map(([email, stats]) => (
                                  <TableRow key={email}>
                                    <TableCell className="font-medium">
                                      <div className="flex items-center gap-2">
                                        <Mail className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm">{email}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Badge variant="outline">{stats.meetingCount}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Badge className="bg-green-500/20 text-green-700 dark:text-green-300">
                                        {stats.protocolCount}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Badge variant="secondary">{stats.companies.size}</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {stats.lastActivity.toLocaleDateString('sv-SE')}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      </>
                    );
                  })()}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="meetings" className="space-y-4">
              <ScrollArea className="h-[55vh]">
                <div className="pr-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Företag</TableHead>
                        <TableHead>Möte</TableHead>
                        <TableHead>Användare</TableHead>
                        <TableHead>Protokoll</TableHead>
                        <TableHead>Mapp</TableHead>
                        <TableHead>Skapad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allCompanyMeetings.flatMap((company) => 
                        (company.meetings || []).map((meeting: any) => ({
                          ...meeting,
                          companyName: company.companyName,
                          companyId: company.companyId
                        }))
                      )
                      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((meeting: any) => (
                        <TableRow key={`${meeting.companyId}-${meeting.id}`}>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {meeting.companyName}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium max-w-xs truncate">
                            {meeting.title}
                          </TableCell>
                          <TableCell className="text-xs">{meeting.userId}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{meeting.protocolCount || 0}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {meeting.folder || 'Allmänt'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(meeting.createdAt).toLocaleDateString('sv-SE')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="analytics" className="space-y-4">
              <ScrollArea className="h-[55vh]">
                <div className="space-y-4 pr-4">
                  {/* Advanced Analytics */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Företag Ranking (Möten)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {allCompanyMeetings
                            .sort((a, b) => (b.statistics?.totalMeetings || 0) - (a.statistics?.totalMeetings || 0))
                            .slice(0, 5)
                            .map((company, index) => (
                              <div key={company.companyId} className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                                  {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{company.companyName}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {company.statistics?.totalMeetings || 0} möten
                                  </div>
                                </div>
                                <div className="w-20 bg-muted rounded-full h-2">
                                  <div 
                                    className="bg-primary h-2 rounded-full transition-all"
                                    style={{
                                      width: `${Math.min(100, ((company.statistics?.totalMeetings || 0) / Math.max(...allCompanyMeetings.map(c => c.statistics?.totalMeetings || 0))) * 100)}%`
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Företag Ranking (Protokoll)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {allCompanyMeetings
                            .sort((a, b) => (b.statistics?.totalProtocols || 0) - (a.statistics?.totalProtocols || 0))
                            .slice(0, 5)
                            .map((company, index) => (
                              <div key={company.companyId} className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 font-bold text-sm">
                                  {index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{company.companyName}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {company.statistics?.totalProtocols || 0} protokoll
                                  </div>
                                </div>
                                <div className="w-20 bg-muted rounded-full h-2">
                                  <div 
                                    className="bg-green-500 h-2 rounded-full transition-all"
                                    style={{
                                      width: `${Math.min(100, ((company.statistics?.totalProtocols || 0) / Math.max(...allCompanyMeetings.map(c => c.statistics?.totalProtocols || 0))) * 100)}%`
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Användare Ranking (Aktivitet)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {(() => {
                            const userActivity = new Map<string, number>();
                            allCompanyMeetings.forEach(company => {
                              company.meetings?.forEach((meeting: any) => {
                                const count = userActivity.get(meeting.userId) || 0;
                                userActivity.set(meeting.userId, count + 1);
                              });
                            });
                            return Array.from(userActivity.entries())
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 5)
                              .map(([email, count], index) => (
                                <div key={email} className="flex items-center gap-3">
                                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-sm">
                                    {index + 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{email}</div>
                                    <div className="text-xs text-muted-foreground">{count} möten</div>
                                  </div>
                                  <Badge variant="outline">{count}</Badge>
                                </div>
                              ));
                          })()}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Nyckeltal</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center pb-2 border-b">
                            <span className="text-sm text-muted-foreground">Total Aktivitet</span>
                            <span className="font-bold">
                              {allCompanyMeetings.reduce((sum, c) => sum + (c.statistics?.totalMeetings || 0), 0)} möten
                            </span>
                          </div>
                          <div className="flex justify-between items-center pb-2 border-b">
                            <span className="text-sm text-muted-foreground">Protokoll Conversion Rate</span>
                            <span className="font-bold text-green-600 dark:text-green-400">
                              {(() => {
                                const totalMeetings = allCompanyMeetings.reduce((sum, c) => sum + (c.statistics?.totalMeetings || 0), 0);
                                const totalProtocols = allCompanyMeetings.reduce((sum, c) => sum + (c.statistics?.totalProtocols || 0), 0);
                                return totalMeetings > 0 ? ((totalProtocols / totalMeetings) * 100).toFixed(1) : 0;
                              })()}%
                            </span>
                          </div>
                          <div className="flex justify-between items-center pb-2 border-b">
                            <span className="text-sm text-muted-foreground">Snitt Användare/Företag</span>
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                              {allCompanyMeetings.length > 0
                                ? (allCompanyMeetings.reduce((sum, c) => sum + (c.statistics?.uniqueUsers || 0), 0) / allCompanyMeetings.length).toFixed(1)
                                : 0}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pb-2 border-b">
                            <span className="text-sm text-muted-foreground">Mest Aktiva Företaget</span>
                            <span className="font-bold truncate ml-2 max-w-[200px]">
                              {allCompanyMeetings.length > 0
                                ? allCompanyMeetings.sort((a, b) => (b.statistics?.totalMeetings || 0) - (a.statistics?.totalMeetings || 0))[0]?.companyName
                                : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Total Engagemang</span>
                            <Badge className="text-base">
                              {allCompanyMeetings.reduce((sum, c) => sum + (c.statistics?.totalProtocols || 0), 0)} protokoll
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Trial Dialog */}
      <Dialog open={showTrialDialog} onOpenChange={setShowTrialDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedCompany?.trial?.manuallyDisabled ? 'Restore Trial Period' : 'Start Trial Period'}
            </DialogTitle>
            <DialogDescription>
              {selectedCompany?.trial?.manuallyDisabled 
                ? `Restore the trial countdown for ${selectedCompany?.name}. This will re-enable time restrictions.`
                : `Configure a trial period for ${selectedCompany?.name}. Members will have full access during the trial.`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="trialDays">
                {selectedCompany?.trial?.manuallyDisabled 
                  ? 'Trial Duration (days) - Optional'
                  : 'Trial Duration (days)'
                }
              </Label>
              <Input
                id="trialDays"
                type="number"
                min="1"
                max="365"
                value={trialDays}
                onChange={(e) => setTrialDays(parseInt(e.target.value) || 7)}
                placeholder="7"
              />
              <p className="text-sm text-muted-foreground mt-1">
                {selectedCompany?.trial?.manuallyDisabled
                  ? 'Leave empty to restore with previous duration. Or set new duration.'
                  : `The trial will start immediately and last for ${trialDays} days.`
                }
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowTrialDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateTrial}
              disabled={isSubmitting || (!selectedCompany?.trial?.manuallyDisabled && (!trialDays || trialDays < 1))}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {selectedCompany?.trial?.manuallyDisabled ? 'Restore Trial' : 'Start Trial'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Detail Dialog for Members */}
      <UserDetailDialog
        user={selectedMemberDetail}
        open={!!selectedMemberDetail}
        onOpenChange={(open) => !open && setSelectedMemberDetail(null)}
      />
    </div>
  );
}
