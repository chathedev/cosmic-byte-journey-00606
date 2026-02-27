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

// Response from POST /enterprise/onboarding/subscribe (draft-level, pre-trial)
export interface DraftSubscribeResponse {
  billing: {
    setupIntentId: string;
    setupIntentClientSecret: string;
    setupIntentStatus: string;
    paymentMethodSaved: boolean;
    readyForTrialStart: boolean;
  };
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

// Response from POST /enterprise/companies/:companyId/onboarding/subscribe (post-trial, legacy)
export interface CompanySubscribeResponse {
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

export interface OnboardingAuthOpts {
  setupToken?: string;
  draftId?: string;
  resumeToken?: string;
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

function authHeaders(opts?: OnboardingAuthOpts): Record<string, string> {
  const token = localStorage.getItem('authToken');
  if (token) return { Authorization: `Bearer ${token}` };
  if (opts?.setupToken) return { 'x-onboarding-setup-token': opts.setupToken };
  return {};
}

function buildAuthQuery(opts?: OnboardingAuthOpts): string {
  const token = localStorage.getItem('authToken');
  if (token || opts?.setupToken) return '';
  if (opts?.draftId && opts?.resumeToken) {
    return `?draftId=${encodeURIComponent(opts.draftId)}&resumeToken=${encodeURIComponent(opts.resumeToken)}`;
  }
  return '';
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

// 4) Subscribe (draft-level, PRE-TRIAL) — creates Stripe SetupIntent for card collection
export async function subscribeDraft(
  draftId: string,
  resumeToken: string
): Promise<DraftSubscribeResponse> {
  return apiFetch('/enterprise/onboarding/subscribe', {
    method: 'POST',
    body: JSON.stringify({ draftId, resumeToken }),
  });
}

// 5) Start trial (ONLY after card confirmed)
export async function startTrial(
  data: OnboardingFormData & { draftId?: string; resumeToken?: string }
): Promise<StartResponse> {
  return apiFetch('/enterprise/onboarding/start', {
    method: 'POST',
    body: JSON.stringify({ ...data, countryCode: 'SE' }),
  });
}

// 6) Onboarding status (post-trial, authenticated)
export async function getOnboardingStatus(companyId: string, opts?: OnboardingAuthOpts): Promise<OnboardingStatusResponse> {
  return apiFetch(`/enterprise/companies/${companyId}/onboarding/status${buildAuthQuery(opts)}`, {
    headers: authHeaders(opts),
  });
}

// 7) Live pricing (post-trial, authenticated)
export async function getOnboardingPricing(companyId: string, opts?: OnboardingAuthOpts): Promise<{ pricing: PricingInfo }> {
  return apiFetch(`/enterprise/companies/${companyId}/onboarding/pricing${buildAuthQuery(opts)}`, {
    headers: authHeaders(opts),
  });
}

// 8) Company-level subscribe (post-trial, legacy/compat)
export async function subscribeCompany(companyId: string, opts?: OnboardingAuthOpts): Promise<CompanySubscribeResponse> {
  return apiFetch(`/enterprise/companies/${companyId}/onboarding/subscribe${buildAuthQuery(opts)}`, {
    method: 'POST',
    headers: authHeaders(opts),
  });
}

// 9) Activate (fallback after trial expiry)
export async function activateOnboarding(companyId: string, opts?: OnboardingAuthOpts): Promise<ActivateResponse> {
  return apiFetch(`/enterprise/companies/${companyId}/onboarding/activate${buildAuthQuery(opts)}`, {
    method: 'POST',
    headers: authHeaders(opts),
  });
}
