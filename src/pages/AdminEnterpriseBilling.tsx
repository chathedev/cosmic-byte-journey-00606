import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { ArrowLeft, Building2, Receipt, ExternalLink, Loader2, History, Plus, Calendar, CreditCard } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

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

export default function AdminEnterpriseBilling() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [billingType, setBillingType] = useState<'one_time' | 'monthly' | 'yearly'>('one_time');
  const [amountSek, setAmountSek] = useState<string>("");
  
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(true);

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
      // Don't show error toast for 404 - just means no history yet
      if (!error.message?.includes('404')) {
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
    
    const amount = parseFloat(amountSek);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Vänligen ange ett giltigt belopp');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiClient.createEnterpriseCompanyBilling(selectedCompanyId, {
        billingType,
        amountSek: amount,
      });

      toast.success(`${billingType === 'one_time' ? 'Faktura' : 'Prenumeration'} skapades!`);
      
      // Show the result and refresh history
      await loadBillingHistory(selectedCompanyId);
      
      // Open invoice in new tab
      if (response.invoiceUrl) {
        window.open(response.invoiceUrl, '_blank');
      }
      
      // Reset form
      setAmountSek("");
      setShowCreateForm(false);
      
    } catch (error: any) {
      console.error('Failed to create billing:', error);
      toast.error(error.message || 'Kunde inte skapa fakturering');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewBilling = () => {
    setShowCreateForm(true);
    setAmountSek("");
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
            <p className="text-muted-foreground">Skapa fakturor och prenumerationer för företag</p>
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
              <Label htmlFor="company" className="text-foreground">Företag</Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger id="company">
                  <SelectValue placeholder="Välj ett företag" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem 
                      key={company.companyId} 
                      value={company.companyId}
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span>{company.companyName}</span>
                        {company.memberCount !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            ({company.memberCount} medlemmar)
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                <Plus className="h-4 w-4" />
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
                  <CardTitle>Skapa Ny Fakturering</CardTitle>
                  <CardDescription>
                    Konfigurera faktureringsuppgifter. Du kan skapa flera fakturor och prenumerationer för samma företag.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
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

                    {/* Amount */}
                    <div className="space-y-2">
                      <Label htmlFor="amount" className="text-foreground">Belopp (SEK) *</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="12345.00"
                        value={amountSek}
                        onChange={(e) => setAmountSek(e.target.value)}
                        required
                        className="bg-background border-border text-foreground"
                      />
                      <p className="text-sm text-muted-foreground">
                        Ange beloppet i svenska kronor (SEK)
                      </p>
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      disabled={isSubmitting || !amountSek}
                      className="w-full"
                      size="lg"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Skapar...
                        </>
                      ) : (
                        <>
                          <Receipt className="h-4 w-4 mr-2" />
                          Skapa {getBillingTypeLabel(billingType)}
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
                  <p>• <strong className="text-foreground">Engångsfaktura:</strong> Skapar en faktura för angivet belopp, slutför den och returnerar en länk till fakturan</p>
                  <p>• <strong className="text-foreground">Månad/År:</strong> Skapar en återkommande Stripe-prenumeration med angivet belopp och returnerar både fakturalänk och länk till faktureringsportal</p>
                  <p>• <strong className="text-foreground">Flera faktureringstyper:</strong> Du kan skapa både engångsfakturor och prenumerationer för samma företag</p>
                  <p>• Backend skapar/uppdaterar automatiskt Stripe-kunden för företaget</p>
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
