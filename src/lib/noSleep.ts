/**
 * NoSleep utility: plays a silent audio loop to prevent mobile browsers
 * from suspending the page during long recordings.
 * Works on iOS Safari and Android Chrome.
 */

let audioElement: HTMLAudioElement | null = null;
let isEnabled = false;

// Tiny silent WAV (~44 bytes header + minimal data), base64-encoded
const SILENT_WAV_BASE64 =
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export const noSleep = {
  /** Call on user gesture (e.g. "Start recording" tap) */
  enable() {
    if (isEnabled) return;
    try {
      if (!audioElement) {
        audioElement = new Audio(
          `data:audio/wav;base64,${SILENT_WAV_BASE64}`
        );
        audioElement.loop = true;
        audioElement.volume = 0.001; // essentially silent
        // Required for iOS
        audioElement.setAttribute('playsinline', '');
      }
      audioElement.play().catch(() => {
        /* user gesture required – will retry on next call */
      });
      isEnabled = true;
      console.log('🔇 NoSleep enabled (silent audio loop)');
    } catch {
      /* ignore */
    }
  },

  disable() {
    if (!isEnabled || !audioElement) return;
    try {
      audioElement.pause();
      audioElement.currentTime = 0;
    } catch {
      /* ignore */
    }
    isEnabled = false;
    console.log('🔇 NoSleep disabled');
  },

  get active() {
    return isEnabled;
  },
};
