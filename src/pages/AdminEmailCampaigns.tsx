import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { emailCampaignApi, Campaign } from '@/lib/emailCampaignApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Send, Eye, Trash2, FileText, Mail, Users } from 'lucide-react';
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Email-kampanjer</h1>
            <p className="text-sm text-muted-foreground mt-1">Hantera och skicka massutskick</p>
          </div>
          <Button onClick={() => setFormDialog({ open: true, campaign: null })}>
            <Plus className="w-4 h-4 mr-2" />
            Ny kampanj
          </Button>
        </div>

        {/* Stats */}
        {campaigns.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-0 bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="text-xs">Kampanjer</span>
                </div>
                <p className="text-2xl font-semibold">{campaigns.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Send className="w-3.5 h-3.5" />
                  <span className="text-xs">Skickade</span>
                </div>
                <p className="text-2xl font-semibold">{campaigns.filter(c => c.status === 'sent').length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-xs">Mottagare</span>
                </div>
                <p className="text-2xl font-semibold">{campaigns.reduce((sum, c) => sum + c.stats.totalTargets, 0)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
          </div>
        ) : campaigns.length === 0 ? (
          <Card className="border-0 bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Mail className="w-10 h-10 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Inga kampanjer ännu</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                Skapa din första email-kampanj för att nå ut till dina användare.
              </p>
              <Button onClick={() => setFormDialog({ open: true, campaign: null })}>
                <Plus className="w-4 h-4 mr-2" />
                Skapa kampanj
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 bg-muted/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border/50">
                  <tr>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Kampanj</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Målgrupp</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Skapad</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Statistik</th>
                    <th className="text-right p-4 text-sm font-medium text-muted-foreground">Åtgärder</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-t border-border/30 hover:bg-muted/50 transition-colors">
                      <td className="p-4">
                        <div className="font-medium">{campaign.name}</div>
                        <div className="text-sm text-muted-foreground">{campaign.subject}</div>
                      </td>
                      <td className="p-4">{getStatusBadge(campaign.status)}</td>
                      <td className="p-4 text-sm">{getTargetTypeLabel(campaign.targetType, campaign.targetPlan)}</td>
                      <td className="p-4 text-sm text-muted-foreground">{format(new Date(campaign.createdAt), 'yyyy-MM-dd HH:mm')}</td>
                      <td className="p-4">
                        {campaign.stats.totalTargets > 0 && (
                          <div className="text-sm text-muted-foreground">
                            {campaign.stats.sent}/{campaign.stats.totalTargets}
                            {campaign.stats.failed > 0 && (
                              <span className="text-destructive ml-2">({campaign.stats.failed} fel)</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Button size="sm" variant="ghost" onClick={() => setPreviewDialog({ open: true, campaignId: campaign.id })}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {campaign.status === 'sent' && (
                            <Button size="sm" variant="ghost" onClick={() => setLogDialog({ open: true, campaignId: campaign.id })}>
                              <FileText className="w-4 h-4" />
                            </Button>
                          )}
                          {(campaign.status === 'draft' || campaign.status === 'scheduled' || campaign.status === 'sent') && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setFormDialog({ open: true, campaign })}>
                                Redigera
                              </Button>
                              <Button size="sm" onClick={() => setSendDialog({ open: true, campaign })}>
                                <Send className="w-4 h-4 mr-1" />
                                {campaign.status === 'sent' ? 'Igen' : 'Skicka'}
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setDeleteDialog({ open: true, campaignId: campaign.id })}>
                            <Trash2 className="w-4 h-4 text-destructive" />
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
      </div>
    </div>
  );
}
