const BACKEND_URL = 'https://api.tivly.se';

export interface OutreachStatus {
  initialized: boolean;
  scheduler: {
    isRunning: boolean;
    jobs: Array<{
      name: string;
      schedule: string;
      running: boolean;
    }>;
  };
  sender: {
    emailsInMaster: number;
    emailsSentToday: number;
    emailsPending: number;
    activeSenderDomains?: string[];
    domainSends?: {
      [key: string]: {
        sent: number;
        limit: number;
        remaining: number;
      };
    };
    pausedSenders?: Record<string, any>;
    nextScheduledSend?: string;
    withinSendingHours?: boolean;
  };
  statistics: {
    totalMaster: number;
    totalSent: number;
    totalInvalid: number;
    totalPending: number;
    sentToday: number;
  };
  timestamp: string;
}

export interface CollectResult {
  success: boolean;
  result: {
    discovered: number;
    validated: number;
    added: number;
  };
}

export interface SendResult {
  success: boolean;
  result: {
    sent: number;
    results: any[];
  };
}

export interface UnsubscribeResult {
  success: boolean;
  email: string;
}

export interface SendTestResult {
  success: boolean;
  message: string;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

export const outreachApi = {
  async getStatus(): Promise<OutreachStatus> {
    const response = await fetch(`${BACKEND_URL}/outreach/status`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get status' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async unsubscribe(email: string): Promise<UnsubscribeResult> {
    const response = await fetch(`${BACKEND_URL}/outreach/unsubscribe`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to unsubscribe' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async triggerCollect(options?: {
    allabolagQuery?: string;
    hittaQuery?: string;
    eniroQuery?: string;
    maxPages?: number;
  }): Promise<CollectResult> {
    const response = await fetch(`${BACKEND_URL}/outreach/trigger-collect`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(options || {}),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to trigger collection' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async triggerSend(maxEmails?: number): Promise<SendResult> {
    const response = await fetch(`${BACKEND_URL}/outreach/trigger-send`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ maxEmails: maxEmails || 10 }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to trigger send' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async sendTest(email?: string): Promise<SendTestResult> {
    const response = await fetch(`${BACKEND_URL}/outreach/send-test`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(email ? { email } : {}),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to send test emails' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },
};
