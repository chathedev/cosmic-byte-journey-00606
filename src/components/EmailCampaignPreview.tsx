import { useState, useEffect } from 'react';
import { emailCampaignApi, PreviewTarget } from '@/lib/emailCampaignApi';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle2, XCircle } from 'lucide-react';

interface EmailCampaignPreviewProps {
  campaignId: string;
  onClose: () => void;
}

export function EmailCampaignPreview({ campaignId, onClose }: EmailCampaignPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [preview, setPreview] = useState<{ count: number; hasMore: boolean; targets: PreviewTarget[] } | null>(null);

  useEffect(() => {
    const loadPreview = async () => {
      try {
        const data = await emailCampaignApi.previewTargets(campaignId);
        setPreview(data);
      } catch (error) {
        console.error('Failed to load preview:', error);
        toast.error('Kunde inte ladda förhandsgranskning');
        onClose();
      } finally {
        setIsLoading(false);
      }
    };

    loadPreview();
  }, [campaignId]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Förhandsgranskning av mottagare</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="font-medium">Totalt antal mottagare</p>
                <p className="text-2xl font-bold">{preview.count}</p>
              </div>
              {preview.hasMore && (
                <Badge variant="secondary">Visar första 100</Badge>
              )}
            </div>

            <div className="space-y-2">
              <p className="font-medium">Mottagare:</p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Email</th>
                      <th className="text-left p-3 font-medium">Plan</th>
                      <th className="text-left p-3 font-medium">Verifierad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.targets.map((target, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-3">{target.email}</td>
                        <td className="p-3">
                          <Badge variant="outline">{target.plan}</Badge>
                        </td>
                        <td className="p-3">
                          {target.isVerified ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-muted-foreground" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
