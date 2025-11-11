import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { emailCampaignApi, Campaign } from '@/lib/emailCampaignApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Send, Eye, Trash2, FileText, Mail, Sparkles, Users, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmailCampaignForm } from '@/components/EmailCampaignForm';
import { EmailCampaignPreview } from '@/components/EmailCampaignPreview';
import { EmailCampaignLog } from '@/components/EmailCampaignLog';

export default function AdminEmailCampaigns() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; campaignId: string | null }>({
    open: false,
    campaignId: null,
  });
  const [sendDialog, setSendDialog] = useState<{ open: boolean; campaign: Campaign | null }>({
    open: false,
    campaign: null,
  });
  const [formDialog, setFormDialog] = useState<{ open: boolean; campaign: Campaign | null }>({
    open: false,
    campaign: null,
  });
  const [previewDialog, setPreviewDialog] = useState<{ open: boolean; campaignId: string | null }>({
    open: false,
    campaignId: null,
  });
  const [logDialog, setLogDialog] = useState<{ open: boolean; campaignId: string | null }>({
    open: false,
    campaignId: null,
  });

  const loadCampaigns = async () => {
    try {
      const data = await emailCampaignApi.listCampaigns();
      setCampaigns(data);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
      toast.error('Kunde inte ladda kampanjer');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const handleDelete = async () => {
    if (!deleteDialog.campaignId) return;

    try {
      await emailCampaignApi.deleteCampaign(deleteDialog.campaignId);
      toast.success('Kampanj raderad');
      loadCampaigns();
    } catch (error) {
      console.error('Failed to delete campaign:', error);
      toast.error('Kunde inte radera kampanj');
    } finally {
      setDeleteDialog({ open: false, campaignId: null });
    }
  };

  const handleSend = async () => {
    if (!sendDialog.campaign) return;

    try {
      await emailCampaignApi.sendCampaign(sendDialog.campaign.id);
      toast.success('Kampanj skickas...');
      loadCampaigns();
    } catch (error) {
      console.error('Failed to send campaign:', error);
      toast.error('Kunde inte skicka kampanj');
    } finally {
      setSendDialog({ open: false, campaign: null });
    }
  };

  const getStatusBadge = (status: Campaign['status']) => {
    const variants: Record<Campaign['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      draft: { variant: 'secondary', label: 'Utkast' },
      scheduled: { variant: 'outline', label: 'Schemalagd' },
      sending: { variant: 'default', label: 'Skickar' },
      sent: { variant: 'default', label: 'Skickad' },
      cancelled: { variant: 'secondary', label: 'Avbruten' },
      failed: { variant: 'destructive', label: 'Misslyckades' },
    };

    const config = variants[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTargetTypeLabel = (type: Campaign['targetType'], plan?: string) => {
    const labels: Record<Campaign['targetType'], string> = {
      all: 'Alla användare',
      plan: `Plan: ${plan}`,
      specific: 'Specifika användare',
      verified: 'Verifierade',
      unverified: 'Overifierade',
      active: 'Aktiva',
      inactive: 'Inaktiva',
    };
    return labels[type];
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3">
      </div>
      <main className="flex-1 p-4 md:p-8">
        <div className="space-y-8 max-w-7xl">
          {/* Header Section */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-primary to-purple-600 rounded-xl shadow-lg animate-scale-in">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                      Email-kampanjer
                    </h1>
                    <p className="text-sm md:text-base text-muted-foreground mt-1">Hantera och skicka massutskick till användare</p>
                  </div>
                </div>
              </div>
              <Button 
                onClick={() => setFormDialog({ open: true, campaign: null })}
                size="lg"
                className="w-full md:w-auto bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg hover-scale"
              >
                <Plus className="w-5 h-5" />
                Ny kampanj
              </Button>
            </div>

            {/* Stats Cards */}
            {campaigns.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
                <Card className="border-2 hover:shadow-lg transition-all hover-scale">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      Totalt kampanjer
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                      {campaigns.length}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-2 hover:shadow-lg transition-all hover-scale">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Send className="w-4 h-4 text-green-600" />
                      Skickade
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-green-600">
                      {campaigns.filter(c => c.status === 'sent').length}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-2 hover:shadow-lg transition-all hover-scale">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      Totala mottagare
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                      {campaigns.reduce((sum, c) => sum + c.stats.totalTargets, 0)}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Main Content */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : campaigns.length === 0 ? (
              <Card className="border-2 border-dashed border-primary/20 bg-gradient-to-br from-background to-primary/5 animate-fade-in">
                <CardContent className="flex flex-col items-center justify-center py-16 px-8 text-center">
                  <div className="mb-6 p-6 bg-gradient-to-br from-primary/10 to-purple-600/10 rounded-full animate-scale-in">
                    <Mail className="w-16 h-16 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Inga kampanjer ännu</h3>
                  <p className="text-muted-foreground mb-8 max-w-md">
                    Kom igång med att skapa din första email-kampanj och nå ut till dina användare med professionella, AI-genererade meddelanden.
                  </p>
                  <Button 
                    onClick={() => setFormDialog({ open: true, campaign: null })}
                    size="lg"
                    className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg hover-scale"
                  >
                    <Sparkles className="w-5 h-5" />
                    Skapa första kampanjen
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-2 animate-fade-in overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-primary/5 to-purple-600/5 border-b-2 border-primary/20">
                      <tr>
                        <th className="text-left p-4 font-semibold">Kampanj</th>
                        <th className="text-left p-4 font-semibold">Status</th>
                        <th className="text-left p-4 font-semibold">Målgrupp</th>
                        <th className="text-left p-4 font-semibold">Skapad</th>
                        <th className="text-left p-4 font-semibold">Statistik</th>
                        <th className="text-right p-4 font-semibold">Åtgärder</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((campaign, index) => (
                        <tr 
                          key={campaign.id} 
                          className="border-t hover:bg-primary/5 transition-colors"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <td className="p-4">
                            <div>
                              <div className="font-semibold">{campaign.name}</div>
                              <div className="text-sm text-muted-foreground">{campaign.subject}</div>
                            </div>
                          </td>
                          <td className="p-4">{getStatusBadge(campaign.status)}</td>
                          <td className="p-4 text-sm">{getTargetTypeLabel(campaign.targetType, campaign.targetPlan)}</td>
                          <td className="p-4 text-sm">{format(new Date(campaign.createdAt), 'yyyy-MM-dd HH:mm')}</td>
                          <td className="p-4">
                            {campaign.stats.totalTargets > 0 && (
                              <div className="text-sm">
                                <div className="text-muted-foreground">
                                  {campaign.stats.sent}/{campaign.stats.totalTargets} skickade
                                </div>
                                {campaign.stats.failed > 0 && (
                                  <div className="text-destructive font-medium">{campaign.stats.failed} misslyckade</div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setPreviewDialog({ open: true, campaignId: campaign.id })}
                                className="hover-scale"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {campaign.status === 'sent' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setLogDialog({ open: true, campaignId: campaign.id })}
                                  className="hover-scale"
                                >
                                  <FileText className="w-4 h-4" />
                                </Button>
                              )}
                            {(campaign.status === 'draft' || campaign.status === 'scheduled' || campaign.status === 'sent') && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setFormDialog({ open: true, campaign })}
                                  className="hover-scale"
                                >
                                  Redigera
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 hover-scale"
                                  onClick={() => setSendDialog({ open: true, campaign })}
                                >
                                  <Send className="w-4 h-4" />
                                  {campaign.status === 'sent' ? 'Skicka igen' : 'Skicka'}
                                </Button>
                              </>
                            )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteDialog({ open: true, campaignId: campaign.id })}
                                className="hover-scale text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
        </div>

        <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, campaignId: null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Radera kampanj?</AlertDialogTitle>
              <AlertDialogDescription>
                Detta kommer permanent radera kampanjen och all tillhörande data. Detta kan inte ångras.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Radera</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={sendDialog.open} onOpenChange={(open) => setSendDialog({ open, campaign: null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {sendDialog.campaign?.status === 'sent' ? 'Skicka kampanj igen?' : 'Skicka kampanj?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {sendDialog.campaign?.status === 'sent' 
                  ? 'Detta kommer att skicka emailet igen till alla målmottagare. Mottagare som redan fått mejlet kommer få det igen.'
                  : 'Detta kommer att skicka emailet till alla målmottagare. Kampanjen kan inte redigeras efter att den har skickats.'
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction onClick={handleSend}>
                {sendDialog.campaign?.status === 'sent' ? 'Skicka igen' : 'Skicka'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {formDialog.open && (
          <EmailCampaignForm
            campaign={formDialog.campaign}
            onClose={() => setFormDialog({ open: false, campaign: null })}
            onSuccess={() => {
              setFormDialog({ open: false, campaign: null });
              loadCampaigns();
            }}
          />
        )}

        {previewDialog.open && previewDialog.campaignId && (
          <EmailCampaignPreview
            campaignId={previewDialog.campaignId}
            onClose={() => setPreviewDialog({ open: false, campaignId: null })}
          />
        )}

        {logDialog.open && logDialog.campaignId && (
          <EmailCampaignLog
            campaignId={logDialog.campaignId}
            onClose={() => setLogDialog({ open: false, campaignId: null })}
          />
        )}
      </main>
    </div>
  );
}
