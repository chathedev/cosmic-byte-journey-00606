import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Users, Lock, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { apiClient } from "@/lib/api";
import { useSubscription } from "@/contexts/SubscriptionContext";

interface TeamOption {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
}

interface TeamSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (teamId: string | null) => void;
}

export function TeamSelectDialog({ open, onOpenChange, onSelect }: TeamSelectDialogProps) {
  const { enterpriseMembership } = useSubscription();
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const companyId = enterpriseMembership?.company?.id;

  useEffect(() => {
    if (!open || !companyId) return;

    setIsLoading(true);
    apiClient.getEnterpriseTeams(companyId)
      .then(data => {
        const myTeams = (data.teams || [])
          .filter((t: any) => t.status === 'active' && t.isMember)
          .map((t: any) => ({ id: t.id, name: t.name, description: t.description, memberCount: t.memberCount }));
        setTeams(myTeams);
      })
      .catch(err => console.warn('Failed to load teams:', err))
      .finally(() => setIsLoading(false));
  }, [open, companyId]);

  const handleSelect = (teamId: string | null) => {
    onSelect(teamId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Dela möte
          </DialogTitle>
          <DialogDescription>
            Välj om mötet ska delas med ett team eller vara privat.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {/* Individual option */}
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0 }}
              onClick={() => handleSelect(null)}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-accent/50 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">Individuellt möte</div>
                <div className="text-xs text-muted-foreground mt-0.5">Bara du kan se detta möte</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </motion.button>

            {teams.length > 0 && (
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dela med team</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {teams.map((team, i) => (
              <motion.button
                key={team.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (i + 1) * 0.05 }}
                onClick={() => handleSelect(team.id)}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-accent/50 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{team.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {team.description && (
                      <span className="text-xs text-muted-foreground truncate">{team.description}</span>
                    )}
                    {team.memberCount != null && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                        {team.memberCount} medlemmar
                      </Badge>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </motion.button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
