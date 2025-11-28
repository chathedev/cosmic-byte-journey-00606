import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { ArrowLeft, Building2, Receipt, ExternalLink, Loader2, History, Plus, Calendar, CreditCard, Trash2, ShoppingCart, Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Separator } from "@/components/ui/separator";

interface Company {
  companyId: string;
  companyName: string;
  description?: string;
  memberCount?: number;
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
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  amountSek: number;
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
  
  // Line items state
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [currentDescription, setCurrentDescription] = useState("");
  const [currentQuantity, setCurrentQuantity] = useState("1");
  const [currentAmount, setCurrentAmount] = useState("");
  
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);

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
      setCompanies(data.companies || []);
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
      // Only show error toast for non-404 errors
      if (error.message && !error.message.includes('404') && !error.message.includes('not found')) {
        toast.error('Kunde inte ladda faktureringshistorik');
      }
      setBillingHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAddLineItem = () => {
    if (!currentDescription.trim()) {
      toast.error('Vänligen ange en beskrivning');
      return;
    }

    const quantity = parseFloat(currentQuantity);
    const amount = parseFloat(currentAmount);

    if (isNaN(quantity) || quantity <= 0) {
      toast.error('Vänligen ange en giltig kvantitet');
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      toast.error('Vänligen ange ett giltigt belopp');
      return;
    }

    const newItem: LineItem = {
      id: crypto.randomUUID(),
      description: currentDescription.trim(),
      quantity,
      amountSek: amount,
    };

    setLineItems([...lineItems, newItem]);
    setCurrentDescription("");
    setCurrentQuantity("1");
    setCurrentAmount("");
    toast.success('Rad tillagd');
  };

  const handleRemoveLineItem = (id: string) => {
    setLineItems(lineItems.filter(item => item.id !== id));
    toast.success('Rad borttagen');
  };

  const getTotalAmount = () => {
    return lineItems.reduce((sum, item) => sum + (item.quantity * item.amountSek), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCompanyId) {
      toast.error('Vänligen välj ett företag');
      return;
    }

    if (lineItems.length === 0) {
      toast.error('Vänligen lägg till minst en rad');
      return;
    }

    const totalAmount = getTotalAmount();

    if (totalAmount <= 0) {
      toast.error('Totalsumman måste vara större än 0');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading(`Skapar ${billingType === 'one_time' ? 'faktura' : 'prenumeration'}...`);
    
    try {
      const response = await apiClient.createEnterpriseCompanyBilling(selectedCompanyId, {
        billingType,
        amountSek: totalAmount,
      });

      toast.success(
        `${billingType === 'one_time' ? 'Faktura' : 'Prenumeration'} skapades! Total: ${totalAmount.toLocaleString('sv-SE')} SEK (${lineItems.length} rad${lineItems.length > 1 ? 'er' : ''})`,
        { id: toastId }
      );
      
      // Refresh history
      await loadBillingHistory(selectedCompanyId);
      
      // Open invoice and portal URLs in new tabs
      if (response.invoiceUrl) {
        window.open(response.invoiceUrl, '_blank', 'noopener,noreferrer');
      }
      if (response.portalUrl && billingType !== 'one_time') {
        // Small delay before opening second window
        setTimeout(() => {
          window.open(response.portalUrl, '_blank', 'noopener,noreferrer');
        }, 500);
      }
      
      // Reset form
      setLineItems([]);
      setCurrentDescription("");
      setCurrentQuantity("1");
      setCurrentAmount("");
      
    } catch (error: any) {
      console.error('Failed to create billing:', error);
      const errorMsg = error.message || 'Kunde inte skapa fakturering';
      toast.error(errorMsg, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCompany = companies.find(c => c.companyId === selectedCompanyId);

  const getBillingTypeLabel = (type: string) => {
    switch (type) {
      case 'one_time': return 'Engångsfaktura';
      case 'monthly': return 'Månadsprenumeration';
      case 'yearly': return 'Årsprenumeration';
      default: return type;
    }
  };

  const getBillingTypeBadgeVariant = (type: string): "default" | "secondary" | "outline" => {
    switch (type) {
      case 'one_time': return 'secondary';
      case 'monthly': return 'default';
      case 'yearly': return 'outline';
      default: return 'secondary';
    }
  };

  const getActiveSubscriptions = () => {
    return billingHistory.filter(record => 
      (record.billingType === 'monthly' || record.billingType === 'yearly') && 
      record.status === 'active'
    );
  };

  const getOneTimeInvoices = () => {
    return billingHistory.filter(record => record.billingType === 'one_time');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gradient-to-r from-primary via-primary/60 to-primary animate-pulse">
          <div className="h-full w-full bg-gradient-to-r from-transparent via-background/20 to-transparent animate-[slide-in-right_1s_ease-in-out_infinite]" />
        </div>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/enterprise')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka till Enterprise
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Receipt className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Enterprise Fakturering</h1>
            <p className="text-muted-foreground">Skapa fakturor och prenumerationer med flera rader</p>
          </div>
        </div>

        {/* Company Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Välj Företag
            </CardTitle>
            <CardDescription>Välj ett företag för att hantera fakturering</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label className="text-foreground font-medium">Företag</Label>
              <Popover open={companySearchOpen} onOpenChange={setCompanySearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={companySearchOpen}
                    className="w-full justify-between bg-background text-foreground border-2 hover:bg-accent hover:text-accent-foreground h-11 font-medium"
                  >
                    <span className="text-foreground">
                      {selectedCompanyId
                        ? companies.find((company) => company.companyId === selectedCompanyId)?.companyName
                        : "Välj ett företag..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover border-2" align="start" sideOffset={8}>
                  <Command className="bg-popover">
                    <CommandInput placeholder="Sök företag..." className="h-11 text-foreground" />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty className="text-foreground py-6">Inget företag hittades.</CommandEmpty>
                      <CommandGroup>
                        {companies.map((company) => (
                          <CommandItem
                            key={company.companyId}
                            value={company.companyName}
                            onSelect={() => {
                              setSelectedCompanyId(company.companyId);
                              setCompanySearchOpen(false);
                            }}
                            className="cursor-pointer hover:bg-accent hover:text-accent-foreground py-3"
                          >
                            <Building2 className="mr-3 h-5 w-5 shrink-0 text-primary" />
                            <span className="flex-1 text-foreground font-medium">{company.companyName}</span>
                            {company.memberCount !== undefined && (
                              <span className="text-xs text-muted-foreground ml-2 font-normal">
                                ({company.memberCount} medlemmar)
                              </span>
                            )}
                            <Check
                              className={cn(
                                "ml-3 h-5 w-5 shrink-0 text-primary",
                                selectedCompanyId === company.companyId ? "opacity-100" : "opacity-0"
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedCompany?.description && (
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedCompany.description}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Content - Only show if company is selected */}
        {selectedCompanyId && (
          <Tabs defaultValue="create" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create" className="gap-2">
                <ShoppingCart className="h-4 w-4" />
                Skapa Fakturering
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <History className="h-4 w-4" />
                Historik
                {billingHistory.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {billingHistory.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Create Billing Tab */}
            <TabsContent value="create" className="space-y-6">
              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Aktiva Prenumerationer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-foreground">
                      {getActiveSubscriptions().length}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Engångsfakturor</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-foreground">
                      {getOneTimeInvoices().length}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Historik</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-foreground">
                      {billingHistory.length}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Active Subscriptions Alert */}
              {getActiveSubscriptions().length > 0 && (
                <Alert className="border-primary/20 bg-primary/5">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-foreground">
                    <strong>Aktiva prenumerationer:</strong> Detta företag har {getActiveSubscriptions().length} aktiv{getActiveSubscriptions().length > 1 ? 'a' : ''} prenumeration{getActiveSubscriptions().length > 1 ? 'er' : ''}. 
                    Du kan fortfarande skapa ytterligare fakturor eller prenumerationer.
                  </AlertDescription>
                </Alert>
              )}

              {/* Billing Form */}
              <Card>
                <CardHeader>
                  <CardTitle>Skapa Fakturering med Flera Rader</CardTitle>
                  <CardDescription>
                    Lägg till produkter/tjänster rad för rad. Totalen beräknas automatiskt.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Billing Type */}
                    <div className="space-y-2">
                      <Label htmlFor="billingType" className="text-foreground">Faktureringstyp *</Label>
                      <Select
                        value={billingType}
                        onValueChange={(value) => setBillingType(value as 'one_time' | 'monthly' | 'yearly')}
                      >
                        <SelectTrigger id="billingType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="one_time">
                            <div className="space-y-1">
                              <div className="font-medium">Engångsfaktura</div>
                              <div className="text-xs text-muted-foreground">
                                Skapar en enskild faktura, inga återkommande avgifter
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="monthly">
                            <div className="space-y-1">
                              <div className="font-medium">Månadsprenumeration</div>
                              <div className="text-xs text-muted-foreground">
                                Återkommande månatliga avgifter
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="yearly">
                            <div className="space-y-1">
                              <div className="font-medium">Årsprenumeration</div>
                              <div className="text-xs text-muted-foreground">
                                Återkommande årliga avgifter
                              </div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    {/* Add Line Item Section */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5" />
                        Lägg till Produkter/Tjänster
                      </h3>

                      <div className="grid gap-4 md:grid-cols-12">
                        <div className="md:col-span-5 space-y-2">
                          <Label htmlFor="description">Beskrivning *</Label>
                          <Input
                            id="description"
                            placeholder="T.ex. Premium Support"
                            value={currentDescription}
                            onChange={(e) => setCurrentDescription(e.target.value)}
                            className="bg-background border-border text-foreground"
                          />
                        </div>

                        <div className="md:col-span-2 space-y-2">
                          <Label htmlFor="quantity">Antal *</Label>
                          <Input
                            id="quantity"
                            type="number"
                            step="1"
                            min="1"
                            placeholder="1"
                            value={currentQuantity}
                            onChange={(e) => setCurrentQuantity(e.target.value)}
                            className="bg-background border-border text-foreground"
                          />
                        </div>

                        <div className="md:col-span-3 space-y-2">
                          <Label htmlFor="lineAmount">Pris (SEK) *</Label>
                          <Input
                            id="lineAmount"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="1000.00"
                            value={currentAmount}
                            onChange={(e) => setCurrentAmount(e.target.value)}
                            className="bg-background border-border text-foreground"
                          />
                        </div>

                        <div className="md:col-span-2 space-y-2">
                          <Label className="invisible">Lägg till</Label>
                          <Button
                            type="button"
                            onClick={handleAddLineItem}
                            variant="outline"
                            className="w-full"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Lägg till
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Line Items Table */}
                    {lineItems.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Fakturarader ({lineItems.length})</h3>
                        
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Beskrivning</TableHead>
                                <TableHead className="text-right">Antal</TableHead>
                                <TableHead className="text-right">Pris</TableHead>
                                <TableHead className="text-right">Totalt</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lineItems.map((item) => (
                                <TableRow key={item.id}>
                                  <TableCell className="font-medium">{item.description}</TableCell>
                                  <TableCell className="text-right">{item.quantity}</TableCell>
                                  <TableCell className="text-right">
                                    {item.amountSek.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SEK
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {(item.quantity * item.amountSek).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SEK
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemoveLineItem(item.id)}
                                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-muted/50">
                                <TableCell colSpan={3} className="text-right font-semibold">
                                  Total:
                                </TableCell>
                                <TableCell className="text-right font-bold text-lg text-primary">
                                  {getTotalAmount().toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SEK
                                </TableCell>
                                <TableCell></TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      disabled={isSubmitting || lineItems.length === 0 || getTotalAmount() <= 0}
                      className="w-full"
                      size="lg"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Skapar {billingType === 'one_time' ? 'faktura' : 'prenumeration'}...
                        </>
                      ) : (
                        <>
                          <Receipt className="h-4 w-4 mr-2" />
                          Skapa {getBillingTypeLabel(billingType)}
                          {lineItems.length > 0 && (
                            <>
                              <span className="ml-2">—</span>
                              <Badge variant="secondary" className="ml-2">
                                {lineItems.length} rad{lineItems.length !== 1 ? 'er' : ''}
                              </Badge>
                              <span className="ml-2 font-bold">
                                {getTotalAmount().toLocaleString('sv-SE')} SEK
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Info Card */}
              <Card className="border-muted">
                <CardHeader>
                  <CardTitle className="text-base text-foreground">Så här fungerar det</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• <strong className="text-foreground">Flera rader:</strong> Lägg till så många produkter/tjänster du vill innan du skapar fakturan</p>
                  <p>• <strong className="text-foreground">Automatisk totalsumma:</strong> Totalen beräknas automatiskt från alla rader (antal × pris)</p>
                  <p>• <strong className="text-foreground">Engångsfaktura:</strong> Skapar en faktura för totalsumman, inga återkommande avgifter</p>
                  <p>• <strong className="text-foreground">Månad/År:</strong> Skapar en återkommande prenumeration med totalsumman</p>
                  <p>• <strong className="text-foreground">Flera faktureringstyper:</strong> Du kan skapa både engångsfakturor och prenumerationer för samma företag</p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-6">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : billingHistory.length === 0 ? (
                <Card>
                  <CardContent className="py-12">
                    <div className="text-center space-y-3">
                      <History className="h-12 w-12 text-muted-foreground mx-auto" />
                      <p className="text-muted-foreground">Ingen faktureringshistorik ännu</p>
                      <p className="text-sm text-muted-foreground">
                        Skapa din första faktura eller prenumeration för att komma igång
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Active Subscriptions */}
                  {getActiveSubscriptions().length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CreditCard className="h-5 w-5" />
                          Aktiva Prenumerationer
                        </CardTitle>
                        <CardDescription>Återkommande fakturering som för närvarande är aktiv</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Typ</TableHead>
                              <TableHead>Belopp</TableHead>
                              <TableHead>Skapad</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Åtgärder</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {getActiveSubscriptions().map((record) => (
                              <TableRow key={record.id}>
                                <TableCell>
                                  <Badge variant={getBillingTypeBadgeVariant(record.billingType)}>
                                    {getBillingTypeLabel(record.billingType)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-medium">
                                  {record.amountSek.toLocaleString('sv-SE')} SEK
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(record.createdAt), 'PPP', { locale: sv })}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="default">Aktiv</Badge>
                                </TableCell>
                                <TableCell className="text-right space-x-2">
                                  {record.invoiceUrl && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => window.open(record.invoiceUrl, '_blank')}
                                    >
                                      <Receipt className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {record.portalUrl && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => window.open(record.portalUrl, '_blank')}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {/* All Billing History */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Fullständig Historik
                      </CardTitle>
                      <CardDescription>All fakturering för detta företag</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Typ</TableHead>
                            <TableHead>Belopp</TableHead>
                            <TableHead>Skapad</TableHead>
                            <TableHead>Skapad Av</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Åtgärder</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {billingHistory.map((record) => (
                            <TableRow key={record.id}>
                              <TableCell>
                                <Badge variant={getBillingTypeBadgeVariant(record.billingType)}>
                                  {getBillingTypeLabel(record.billingType)}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">
                                {record.amountSek.toLocaleString('sv-SE')} SEK
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(record.createdAt), 'PPP', { locale: sv })}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {record.createdBy}
                              </TableCell>
                              <TableCell>
                                <Badge variant={record.status === 'active' ? 'default' : 'secondary'}>
                                  {record.status === 'active' ? 'Aktiv' : record.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right space-x-2">
                                {record.invoiceUrl && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(record.invoiceUrl, '_blank')}
                                    title="Öppna faktura"
                                  >
                                    <Receipt className="h-4 w-4" />
                                  </Button>
                                )}
                                {record.portalUrl && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => window.open(record.portalUrl, '_blank')}
                                    title="Öppna faktureringsportal"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
