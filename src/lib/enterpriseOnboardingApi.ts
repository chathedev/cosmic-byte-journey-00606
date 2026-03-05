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

export interface CompanyRegistryResult {
  provider: string;
  status: 'verified' | 'company_name_mismatch' | 'organization_not_found' | 'blocked' | 'rate_limited' | 'unavailable' | string;
  ok: boolean;
  checked: boolean;
  required: boolean;
  url?: string;
  timestamp?: string;
}

export interface CompanyConnectionResult {
  provider: string;
  status: 'verified' | 'likely_verified' | 'ai_verified' | 'ai_rejected' | 'insufficient_evidence' | 'website_unreachable' | 'disabled' | 'skipped' | 'test_bypass' | string;
  ok: boolean;
  checked: boolean;
  required: boolean;
  reason?: string;
  message?: string;
  score?: number;
  timestamp?: string;
  websiteUrl?: string;
  websiteDomain?: string;
  workEmail?: string;
  workEmailDomain?: string;
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
    companyRegistry?: CompanyRegistryResult;
    companyConnection?: CompanyConnectionResult;
    requirements?: {
      commitmentsRequired?: boolean;
    };
    availability?: {
      organizationNumberAvailable?: boolean;
      workEmailAvailable?: boolean;
      existingCompanyByOrganizationNumber?: any;
      existingCompanyByContactEmail?: any;
      existingDraft?: any;
      domainTrialAvailable?: boolean;
      domainTrialLock?: {
        domain?: string;
        trialStartedAt?: string;
        lockExpiresAt?: string;
        company?: string;
      };
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
    firstChargeEstimate?: {
      activationFeeSek: number;
      monthlyTotalSek: number;
      expectedTotalSek: number;
      trialDays: number;
    };
    stripePublishableKey?: string;
    stripePublishableKeyMode?: 'test' | 'live';
    stripeKeyPairCompatible?: boolean;
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
  return apiFetch('/team/onboarding/validate', {
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
  const draftId = typeof data.draftId === 'string' ? data.draftId.trim() : '';
  const resumeToken = typeof data.resumeToken === 'string' ? data.resumeToken.trim() : '';

  // Backend requires BOTH draftId + resumeToken for updates.
  // If one is missing, create a new draft instead of sending a broken update payload.
  const payload: Record<string, any> = { ...data, countryCode: 'SE' };
  if (draftId && resumeToken) {
    payload.draftId = draftId;
    payload.resumeToken = resumeToken;
  } else {
    delete payload.draftId;
    delete payload.resumeToken;
  }

  return apiFetch('/team/onboarding/draft', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// 3) Get draft
export async function getDraft(draftId: string, resumeToken: string): Promise<DraftResponse> {
  return apiFetch(`/team/onboarding/draft/${draftId}?resumeToken=${encodeURIComponent(resumeToken)}`);
}

// 4) Subscribe (draft-level, PRE-TRIAL) — creates Stripe SetupIntent for card collection
export async function subscribeDraft(
  draftId: string,
  resumeToken: string
): Promise<DraftSubscribeResponse> {
  return apiFetch('/team/onboarding/subscribe', {
    method: 'POST',
    body: JSON.stringify({ draftId, resumeToken }),
  });
}

// 5) Start trial (ONLY after card confirmed)
export async function startTrial(
  data: OnboardingFormData & { draftId?: string; resumeToken?: string }
): Promise<StartResponse> {
  return apiFetch('/team/onboarding/start', {
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

// 10) Send email verification for onboarding work email (link-based)
export async function sendOnboardingEmailVerification(data: { email: string; draftId: string }): Promise<{
  sent?: boolean; retryAfterMs?: number; message?: string;
  emailVerification?: { status: string; expiresAt?: string; method?: string };
  verifyUrl?: string;
}> {
  return apiFetch('/enterprise/onboarding/verify-email/send', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// 11) Poll email verification status (real-time check)
export async function checkOnboardingEmailVerification(draftId: string): Promise<{
  success: boolean;
  draftId: string;
  emailVerification?: {
    email: string;
    method: string;
    status: string;
    issuedAt?: string;
    sentAt?: string;
    expiresAt?: string;
    verifiedAt?: string;
    attempts?: number;
    attemptsRemaining?: number;
  };
}> {
  return apiFetch(`/enterprise/onboarding/verify-email/status?draftId=${encodeURIComponent(draftId)}`);
}
