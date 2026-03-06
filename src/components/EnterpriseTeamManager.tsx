import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Trash2, Edit2, Check, X, UserPlus, UserMinus, ChevronDown, Archive, RotateCcw } from 'lucide-react';
import { useScrollToInputHandler } from '@/hooks/useScrollToInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  const { handleFocus: scrollOnFocus } = useScrollToInputHandler();
  const [teams, setTeams] = useState<Team[]>([]);
  const [availableMembers, setAvailableMembers] = useState<string[]>([]);
  const [canManageTeams, setCanManageTeams] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const [addingMemberTeamId, setAddingMemberTeamId] = useState<string | null>(null);
  const [newMemberEmail, setNewMemberEmail] = useState('');

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

  const activeTeams = teams.filter(t => t.status === 'active');
  const archivedTeams = teams.filter(t => t.status === 'archived');
  const displayTeams = showArchived ? teams : activeTeams;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">Team</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeTeams.length} aktiv{activeTeams.length !== 1 ? 'a' : 't'}
              {archivedTeams.length > 0 && !showArchived && (
                <span> · {archivedTeams.length} arkiverad{archivedTeams.length !== 1 ? 'e' : ''}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canManageTeams && archivedTeams.length > 0 && (
            <Button
              size="sm"
              variant={showArchived ? 'secondary' : 'outline'}
              onClick={() => setShowArchived(!showArchived)}
              className="text-xs h-8 gap-1.5"
            >
              <Archive className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Arkiverade</span>
            </Button>
          )}
          {canManageTeams && (
            <Button size="sm" onClick={() => setShowCreateForm(true)} className="h-8 gap-1.5">
              <Plus className="w-4 h-4" />
              <span>Nytt team</span>
            </Button>
          )}
        </div>
      </div>

      {/* Create Form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-3">
              <p className="text-sm font-medium">Skapa nytt team</p>
              <Input
                placeholder="Teamnamn"
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                autoFocus
                onFocus={scrollOnFocus}
              />
              <Input
                placeholder="Beskrivning (valfritt)"
                value={newTeamDescription}
                onChange={e => setNewTeamDescription(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setShowCreateForm(false)}>Avbryt</Button>
                <Button size="sm" onClick={handleCreateTeam} disabled={!newTeamName.trim() || isCreating}>
                  {isCreating ? 'Skapar...' : 'Skapa team'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && displayTeams.length === 0 && (
        <div className="text-center py-12 rounded-xl border border-dashed border-border">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {showArchived ? 'Inga arkiverade team' : 'Inga team ännu'}
          </p>
          {canManageTeams && !showArchived && (
            <p className="text-xs text-muted-foreground/70 mt-1">Skapa ett team för att dela möten inom gruppen</p>
          )}
        </div>
      )}

      {/* Teams List */}
      <div className="space-y-2">
        {displayTeams.map(team => {
          const isExpanded = expandedTeams.has(team.id);
          const isEditing = editingTeamId === team.id;
          const isArchived = team.status === 'archived';

          return (
            <motion.div key={team.id} layout transition={{ duration: 0.15 }}>
              <div className={`rounded-xl border bg-card transition-colors ${isArchived ? 'opacity-50' : ''} ${team.isMember ? 'border-primary/15' : 'border-border'}`}>
                {/* Team Row */}
                <div className="px-4 py-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="h-9 text-sm"
                        placeholder="Teamnamn"
                        autoFocus
                        onFocus={scrollOnFocus}
                      />
                      <Input
                        value={editDescription}
                        onChange={e => setEditDescription(e.target.value)}
                        className="h-9 text-sm"
                        placeholder="Beskrivning (valfritt)"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingTeamId(null)}>
                          Avbryt
                        </Button>
                        <Button size="sm" className="h-7 text-xs" onClick={() => handleUpdateTeam(team.id)}>
                          Spara
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {/* Team Info */}
                      <button
                        onClick={() => toggleExpanded(team.id)}
                        className="flex-1 min-w-0 flex items-center gap-3 text-left group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{team.name}</span>
                            {team.isMember && (
                              <Badge className="text-[10px] h-5 bg-primary/10 text-primary border-primary/20 font-normal">
                                Mitt team
                              </Badge>
                            )}
                            {isArchived && (
                              <Badge variant="outline" className="text-[10px] h-5 font-normal">
                                Arkiverad
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {team.memberCount} {team.memberCount === 1 ? 'medlem' : 'medlemmar'}
                            {team.description && <span className="hidden sm:inline"> · {team.description}</span>}
                          </p>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Actions */}
                      {canManageTeams && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => { setEditingTeamId(team.id); setEditName(team.name); setEditDescription(team.description || ''); }}
                            className="p-1.5 rounded-md hover:bg-muted/40 transition-colors focus-visible:ring-1 focus-visible:ring-ring"
                            title="Redigera"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => handleArchiveTeam(team)}
                            className="p-1.5 rounded-md hover:bg-muted/40 transition-colors focus-visible:ring-1 focus-visible:ring-ring"
                            title={isArchived ? 'Återställ' : 'Arkivera'}
                          >
                            {isArchived
                              ? <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                              : <Archive className="w-3.5 h-3.5 text-muted-foreground" />
                            }
                          </button>
                          <button
                            onClick={() => setDeletingTeam(team)}
                            className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors focus-visible:ring-1 focus-visible:ring-ring"
                            title="Ta bort"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Expanded: Members */}
                <AnimatePresence>
                  {isExpanded && !isEditing && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="border-t border-border px-4 py-3">
                        {team.members.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-1">Inga medlemmar i detta team</p>
                        ) : (
                          <div className="space-y-1">
                            {team.members.map(email => (
                              <div key={email} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-muted/30 text-xs group/member">
                                <span className="truncate text-foreground/80">{email}</span>
                                {canManageTeams && (
                                  <button
                                    onClick={() => handleRemoveMember(team.id, email)}
                                    className="p-1 rounded hover:bg-destructive/10 shrink-0 ml-2 opacity-0 group-hover/member:opacity-100 transition-opacity"
                                    title="Ta bort medlem"
                                  >
                                    <UserMinus className="w-3.5 h-3.5 text-destructive/70" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add member */}
                        {canManageTeams && (
                          <div className="mt-2.5">
                            {addingMemberTeamId === team.id ? (
                              <div className="flex gap-2 items-center">
                                <Input
                                  placeholder="e-post@företag.se"
                                  value={newMemberEmail}
                                  onChange={e => setNewMemberEmail(e.target.value)}
                                  className="h-8 text-xs flex-1"
                                  autoFocus
                                  onFocus={scrollOnFocus}
                                  list={`members-${team.id}`}
                                  onKeyDown={e => e.key === 'Enter' && handleAddMember(team.id)}
                                />
                                <datalist id={`members-${team.id}`}>
                                  {availableMembers
                                    .filter(m => !team.members.includes(m))
                                    .map(m => <option key={m} value={m} />)}
                                </datalist>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleAddMember(team.id)}>
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setAddingMemberTeamId(null); setNewMemberEmail(''); }}>
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setAddingMemberTeamId(team.id)}
                                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors py-1"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                Lägg till medlem
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
