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

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResponse {
  valid: boolean;
  validation: {
    errors: Record<string, string>;
    normalized?: Record<string, any>;
    availability?: {
      organizationNumber?: { available: boolean; message?: string };
      workEmail?: { available: boolean; message?: string };
      activeDraft?: { exists: boolean; draftId?: string };
    };
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
