// Shared helper for ASR upload routing.
// We always upload directly to the external ASR API to avoid streaming issues
// with Supabase Edge Functions. The proxy approach caused HTTP/2 stalls.

export const DIRECT_ASR_URL = 'https://api.tivly.se/asr/transcribe';

export type AsrTranscribeTarget = {
  useProxy: false;
  url: string;
};

/**
 * Always returns direct upload target - proxy approach removed due to
 * HTTP/2 streaming issues with Supabase Edge Functions
 */
export function getAsrTranscribeTarget(_fileSizeBytes: number): AsrTranscribeTarget {
  return {
    useProxy: false,
    url: DIRECT_ASR_URL,
  };
}

/**
 * No-op - proxy headers no longer needed since we always use direct upload
 * @deprecated Proxy approach removed
 */
export function applyProxyHeadersToXhr(_xhr: XMLHttpRequest) {
  // No-op - always use direct upload with Bearer token
}
