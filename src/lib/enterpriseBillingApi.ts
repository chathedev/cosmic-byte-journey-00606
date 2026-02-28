const BACKEND_URL = 'https://api.tivly.se';

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

export interface BillingOverview {
  billingStatus: string;
  company: any;
  viewer: {
    email: string;
    role: string;
    canManageBilling: boolean;
  };
  billingHistory: any[];
  billingHistoryCount: number;
  activeSubscriptionId: string | null;
}

export interface SubscriptionDetail {
  viewer: { canManageBilling: boolean };
  management: {
    canManageBilling: boolean;
    portalEndpoint: string;
    cancelEndpoint: string;
  };
  subscription: {
    id: string;
    status: string;
    collectionMethod: string;
    autoChargeEnabled: boolean;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    startedAt: string;
    cancelAtPeriodEnd: boolean;
    cancelAt: string | null;
    canceledAt: string | null;
    endedAt: string | null;
    trialEnd: string | null;
    paymentMethodId: string | null;
    paymentMethodSource: string | null;
  } | null;
  latestInvoice: {
    id: string;
    status: string;
    amountDue: number;
    amountPaid: number;
    currency: string;
    created: string;
    hostedInvoiceUrl: string | null;
    invoicePdf: string | null;
  } | null;
}

export interface PortalResponse {
  success: boolean;
  companyId: string;
  portalUrl: string;
  timestamp: string;
}

export interface CancelResponse {
  company: any;
  subscription: {
    status: string;
    cancelAtPeriodEnd: boolean;
    cancelAt: string | null;
    canceledAt: string | null;
    currentPeriodEnd: string;
  };
  entry: any;
}

export const enterpriseBillingApi = {
  async getBillingOverview(companyId: string): Promise<BillingOverview> {
    const res = await fetch(`${BACKEND_URL}/enterprise/companies/${companyId}/billing`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async getSubscription(companyId: string): Promise<SubscriptionDetail> {
    const res = await fetch(`${BACKEND_URL}/enterprise/companies/${companyId}/billing/subscription`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async openPortal(companyId: string): Promise<PortalResponse> {
    const res = await fetch(`${BACKEND_URL}/enterprise/companies/${companyId}/billing/portal`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async cancelSubscription(companyId: string, atPeriodEnd: boolean = true): Promise<CancelResponse> {
    const res = await fetch(`${BACKEND_URL}/enterprise/companies/${companyId}/billing/subscription/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ atPeriodEnd }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
};
