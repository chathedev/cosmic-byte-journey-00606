import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { ArrowLeft, Building2, Receipt, ExternalLink, Loader2, Check, ChevronsUpDown, RefreshCw, Send, Trash2, MoreVertical, XCircle } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
  contactEmail?: string;
  memberCount?: number;
  domains?: string[];
  notes?: string | null;
}

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
  subscriptionStatus?: string;
  cancelAt?: string;
  createdAt: string;
  createdBy?: string;
}

export default function AdminEnterpriseBilling() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [recurringInterval, setRecurringInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  
  const [lineItems, setLineItems] = useState<Array<{ 
    description: string; 
    amount: string; 
    type: 'one_time' | 'recurring' 
  }>>([
    { description: '', amount: '', type: 'one_time' }
  ]);
  
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
  
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
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelRecord, setCancelRecord] = useState<BillingRecord | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(true);

  // Track whether invoice email has been sent (separate from Stripe invoice status)
  const [sentInvoiceIds, setSentInvoiceIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedCompanyId) {
      setSentInvoiceIds(new Set());
      return;
    }

    const sentStorageKey = `enterpriseBillingSent:${selectedCompanyId}`;
    try {
      const raw = localStorage.getItem(sentStorageKey);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      setSentInvoiceIds(new Set(parsed.filter(Boolean)));
    } catch {
      setSentInvoiceIds(new Set());
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      loadBillingHistory(selectedCompanyId);
    }
  }, [selectedCompanyId]);

  const loadCompanies = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.getEnterpriseCompanies();
      const companiesList = data.summaries || data.companies || [];
      setCompanies(companiesList);
    } catch (error: any) {
      console.error('Failed to load companies:', error);
      toast.error('Kunde inte ladda företag');
    } finally {
      setIsLoading(false);
    }
  };

  const loadBillingHistory = async (companyId: string) => {
    setLoadingHistory(true);
    try {
      const data = await apiClient.getEnterpriseCompanyBillingHistory(companyId);
      setBillingHistory(data.billingHistory || []);
    } catch (error: any) {
      console.error('Failed to load billing history:', error);
      if (error.message && !error.message.includes('404') && !error.message.includes('not found')) {
        toast.error('Kunde inte ladda faktureringshistorik');
      }
      setBillingHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

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
    
    if (!selectedCompanyId) {
      toast.error('Vänligen välj ett företag');
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
        // Has recurring items, use monthly/yearly with optional one-time add-on
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
        // Only one-time items
        billingType = 'one_time';
        requestData = {
          billingType,
          amountSek: oneTimeTotal,
        };
      }

      const response = await apiClient.createEnterpriseCompanyBilling(selectedCompanyId, requestData);
      
      toast.success('Fakturering skapad', { id: toastId });
      
      await loadBillingHistory(selectedCompanyId);
      
      setSuccessDialogData({
        billingType,
        amountSek: recurringTotal > 0 ? recurringTotal : oneTimeTotal,
        oneTimeAmountSek: recurringTotal > 0 && oneTimeTotal > 0 ? oneTimeTotal : undefined,
        invoiceUrl: response.invoiceUrl,
        portalUrl: response.portalUrl,
        companyName: selectedCompany?.name || selectedCompany?.slug || selectedCompanyId,
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

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  const getBillingTypeLabel = (type: string) => {
    switch (type) {
      case 'one_time': return 'Engång';
      case 'monthly': return 'Månad';
      case 'yearly': return 'År';
      default: return type;
    }
  };

  const getStatusLabel = (status?: string, record?: BillingRecord) => {
    // Show cancel scheduled status
    if (record?.cancelAt) {
      return 'Avslutas snart';
    }
    switch (status) {
      case 'draft': return 'Utkast';
      case 'open': return 'Väntande';
      case 'sent': return 'Skickad';
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

  const getStatusVariant = (status?: string, record?: BillingRecord): "default" | "secondary" | "outline" | "destructive" => {
    // Cancel scheduled gets warning style
    if (record?.cancelAt) {
      return 'secondary';
    }
    switch (status) {
      case 'paid':
      case 'active': return 'default';
      case 'sent': return 'secondary';
      case 'open':
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
    if (!record.invoiceId || !selectedCompanyId) {
      toast.error('Inget faktura-ID eller företag valt');
      return;
    }

    const loadingKey = `refresh-${record.id}`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));

    try {
      await apiClient.refreshInvoiceStatus(selectedCompanyId, record.invoiceId);
      toast.success('Status uppdaterad');
      await loadBillingHistory(selectedCompanyId);
    } catch (error: any) {
      console.error('Failed to refresh invoice:', error);
      toast.error(error.message || 'Kunde inte uppdatera status');
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const markInvoiceSent = (invoiceId?: string) => {
    if (!selectedCompanyId || !invoiceId) return;

    const sentStorageKey = `enterpriseBillingSent:${selectedCompanyId}`;
    setSentInvoiceIds((prev) => {
      const next = new Set(prev);
      next.add(invoiceId);
      localStorage.setItem(sentStorageKey, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const getDisplayStatus = (record: BillingRecord) => {
    if (record.status === 'open' && record.invoiceId && sentInvoiceIds.has(record.invoiceId)) {
      return 'sent';
    }
    return record.status;
  };

  const handleSendInvoice = async (record: BillingRecord) => {
    if (!record.invoiceId || !selectedCompanyId) {
      toast.error('Inget faktura-ID eller företag valt');
      return;
    }

    const loadingKey = `send-${record.id}`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));

    try {
      await apiClient.sendInvoiceEmail(selectedCompanyId, record.invoiceId);
      markInvoiceSent(record.invoiceId);
      toast.success('Faktura skickad');
      await loadBillingHistory(selectedCompanyId);
    } catch (error: any) {
      console.error('Failed to send invoice:', error);
      toast.error(error.message || 'Kunde inte skicka faktura');
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const handleDeleteEntry = async () => {
    if (!deleteEntryId || !selectedCompanyId) {
      toast.error('Ingen post eller företag valt');
      setDeleteDialogOpen(false);
      setDeleteEntryId(null);
      return;
    }

    try {
      await apiClient.deleteInvoiceHistoryEntry(selectedCompanyId, deleteEntryId);
      toast.success('Historikpost borttagen');
      await loadBillingHistory(selectedCompanyId);
    } catch (error: any) {
      console.error('Failed to delete entry:', error);
      toast.error(error.message || 'Kunde inte ta bort post');
    } finally {
      setDeleteDialogOpen(false);
      setDeleteEntryId(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!cancelRecord?.subscriptionId || !selectedCompanyId) return;

    const loadingKey = `cancel-${cancelRecord.id}`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));

    try {
      await apiClient.cancelEnterpriseSubscription(selectedCompanyId, cancelRecord.subscriptionId, cancelAtPeriodEnd);
      toast.success(cancelAtPeriodEnd ? 'Prenumeration avslutas vid periodens slut' : 'Prenumeration avslutad omedelbart');
      await loadBillingHistory(selectedCompanyId);
    } catch (error: any) {
      console.error('Failed to cancel subscription:', error);
      toast.error(error.message || 'Kunde inte avsluta prenumeration');
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }));
      setCancelDialogOpen(false);
      setCancelRecord(null);
      setCancelAtPeriodEnd(true);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/enterprise')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Enterprise Fakturering</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera fakturor och prenumerationer</p>
        </div>

        {/* Company Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Välj Företag</CardTitle>
          </CardHeader>
          <CardContent>
            <Popover open={companySearchOpen} onOpenChange={setCompanySearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {selectedCompanyId
                    ? companies.find((c) => c.id === selectedCompanyId)?.name || 
                      companies.find((c) => c.id === selectedCompanyId)?.slug || 
                      'Välj företag'
                    : "Välj företag"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Sök företag..." />
                  <CommandList>
                    <CommandEmpty>Inget företag hittades</CommandEmpty>
                    <CommandGroup>
                      {companies.map((company) => (
                        <CommandItem
                          key={company.id}
                          value={company.name || company.slug}
                          onSelect={() => {
                            setSelectedCompanyId(company.id);
                            setCompanySearchOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedCompanyId === company.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {company.name || company.slug}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            {selectedCompany && selectedCompany.contactEmail && (
              <p className="text-sm text-muted-foreground mt-3">
                {selectedCompany.contactEmail}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Main Content */}
        {selectedCompanyId && (
          <Tabs defaultValue="create">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">Skapa</TabsTrigger>
              <TabsTrigger value="history">
                Historik
                {billingHistory.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">({billingHistory.length})</span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Create Tab */}
            <TabsContent value="create" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Lägg till betalning</CardTitle>
                  <CardDescription>Lägg till poster och välj om de är engångsbetalningar eller återkommande</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Poster</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addLineItem}
                        >
                          + Lägg till post
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {lineItems.map((item, index) => (
                          <div key={index} className="p-3 rounded-lg border space-y-2">
                            <div className="flex gap-2">
                              <Input
                                placeholder="Beskrivning (t.ex. Månadsavgift, Setup)"
                                value={item.description}
                                onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                                className="flex-1"
                              />
                              {lineItems.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeLineItem(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Belopp (SEK)"
                                value={item.amount}
                                onChange={(e) => updateLineItem(index, 'amount', e.target.value)}
                                required
                                className="flex-1"
                              />
                              <div className="flex rounded-md border">
                                <Button
                                  type="button"
                                  variant={item.type === 'one_time' ? 'default' : 'ghost'}
                                  size="sm"
                                  onClick={() => updateLineItem(index, 'type', 'one_time')}
                                  className="rounded-r-none border-r"
                                >
                                  Engång
                                </Button>
                                <Button
                                  type="button"
                                  variant={item.type === 'recurring' ? 'default' : 'ghost'}
                                  size="sm"
                                  onClick={() => updateLineItem(index, 'type', 'recurring')}
                                  className="rounded-l-none"
                                >
                                  Återkommande
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {hasRecurringItems() && (
                      <div className="space-y-2">
                        <Label>Återkommande intervall</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant={recurringInterval === 'monthly' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setRecurringInterval('monthly')}
                          >
                            Per månad
                          </Button>
                          <Button
                            type="button"
                            variant={recurringInterval === 'yearly' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setRecurringInterval('yearly')}
                          >
                            Per år
                          </Button>
                        </div>
                      </div>
                    )}

                    {getTotalAmount() > 0 && (
                      <div className="p-4 rounded-lg border bg-muted/30 space-y-2">
                        {getOneTimeTotal() > 0 && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">Engångsbelopp</span>
                            <span className="font-medium">{getOneTimeTotal().toLocaleString('sv-SE')} kr</span>
                          </div>
                        )}
                        {getRecurringTotal() > 0 && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">
                              Återkommande ({recurringInterval === 'monthly' ? 'månad' : 'år'})
                            </span>
                            <span className="font-medium">{getRecurringTotal().toLocaleString('sv-SE')} kr</span>
                          </div>
                        )}
                        {getOneTimeTotal() > 0 && getRecurringTotal() > 0 && (
                          <>
                            <div className="border-t pt-2">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium">Första fakturan</span>
                                <span className="text-lg font-semibold">
                                  {getTotalAmount().toLocaleString('sv-SE')} kr
                                </span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={isSubmitting || getTotalAmount() <= 0}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Skapar...
                        </>
                      ) : (
                        'Skapa fakturering'
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-6 mt-6">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : billingHistory.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-8 text-muted-foreground">
                      <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>Ingen faktureringshistorik</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-medium">Fakturor & Prenumerationer</CardTitle>
                    <CardDescription>{billingHistory.length} poster</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Skapad</TableHead>
                            <TableHead>Typ</TableHead>
                            <TableHead className="text-right">Belopp</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Länkar</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {billingHistory.map((record) => (
                            <TableRow key={record.id}>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(record.createdAt), 'PP', { locale: sv })}
                              </TableCell>
                              <TableCell>
                                <span className="text-sm">
                                  {getBillingTypeLabel(record.billingType)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {record.amountSek.toLocaleString('sv-SE')} kr
                                {record.oneTimeAmountSek && record.oneTimeAmountSek > 0 && (
                                  <span className="block text-xs text-muted-foreground">
                                    +{record.oneTimeAmountSek.toLocaleString('sv-SE')} kr engång
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={getStatusVariant(getDisplayStatus(record), record)}>
                                  {getStatusLabel(getDisplayStatus(record), record)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {record.invoiceUrl && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => window.open(record.invoiceUrl, '_blank')}
                                      title="Öppna faktura"
                                      className="h-7 px-2 text-xs"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm">
                                        <MoreVertical className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {record.invoiceUrl && (
                                        <DropdownMenuItem
                                          onClick={() => window.open(record.invoiceUrl, '_blank')}
                                        >
                                          <ExternalLink className="mr-2 h-4 w-4" />
                                          Öppna faktura
                                        </DropdownMenuItem>
                                      )}
                                      {record.portalUrl && (
                                        <DropdownMenuItem
                                          onClick={() => window.open(record.portalUrl, '_blank')}
                                        >
                                          <Building2 className="mr-2 h-4 w-4" />
                                          Kundportal
                                        </DropdownMenuItem>
                                      )}
                                      {(record.invoiceUrl || record.portalUrl) && record.invoiceId && (
                                        <DropdownMenuSeparator />
                                      )}
                                      {record.invoiceId && (
                                        <>
                                          <DropdownMenuItem
                                            onClick={() => handleRefreshInvoice(record)}
                                            disabled={actionLoading[`refresh-${record.id}`]}
                                          >
                                            {actionLoading[`refresh-${record.id}`] ? (
                                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                              <RefreshCw className="mr-2 h-4 w-4" />
                                            )}
                                            Uppdatera status
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => handleSendInvoice(record)}
                                            disabled={actionLoading[`send-${record.id}`]}
                                          >
                                            {actionLoading[`send-${record.id}`] ? (
                                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                              <Send className="mr-2 h-4 w-4" />
                                            )}
                                            Skicka faktura
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                        </>
                                      )}
                                      {record.subscriptionId && ['active', 'past_due', 'trialing'].includes(record.subscriptionStatus || record.status) && (
                                        <>
                                          <DropdownMenuItem
                                            onClick={() => {
                                              setCancelRecord(record);
                                              setCancelDialogOpen(true);
                                            }}
                                            disabled={actionLoading[`cancel-${record.id}`]}
                                            className="text-destructive"
                                          >
                                            {actionLoading[`cancel-${record.id}`] ? (
                                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                              <XCircle className="mr-2 h-4 w-4" />
                                            )}
                                            Avsluta prenumeration
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                        </>
                                      )}
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setDeleteEntryId(record.id);
                                          setDeleteDialogOpen(true);
                                        }}
                                        className="text-destructive"
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Ta bort post
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {successDialogData && (
        <BillingSuccessDialog
          open={successDialogOpen}
          onOpenChange={setSuccessDialogOpen}
          {...successDialogData}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort historikpost?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta tar bara bort posten från historiken. Fakturan i Stripe påverkas inte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEntry} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Subscription Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={(open) => {
        setCancelDialogOpen(open);
        if (!open) {
          setCancelRecord(null);
          setCancelAtPeriodEnd(true);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avsluta prenumeration?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Välj hur prenumerationen ska avslutas:</p>
              <div className="flex flex-col gap-2 mt-2">
                <label className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    checked={cancelAtPeriodEnd}
                    onChange={() => setCancelAtPeriodEnd(true)}
                    className="accent-primary"
                  />
                  <div>
                    <div className="font-medium text-sm text-foreground">Vid periodens slut</div>
                    <div className="text-xs text-muted-foreground">Fortsätter fungera till slutet av faktureringsperioden</div>
                  </div>
                </label>
                <label className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-muted/50">
                  <input
                    type="radio"
                    checked={!cancelAtPeriodEnd}
                    onChange={() => setCancelAtPeriodEnd(false)}
                    className="accent-primary"
                  />
                  <div>
                    <div className="font-medium text-sm text-foreground">Omedelbart</div>
                    <div className="text-xs text-muted-foreground">Avslutas direkt, ingen återbetalning</div>
                  </div>
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelSubscription} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Avsluta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
