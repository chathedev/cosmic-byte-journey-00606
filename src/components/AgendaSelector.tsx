import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FileText, Trash2 } from "lucide-react";
import { agendaStorage, MeetingAgenda } from "@/utils/agendaStorage";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ConfirmDialog } from "./ConfirmDialog";

interface AgendaSelectorProps {
  selectedAgendaId?: string;
  onSelectAgenda: (agendaId: string | undefined) => void;
}

export const AgendaSelector = ({ selectedAgendaId, onSelectAgenda }: AgendaSelectorProps) => {
  const { user } = useAuth();
  const [agendas, setAgendas] = useState<MeetingAgenda[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [newAgendaName, setNewAgendaName] = useState("");
  const [newAgendaContent, setNewAgendaContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [deleteAgendaId, setDeleteAgendaId] = useState<string | null>(null);

  const loadAgendas = async () => {
    if (!user) return;
    try {
      const data = await agendaStorage.getAgendas(user.uid);
      setAgendas(data);
    } catch (error) {
      console.error('Failed to load agendas:', error);
    }
  };

  useEffect(() => {
    loadAgendas();
  }, [user]);

  const handleCreateAgenda = async () => {
    if (!user || !newAgendaName.trim() || !newAgendaContent.trim()) {
      toast.error("Fyll i namn och innehåll");
      return;
    }

    setIsLoading(true);
    try {
      await agendaStorage.saveAgenda({
        userId: user.uid,
        name: newAgendaName,
        content: newAgendaContent,
      });
      
      toast.success("Agenda skapad!");
      setNewAgendaName("");
      setNewAgendaContent("");
      setShowDialog(false);
      await loadAgendas();
    } catch (error) {
      console.error('Failed to create agenda:', error);
      toast.error("Kunde inte skapa agenda");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAgenda = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteAgendaId(id);
  };

  const confirmDeleteAgenda = async () => {
    if (!deleteAgendaId) return;
    
    try {
      await agendaStorage.deleteAgenda(deleteAgendaId);
      toast.success("Agenda borttagen");
      if (selectedAgendaId === deleteAgendaId) {
        onSelectAgenda(undefined);
      }
      await loadAgendas();
    } catch (error) {
      console.error('Failed to delete agenda:', error);
      toast.error("Kunde inte ta bort agenda");
    } finally {
      setDeleteAgendaId(null);
    }
  };

  return (
    <div className="flex gap-2 w-full">
      <Select value={selectedAgendaId || "none"} onValueChange={(val) => onSelectAgenda(val === "none" ? undefined : val)}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="Välj agenda (valfritt)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Ingen agenda</SelectItem>
          {agendas.map((agenda) => (
            <SelectItem key={agenda.id} value={agenda.id}>
              <div className="flex items-center justify-between w-full">
                <span>{agenda.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 ml-2"
                  onClick={(e) => handleDeleteAgenda(agenda.id, e)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon">
            <Plus className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Skapa ny mötesagenda
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Namn</label>
              <Input
                placeholder="t.ex. HHF Styrelsemöte"
                value={newAgendaName}
                onChange={(e) => setNewAgendaName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Agenda/Kallelse innehåll</label>
              <Textarea
                placeholder="Skriv eller klistra in din mötesagenda här..."
                value={newAgendaContent}
                onChange={(e) => setNewAgendaContent(e.target.value)}
                className="min-h-[200px]"
              />
            </div>
            <Button 
              onClick={handleCreateAgenda} 
              disabled={isLoading || !newAgendaName.trim() || !newAgendaContent.trim()}
              className="w-full"
            >
              Skapa agenda
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteAgendaId}
        onOpenChange={(open) => {
          if (!open) setDeleteAgendaId(null);
        }}
        title="Ta bort agenda"
        description="Vill du verkligen ta bort denna agenda?"
        confirmText="Ta bort"
        cancelText="Avbryt"
        variant="destructive"
        onConfirm={confirmDeleteAgenda}
      />
    </div>
  );
};
