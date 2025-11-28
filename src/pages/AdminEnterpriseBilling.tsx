import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { ArrowLeft, Building2, Receipt, ExternalLink } from "lucide-react";
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
      toast.error('Failed to load companies');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCompanyId) {
      toast.error('Please select a company');
      return;
    }
    
    const amount = parseFloat(amountSek);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiClient.createEnterpriseCompanyBilling(selectedCompanyId, {
        billingType,
        amountSek: amount,
      });

      toast.success(`${billingType === 'one_time' ? 'Invoice' : 'Subscription'} created successfully!`);
      setResult({
        invoiceUrl: response.invoiceUrl,
        portalUrl: response.portalUrl,
        subscriptionId: response.subscriptionId,
      });
    } catch (error: any) {
      console.error('Failed to create billing:', error);
      toast.error(error.message || 'Failed to create billing');
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
            Back to Enterprise
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Receipt className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Enterprise Billing</h1>
            <p className="text-muted-foreground">Create invoices and subscriptions for enterprise companies</p>
          </div>
        </div>

        {/* Result Display */}
        {result && (
          <Alert className="border-primary/20 bg-primary/5">
            <AlertDescription className="space-y-3">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <Receipt className="h-4 w-4" />
                Billing Created Successfully!
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Invoice URL:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(result.invoiceUrl, '_blank')}
                    className="gap-2"
                  >
                    Open Invoice <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>

                {result.portalUrl && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Billing Portal:</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(result.portalUrl, '_blank')}
                      className="gap-2"
                    >
                      Open Portal <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {result.subscriptionId && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Subscription ID:</span>
                    <code className="text-xs bg-background/50 px-2 py-1 rounded">
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
                Create Another Billing
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Billing Form */}
        {!result && (
          <Card>
            <CardHeader>
              <CardTitle>Create Billing</CardTitle>
              <CardDescription>
                Select a company and configure billing details. The backend will create the necessary Stripe objects automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Company Selection */}
                <div className="space-y-2">
                  <Label htmlFor="company">Company *</Label>
                  <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                    <SelectTrigger id="company">
                      <SelectValue placeholder="Select a company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.companyId} value={company.companyId}>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span>{company.companyName}</span>
                            {company.memberCount !== undefined && (
                              <span className="text-xs text-muted-foreground">
                                ({company.memberCount} members)
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
                  <Label htmlFor="billingType">Billing Type *</Label>
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
                          <div className="font-medium">One-time Invoice</div>
                          <div className="text-xs text-muted-foreground">
                            Creates a single invoice, no recurring charges
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="monthly">
                        <div className="space-y-1">
                          <div className="font-medium">Monthly Subscription</div>
                          <div className="text-xs text-muted-foreground">
                            Recurring monthly charges
                          </div>
                        </div>
                      </SelectItem>
                      <SelectItem value="yearly">
                        <div className="space-y-1">
                          <div className="font-medium">Yearly Subscription</div>
                          <div className="text-xs text-muted-foreground">
                            Recurring yearly charges
                          </div>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (SEK) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="12345.00"
                    value={amountSek}
                    onChange={(e) => setAmountSek(e.target.value)}
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter the amount in Swedish Kronor (SEK)
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
                      <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Receipt className="h-4 w-4 mr-2" />
                      Create {billingType === 'one_time' ? 'Invoice' : 'Subscription'}
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
            <CardTitle className="text-base">How it works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• <strong>One-time:</strong> Creates an invoice for the specified amount, finalizes it, and returns a hosted invoice URL</p>
            <p>• <strong>Monthly/Yearly:</strong> Creates a recurring Stripe subscription with the specified amount and returns both invoice URL and billing portal link</p>
            <p>• The backend automatically creates/updates the Stripe customer for the company</p>
            <p>• All billing records are stored per enterprise workspace</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
