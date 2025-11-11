import { useState, useEffect } from 'react';
import { emailCampaignApi, Campaign, CreateCampaignRequest } from '@/lib/emailCampaignApi';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Loader2, Calendar, Clock } from 'lucide-react';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { format, addMinutes } from 'date-fns';

interface EmailCampaignFormProps {
  campaign: Campaign | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EmailCampaignForm({ campaign, onClose, onSuccess }: EmailCampaignFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('Skapa ett e-postutskick på svenska om vår nya funktion för Plus-användare: Automatisk sparning av åtgärdspunkter.\n\nNär du skapar mötesprotokollet med AI sparas nu alla åtgärdspunkter automatiskt - inga extra klick behövs! Du kan se dem direkt i din översikt med deadlines, ansvariga och prioritet. Plus får du smarta förslag för nästa möte.');
  const [hasGenerated, setHasGenerated] = useState(!!campaign);
  const [showPreview, setShowPreview] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [formData, setFormData] = useState<CreateCampaignRequest>({
    name: campaign?.name || '',
    subject: campaign?.subject || '',
    htmlBody: campaign?.htmlBody || '',
    textBody: campaign?.textBody || '',
    targetType: campaign?.targetType || 'all',
    targetPlan: campaign?.targetPlan,
    targetEmails: campaign?.targetEmails,
    scheduledAt: campaign?.scheduledAt,
  });

  // Initialize schedule fields if editing campaign with scheduled time
  useEffect(() => {
    if (campaign?.scheduledAt) {
      const stockholmTime = toZonedTime(new Date(campaign.scheduledAt), 'Europe/Stockholm');
      setScheduleDate(format(stockholmTime, 'yyyy-MM-dd'));
      setScheduleTime(format(stockholmTime, 'HH:mm'));
    }
  }, [campaign]);

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Ange en prompt för att generera email');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-email', {
        body: { prompt: aiPrompt },
      });

      if (error) {
        console.error('AI generation error:', error);
        throw new Error(error.message || 'Kunde inte generera email');
      }

      if (!data) {
        throw new Error('Ingen data mottagen från AI');
      }

      // Update form with AI-generated content
      setFormData({
        ...formData,
        name: formData.name || `Email kampanj - ${new Date().toLocaleDateString('sv-SE')}`,
        subject: data.subject || formData.subject,
        htmlBody: data.htmlBody || formData.htmlBody,
        textBody: data.textBody || formData.textBody,
      });

