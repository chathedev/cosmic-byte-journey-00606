import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useToast } from "@/hooks/use-toast";
import { agendaApi } from "@/lib/agendaApi";
import { extractTextFromFile } from "@/utils/fileTextExtractor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Trash2, Upload, FileText, Loader2, Lock } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Agenda {
  id: string;
  name: string;
  uploadDate: string;
}

export default function Agendas() {
  const { user } = useAuth();
  const { userPlan, isLoading: planLoading } = useSubscription();
  const { toast } = useToast();
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [agendaName, setAgendaName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showSubscribeDialog, setShowSubscribeDialog] = useState(false);
  const [deleteAgenda, setDeleteAgenda] = useState<{ id: string; name: string } | null>(null);

  // Only free users are locked, Standard+ get full access
  const isLocked = userPlan?.plan === 'free';


  const loadAgendas = async () => {
    if (!user?.email) return;
    
    try {
      setLoading(true);
      const response = await agendaApi.listAgendas(user.email);
      setAgendas(response.agendas);
    } catch (error: any) {
      toast({
        title: "Fel",
        description: error.message || "Kunde inte hämta agendor",
        variant: "destructive",
      });
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
        // Auto-fill name from filename without extension
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setAgendaName(nameWithoutExt);
      }
    }
  };

  const handleUpload = async () => {
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
      
      // Extract text from file
      const textContent = await extractTextFromFile(selectedFile);
      
      // Save to backend
      await agendaApi.saveAgenda({
        name: agendaName.trim(),
        textContent,
      });

      toast({
        title: "Agenda sparad",
        description: "Din agenda har sparats framgångsrikt",
      });

      // Reset form and reload
      setShowUploadDialog(false);
      setAgendaName("");
      setSelectedFile(null);
      loadAgendas();
    } catch (error: any) {
      toast({
        title: "Fel",
        description: error.message || "Kunde inte spara agenda",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (agendaId: string, agendaName: string) => {
    setDeleteAgenda({ id: agendaId, name: agendaName });
  };

  const confirmDelete = async () => {
    if (!deleteAgenda) return;

    try {
      await agendaApi.deleteAgenda(deleteAgenda.id);
      toast({
        title: "Agenda borttagen",
        description: "Agendan har tagits bort",
      });
      loadAgendas();
    } catch (error: any) {
      toast({
        title: "Fel",
        description: error.message || "Kunde inte ta bort agenda",
        variant: "destructive",
      });
    } finally {
      setDeleteAgenda(null);
    }
  };

  return (
    <>
      <header className="h-14 border-b border-border flex items-center px-4 gap-3 bg-card shadow-sm">
        <h1 className="text-lg font-semibold">Mötesagendor</h1>
      </header>

          <main className="flex-1 p-6 md:p-8 animate-fade-in">
            {isLocked ? (
              <div className="max-w-4xl mx-auto">
                <Card className="border-2 border-primary/20">
                  <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                      <Lock className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3">Agendor är låsta</h3>
                    <p className="text-muted-foreground text-center max-w-md mb-6">
                      Uppgradera till Tivly Pro eller Plus för att skapa och hantera mötesagendor som används för att strukturera dina protokoll.
                    </p>
                    <Button onClick={() => setShowSubscribeDialog(true)} size="lg">
                      Uppgradera till Pro
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">Mina agendor</h2>
                    <p className="text-muted-foreground text-sm mb-2">
                      Ladda upp och hantera dina mötesagendor för att skapa strukturerade mötesprotokoll
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Agendorna används som mall när du genererar protokoll från dina mötesinspelningar
                    </p>
                  </div>
                  <Button onClick={() => setShowUploadDialog(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Ny agenda
                  </Button>
                </div>

                {loading ? (
                  <div className="flex justify-center items-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : agendas.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground text-center">
                        Inga agendor ännu. Skapa din första agenda genom att klicka på "Ny agenda".
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {agendas.map((agenda, index) => (
                      <Card 
                        key={agenda.id}
                        className="hover:shadow-lg hover:-translate-y-1 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <CardTitle className="text-lg">{agenda.name}</CardTitle>
                              <CardDescription>
                                Uppladdad {format(new Date(agenda.uploadDate), "d MMMM yyyy 'kl.' HH:mm", { locale: sv })}
                              </CardDescription>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(agenda.id, agenda.name)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ladda upp ny agenda</DialogTitle>
            <DialogDescription>
              Ladda upp en PDF eller Word-fil. Texten kommer automatiskt att extraheras.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="agenda-name">Namn</Label>
              <Input
                id="agenda-name"
                value={agendaName}
                onChange={(e) => setAgendaName(e.target.value)}
                placeholder="T.ex. Styrelsemöte Q1 2024"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agenda-file">Fil</Label>
              <Input
                id="agenda-file"
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
                setShowUploadDialog(false);
                setAgendaName("");
                setSelectedFile(null);
              }}
              disabled={uploading}
            >
              Avbryt
            </Button>
            <Button
              onClick={handleUpload}
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
                  Spara
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubscribeDialog open={showSubscribeDialog} onOpenChange={setShowSubscribeDialog} />
      
      <ConfirmDialog
        open={!!deleteAgenda}
        onOpenChange={(open) => {
          if (!open) setDeleteAgenda(null);
        }}
        title="Ta bort agenda"
        description={`Är du säker på att du vill ta bort "${deleteAgenda?.name}"?`}
        confirmText="Ta bort"
        cancelText="Avbryt"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </>
  );
}
