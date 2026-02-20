import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, ChevronRight, Check } from "lucide-react";
import { motion } from "framer-motion";

export interface EnterpriseMembershipItem {
  companyId: string;
  companyName: string;
  role: string;
  dataAccessMode?: string;
  joinedAt?: string;
  speakerIdentificationEnabled?: boolean;
}

interface OrgSwitcherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberships: EnterpriseMembershipItem[];
  activeCompanyId?: string;
  onSelect: (companyId: string) => Promise<void>;
}

export function OrgSwitcherDialog({ open, onOpenChange, memberships, activeCompanyId, onSelect }: OrgSwitcherDialogProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleSelect = async (companyId: string) => {
    setLoading(companyId);
    try {
      await onSelect(companyId);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to switch org:", err);
    } finally {
      setLoading(null);
    }
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case "owner": return "Ägare";
      case "admin": return "Admin";
      default: return "Medlem";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Välj organisation
          </DialogTitle>
          <DialogDescription>
            Du tillhör flera organisationer. Välj vilken du vill arbeta i.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {memberships.map((m, i) => {
            const isActive = m.companyId === activeCompanyId;
            const isLoading = loading === m.companyId;

            return (
              <motion.button
                key={m.companyId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => handleSelect(m.companyId)}
                disabled={isLoading}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${
                  isActive
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/40 hover:bg-accent/50"
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {m.companyName}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                      {roleLabel(m.role)}
                    </Badge>
                  </div>
                </div>
                {isActive ? (
                  <Check className="h-5 w-5 text-primary shrink-0" />
                ) : isLoading ? (
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </motion.button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