      setHasGenerated(true);
      setShowPreview(true);
      toast.success('Email genererat med AI!');
    } catch (error) {
      console.error('Failed to generate email:', error);
      toast.error(error instanceof Error ? error.message : 'Kunde inte generera email med AI');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Convert Stockholm time to UTC ISO string if scheduling
      let scheduledAtUTC: string | undefined;
      if (scheduleDate && scheduleTime) {
        const stockholmDateTime = `${scheduleDate}T${scheduleTime}:00`;
        const stockholmDate = new Date(stockholmDateTime);
        
        // Convert Stockholm time to UTC
        scheduledAtUTC = formatInTimeZone(stockholmDate, 'Europe/Stockholm', "yyyy-MM-dd'T'HH:mm:ssXXX");
      }

      const submissionData = {
        ...formData,
        scheduledAt: scheduledAtUTC,
      };

      if (campaign) {
        await emailCampaignApi.updateCampaign(campaign.id, submissionData);
        toast.success('Kampanj uppdaterad');
      } else {
        await emailCampaignApi.createCampaign(submissionData);
        toast.success(scheduledAtUTC ? 'Kampanj schemalagd' : 'Kampanj skapad');
      }
      onSuccess();
    } catch (error) {
      console.error('Failed to save campaign:', error);
      toast.error('Kunde inte spara kampanj');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaign ? 'Redigera kampanj' : 'Ny Email-kampanj med AI'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* AI Prompt - Clean minimalistic design */}
          <div className="space-y-4 p-6 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Skapa email med AI</h3>
            </div>
            
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Beskriv vad ditt email ska handla om...&#10;&#10;Exempel:&#10;• Meddela användare om nya AI-funktioner&#10;• Välkomna nya användare till Tivly&#10;• Informera om systemunderhåll"
              rows={5}
              className="bg-background/80 backdrop-blur-sm border-primary/20 focus:border-primary/40 resize-none"
            />
            
            <Button
              type="button"
              onClick={handleGenerateWithAI}
              disabled={isGenerating || !aiPrompt.trim()}
              className="w-full h-12"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Genererar...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Generera med AI
                </>
              )}
            </Button>
          </div>

          {/* Generated Content - Minimalistic clean design */}
          {hasGenerated && (
            <div className="space-y-8 animate-fade-in">
              {/* Preview/Edit Toggle */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={showPreview ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setShowPreview(true)}
                >
                  Förhandsvisning
                </Button>
                <Button
                  type="button"
                  variant={!showPreview ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setShowPreview(false)}
                >
                  Redigera
                </Button>
              </div>

              {/* Preview Mode - Clean email display */}
              {showPreview && (
                <div className="space-y-4 animate-scale-in">
                  <div className="rounded-xl overflow-hidden border bg-gradient-to-br from-background to-muted/20">
                    <div className="p-6 border-b bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-2">Ämnesrad</p>
                      <p className="text-xl font-semibold">{formData.subject}</p>
                    </div>
                    
                    <div className="p-8 bg-white">
                      <div 
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: formData.htmlBody }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Edit Mode - Streamlined fields */}
              {!showPreview && (
                <div className="space-y-6 animate-fade-in">
                  <div className="grid gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm font-medium">Kampanjnamn</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        className="h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject" className="text-sm font-medium">Email-ämne</Label>
                      <Input
                        id="subject"
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        required
                        className="h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="htmlBody" className="text-sm font-medium">HTML-innehåll</Label>
                      <Textarea
                        id="htmlBody"
                        value={formData.htmlBody}
                        onChange={(e) => setFormData({ ...formData, htmlBody: e.target.value })}
                        rows={10}
                        required
                        className="font-mono text-xs resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="textBody" className="text-sm font-medium">Text-version</Label>
                      <Textarea
                        id="textBody"
                        value={formData.textBody}
                        onChange={(e) => setFormData({ ...formData, textBody: e.target.value })}
                        rows={6}
                        required
                        className="resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Scheduling Settings - Clean design */}
              <div className="space-y-4 p-6 rounded-xl bg-muted/30 border">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-background">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Schemaläggning</h3>
                    <p className="text-xs text-muted-foreground">Valfritt - lämna tomt för direkt utskick</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="scheduleDate" className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Datum (Stockholm)
                    </Label>
                    <Input
                      id="scheduleDate"
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      min={format(new Date(), 'yyyy-MM-dd')}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="scheduleTime" className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Tid (Stockholm)
                    </Label>
                    <Input
                      id="scheduleTime"
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                    />
                  </div>
                </div>

                {scheduleDate && scheduleTime && (
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm">
                    <p className="font-medium text-primary">
                      📅 Schemalagt: {format(new Date(scheduleDate), 'dd MMM yyyy')} kl. {scheduleTime} (Stockholm)
                    </p>
                  </div>
                )}
              </div>

              {/* Target Settings - Clean design */}
              <div className="space-y-4 p-6 rounded-xl bg-muted/30 border">
                <h3 className="font-semibold text-base">Målgrupp</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="targetType">Skicka till</Label>
                  <Select
                    value={formData.targetType}
                    onValueChange={(value: any) =>
                      setFormData({ ...formData, targetType: value, targetPlan: undefined, targetEmails: undefined })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla användare</SelectItem>
                      <SelectItem value="plan">Specifik plan</SelectItem>
                      <SelectItem value="specific">Specifika email-adresser</SelectItem>
                      <SelectItem value="verified">Verifierade användare</SelectItem>
                      <SelectItem value="unverified">Overifierade användare</SelectItem>
                      <SelectItem value="active">Aktiva användare (senaste 30 dagarna)</SelectItem>
                      <SelectItem value="inactive">Inaktiva användare (30+ dagar)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.targetType === 'plan' && (
                  <div className="space-y-2 animate-fade-in">
                    <Label htmlFor="targetPlan">Plan</Label>
                    <Select
                      value={formData.targetPlan}
                      onValueChange={(value: any) => setFormData({ ...formData, targetPlan: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Välj plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Gratis</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.targetType === 'specific' && (
                  <div className="space-y-2 animate-fade-in">
                    <Label htmlFor="targetEmails">Email-adresser (en per rad)</Label>
                    <Textarea
                      id="targetEmails"
                      value={formData.targetEmails?.join('\n') || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          targetEmails: e.target.value.split('\n').filter((email) => email.trim()),
                        })
                      }
                      rows={5}
                      placeholder="user1@example.com&#10;user2@example.com"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <Button type="button" variant="outline" onClick={onClose} size="lg">
                  Avbryt
                </Button>
                <Button type="submit" disabled={isLoading} size="lg" className="min-w-[160px]">
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Sparar...
                    </>
                  ) : campaign ? 'Uppdatera' : 'Skapa kampanj'}
                </Button>
              </div>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
