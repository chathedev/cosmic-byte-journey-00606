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
import { Loader2, Plus, Edit, Trash2, Users, Building2, Mail, ChevronRight, Calendar, FileText, TrendingUp, Receipt, Volume2, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, []);

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

  const handleCreateCompany = async (formData: FormData) => {
    const name = formData.get('name') as string;
    const contactEmail = formData.get('contactEmail') as string;
    const domains = (formData.get('domains') as string).split(',').map(d => d.trim()).filter(Boolean);
    const notes = formData.get('notes') as string;
    const dataAccessMode = formData.get('dataAccessMode') as 'shared' | 'individual';
    const adminFullAccessEnabled = formData.get('adminFullAccessEnabled') === 'true';
    const speakerIdentificationEnabled = formData.get('speakerIdentificationEnabled') === 'true';

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

  const viewCompanyDetails = async (companyId: string) => {
    try {
      const data = await apiClient.getEnterpriseCompany(companyId);
      setSelectedCompany(data.company);
    } catch (error) {
      console.error('Failed to load company details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load company details',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Enterprise Management</h1>
            <p className="text-muted-foreground mt-1">Hantera företag, medlemmar och möten</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate('/admin/enterprise/billing')}
            >
              <Receipt className="h-4 w-4 mr-2" />
              Billing
            </Button>
            <Button 
              variant="outline" 
              onClick={loadAllCompanyMeetings}
              disabled={loadingAllMeetings}
            >
              {loadingAllMeetings && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Calendar className="h-4 w-4 mr-2" />
              Visa Alla Möten
            </Button>
            <Button onClick={() => setShowCreateCompany(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Skapa Företag
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Companies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{summaries.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Companies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                {summaries.filter(c => c.status === 'active').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {summaries.reduce((sum, c) => sum + c.memberCount, 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Companies List or Details */}
        {!selectedCompany ? (
          <Card>
            <CardHeader>
              <CardTitle>Companies</CardTitle>
              <CardDescription>All enterprise companies in the system</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Active Members</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((summary) => (
                    <TableRow key={summary.id}>
                      <TableCell className="font-medium">{summary.name}</TableCell>
                      <TableCell>
                        <Badge variant={summary.status === 'active' ? 'default' : 'secondary'}>
                          {summary.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{summary.memberCount}</TableCell>
                      <TableCell>{summary.activeMemberCount}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewCompanyDetails(summary.id)}
                        >
                          View Details
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Company Details */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">{selectedCompany.name}</CardTitle>
                    <CardDescription className="mt-1">
                      <Badge variant={selectedCompany.status === 'active' ? 'default' : 'secondary'}>
                        {selectedCompany.status}
                      </Badge>
                      <span className="ml-2 text-xs">ID: {selectedCompany.id}</span>
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {selectedCompany.adminFullAccessEnabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadCompanyMeetings(selectedCompany.id)}
                        disabled={loadingMeetings}
                      >
                        {loadingMeetings && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        View All Meetings
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingCompany(selectedCompany);
                        setShowEditCompany(true);
                      }}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeletingCompany(selectedCompany)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Ta bort
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCompany(null)}
                    >
                      Back to List
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Contact Email</Label>
                    <p className="text-sm">{selectedCompany.contactEmail || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Plan Tier</Label>
                    <p className="text-sm">{selectedCompany.planTier}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Domains</Label>
                    <p className="text-sm">{selectedCompany.domains?.join(', ') || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Data Access Mode</Label>
                    <p className="text-sm">
                      <Badge variant={selectedCompany.dataAccessMode === 'shared' ? 'default' : 'secondary'}>
                        {selectedCompany.dataAccessMode || 'shared'}
                      </Badge>
                      {selectedCompany.dataAccessMode === 'individual' && (
                        <span className="text-xs text-muted-foreground ml-2">
                          (Members see only their own data)
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Admin Full Access</Label>
                    <p className="text-sm">
                      <Badge variant={selectedCompany.adminFullAccessEnabled ? 'default' : 'secondary'}>
                        {selectedCompany.adminFullAccessEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Created</Label>
                    <p className="text-sm">{new Date(selectedCompany.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                
                {/* Speaker Identification Section */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4 text-primary" />
                      <Label className="text-sm font-semibold">Talaridentifiering (SIS)</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={selectedCompany.preferences?.speakerIdentificationEnabled ? 'default' : 'secondary'}>
                        {selectedCompany.preferences?.speakerIdentificationEnabled ? 'Aktiverad' : 'Inaktiverad'}
                      </Badge>
                      <Switch
                        checked={selectedCompany.preferences?.speakerIdentificationEnabled ?? false}
                        onCheckedChange={async (checked) => {
                          try {
                            setIsSubmitting(true);
                            await apiClient.updateEnterpriseCompany(selectedCompany.id, {
                              preferences: {
                                ...selectedCompany.preferences,
                                speakerIdentificationEnabled: checked,
                              },
                            });
                            const updated = await apiClient.getEnterpriseCompany(selectedCompany.id);
                            setSelectedCompany(updated.company);
                            toast({
                              title: checked ? 'SIS aktiverad' : 'SIS inaktiverad',
                              description: checked 
                                ? 'Talaridentifiering är nu aktiverad för detta företag' 
                                : 'Talaridentifiering är nu inaktiverad',
                            });
                          } catch (error) {
                            console.error('Failed to toggle SIS:', error);
                            toast({
                              title: 'Fel',
                              description: 'Kunde inte ändra SIS-inställning',
                              variant: 'destructive',
                            });
                          } finally {
                            setIsSubmitting(false);
                          }
                        }}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  {selectedCompany.preferences?.speakerIdentificationEnabled && (
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Medlemmar kan spela in röstprov för att identifieras automatiskt i möten.
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span className="text-muted-foreground">
                            {selectedCompany.members.filter(m => m.sisSample?.status === 'ready').length} verifierade
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {selectedCompany.members.filter(m => !m.sisSample || m.sisSample?.status !== 'ready').length} ej verifierade
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Trial Section */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-semibold">Trial Status</Label>
                    {selectedCompany.trial?.enabled && !selectedCompany.trial?.manuallyDisabled ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDisableTrial}
                        disabled={isSubmitting}
                      >
                        {isSubmitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Remove Trial & Enable Access
                      </Button>
                    ) : selectedCompany.trial?.manuallyDisabled ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResumeTrial}
                        disabled={isSubmitting}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Restore Trial
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTrialDialog(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Start Trial
                      </Button>
                    )}
                  </div>
                  {selectedCompany.trial?.enabled ? (
                    <div className="grid gap-4 md:grid-cols-3 bg-muted/30 p-4 rounded-lg">
                      <div>
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        <p className="text-sm">
                          <Badge variant={
                            selectedCompany.trial.manuallyDisabled ? 'default' :
                            selectedCompany.trial.expired ? 'destructive' : 
                            'default'
                          }>
                            {selectedCompany.trial.manuallyDisabled ? 'Full Access (Trial Removed)' :
                             selectedCompany.trial.expired ? 'Expired' : 
                             'Active Trial'}
                          </Badge>
                        </p>
                      </div>
                      {!selectedCompany.trial.manuallyDisabled && (
                        <>
                          <div>
                            <Label className="text-xs text-muted-foreground">Days Remaining</Label>
                            <p className="text-sm font-semibold">
                              {selectedCompany.trial.daysRemaining !== null 
                                ? `${selectedCompany.trial.daysRemaining} / ${selectedCompany.trial.daysTotal}`
                                : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Ends At</Label>
                            <p className="text-sm">{new Date(selectedCompany.trial.endsAt).toLocaleDateString()}</p>
                          </div>
                        </>
                      )}
                      <div>
                        <Label className="text-xs text-muted-foreground">Started At</Label>
                        <p className="text-sm">{new Date(selectedCompany.trial.startsAt).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Configured By</Label>
                        <p className="text-sm text-xs">{selectedCompany.trial.configuredBy}</p>
                      </div>
                      {selectedCompany.trial.manuallyDisabled && selectedCompany.trial.disabledAt && (
                        <>
                          <div>
                            <Label className="text-xs text-muted-foreground">Access Granted At</Label>
                            <p className="text-sm">{new Date(selectedCompany.trial.disabledAt).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Granted By</Label>
                            <p className="text-sm text-xs">{selectedCompany.trial.disabledBy}</p>
                          </div>
                          <div className="md:col-span-3">
                            <p className="text-sm text-muted-foreground italic">
                              Trial removed - company has full access without time restrictions
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No active trial</p>
                  )}
                </div>
                
                {selectedCompany.notes && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <p className="text-sm text-muted-foreground">{selectedCompany.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Members */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Members</CardTitle>
                    <CardDescription>{selectedCompany.members.length} total members</CardDescription>
                  </div>
                  <Button onClick={() => setShowAddMember(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Member
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
                      {selectedCompany.preferences?.speakerIdentificationEnabled && (
                        <TableHead>SIS</TableHead>
                      )}
                      <TableHead>Tillagd</TableHead>
                      <TableHead className="text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedCompany.members.map((member) => (
                      <TableRow key={member.email}>
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
                            {member.status}
                          </Badge>
                        </TableCell>
                        {selectedCompany.preferences?.speakerIdentificationEnabled && (
                          <TableCell>
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
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                <XCircle className="h-3 w-3 mr-1" />
                                Ej verifierad
                              </Badge>
                            )}
                          </TableCell>
                        )}
                        <TableCell>{new Date(member.addedAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingMember(member);
                              setShowEditMember(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingMember(member)}
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
          </div>
        )}
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
    </div>
  );
}
