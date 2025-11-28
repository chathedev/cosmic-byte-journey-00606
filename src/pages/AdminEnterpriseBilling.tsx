import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { ArrowLeft, Building2, Receipt, ExternalLink, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Company {
  companyId: string;
  companyName: string;
  description?: string;
  memberCount?: number;
}

export default function AdminEnterpriseBilling() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [billingType, setBillingType] = useState<'one_time' | 'monthly' | 'yearly'>('one_time');
  const [amountSek, setAmountSek] = useState<string>("");
  
  const [result, setResult] = useState<{
    invoiceUrl: string;
    portalUrl?: string;
    subscriptionId?: string;
  } | null>(null);

  useEffect(() => {
    loadCompanies();
  }, []);

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
      setResult({
        invoiceUrl: response.invoiceUrl,
        portalUrl: response.portalUrl,
        subscriptionId: response.subscriptionId,
      });
    } catch (error: any) {
      console.error('Failed to create billing:', error);
      toast.error(error.message || 'Kunde inte skapa fakturering');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedCompanyId("");
    setBillingType('one_time');
    setAmountSek("");
    setResult(null);
  };

  const selectedCompany = companies.find(c => c.companyId === selectedCompanyId);

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
      <div className="max-w-4xl mx-auto space-y-6">
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

        {/* Result Display */}
        {result && (
          <Alert className="border-primary/20 bg-primary/5">
            <AlertDescription className="space-y-3">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <Receipt className="h-4 w-4" />
                Fakturering skapad!
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Faktura URL:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(result.invoiceUrl, '_blank')}
                    className="gap-2"
                  >
                    Öppna Faktura <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>

                {result.portalUrl && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Faktureringsportal:</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(result.portalUrl, '_blank')}
                      className="gap-2"
                    >
                      Öppna Portal <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {result.subscriptionId && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Prenumerations-ID:</span>
                    <code className="text-xs bg-background/50 px-2 py-1 rounded text-foreground">
                      {result.subscriptionId}
                    </code>
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="w-full mt-2"
              >
                Skapa Ny Fakturering
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Billing Form */}
        {!result && (
          <Card>
            <CardHeader>
              <CardTitle>Skapa Fakturering</CardTitle>
              <CardDescription>
                Välj ett företag och konfigurera faktureringsuppgifter. Backend skapar nödvändiga Stripe-objekt automatiskt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Company Selection */}
                <div className="space-y-2">
                  <Label htmlFor="company" className="text-foreground">Företag *</Label>
                  <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                    <SelectTrigger id="company" className="bg-background border-border">
                      <SelectValue placeholder="Välj ett företag" className="text-foreground" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border z-50">
                      {companies.map((company) => (
                        <SelectItem 
                          key={company.companyId} 
                          value={company.companyId}
                          className="text-foreground hover:bg-accent focus:bg-accent cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-foreground">{company.companyName}</span>
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
                    <p className="text-sm text-muted-foreground">
                      {selectedCompany.description}
                    </p>
                  )}
                </div>

                {/* Billing Type */}
                <div className="space-y-2">
                  <Label htmlFor="billingType" className="text-foreground">Faktureringstyp *</Label>
                  <Select
                    value={billingType}
                    onValueChange={(value) => setBillingType(value as 'one_time' | 'monthly' | 'yearly')}
                  >
                    <SelectTrigger id="billingType" className="bg-background border-border">
                      <SelectValue className="text-foreground" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border z-50">
                      <SelectItem value="one_time" className="text-foreground hover:bg-accent focus:bg-accent cursor-pointer">
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">Engångsfaktura</div>
                          <div className="text-xs text-muted-foreground">
                            Skapar en enskild faktura, inga återkommande avgifter
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="monthly" className="text-foreground hover:bg-accent focus:bg-accent cursor-pointer">
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">Månadsprenumeration</div>
                          <div className="text-xs text-muted-foreground">
                            Återkommande månatliga avgifter
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="yearly" className="text-foreground hover:bg-accent focus:bg-accent cursor-pointer">
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">Årsprenumeration</div>
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
                  disabled={isSubmitting || !selectedCompanyId || !amountSek}
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
                      Skapa {billingType === 'one_time' ? 'Faktura' : 'Prenumeration'}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card className="border-muted">
          <CardHeader>
            <CardTitle className="text-base text-foreground">Så här fungerar det</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• <strong className="text-foreground">Engångsfaktura:</strong> Skapar en faktura för angivet belopp, slutför den och returnerar en länk till fakturan</p>
            <p>• <strong className="text-foreground">Månad/År:</strong> Skapar en återkommande Stripe-prenumeration med angivet belopp och returnerar både fakturalänk och länk till faktureringsportal</p>
            <p>• Backend skapar/uppdaterar automatiskt Stripe-kunden för företaget</p>
            <p>• Alla faktureringsposter lagras per enterprise workspace</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
