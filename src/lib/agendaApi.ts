const BACKEND_URL = 'https://api.tivly.se';

interface SaveAgendaRequest {
  name: string;
  textContent: string;
}

interface SaveAgendaResponse {
  ok: boolean;
  agenda: {
    id: string;
    name: string;
    uploadDate: string;
  };
}

interface AgendaListItem {
  id: string;
  name: string;
  uploadDate: string;
}

interface AgendaListResponse {
  agendas: AgendaListItem[];
}

interface AgendaDetail {
  id: string;
  name: string;
  textContent: string;
  uploadDate: string;
  createdAt: string;
  updatedAt: string;
}

interface AgendaDetailResponse {
  agenda: AgendaDetail;
}

interface DeleteAgendaResponse {
  ok: boolean;
  message: string;
  agendaId: string;
}

const getAuthToken = () => {
  const token = localStorage.getItem('authToken');
  if (!token) {
    throw new Error('No authentication token found');
  }
  return token;
};

export const agendaApi = {
  async saveAgenda(data: SaveAgendaRequest): Promise<SaveAgendaResponse> {
    const token = getAuthToken();
    
    // Import encryption utilities
    const { encryptPayload, SENSITIVE_FIELDS } = await import('./fieldEncryption');
    
    try {
      // Encrypt sensitive agenda content
      const encryptedPayload = await encryptPayload(
        token,
        data,
        [
          { path: 'textContent', encoding: 'utf8' },
        ]
      );

      const response = await fetch(`${BACKEND_URL}/agenda/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(encryptedPayload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to save agenda' }));
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error('Failed to encrypt agenda payload:', error);
      // Fallback to unencrypted for backward compatibility
      const response = await fetch(`${BACKEND_URL}/agenda/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to save agenda' }));
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      return response.json();
    }
  },

  async listAgendas(userId: string): Promise<AgendaListResponse> {
    const token = getAuthToken();
    
    const response = await fetch(`${BACKEND_URL}/agenda/list/${encodeURIComponent(userId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch agendas' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getAgenda(agendaId: string): Promise<AgendaDetailResponse> {
    const token = getAuthToken();
    
    const response = await fetch(`${BACKEND_URL}/agenda/${agendaId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch agenda' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async deleteAgenda(agendaId: string): Promise<DeleteAgendaResponse> {
    const token = getAuthToken();
    
    const response = await fetch(`${BACKEND_URL}/agenda/${agendaId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete agenda' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },
};
