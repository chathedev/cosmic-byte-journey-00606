import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Link2, Unlink, Trash2, Users, Mic, Search, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { backendApi, SpeakerProfile } from '@/lib/backendApi';
import { apiClient } from '@/lib/api';

interface Company {
  id: string;
  name: string;
}

const AdminSpeakerProfiles = () => {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<SpeakerProfile[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Link dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkingProfile, setLinkingProfile] = useState<SpeakerProfile | null>(null);
  const [linkEmail, setLinkEmail] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState<SpeakerProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [profilesData, companiesData] = await Promise.all([
        backendApi.getSpeakerProfiles(selectedCompanyId === 'all' ? undefined : selectedCompanyId),
        apiClient.getEnterpriseCompanies().catch(() => ({ companies: [] })),
      ]);
      setProfiles(profilesData);
      setCompanies(companiesData.companies || []);
    } catch (error) {
      console.error('Failed to fetch speaker profiles:', error);
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta röstprofiler.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCompanyId]);

  const handleLink = async () => {
    if (!linkingProfile || !linkEmail.trim()) return;
    
    setIsLinking(true);
    try {
      await backendApi.linkSpeakerProfile(
        linkingProfile.companyId || '',
        linkingProfile.name,
        linkEmail.trim()
      );
      
      toast({
        title: 'Profil länkad',
        description: `${linkingProfile.name} är nu länkad till ${linkEmail.trim()}`,
      });
      
      setLinkDialogOpen(false);
      setLinkingProfile(null);
      setLinkEmail('');
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Fel',
        description: error.message || 'Kunde inte länka profilen.',
        variant: 'destructive',
      });
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async (profile: SpeakerProfile) => {
    try {
      await backendApi.unlinkSpeakerProfile(profile.companyId || '', profile.name);
      
      toast({
        title: 'Länk borttagen',
        description: `${profile.name} är inte längre länkad.`,
      });
      
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Fel',
        description: error.message || 'Kunde inte ta bort länken.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingProfile) return;
    
    setIsDeleting(true);
    try {
      await backendApi.deleteSpeakerProfile(deletingProfile.companyId || '', deletingProfile.name);
      
      toast({
        title: 'Profil borttagen',
        description: `${deletingProfile.name} har tagits bort.`,
      });
      
      setDeleteDialogOpen(false);
      setDeletingProfile(null);
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Fel',
        description: error.message || 'Kunde inte ta bort profilen.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredProfiles = profiles.filter(profile => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      profile.name.toLowerCase().includes(query) ||
      (profile.linkedEmail?.toLowerCase().includes(query)) ||
      (profile.companyId?.toLowerCase().includes(query))
    );
  });

  const getCompanyName = (companyId?: string) => {
    if (!companyId) return 'Okänt företag';
    const company = companies.find(c => c.id === companyId);
    return company?.name || companyId;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Mic className="w-6 h-6" />
              Röstprofiler
            </h1>
            <p className="text-muted-foreground mt-1">
              Hantera manuellt namngivna röstprofiler för automatisk taligenkänning
            </p>
          </div>
          <Button onClick={fetchData} variant="outline" className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Uppdatera
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex-1">
                <Label htmlFor="search" className="sr-only">Sök</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Sök namn eller e-post..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-full md:w-64">
                <Label htmlFor="company" className="sr-only">Företag</Label>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Alla företag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla företag</SelectItem>
                    {companies.map(company => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profiles Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Profiler ({filteredProfiles.length})
            </CardTitle>
            <CardDescription>
              Röstprofiler som skapats via manuell namngivning i möten
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Mic className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Inga röstprofiler hittades</p>
                <p className="text-sm mt-2">
                  Profiler skapas automatiskt när användare namnger talare i möten
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Namn</TableHead>
                      <TableHead>Företag</TableHead>
                      <TableHead>Länkad e-post</TableHead>
                      <TableHead>Möten</TableHead>
                      <TableHead>Skapad</TableHead>
                      <TableHead className="text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProfiles.map((profile, idx) => (
                      <TableRow key={`${profile.companyId}-${profile.name}-${idx}`}>
                        <TableCell className="font-medium">{profile.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getCompanyName(profile.companyId)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {profile.linkedEmail ? (
                            <div className="flex items-center gap-2">
                              <Link2 className="w-4 h-4 text-green-500" />
                              <span className="text-sm">{profile.linkedEmail}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Ej länkad</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {profile.meetingsCount || 0} möten
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(profile.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {profile.linkedEmail ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUnlink(profile)}
                                className="text-orange-600 hover:text-orange-700"
                              >
                                <Unlink className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setLinkingProfile(profile);
                                  setLinkDialogOpen(true);
                                }}
                                className="text-blue-600 hover:text-blue-700"
                              >
                                <Link2 className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeletingProfile(profile);
                                setDeleteDialogOpen(true);
                              }}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-2">Hur fungerar röstprofiler?</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>När användare namnger "Talare 1/2" i ett möte skapas en röstprofil automatiskt</li>
              <li>Backend sparar röstembeddings och kopplar dem till namnet</li>
              <li>I framtida möten matchar Lyra röster mot dessa profiler automatiskt</li>
              <li>Länka en profil till en e-post för att koppla den till en specifik användare</li>
              <li>Matchningskänslighet: 72% (SIS_NAME_PROFILE_THRESHOLD)</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Länka röstprofil</DialogTitle>
            <DialogDescription>
              Koppla "{linkingProfile?.name}" till en användares e-postadress
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="link-email">E-postadress</Label>
              <Input
                id="link-email"
                type="email"
                placeholder="namn@företag.se"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleLink} disabled={isLinking || !linkEmail.trim()}>
              {isLinking && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Länka
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort röstprofil?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort profilen "{deletingProfile?.name}"?
              Detta kommer att ta bort alla sparade röstembeddings och framtida möten
              kommer inte längre att känna igen denna person automatiskt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminSpeakerProfiles;
