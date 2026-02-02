/**
 * Module-level storage for digital recording MediaStreams.
 * MediaStream objects cannot be serialized, so we store them here
 * and pass a flag through React Router navigation.
 */

let systemStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let combinedStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;

export const digitalRecordingStreams = {
  set(streams: {
    systemStream?: MediaStream;
    micStream?: MediaStream;
    combinedStream?: MediaStream;
    audioContext?: AudioContext;
  }) {
    systemStream = streams.systemStream || null;
    micStream = streams.micStream || null;
    combinedStream = streams.combinedStream || null;
    audioContext = streams.audioContext || null;
  },

  get() {
    return { systemStream, micStream, combinedStream, audioContext };
  },

  clear() {
    // Stop all tracks before clearing
    systemStream?.getTracks().forEach(t => t.stop());
    micStream?.getTracks().forEach(t => t.stop());
    combinedStream?.getTracks().forEach(t => t.stop());

    if (audioContext && audioContext.state !== 'closed') {
      try {
        audioContext.close();
      } catch {
        /* ignore */
      }
    }

    systemStream = null;
    micStream = null;
    combinedStream = null;
    audioContext = null;
  },

  hasStreams() {
    return systemStream !== null || micStream !== null || combinedStream !== null;
  },
};
