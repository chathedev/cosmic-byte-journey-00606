import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ExternalLink, RefreshCw, Send, Trash2, MoreVertical, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import BillingSuccessDialog from "@/components/BillingSuccessDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BillingRecord {
  id: string;
  billingType: 'one_time' | 'monthly' | 'yearly';
  amountSek: number;
  oneTimeAmountSek?: number;
  status: string;
  invoiceUrl: string;
  invoiceId?: string;
  portalUrl?: string;
  subscriptionId?: string;
  createdAt: string;
  createdBy?: string;
}

interface CompanyBillingSectionProps {
  companyId: string;
  companyName: string;
  contactEmail?: string;
}

export function CompanyBillingSection({ companyId, companyName, contactEmail }: CompanyBillingSectionProps) {
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [lineItems, setLineItems] = useState<Array<{ 
    description: string; 
    amount: string; 
    type: 'one_time' | 'recurring' 
  }>>([
    { description: '', amount: '', type: 'one_time' }
  ]);

  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successDialogData, setSuccessDialogData] = useState<{
    billingType: 'one_time' | 'monthly' | 'yearly';
    amountSek: number;
    oneTimeAmountSek?: number;
    invoiceUrl: string;
    portalUrl?: string;
    companyName: string;
  } | null>(null);

  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);

  // Real-time polling ref
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Load billing history
  const loadBillingHistory = useCallback(async (showLoader = true) => {
    if (!companyId) return;
    
    if (showLoader) setLoadingHistory(true);
    try {
      const data = await apiClient.getEnterpriseCompanyBillingHistory(companyId);
      setBillingHistory(data.billingHistory || []);
    } catch (error: any) {
      console.error('Failed to load billing history:', error);
      if (showLoader && error.message && !error.message.includes('404') && !error.message.includes('not found')) {
        toast.error('Kunde inte ladda faktureringshistorik');
      }
    } finally {
      if (showLoader) setLoadingHistory(false);
    }
  }, [companyId]);

  // Start polling for real-time updates
  useEffect(() => {
    if (!companyId) return;

    // Initial load
    loadBillingHistory(true);

    // Start polling every 3 seconds
    isPollingRef.current = true;
    pollingRef.current = setInterval(() => {
      if (isPollingRef.current) {
        loadBillingHistory(false); // Silent refresh
      }
    }, 3000);

    return () => {
      isPollingRef.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [companyId, loadBillingHistory]);

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', amount: '', type: 'one_time' }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: 'description' | 'amount' | 'type', value: string) => {
    const updated = [...lineItems];
    updated[index][field as keyof typeof updated[0]] = value as any;
    setLineItems(updated);
  };

  const getOneTimeTotal = () => {
    return lineItems.reduce((sum, item) => {
      if (item.type === 'one_time') {
        return sum + (parseFloat(item.amount) || 0);
      }
      return sum;
    }, 0);
  };

  const getRecurringTotal = () => {
    return lineItems.reduce((sum, item) => {
      if (item.type === 'recurring') {
        return sum + (parseFloat(item.amount) || 0);
      }
      return sum;
    }, 0);
  };

  const hasRecurringItems = () => {
    return lineItems.some(item => item.type === 'recurring' && parseFloat(item.amount) > 0);
  };

  const getTotalAmount = () => {
    return getOneTimeTotal() + getRecurringTotal();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!companyId) {
      toast.error('Inget företag valt');
      return;
    }

    const oneTimeTotal = getOneTimeTotal();
    const recurringTotal = getRecurringTotal();
    
    if (oneTimeTotal <= 0 && recurringTotal <= 0) {
      toast.error('Vänligen ange minst ett belopp');
      return;
    }

    const validItems = lineItems.filter(item => parseFloat(item.amount) > 0);
    if (validItems.length === 0) {
      toast.error('Vänligen ange minst ett belopp');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Skapar fakturering...');
    
    try {
      let billingType: 'one_time' | 'monthly' | 'yearly';
      let requestData: any;

      if (recurringTotal > 0) {
        billingType = recurringInterval;
        requestData = {
          billingType,
          amountSek: recurringTotal,
        };
        
        if (oneTimeTotal > 0) {
          requestData.oneTimeAmountSek = oneTimeTotal;
          requestData.combineOneTime = true;
        }
      } else {
        billingType = 'one_time';
        requestData = {
          billingType,
          amountSek: oneTimeTotal,
        };
      }

      const response = await apiClient.createEnterpriseCompanyBilling(companyId, requestData);
      
      toast.success('Fakturering skapad', { id: toastId });
      
      await loadBillingHistory(false);
      
      setSuccessDialogData({
        billingType,
        amountSek: recurringTotal > 0 ? recurringTotal : oneTimeTotal,
        oneTimeAmountSek: recurringTotal > 0 && oneTimeTotal > 0 ? oneTimeTotal : undefined,
        invoiceUrl: response.invoiceUrl,
        portalUrl: response.portalUrl,
        companyName: companyName,
      });
      setSuccessDialogOpen(true);
      
      setLineItems([{ description: '', amount: '', type: 'one_time' }]);
      
    } catch (error: any) {
      console.error('Failed to create billing:', error);
      const errorMsg = error.message || 'Kunde inte skapa fakturering';
      toast.error(errorMsg, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getBillingTypeLabel = (type: string) => {
    switch (type) {
      case 'one_time': return 'Engång';
      case 'monthly': return 'Månad';
      case 'yearly': return 'År';
      default: return type;
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'draft': return 'Utkast';
      case 'open': return 'Skickad';
      case 'paid': return 'Betald';
      case 'void': return 'Makulerad';
      case 'uncollectible': return 'Ej inkasserbar';
      case 'active': return 'Aktiv';
      case 'canceled': return 'Avbruten';
      case 'incomplete': return 'Ofullständig';
      case 'incomplete_expired': return 'Utgången';
      case 'past_due': return 'Förfallen';
      case 'trialing': return 'Provperiod';
      case 'unpaid': return 'Obetald';
      default: return status || '—';
    }
  };

  const getStatusVariant = (status?: string): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case 'paid':
      case 'active': return 'default';
      case 'open': return 'secondary';
      case 'draft':
      case 'trialing': return 'outline';
      case 'void':
      case 'canceled':
      case 'incomplete_expired':
      case 'uncollectible': return 'destructive';
      default: return 'outline';
    }
  };

  const handleRefreshInvoice = async (record: BillingRecord) => {
    if (!record.invoiceId || !companyId) {
      toast.error('Inget faktura-ID');
      return;
    }

    const loadingKey = `refresh-${record.id}`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));

    try {
      await apiClient.refreshInvoiceStatus(companyId, record.invoiceId);
      toast.success('Status uppdaterad');
      await loadBillingHistory(false);
    } catch (error: any) {
      console.error('Failed to refresh invoice:', error);
      toast.error(error.message || 'Kunde inte uppdatera status');
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const handleSendInvoice = async (record: BillingRecord) => {
    if (!record.invoiceId || !companyId) {
      toast.error('Inget faktura-ID');
      return;
    }

    const loadingKey = `send-${record.id}`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));

    try {
      await apiClient.sendInvoiceEmail(companyId, record.invoiceId);
      toast.success('Faktura skickad');
      await loadBillingHistory(false);
    } catch (error: any) {
      console.error('Failed to send invoice:', error);
      toast.error(error.message || 'Kunde inte skicka faktura');
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const handleDeleteEntry = async () => {
    if (!deleteEntryId || !companyId) return;

    try {
      await apiClient.deleteInvoiceHistoryEntry(companyId, deleteEntryId);
      toast.success('Historikpost borttagen');
      await loadBillingHistory(false);
    } catch (error: any) {
      console.error('Failed to delete entry:', error);
      toast.error(error.message || 'Kunde inte ta bort post');
    } finally {
      setDeleteDialogOpen(false);
      setDeleteEntryId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Fakturering</CardTitle>
              <CardDescription className="text-xs">
                {contactEmail && <span>{contactEmail} • </span>}
                Auto-uppdateras var 3:e sekund
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadBillingHistory(true)}
            disabled={loadingHistory}
          >
            {loadingHistory ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="history" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="history">
              Historik
              {billingHistory.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">({billingHistory.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="create">Ny Faktura</TabsTrigger>
          </TabsList>

          {/* History Tab */}
          <TabsContent value="history" className="mt-0">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : billingHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Ingen faktureringshistorik
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Datum</TableHead>
                      <TableHead className="text-xs">Typ</TableHead>
                      <TableHead className="text-xs text-right">Belopp</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingHistory.map((record) => (
                      <TableRow 
                        key={record.id} 
                        className="transition-all duration-300 ease-in-out"
                      >
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(record.createdAt), 'dd MMM yyyy', { locale: sv })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {getBillingTypeLabel(record.billingType)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium whitespace-nowrap">
                          {record.amountSek.toLocaleString('sv-SE')} kr
                          {record.oneTimeAmountSek && record.oneTimeAmountSek > 0 && (
                            <span className="text-muted-foreground ml-1">
                              (+{record.oneTimeAmountSek.toLocaleString('sv-SE')})
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(record.status)} className="text-[10px]">
                            {getStatusLabel(record.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-background">
                              {record.invoiceUrl && (
                                <DropdownMenuItem asChild>
                                  <a 
                                    href={record.invoiceUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Visa faktura
                                  </a>
                                </DropdownMenuItem>
                              )}
                              {record.portalUrl && (
                                <DropdownMenuItem asChild>
                                  <a 
                                    href={record.portalUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Kundportal
                                  </a>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleRefreshInvoice(record)}
                                disabled={actionLoading[`refresh-${record.id}`]}
                              >
                                {actionLoading[`refresh-${record.id}`] ? (
                                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3 mr-2" />
                                )}
                                Uppdatera status
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleSendInvoice(record)}
                                disabled={actionLoading[`send-${record.id}`]}
                              >
                                {actionLoading[`send-${record.id}`] ? (
                                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                ) : (
                                  <Send className="h-3 w-3 mr-2" />
                                )}
                                Skicka faktura
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => {
                                  setDeleteEntryId(record.id);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-3 w-3 mr-2" />
                                Ta bort
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Create Tab */}
          <TabsContent value="create" className="mt-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Poster</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLineItem}
                    className="h-7 text-xs"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Lägg till
                  </Button>
                </div>

                <div className="space-y-2">
                  {lineItems.map((item, index) => (
                    <div key={index} className="p-2 rounded-lg border space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Beskrivning"
                          value={item.description}
                          onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          className="flex-1 h-8 text-sm"
                        />
                        {lineItems.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLineItem(index)}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            type="number"
                            placeholder="Belopp (SEK)"
                            value={item.amount}
                            onChange={(e) => updateLineItem(index, 'amount', e.target.value)}
                            min="0"
                            step="1"
                            className="h-8 text-sm"
                          />
                        </div>
                        <Select
                          value={item.type}
                          onValueChange={(value) => updateLineItem(index, 'type', value)}
                        >
                          <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-background">
                            <SelectItem value="one_time" className="text-xs">Engång</SelectItem>
                            <SelectItem value="recurring" className="text-xs">Återkommande</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {hasRecurringItems() && (
                <div>
                  <Label className="text-xs">Återkommande intervall</Label>
                  <Select 
                    value={recurringInterval} 
                    onValueChange={(v) => setRecurringInterval(v as any)}
                  >
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="monthly">Månadsvis</SelectItem>
                      <SelectItem value="yearly">Årsvis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                {getOneTimeTotal() > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Engångsbelopp</span>
                    <span className="font-medium">{getOneTimeTotal().toLocaleString('sv-SE')} kr</span>
                  </div>
                )}
                {getRecurringTotal() > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Återkommande ({recurringInterval === 'monthly' ? 'mån' : 'år'})</span>
                    <span className="font-medium">{getRecurringTotal().toLocaleString('sv-SE')} kr</span>
                  </div>
                )}
                <div className="border-t pt-1 flex justify-between text-sm font-semibold">
                  <span>Totalt</span>
                  <span>{getTotalAmount().toLocaleString('sv-SE')} kr</span>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting || getTotalAmount() <= 0}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Skapa Faktura
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort historikpost?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta tar bara bort posten från historiken, inte själva fakturan i Stripe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry}>
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success Dialog */}
      <BillingSuccessDialog
        open={successDialogOpen}
        onOpenChange={setSuccessDialogOpen}
        billingType={successDialogData?.billingType || 'one_time'}
        amountSek={successDialogData?.amountSek || 0}
        oneTimeAmountSek={successDialogData?.oneTimeAmountSek}
        invoiceUrl={successDialogData?.invoiceUrl || ''}
        portalUrl={successDialogData?.portalUrl}
        companyName={successDialogData?.companyName || ''}
      />
    </Card>
  );
}
