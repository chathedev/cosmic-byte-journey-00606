// Meeting storage using backend /meetings API (single source of truth)
import { apiClient } from '@/lib/api';

export interface MeetingSession {
  id: string;
  title: string;
  transcript: string;
  protocol?: string;
  folder: string; // For backward-compat we expose folder name; backend may use folderId internally
  createdAt: string;
  updatedAt: string;
  userId: string;
  isCompleted?: boolean;
  protocolCount?: number;
  agendaId?: string;
}

export interface MeetingFolder {
  id?: string;
  name: string;
  createdAt: string;
  userId: string;
  order?: number;
}

const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

const mapMeeting = (m: any, userIdHint?: string): MeetingSession => ({
  id: String(m.id),
  title: m.title || 'Möte',
  transcript: m.transcript || '',
  protocol: m.protocol || undefined,
  folder: m.folder?.name || m.folder || m.folderId || 'Allmänt',
  createdAt: m.createdAt || m.created_at || new Date().toISOString(),
  updatedAt: m.updatedAt || m.updated_at || new Date().toISOString(),
  userId: m.userId || userIdHint || '',
  isCompleted: !!(m.isCompleted ?? m.completed ?? false),
  protocolCount: Number(m.protocolCount ?? 0),
  agendaId: m.agendaId || m.agendaid || undefined,
});

