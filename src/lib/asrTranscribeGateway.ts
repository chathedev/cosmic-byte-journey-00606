// Shared helper for ASR upload routing.
// Some environments experience HTTP/2 transport errors when uploading directly to the external ASR endpoint.
// We route *small* uploads via a Lovable Cloud backend function proxy for reliability,
// while keeping direct upload for large files to avoid edge body-size limits.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const ASR_TRANSCRIBE_PROXY_MAX_BYTES = 20 * 1024 * 1024; // 20MB

export type AsrTranscribeTarget = {
  useProxy: boolean;
  url: string;
};

export function getAsrTranscribeTarget(fileSizeBytes: number): AsrTranscribeTarget {
  const canProxy = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  const useProxy = canProxy && fileSizeBytes <= ASR_TRANSCRIBE_PROXY_MAX_BYTES;

  return {
    useProxy,
    url: useProxy
      ? `${SUPABASE_URL}/functions/v1/asr-transcribe-proxy`
      : `https://api.tivly.se/asr/transcribe`,
  };
}

export function applyProxyHeadersToXhr(xhr: XMLHttpRequest) {
  if (!SUPABASE_ANON_KEY) return;
  xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
  xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
}
