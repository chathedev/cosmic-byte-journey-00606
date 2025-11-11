import { apiClient } from "@/lib/api";

export interface MeetingAgenda {
  id: string;
  userId: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const agendaStorage = {
  async getAgendas(userId: string): Promise<MeetingAgenda[]> {
    try {
      const response = await apiClient.getAgendas();
      return response;
    } catch (error) {
      console.error('Failed to get agendas:', error);
      throw error;
    }
  },

  async saveAgenda(agenda: Partial<MeetingAgenda>): Promise<string> {
    try {
      if (agenda.id) {
        const response = await apiClient.updateAgenda(agenda.id, {
          name: agenda.name,
          content: agenda.content,
        });
        return response.id;
      } else {
        const response = await apiClient.createAgenda({
          name: agenda.name!,
          content: agenda.content!,
        });
        return response.id;
      }
    } catch (error) {
      console.error('Failed to save agenda:', error);
      throw error;
    }
  },

  async deleteAgenda(id: string): Promise<void> {
    try {
      await apiClient.deleteAgenda(id);
    } catch (error) {
      console.error('Failed to delete agenda:', error);
      throw error;
    }
  },

  async getAgenda(id: string): Promise<MeetingAgenda | null> {
    try {
      const response = await apiClient.getAgenda(id);
      return response;
    } catch (error) {
      console.error('Failed to get agenda:', error);
      return null;
    }
  },
};
