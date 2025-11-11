const BACKEND_URL = 'https://api.tivly.se';

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  targetType: 'all' | 'plan' | 'specific' | 'verified' | 'unverified' | 'active' | 'inactive';
  targetPlan?: 'free' | 'standard' | 'plus' | 'unlimited';
  targetEmails?: string[];
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed';
  scheduledAt?: string;
  sentAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  stats: {
    totalTargets: number;
    sent: number;
    failed: number;
  };
}

export interface CreateCampaignRequest {
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  targetType: 'all' | 'plan' | 'specific' | 'verified' | 'unverified' | 'active' | 'inactive';
  targetPlan?: 'free' | 'standard' | 'plus' | 'unlimited';
  targetEmails?: string[];
  scheduledAt?: string;
}

export interface PreviewTarget {
  email: string;
  name: string;
  plan: string;
  isVerified: boolean;
}

export interface ExecutionLog {
  campaignId: string;
  executedAt: string;
  stats: {
    totalTargets: number;
    sent: number;
    failed: number;
  };
  results: Array<{
    success: boolean;
    email: string;
    messageId?: string;
    error?: string;
  }>;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

export const emailCampaignApi = {
  async createCampaign(data: CreateCampaignRequest): Promise<Campaign> {
    const response = await fetch(`${BACKEND_URL}/admin/email-campaigns`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create campaign' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.campaign;
  },

  async listCampaigns(): Promise<Campaign[]> {
    const response = await fetch(`${BACKEND_URL}/admin/email-campaigns`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list campaigns' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.campaigns;
  },

  async getCampaign(campaignId: string): Promise<Campaign> {
    const response = await fetch(`${BACKEND_URL}/admin/email-campaigns/${campaignId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get campaign' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.campaign;
  },

  async updateCampaign(campaignId: string, data: Partial<CreateCampaignRequest>): Promise<Campaign> {
    const response = await fetch(`${BACKEND_URL}/admin/email-campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to update campaign' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.campaign;
  },

  async deleteCampaign(campaignId: string): Promise<void> {
    const response = await fetch(`${BACKEND_URL}/admin/email-campaigns/${campaignId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete campaign' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
  },

  async previewTargets(campaignId: string): Promise<{ count: number; hasMore: boolean; targets: PreviewTarget[] }> {
    const response = await fetch(`${BACKEND_URL}/admin/email-campaigns/${campaignId}/preview-targets`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to preview targets' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async sendCampaign(campaignId: string): Promise<void> {
    const response = await fetch(`${BACKEND_URL}/admin/email-campaigns/${campaignId}/send`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to send campaign' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
  },

  async getExecutionLog(campaignId: string): Promise<ExecutionLog> {
    const response = await fetch(`${BACKEND_URL}/admin/email-campaigns/${campaignId}/log`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get execution log' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.log;
  },
};
