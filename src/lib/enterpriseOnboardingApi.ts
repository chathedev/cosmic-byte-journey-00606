const API_BASE_URL = 'https://api.tivly.se';

export interface OnboardingFormData {
  companyName: string;
  workEmail: string;
  planType: 'enterprise_small' | 'enterprise_standard';
  organizationNumber: string;
  countryCode: 'SE';
  contactName: string;
  contactPhone: string;
  websiteUrl: string;
  expectedSeats: number;
  acceptedTerms: boolean;
  authorizedSignatory: boolean;
}

export interface ValidationResponse {
  success: boolean;
  valid: boolean;
  validation: {
    ok: boolean;
    errors: Record<string, string>;
    normalized?: {
      companyName?: string;
      workEmail?: string;
      workEmailDomain?: string;
      planType?: string;
      organizationNumber?: string;
      organizationNumberDisplay?: string;
      organizationNumberVat?: string;
      countryCode?: string;
      contactName?: string;
      contactPhone?: string;
      websiteUrl?: string;
      websiteDomain?: string;
      expectedSeats?: number;
      acceptedTerms?: boolean;
      authorizedSignatory?: boolean;
      title?: string | null;
      domain?: string;
    };
    checks?: Record<string, boolean>;
    requirements?: {
      commitmentsRequired?: boolean;
    };
    availability?: {
      organizationNumberAvailable?: boolean;
      workEmailAvailable?: boolean;
      existingCompanyByOrganizationNumber?: any;
      existingCompanyByContactEmail?: any;
      existingDraft?: any;
    };
    timestamp?: string;
  };
}

export interface DraftResponse {
  draft: {
    id: string;
    resumeToken: string;
    fields: Record<string, any>;
    rawFields: Record<string, any>;
    progress: {
      step: number;
      percent: number;
    };
  };
  validation: ValidationResponse['validation'];
}

export interface PricingInfo {
  monthlyBaseSek: number;
  monthlyExtraSek: number;
  monthlyTotalSek: number;
  activationFeeSek: number;
  includedSeats: number;
  extraSeats: number;
  perExtraSeatSek: number;
}

export interface StartResponse {
  accountSetupRequired: boolean;
  invitation: {
    email: string;
    sent: boolean;
  };
  draftLink?: {
    linked: boolean;
    reason?: string;
  };
  nextStep: string;
  company: {
    id: string;
    [key: string]: any;
  };
  pricing: PricingInfo;
  billing?: {
    setupEndpoint?: string;
  };
}

export interface OnboardingStatusResponse {
  status: string;
  trialEndsAt: string;
  trialExpired: boolean;
  canActivate: boolean;
  canSetupBilling: boolean;
  organizationNumber: string;
  organizationNumberVat: string;
  countryCode: string;
  pricing: PricingInfo;
  billingSetup: {
    configured: boolean;
    customerId?: string;
    subscriptionId?: string;
    subscriptionStatus?: string;
    setupIntentId?: string;
    setupIntentStatus?: string;
    paymentMethodSaved: boolean;
    requiresPaymentMethod: boolean;
    autoChargeReady: boolean;
  };
}

export interface SubscribeResponse {
  subscriptionId: string;
  subscriptionStatus: string;
  setupIntentId: string;
  setupIntentClientSecret: string;
  setupIntentStatus: string;
  paymentMethodSaved: boolean;
  requiresPaymentMethod: boolean;
  autoChargeReady: boolean;
  pricing: PricingInfo;
  trialEndsAt: string;
}

export interface ActivateResponse {
  paymentIntentClientSecret: string;
  paymentIntentId: string;
  paymentIntentStatus: string;
  pricing: PricingInfo;
  invoiceId: string;
  subscriptionId: string;
}

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { status: res.status, ...body };
  }
  return res.json();
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// 1) Validate
export async function validateOnboarding(
  data: Partial<OnboardingFormData> & { requireCommitments?: boolean }
): Promise<ValidationResponse> {
  return apiFetch('/enterprise/onboarding/validate', {
    method: 'POST',
    body: JSON.stringify({ ...data, countryCode: 'SE' }),
  });
}

// 2) Save draft
export async function saveDraft(
  data: Partial<OnboardingFormData> & {
    draftId?: string;
    resumeToken?: string;
    progressStep?: number;
    progressPercent?: number;
  }
): Promise<DraftResponse> {
  return apiFetch('/enterprise/onboarding/draft', {
    method: 'POST',
    body: JSON.stringify({ ...data, countryCode: 'SE' }),
  });
}

// 3) Get draft
export async function getDraft(draftId: string, resumeToken: string): Promise<DraftResponse> {
  return apiFetch(`/enterprise/onboarding/draft/${draftId}?resumeToken=${encodeURIComponent(resumeToken)}`);
}

// 4) Start trial
export async function startTrial(
  data: OnboardingFormData & { draftId?: string; resumeToken?: string }
): Promise<StartResponse> {
  return apiFetch('/enterprise/onboarding/start', {
    method: 'POST',
    body: JSON.stringify({ ...data, countryCode: 'SE' }),
  });
}

// 5) Onboarding status (authenticated)
export async function getOnboardingStatus(companyId: string): Promise<OnboardingStatusResponse> {
  return apiFetch(`/enterprise/companies/${companyId}/onboarding/status`, {
    headers: authHeaders(),
  });
}

// 6) Live pricing (authenticated)
export async function getOnboardingPricing(companyId: string): Promise<{ pricing: PricingInfo }> {
  return apiFetch(`/enterprise/companies/${companyId}/onboarding/pricing`, {
    headers: authHeaders(),
  });
}

// 7) Subscribe (creates Stripe subscription + SetupIntent)
export async function subscribeOnboarding(companyId: string): Promise<SubscribeResponse> {
  return apiFetch(`/enterprise/companies/${companyId}/onboarding/subscribe`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

// 8) Activate (fallback after trial expiry)
export async function activateOnboarding(companyId: string): Promise<ActivateResponse> {
  return apiFetch(`/enterprise/companies/${companyId}/onboarding/activate`, {
    method: 'POST',
    headers: authHeaders(),
  });
}
