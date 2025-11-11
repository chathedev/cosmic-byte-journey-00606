import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { agendaApi } from "@/lib/agendaApi";
import { extractTextFromFile } from "@/utils/fileTextExtractor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Upload, Loader2 } from "lucide-react";

interface Agenda {
  id: string;
  name: string;
  uploadDate: string;
}

interface AgendaSelectorNewProps {
  selectedAgendaId?: string;
  onSelectAgenda: (agendaId: string | undefined) => void;
}

export function AgendaSelectorNew({ selectedAgendaId, onSelectAgenda }: AgendaSelectorNewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [agendaName, setAgendaName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadAgendas = async () => {
    if (!user?.email) return;
    
    try {
      setLoading(true);
      const response = await agendaApi.listAgendas(user.email);
      setAgendas(response.agendas);
    } catch (error: any) {
      console.error("Failed to load agendas:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgendas();
  }, [user]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!agendaName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setAgendaName(nameWithoutExt);
      }
    }
  };

  const handleCreateAgenda = async () => {
    if (!selectedFile || !agendaName.trim()) {
      toast({
        title: "Fel",
        description: "Vänligen välj en fil och ange ett namn",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploading(true);
      
      const textContent = await extractTextFromFile(selectedFile);
      
      const response = await agendaApi.saveAgenda({
        name: agendaName.trim(),
        textContent,
      });

      toast({
        title: "Agenda skapad",
        description: "Din agenda har sparats",
      });

      setShowDialog(false);
      setAgendaName("");
      setSelectedFile(null);
      await loadAgendas();
      
      // Auto-select the newly created agenda
      onSelectAgenda(response.agenda.id);
    } catch (error: any) {
      toast({
        title: "Fel",
        description: error.message || "Kunde inte skapa agenda",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Mötesagenda (valfritt)</Label>
      <div className="flex gap-2">
        <Select
          value={selectedAgendaId || "none"}
          onValueChange={(value) => onSelectAgenda(value === "none" ? undefined : value)}
          disabled={loading}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={loading ? "Laddar..." : "Välj agenda"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Ingen agenda</SelectItem>
            {agendas.map((agenda) => (
              <SelectItem key={agenda.id} value={agenda.id}>
                {agenda.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setShowDialog(true)}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skapa ny agenda</DialogTitle>
            <DialogDescription>
              Ladda upp en PDF eller Word-fil med din mötesagenda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-agenda-name">Namn</Label>
              <Input
                id="new-agenda-name"
                value={agendaName}
                onChange={(e) => setAgendaName(e.target.value)}
                placeholder="T.ex. Styrelsemöte Q1 2024"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-agenda-file">Fil</Label>
              <Input
                id="new-agenda-file"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileSelect}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Vald fil: {selectedFile.name}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDialog(false);
                setAgendaName("");
                setSelectedFile(null);
              }}
              disabled={uploading}
            >
              Avbryt
            </Button>
            <Button
              onClick={handleCreateAgenda}
              disabled={!selectedFile || !agendaName.trim() || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sparar...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Skapa
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
