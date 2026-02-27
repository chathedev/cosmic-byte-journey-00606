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
  company: Record<string, any>;
  pricing: PricingInfo;
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

export async function validateOnboarding(
  data: Partial<OnboardingFormData> & { requireCommitments?: boolean }
): Promise<ValidationResponse> {
  return apiFetch('/enterprise/onboarding/validate', {
    method: 'POST',
    body: JSON.stringify({ ...data, countryCode: 'SE' }),
  });
}

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

export async function getDraft(draftId: string, resumeToken: string): Promise<DraftResponse> {
  return apiFetch(`/enterprise/onboarding/draft/${draftId}?resumeToken=${encodeURIComponent(resumeToken)}`);
}

export async function startTrial(
  data: OnboardingFormData & { draftId?: string; resumeToken?: string }
): Promise<StartResponse> {
  return apiFetch('/enterprise/onboarding/start', {
    method: 'POST',
    body: JSON.stringify({ ...data, countryCode: 'SE' }),
  });
}
