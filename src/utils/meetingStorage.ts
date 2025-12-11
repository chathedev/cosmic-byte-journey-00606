// Meeting storage using backend /meetings API (single source of truth)
import { apiClient } from '@/lib/api';

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker: string;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  words?: TranscriptWord[];
}

export interface MeetingSession {
  id: string;
  title: string;
  transcript: string;
  transcriptSegments?: TranscriptSegment[]; // Speaker diarization data from ASR
  protocol?: string;
  folder: string; // For backward-compat we expose folder name; backend may use folderId internally
  createdAt: string;
  updatedAt: string;
  userId: string;
  isCompleted?: boolean;
  protocolCount?: number;
  agendaId?: string;
  source?: 'live' | 'upload'; // Indikerar om mötet är från live-inspelning eller uppladdad fil
  transcriptionStatus?: 'uploading' | 'processing' | 'done' | 'failed'; // Status för transkribering
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
  source: m.source || undefined,
  transcriptSegments: m.transcriptSegments || undefined, // Speaker diarization data
  // CRITICAL: Override status to 'done' if real transcript exists (not placeholder text)
  transcriptionStatus: (m.transcript && m.transcript.trim().length > 0 && !m.transcript.includes('Transkribering pågår')) ? 'done' : (m.transcriptionStatus || 'processing'),
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

      // CRITICAL: Determine if this is an update or create operation
      const hasValidId = meeting.id && isValidUUID(meeting.id);
      const isTempId = meeting.id && meeting.id.startsWith('temp-');
      const isNewMeeting = !hasValidId || isTempId || (meeting as any).forceCreate;

      console.log('💾 saveMeeting decision:', {
        meetingId: meeting.id,
        hasValidId,
        isTempId,
        isCompleted: meeting.isCompleted,
        isNewMeeting,
      });

      // Draft meeting - return temp ID without backend save
      if (!meeting.isCompleted && !hasValidId) {
        console.log('💾 Draft meeting - returning temp ID:', meeting.id);
        return meeting.id || `temp-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      }

      // For new meetings (temp ID, no ID, or forceCreate), always CREATE
      if (isNewMeeting) {
        console.log('💾 Creating NEW meeting:', {
          tempId: meeting.id,
          title: meeting.title,
        });
        
        // Remove any temp or client-generated ID - let backend generate UUID
        delete payload.id;
        
        const result = await apiClient.createMeeting(payload);
        const newId = String(result.meeting?.id || '');
        
        if (!newId || !isValidUUID(newId)) {
          console.error('❌ Backend returned invalid meeting ID:', newId);
          throw new Error('Failed to create meeting: invalid ID returned from backend');
        }
        
        console.log('✅ Created NEW meeting with UUID:', newId);
        return newId;
      }

      // Existing meeting with valid UUID - update it
      console.log('💾 Updating existing meeting:', meeting.id);
      const result = await apiClient.updateMeeting(meeting.id, payload);
      return String(result.meeting?.id || meeting.id);
    } catch (error) {
      console.error('Error saving meeting (API):', error);
      throw error;
    }
  },

  // Increment protocol count - count meeting ONLY if not already counted
  async incrementProtocolCount(meetingId: string): Promise<void> {
    try {
      // NEVER increment meeting count here - that's handled by incrementMeetingCount flow
      // This function ONLY increments the protocolCount field
      
      // Skip for temp meetings - they don't exist in backend yet
      if (!isValidUUID(meetingId)) {
        console.log('⏭️ Temp meeting - protocol count will be set on save:', meetingId);
        return;
      }
      
      // Fetch current to compute next count
      const { meetings } = await apiClient.getMeetings();
      const current = (meetings || []).find((m: any) => String(m.id) === String(meetingId));
      const next = Number(current?.protocolCount ?? 0) + 1;
      await apiClient.updateMeeting(meetingId, { protocolCount: next });
      console.log(`✅ Protocol count updated to ${next} for meeting:`, meetingId);
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
  // ATOMIC operation with LOCAL CACHE + locking to prevent race conditions
  async markCountedIfNeeded(meetingId: string): Promise<boolean> {
    const lockKey = `counting_lock_${meetingId}`;
    const cacheKey = `meeting_counted_${meetingId}`;
    
    try {
      if (!isValidUUID(meetingId)) {
        console.log('⏭️ Temp meeting cannot be counted:', meetingId);
        return false;
      }
      
      // CHECK LOCAL CACHE FIRST - if we've already counted this meeting in this session, don't even try
      const alreadyCounted = localStorage.getItem(cacheKey);
      if (alreadyCounted === 'true') {
        console.log('⏭️ Meeting already counted (local cache):', meetingId);
        return false;
      }
      
      // Check for in-flight counting operation
      const lockData = sessionStorage.getItem(lockKey);
      if (lockData) {
        const lockTime = parseInt(lockData, 10);
        const now = Date.now();
        // If lock is less than 10 seconds old, respect it
        if (now - lockTime < 10000) {
          console.log('⏭️ Already counting this meeting in parallel call, skipping:', meetingId);
          return false;
        }
        // Lock is stale, clear it
        sessionStorage.removeItem(lockKey);
      }
      
      // Acquire lock with timestamp
      sessionStorage.setItem(lockKey, String(Date.now()));
      
      // Backend handles atomicity - the counted flag can only be set from false->true once
      const { meetings } = await apiClient.getMeetings();
      const current = (meetings || []).find((m: any) => String(m.id) === String(meetingId));
      
      if (current?.counted) {
        console.log('⏭️ Meeting already marked as counted (backend verified):', meetingId);
        localStorage.setItem(cacheKey, 'true'); // Cache the result
        sessionStorage.removeItem(lockKey);
        return false;
      }
      
      console.log('📊 Backend confirms meeting NOT counted yet:', meetingId);
      
      // Atomically mark as counted in backend
      await apiClient.updateMeeting(meetingId, { counted: true });
      console.log('✅ Successfully marked meeting as counted in backend:', meetingId);
      
      // CACHE THE RESULT - this meeting is now counted forever
      localStorage.setItem(cacheKey, 'true');
      
      // Release lock
      sessionStorage.removeItem(lockKey);
      return true;
    } catch (error) {
      console.error('❌ markCountedIfNeeded error:', error);
      // Release lock on error
      sessionStorage.removeItem(lockKey);
      // On error, assume already counted to prevent double counting
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