export const meetingStorage = {
  // Meetings
  async getMeetings(userId: string, opts?: { folderId?: string }): Promise<MeetingSession[]> {
    try {
      const [meetingsResp, foldersResp] = await Promise.all([
        apiClient.getMeetings(opts?.folderId),
        apiClient.getFolders().catch(() => [] as any),
      ]);

      const mr: any = meetingsResp as any;
      let meetingsArr: any[] = [];
      if (Array.isArray(mr)) meetingsArr = mr;
      else if (Array.isArray(mr?.meetings)) meetingsArr = mr.meetings;
      else if (Array.isArray(mr?.user?.meetings)) meetingsArr = mr.user.meetings;

      const fr: any = foldersResp as any;
      let foldersArr: any[] = [];
      if (Array.isArray(fr)) foldersArr = fr;
      else if (Array.isArray(fr?.folders)) foldersArr = fr.folders;
      else if (Array.isArray(fr?.user?.folders)) foldersArr = fr.user.folders;

      const safeFolders = Array.isArray(foldersArr) ? foldersArr : [];
      const idToName = new Map<string, string>(
        safeFolders.map((f: any) => [String(f.id), String(f.name)])
      );
      console.log('📥 getMeetings() resp:', { count: meetingsArr.length });
      return meetingsArr.map((m: any) => {
        const mapped = mapMeeting(m, userId);
        if (mapped.folder && isValidUUID(String(mapped.folder))) {
          const friendly = idToName.get(String(mapped.folder));
          if (friendly) mapped.folder = friendly;
        }
        return mapped;
      });
    } catch (error) {
      console.error('Error getting meetings (API):', error);
      return [];
    }
  },

  async saveMeeting(meeting: MeetingSession): Promise<string> {
    try {
      const payload: any = {
        title: meeting.title,
        transcript: meeting.transcript,
        protocol: meeting.protocol,
        folder: meeting.folder,
        folderId: (meeting as any).folderId,
        isCompleted: meeting.isCompleted ?? false,
        protocolCount: meeting.protocolCount ?? 0,
        hasCounted: (meeting as any).hasCounted ?? false,
        agendaId: meeting.agendaId,
        createdAt: meeting.createdAt,
        startedAt: meeting.createdAt,
        meetingStartedAt: meeting.createdAt,
      };

      // Resolve folderId if only a folder name was provided
      try {
        if (!payload.folderId && payload.folder) {
          const f = String(payload.folder);
          if (isValidUUID(f)) {
            payload.folderId = f;
          } else {
            const list = await apiClient.getFolders();
            const match = (Array.isArray(list) ? list : []).find((x: any) => String(x.name) === f);
            if (match?.id) payload.folderId = match.id;
          }
        }
      } catch (e) {
        console.warn('⚠️ Could not resolve folderId from name, proceeding with name only', e);
      }

      // Only save to backend if meeting has a valid UUID (already created) OR is completed
      const hasValidId = meeting.id && isValidUUID(meeting.id);
      const shouldSaveToBackend = hasValidId || meeting.isCompleted;

      if (!shouldSaveToBackend) {
        // Draft meeting - return temp ID without backend save
        return meeting.id || 'temp-' + Date.now();
      }

      if (hasValidId) {
        const result = await apiClient.updateMeeting(meeting.id, payload);
        return String(result.meeting?.id || meeting.id);
      } else {
        // isCompleted but no valid ID - create new meeting on backend
        const result = await apiClient.createMeeting(payload);
        return String(result.meeting?.id || '');
      }
    } catch (error) {
      console.error('Error saving meeting (API):', error);
      throw error;
    }
  },

  // Increment protocol count - ALWAYS count meeting to backend
  async incrementProtocolCount(meetingId: string): Promise<void> {
    try {
      // Skip if temp ID (not yet saved to backend)
      if (!isValidUUID(meetingId)) {
        console.log('⏭️ Skipping incrementProtocolCount for temp meeting:', meetingId);
        return;
      }
      
      // ALWAYS count meeting when generating protocol
      console.log('📊 Counting meeting on protocol generation - ALWAYS:', meetingId);
      await apiClient.incrementMeetings(1);
      
      // Fetch current to compute next count
      const { meetings } = await apiClient.getMeetings();
      const current = (meetings || []).find((m: any) => String(m.id) === String(meetingId));
      const next = Number(current?.protocolCount ?? 0) + 1;
      await apiClient.updateMeeting(meetingId, { protocolCount: next });
    } catch (error) {
      console.error('Error incrementing protocol count (API):', error);
    }
  },

  async markCompleted(meetingId: string): Promise<void> {
    try {
      // Skip if temp ID (not yet saved to backend)
      if (!isValidUUID(meetingId)) {
        console.log('⏭️ Skipping markCompleted for temp meeting:', meetingId);
        return;
      }
      await apiClient.updateMeeting(meetingId, { isCompleted: true });
    } catch (error) {
      console.error('Error marking meeting completed (API):', error);
    }
  },

  async getMeeting(meetingId: string): Promise<MeetingSession | null> {
    try {
      const [meetingsResp, foldersResp] = await Promise.all([
        apiClient.getMeetings(),
        apiClient.getFolders().catch(() => [] as any),
      ]);
      const mr: any = meetingsResp as any;
      let meetingsArr: any[] = [];
      if (Array.isArray(mr)) meetingsArr = mr;
      else if (Array.isArray(mr?.meetings)) meetingsArr = mr.meetings;
      else if (Array.isArray(mr?.user?.meetings)) meetingsArr = mr.user.meetings;

      const fr: any = foldersResp as any;
      let foldersArr: any[] = [];
      if (Array.isArray(fr)) foldersArr = fr;
      else if (Array.isArray(fr?.folders)) foldersArr = fr.folders;
      else if (Array.isArray(fr?.user?.folders)) foldersArr = fr.user.folders;

      const found = (meetingsArr || []).find((m: any) => String(m.id) === String(meetingId));
      if (!found) return null;
      const mapped = mapMeeting(found);
      if (mapped.folder && isValidUUID(String(mapped.folder))) {
        const idToName = new Map<string, string>(
          (foldersArr || []).map((f: any) => [String(f.id), String(f.name)])
        );
        const friendly = idToName.get(String(mapped.folder));
        if (friendly) mapped.folder = friendly;
      }
      return mapped;
    } catch (error) {
      console.error('Error getting meeting (API):', error);
      return null;
    }
  },

  async deleteMeeting(id: string): Promise<void> {
    try {
      console.log('🗑️ Moving meeting to Trash (soft delete):', id);
      
      // Ensure Trash folder exists (it should already exist from account creation)
      const raw: any = await apiClient.getFolders();
      const all: any[] = Array.isArray(raw) ? raw : (raw?.folders || raw?.user?.folders || []);
      let trash = all.find((f: any) => String(f.name) === '__Trash');
      
      if (!trash) {
        // Create if missing (fallback)
        const created = await apiClient.createFolder({ name: '__Trash' });
        trash = { id: created.id, name: created.name };
      }

      // Move meeting to Trash folder
      await apiClient.updateMeeting(id, { folderId: trash.id, folder: trash.name });
      console.log('✅ Soft-deleted by moving to __Trash');
    } catch (error) {
      console.error('❌ Error soft-deleting meeting:', error);
      throw error;
    }
  },

  // Mark meeting as counted exactly once - returns true if successfully marked (wasn't counted before)
  async markCountedIfNeeded(meetingId: string): Promise<boolean> {
    try {
      if (!isValidUUID(meetingId)) {
        console.log('⏭️ Skipping markCountedIfNeeded for temp meeting:', meetingId);
        return false;
      }
      
      // Check if already counted
      const { meetings } = await apiClient.getMeetings();
      const current = (meetings || []).find((m: any) => String(m.id) === String(meetingId));
      
      if (current?.counted) {
        console.log('⏭️ Meeting already counted:', meetingId);
        return false;
      }
      
      // Mark as counted
      await apiClient.updateMeeting(meetingId, { counted: true });
      console.log('✅ Marked meeting as counted:', meetingId);
      return true;
    } catch (error) {
      console.warn('markCountedIfNeeded error:', error);
      return false;
    }
  },

  // Folders - using backend API
  async getFolders(userId: string): Promise<MeetingFolder[]> {
    try {
      const raw: any = await apiClient.getFolders();
      const list: any[] = Array.isArray(raw) ? raw : (raw?.folders || []);
      console.log('📂 getFolders() resp:', { count: list.length });
      
      // Filter out hidden __Trash folder from UI
      const visible = list.filter((f: any) => String(f.name) !== '__Trash');
      
      return visible.map((f: any) => ({
        id: f.id,
        name: f.name,
        createdAt: f.createdAt || f.created_at || new Date().toISOString(),
        userId: f.userId || userId,
        order: f.order ?? 0,
      }));
    } catch (error) {
      console.error('Error getting folders from backend:', error);
      // Return default folder on error
      return [
        {
          id: 'default',
          name: 'Allmänt',
          createdAt: new Date().toISOString(),
          userId,
          order: 0,
        },
      ];
    }
  },

  async addFolder(name: string, userId: string): Promise<MeetingFolder> {
    try {
      const created = await apiClient.createFolder({ name });
      return {
        id: created.id,
        name: created.name,
        createdAt: created.createdAt || created.created_at || new Date().toISOString(),
        userId: created.userId || userId,
        order: created.order ?? 0,
      };
    } catch (error) {
      console.error('Error creating folder:', error);
      throw error;
    }
  },

  async deleteFolder(name: string, userId: string, moveToFolder: string = 'Allmänt'): Promise<void> {
    try {
      // Prevent deletion of protected folders
      if (name === 'Allmänt' || name === '__Trash') {
        throw new Error('Cannot delete protected folder');
      }
      
      // Find source folder by name
      const folders = await this.getFolders(userId);
      const source = folders.find(f => f.name === name);
      if (!source?.id) throw new Error('Folder not found');

      // Resolve destination folder (create if missing)
      let dest = folders.find(f => f.name === moveToFolder);
      if (!dest) {
        const created = await apiClient.createFolder({ name: moveToFolder });
        dest = {
          id: created.id,
          name: created.name,
          createdAt: created.createdAt || new Date().toISOString(),
          userId,
          order: created.order ?? 0,
        };
      }

      // Move all meetings that belong to the source folderId
      const snapshot = await apiClient.getMeetings();
      const toMove = (snapshot?.meetings || []).filter((m: any) => {
        const fid = m.folderId || m.folder?.id;
        const fname = m.folder?.name;
        return String(fid) === String(source.id) || String(fname) === String(source.name);
      });

      for (const meeting of toMove) {
        await apiClient.updateMeeting(String(meeting.id), { folderId: dest.id, folder: dest.name });
      }

      // Delete folder from backend
      await apiClient.deleteFolder(String(source.id));
    } catch (error) {
      console.error('Error deleting folder:', error);
      throw error;
    }
  }
};
