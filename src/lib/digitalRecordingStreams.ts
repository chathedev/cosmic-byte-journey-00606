/**
 * Module-level storage for digital recording MediaStreams.
 * MediaStream objects cannot be serialized, so we store them here
 * and pass a flag through React Router navigation.
 */

let systemStream: MediaStream | null = null;
let micStream: MediaStream | null = null;

export const digitalRecordingStreams = {
  set(streams: { systemStream?: MediaStream; micStream?: MediaStream }) {
    systemStream = streams.systemStream || null;
    micStream = streams.micStream || null;
  },

  get() {
    return { systemStream, micStream };
  },

  clear() {
    // Stop all tracks before clearing
    systemStream?.getTracks().forEach(t => t.stop());
    micStream?.getTracks().forEach(t => t.stop());
    systemStream = null;
    micStream = null;
  },

  hasStreams() {
    return systemStream !== null || micStream !== null;
  },
};
