const BACKEND_URL = 'https://api.tivly.se';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface AnalyzeMeetingRequest {
  transcript: string;
  meetingName?: string;
  agenda?: string;
}

interface AIActionItem {
  title: string;
  description?: string;
  owner?: string;
  deadline?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface AnalyzeMeetingResponse {
  title: string;
  summary: string;
  mainPoints: string[];
  decisions: string[];
  actionItems: AIActionItem[];
  nextMeetingSuggestions?: string[];
}

interface SendEmailRequest {
  recipients: string[];
  subject: string;
  message: string;
  documentBlob: string; // base64
  fileName?: string;
}

interface SendEmailResponse {
  success: boolean;
  messageId?: string;
}

export const analyzeMeeting = async (data: AnalyzeMeetingRequest): Promise<AnalyzeMeetingResponse> => {
  const token = localStorage.getItem('authToken');

  // If no token, call public edge function without auth (function is public)
  if (!token) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-meeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: data.transcript,
        meetingName: data.meetingName,
        agenda: data.agenda
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to analyze meeting' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  // Import encryption utilities
  const { encryptPayload, SENSITIVE_FIELDS } = await import('./fieldEncryption');
  
  try {
    // Encrypt sensitive meeting analysis fields
    const fieldsToEncrypt = [
      { path: SENSITIVE_FIELDS.TRANSCRIPT, encoding: 'utf8' as const }
    ];
    
    if (data.agenda) {
      fieldsToEncrypt.push({ path: SENSITIVE_FIELDS.AGENDA, encoding: 'utf8' as const });
    }
    
    const encryptedPayload = await encryptPayload(token, data, fieldsToEncrypt);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-meeting`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(encryptedPayload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to analyze meeting' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Failed to encrypt analyze-meeting payload:', error);
    // Fallback to unencrypted for backward compatibility
    const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-meeting`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        transcript: data.transcript,
        meetingName: data.meetingName,
        agenda: data.agenda
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to analyze meeting' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
};

export const sendProtocolEmail = async (data: SendEmailRequest): Promise<SendEmailResponse> => {
  const token = localStorage.getItem('authToken');
  
  if (!token) {
    throw new Error('No authentication token found');
  }

  // Import encryption utilities dynamically
  const { encryptPayload, SENSITIVE_FIELDS } = await import('./fieldEncryption');
  
  try {
    // Encrypt sensitive email content
    const encryptedPayload = await encryptPayload(
      token,
      data,
      [
        { path: SENSITIVE_FIELDS.MESSAGE, encoding: 'utf8' },
        { path: 'documentBlob', encoding: 'utf8' },
      ]
    );

    const response = await fetch(`${BACKEND_URL}/send-protocol-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(encryptedPayload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to send email' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Failed to encrypt email payload:', error);
    // Fallback to unencrypted (for backward compatibility)
    const response = await fetch(`${BACKEND_URL}/send-protocol-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to send email' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
};

interface SaveActionItemsRequest {
  meetingId: string;
  userId: string;
  actionItems: AIActionItem[];
}

export const saveActionItems = async (data: SaveActionItemsRequest): Promise<void> => {
  const token = localStorage.getItem('authToken');
  
  if (!token) {
    throw new Error('No authentication token found');
  }

  // Import encryption utilities dynamically
  const { encryptPayload, SENSITIVE_FIELDS } = await import('./fieldEncryption');
  
  try {
    // Encrypt action item descriptions
    const fieldsToEncrypt = data.actionItems.map((_, index) => ({
      path: `actionItems[${index}].${SENSITIVE_FIELDS.DESCRIPTION}`,
      encoding: 'utf8' as const,
    }));

    const encryptedPayload = await encryptPayload(token, data, fieldsToEncrypt);

    const response = await fetch(`${BACKEND_URL}/action-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(encryptedPayload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to save action items' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Failed to encrypt action items:', error);
    // Fallback to unencrypted
    const response = await fetch(`${BACKEND_URL}/action-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to save action items' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
  }
};
