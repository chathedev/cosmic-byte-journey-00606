import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { ArrowLeft, Building2, Receipt, ExternalLink, Loader2, Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
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
  oneTimeAmountSek?: number;
  status: string;
  invoiceUrl: string;
  invoiceId?: string;
  portalUrl?: string;
  subscriptionId?: string;
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
  const [billingType, setBillingType] = useState<'one_time' | 'monthly' | 'yearly'>('one_time');
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  
  const [amount, setAmount] = useState("");
  
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
  
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successDialogData, setSuccessDialogData] = useState<{
    billingType: 'one_time' | 'monthly' | 'yearly';
    amountSek: number;
    invoiceUrl: string;
    portalUrl?: string;
    companyName: string;
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

    const amountValue = parseFloat(amount);
    if (!amountValue || amountValue <= 0) {
      toast.error('Vänligen ange ett giltigt belopp');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Skapar fakturering...');
    
    try {
      const response = await apiClient.createEnterpriseCompanyBilling(selectedCompanyId, {
        billingType,
        amountSek: amountValue,
      });
      
      toast.success('Fakturering skapad', { id: toastId });
      
      await loadBillingHistory(selectedCompanyId);
      
      setSuccessDialogData({
        billingType,
        amountSek: amountValue,
        invoiceUrl: response.invoiceUrl,
        portalUrl: response.portalUrl,
        companyName: selectedCompany?.name || selectedCompany?.slug || selectedCompanyId,
      });
      setSuccessDialogOpen(true);
      
      setAmount("");
      
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
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Lägg till betalning</CardTitle>
                  <CardDescription>Skapa en faktura eller prenumeration</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <Label>Typ</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          type="button"
                          variant={billingType === 'one_time' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setBillingType('one_time')}
                        >
                          Engång
                        </Button>
                        <Button
                          type="button"
                          variant={billingType === 'monthly' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setBillingType('monthly')}
                        >
                          Månad
                        </Button>
                        <Button
                          type="button"
                          variant={billingType === 'yearly' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setBillingType('yearly')}
                        >
                          År
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="amount">Belopp (SEK)</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="15000"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                      {billingType !== 'one_time' && (
                        <p className="text-xs text-muted-foreground">
                          Faktureras {billingType === 'monthly' ? 'varje månad' : 'varje år'}
                        </p>
                      )}
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Skapar...
                        </>
                      ) : (
                        'Skapa'
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
                                <Badge variant={getStatusVariant(record.status)}>
                                  {getStatusLabel(record.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {record.invoiceUrl && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => window.open(record.invoiceUrl, '_blank')}
                                      title="Visa faktura"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {record.portalUrl && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => window.open(record.portalUrl, '_blank')}
                                      title="Öppna portal"
                                    >
                                      <Building2 className="h-4 w-4" />
                                    </Button>
                                  )}
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
    </div>
  );
}
