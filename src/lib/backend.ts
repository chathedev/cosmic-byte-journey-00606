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
  const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-meeting`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
};

export const sendProtocolEmail = async (data: SendEmailRequest): Promise<SendEmailResponse> => {
  const token = localStorage.getItem('authToken');
  
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
};

interface SaveActionItemsRequest {
  meetingId: string;
  userId: string;
  actionItems: AIActionItem[];
}

export const saveActionItems = async (data: SaveActionItemsRequest): Promise<void> => {
  const token = localStorage.getItem('authToken');
  
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
};
