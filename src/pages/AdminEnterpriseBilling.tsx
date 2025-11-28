import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { ArrowLeft, Building2, Receipt, ExternalLink, Loader2, Calendar, Check, ChevronsUpDown, AlertCircle } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import BillingSuccessDialog from "@/components/BillingSuccessDialog";

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
  status: string;
  invoiceUrl: string;
  portalUrl?: string;
  subscriptionId?: string;
  createdAt: string;
  createdBy: string;
  invoiceStatus?: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
}

export default function AdminEnterpriseBilling() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [billingType, setBillingType] = useState<'one_time' | 'monthly' | 'yearly'>('monthly');
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  
  const [recurringAmount, setRecurringAmount] = useState("");
  const [oneTimeAmount, setOneTimeAmount] = useState("");
  const [combineOneTime, setCombineOneTime] = useState(true);
  
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
  
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successDialogData, setSuccessDialogData] = useState<{
    billingType: 'one_time' | 'monthly' | 'yearly';
    amountSek: number;
    oneTimeAmountSek?: number;
    invoiceUrl: string;
    portalUrl?: string;
    companyName: string;
    oneTimeInvoiceUrl?: string;
    oneTimeInvoiceId?: string;
  } | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCompanyId) {
      toast.error('Vänligen välj ett företag');
      return;
    }

    const recurring = parseFloat(recurringAmount) || 0;
    const oneTime = parseFloat(oneTimeAmount) || 0;

    if (billingType === 'one_time') {
      if (recurring <= 0) {
        toast.error('Vänligen ange ett belopp');
        return;
      }
      if (oneTime > 0) {
        toast.error('Engångsfakturor kan inte ha en separat engångsavgift');
        return;
      }
    } else {
      if (recurring <= 0) {
        toast.error('Vänligen ange ett återkommande belopp');
        return;
      }
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Skapar fakturering...');
    
    try {
      const requestData: any = {
        billingType,
        amountSek: recurring,
      };

      if ((billingType === 'monthly' || billingType === 'yearly') && oneTime > 0) {
        requestData.oneTimeAmountSek = oneTime;
        requestData.combineOneTime = combineOneTime;
      }

      const response = await apiClient.createEnterpriseCompanyBilling(selectedCompanyId, requestData);
      
      toast.success('Fakturering skapad', { id: toastId });
      
      await loadBillingHistory(selectedCompanyId);
      
      setSuccessDialogData({
        billingType,
        amountSek: recurring,
        oneTimeAmountSek: (billingType === 'monthly' || billingType === 'yearly') && oneTime > 0 ? oneTime : undefined,
        invoiceUrl: response.invoiceUrl,
        portalUrl: response.portalUrl,
        companyName: selectedCompany?.name || selectedCompany?.slug || selectedCompanyId,
        oneTimeInvoiceUrl: response.oneTimeInvoiceUrl,
        oneTimeInvoiceId: response.oneTimeInvoiceId,
      });
      setSuccessDialogOpen(true);
      
      setRecurringAmount("");
      setOneTimeAmount("");
      
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

  const getInvoiceStatusLabel = (status?: string) => {
    switch (status) {
      case 'draft': return 'Utkast';
      case 'open': return 'Skickad';
      case 'paid': return 'Betald';
      case 'void': return 'Annullerad';
      case 'uncollectible': return 'Ej inkasserbar';
      default: return status || 'Okänd';
    }
  };

  const getInvoiceStatusVariant = (status?: string): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case 'paid': return 'default';
      case 'open': return 'secondary';
      case 'draft': return 'outline';
      case 'void':
      case 'uncollectible': return 'destructive';
      default: return 'outline';
    }
  };

  const getActiveSubscriptions = () => {
    return billingHistory.filter(record => 
      (record.billingType === 'monthly' || record.billingType === 'yearly') && 
      record.status === 'active'
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
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
              {getActiveSubscriptions().length > 0 && (
                <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
                  <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="font-medium">Aktiva prenumerationer: {getActiveSubscriptions().length}</p>
                    <p className="text-muted-foreground mt-1">Du kan skapa ytterligare fakturor</p>
                  </div>
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Ny Fakturering</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Billing Type */}
                    <div className="space-y-3">
                      <Label>Typ</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          type="button"
                          variant={billingType === 'one_time' ? 'default' : 'outline'}
                          className="h-auto py-3"
                          onClick={() => setBillingType('one_time')}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <Receipt className="h-4 w-4" />
                            <span className="text-xs">Engång</span>
                          </div>
                        </Button>
                        <Button
                          type="button"
                          variant={billingType === 'monthly' ? 'default' : 'outline'}
                          className="h-auto py-3"
                          onClick={() => setBillingType('monthly')}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span className="text-xs">Månad</span>
                          </div>
                        </Button>
                        <Button
                          type="button"
                          variant={billingType === 'yearly' ? 'default' : 'outline'}
                          className="h-auto py-3"
                          onClick={() => setBillingType('yearly')}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span className="text-xs">År</span>
                          </div>
                        </Button>
                      </div>
                    </div>

                    <Separator />

                    {/* Amounts */}
                    {billingType === 'one_time' ? (
                      <div className="space-y-2">
                        <Label htmlFor="amount">Belopp (SEK)</Label>
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="15000"
                          value={recurringAmount}
                          onChange={(e) => setRecurringAmount(e.target.value)}
                          required
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="recurring">Återkommande belopp (SEK)</Label>
                          <Input
                            id="recurring"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="5000"
                            value={recurringAmount}
                            onChange={(e) => setRecurringAmount(e.target.value)}
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            Faktureras {billingType === 'monthly' ? 'varje månad' : 'varje år'}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="onetime">Engångsavgift (valfritt)</Label>
                          <Input
                            id="onetime"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="15000"
                            value={oneTimeAmount}
                            onChange={(e) => setOneTimeAmount(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            T.ex. setup eller installation
                          </p>
                        </div>

                        {parseFloat(oneTimeAmount || '0') > 0 && (
                          <div className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="space-y-1">
                              <p className="text-sm font-medium">Kombinera på första fakturan</p>
                              <p className="text-xs text-muted-foreground">
                                {combineOneTime 
                                  ? 'En faktura med allt' 
                                  : 'Separata fakturor'}
                              </p>
                            </div>
                            <Switch
                              checked={combineOneTime}
                              onCheckedChange={setCombineOneTime}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Summary */}
                    {parseFloat(recurringAmount || '0') > 0 && (
                      <div className="p-4 rounded-lg border space-y-2">
                        <p className="text-sm font-medium">Sammanfattning</p>
                        {billingType === 'one_time' ? (
                          <p className="text-2xl font-semibold">
                            {parseFloat(recurringAmount).toLocaleString('sv-SE')} SEK
                          </p>
                        ) : (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Återkommande</span>
                              <span className="font-medium">{parseFloat(recurringAmount).toLocaleString('sv-SE')} SEK</span>
                            </div>
                            {parseFloat(oneTimeAmount || '0') > 0 && (
                              <>
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Engång</span>
                                  <span className="font-medium">{parseFloat(oneTimeAmount).toLocaleString('sv-SE')} SEK</span>
                                </div>
                                <Separator />
                                <div className="flex justify-between">
                                  <span className="text-sm font-medium">Första fakturan</span>
                                  <span className="text-lg font-semibold">
                                    {(parseFloat(recurringAmount) + parseFloat(oneTimeAmount)).toLocaleString('sv-SE')} SEK
                                  </span>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={isSubmitting || parseFloat(recurringAmount || '0') <= 0}
                      className="w-full"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
            <TabsContent value="history" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Faktureringshistorik</CardTitle>
                  <CardDescription>
                    {billingHistory.length} {billingHistory.length === 1 ? 'post' : 'poster'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : billingHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Ingen historik ännu
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead>Typ</TableHead>
                          <TableHead>Belopp</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {billingHistory.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="text-sm">
                              {format(new Date(record.createdAt), 'PPP', { locale: sv })}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {getBillingTypeLabel(record.billingType)}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {record.amountSek.toLocaleString('sv-SE')} SEK
                            </TableCell>
                            <TableCell>
                              <Badge variant={getInvoiceStatusVariant(record.invoiceStatus)} className="text-xs">
                                {getInvoiceStatusLabel(record.invoiceStatus)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(record.invoiceUrl, '_blank')}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                                {record.portalUrl && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(record.portalUrl, '_blank')}
                                  >
                                    <Building2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
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
    </div>
  );
}
