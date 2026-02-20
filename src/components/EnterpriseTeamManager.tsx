import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Trash2, Edit2, Check, X, UserPlus, UserMinus, ChevronDown, ChevronUp, Archive, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Team {
  id: string;
  name: string;
  status: 'active' | 'archived';
  description?: string;
  members: string[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  isMember: boolean;
}

export function EnterpriseTeamManager() {
  const { enterpriseMembership } = useSubscription();
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [availableMembers, setAvailableMembers] = useState<string[]>([]);
  const [canManageTeams, setCanManageTeams] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  // Create team state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit team state
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Expanded teams (for member management)
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // Add member state
  const [addingMemberTeamId, setAddingMemberTeamId] = useState<string | null>(null);
  const [newMemberEmail, setNewMemberEmail] = useState('');

  // Delete confirm
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);

  const companyId = enterpriseMembership?.company?.id;

  const loadTeams = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const data = await apiClient.getEnterpriseTeams(companyId, showArchived);
      setTeams(data.teams || []);
      setAvailableMembers(data.availableMembers || []);
      setCanManageTeams(data.viewer?.canManageTeams || false);
    } catch (error) {
      console.error('Failed to load teams:', error);
      toast({ title: 'Kunde inte ladda team', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [companyId, showArchived, toast]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const handleCreateTeam = async () => {
    if (!companyId || !newTeamName.trim()) return;
    setIsCreating(true);
    try {
      await apiClient.createEnterpriseTeam(companyId, {
        name: newTeamName.trim(),
        description: newTeamDescription.trim() || undefined,
      });
      toast({ title: 'Team skapat!' });
      setNewTeamName('');
      setNewTeamDescription('');
      setShowCreateForm(false);
      await loadTeams();
    } catch (error: any) {
      toast({ title: 'Kunde inte skapa team', description: error.message, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateTeam = async (teamId: string) => {
    if (!companyId) return;
    try {
      await apiClient.updateEnterpriseTeam(companyId, teamId, {
        name: editName.trim() || undefined,
        description: editDescription.trim() || undefined,
      });
      toast({ title: 'Team uppdaterat' });
      setEditingTeamId(null);
      await loadTeams();
    } catch (error: any) {
      toast({ title: 'Kunde inte uppdatera', description: error.message, variant: 'destructive' });
    }
  };

  const handleArchiveTeam = async (team: Team) => {
    if (!companyId) return;
    try {
      await apiClient.updateEnterpriseTeam(companyId, team.id, {
        status: team.status === 'active' ? 'archived' : 'active',
      });
      toast({ title: team.status === 'active' ? 'Team arkiverat' : 'Team återställt' });
      await loadTeams();
    } catch (error: any) {
      toast({ title: 'Misslyckades', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteTeam = async () => {
    if (!companyId || !deletingTeam) return;
    try {
      await apiClient.deleteEnterpriseTeam(companyId, deletingTeam.id);
      toast({ title: 'Team borttaget' });
      setDeletingTeam(null);
      await loadTeams();
    } catch (error: any) {
      toast({ title: 'Kunde inte ta bort', description: error.message, variant: 'destructive' });
    }
  };

  const handleAddMember = async (teamId: string) => {
    if (!companyId || !newMemberEmail.trim()) return;
    try {
      await apiClient.addEnterpriseTeamMember(companyId, teamId, newMemberEmail.trim());
      toast({ title: 'Medlem tillagd' });
      setNewMemberEmail('');
      setAddingMemberTeamId(null);
      await loadTeams();
    } catch (error: any) {
      toast({ title: 'Kunde inte lägga till', description: error.message, variant: 'destructive' });
    }
  };

  const handleRemoveMember = async (teamId: string, email: string) => {
    if (!companyId) return;
    try {
      await apiClient.removeEnterpriseTeamMember(companyId, teamId, email);
      toast({ title: 'Medlem borttagen' });
      await loadTeams();
    } catch (error: any) {
      toast({ title: 'Kunde inte ta bort', description: error.message, variant: 'destructive' });
    }
  };

  const toggleExpanded = (teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  if (!enterpriseMembership?.isMember) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Team</h2>
          <Badge variant="secondary" className="text-xs">{teams.filter(t => t.status === 'active').length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {canManageTeams && (
            <Button
              size="sm"
              variant={showArchived ? 'secondary' : 'ghost'}
              onClick={() => setShowArchived(!showArchived)}
              className="text-xs"
            >
              <Archive className="w-3.5 h-3.5 mr-1" />
              Arkiverade
            </Button>
          )}
          {canManageTeams && (
            <Button size="sm" onClick={() => setShowCreateForm(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Nytt team
            </Button>
          )}
        </div>
      </div>

      {/* Create Form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="border-primary/20">
              <CardContent className="pt-4 space-y-3">
                <Input
                  placeholder="Teamnamn"
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  autoFocus
                />
                <Input
                  placeholder="Beskrivning (valfritt)"
                  value={newTeamDescription}
                  onChange={e => setNewTeamDescription(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(false)}>Avbryt</Button>
                  <Button size="sm" onClick={handleCreateTeam} disabled={!newTeamName.trim() || isCreating}>
                    {isCreating ? 'Skapar...' : 'Skapa'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Teams List */}
      {!isLoading && teams.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Inga team ännu</p>
          {canManageTeams && <p className="text-xs mt-1">Skapa ett team för att dela möten inom gruppen</p>}
        </div>
      )}

      <div className="space-y-3">
        {teams.map(team => {
          const isExpanded = expandedTeams.has(team.id);
          const isEditing = editingTeamId === team.id;
          const isArchived = team.status === 'archived';

          return (
            <motion.div key={team.id} layout>
              <Card className={`transition-colors ${isArchived ? 'opacity-60' : ''} ${team.isMember ? 'border-primary/20' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex gap-2 flex-1">
                          <Input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="h-8 text-sm"
                            autoFocus
                          />
                          <Button size="sm" variant="ghost" onClick={() => handleUpdateTeam(team.id)}>
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingTeamId(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <CardTitle className="text-sm font-medium truncate">{team.name}</CardTitle>
                          {isArchived && <Badge variant="outline" className="text-[10px]">Arkiverad</Badge>}
                          {team.isMember && <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">Mitt team</Badge>}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleExpanded(team.id)} className="p-1 rounded hover:bg-accent">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      {canManageTeams && !isEditing && (
                        <>
                          <button onClick={() => { setEditingTeamId(team.id); setEditName(team.name); setEditDescription(team.description || ''); }} className="p-1 rounded hover:bg-accent">
                            <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          <button onClick={() => handleArchiveTeam(team)} className="p-1 rounded hover:bg-accent">
                            {isArchived ? <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" /> : <Archive className="w-3.5 h-3.5 text-muted-foreground" />}
                          </button>
                          <button onClick={() => setDeletingTeam(team)} className="p-1 rounded hover:bg-destructive/10">
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {team.description && !isEditing && (
                    <p className="text-xs text-muted-foreground mt-1">{team.description}</p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {team.memberCount} {team.memberCount === 1 ? 'medlem' : 'medlemmar'}
                  </div>
                </CardHeader>

                {/* Expanded: Members */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                    >
                      <CardContent className="pt-0 pb-3">
                        <div className="space-y-1.5 mt-2">
                          {team.members.map(email => (
                            <div key={email} className="flex items-center justify-between py-1 px-2 rounded bg-muted/50 text-xs">
                              <span className="truncate">{email}</span>
                              {canManageTeams && (
                                <button onClick={() => handleRemoveMember(team.id, email)} className="p-0.5 rounded hover:bg-destructive/10 shrink-0 ml-2">
                                  <UserMinus className="w-3.5 h-3.5 text-destructive" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Add member */}
                        {canManageTeams && (
                          <div className="mt-3">
                            {addingMemberTeamId === team.id ? (
                              <div className="flex gap-2">
                                <Input
                                  placeholder="e-post@företag.se"
                                  value={newMemberEmail}
                                  onChange={e => setNewMemberEmail(e.target.value)}
                                  className="h-8 text-xs"
                                  autoFocus
                                  list={`members-${team.id}`}
                                />
                                <datalist id={`members-${team.id}`}>
                                  {availableMembers
                                    .filter(m => !team.members.includes(m))
                                    .map(m => <option key={m} value={m} />)}
                                </datalist>
                                <Button size="sm" variant="ghost" className="h-8" onClick={() => handleAddMember(team.id)}>
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAddingMemberTeamId(null); setNewMemberEmail(''); }}>
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="ghost" className="text-xs w-full" onClick={() => setAddingMemberTeamId(team.id)}>
                                <UserPlus className="w-3.5 h-3.5 mr-1" /> Lägg till medlem
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deletingTeam}
        onOpenChange={(open) => !open && setDeletingTeam(null)}
        title="Ta bort team?"
        description={`Vill du verkligen ta bort teamet "${deletingTeam?.name}"? Alla möten kopplade till detta team blir privata.`}
        confirmText="Ta bort"
        onConfirm={handleDeleteTeam}
        variant="destructive"
      />
    </div>
  );
}
