import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UPSTREAM_URL = "https://api.tivly.se/asr/transcribe";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();

  try {
    const formData = await req.formData();

    const traceId = (formData.get("traceId") as string | null) ?? undefined;
    const backendAuthToken = (formData.get("backendAuthToken") as string | null) ?? "";
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      console.error("❌ asr-transcribe-proxy: missing audio file", { traceId });
      return new Response(JSON.stringify({ error: "Missing audio file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log request metadata (never log the token)
    const keys: string[] = [];
    for (const k of formData.keys()) keys.push(k);

    console.log("📥 asr-transcribe-proxy request", {
      traceId,
      fileName: audio.name,
      size: audio.size,
      type: audio.type,
      hasAuthToken: backendAuthToken.length > 0,
      fields: keys,
    });

    // Rebuild form data for upstream (exclude backendAuthToken)
    const upstreamForm = new FormData();
    for (const [key, value] of formData.entries()) {
      if (key === "backendAuthToken") continue;
      // Keep file metadata
      if (value instanceof File) {
        upstreamForm.append(key, value, value.name);
      } else {
        upstreamForm.append(key, String(value));
      }
    }

    const upstreamHeaders: HeadersInit = {};
    if (backendAuthToken) {
      upstreamHeaders["Authorization"] = `Bearer ${backendAuthToken}`;
    }

    const upstreamRes = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: upstreamHeaders,
      body: upstreamForm,
    });

    const upstreamText = await upstreamRes.text();
    const durationMs = Date.now() - startedAt;

    console.log("📤 asr-transcribe-proxy upstream response", {
      traceId,
      status: upstreamRes.status,
      durationMs,
      preview: upstreamText.slice(0, 500),
    });

    const contentType = upstreamRes.headers.get("content-type") || "application/json";

    return new Response(upstreamText, {
      status: upstreamRes.status,
      headers: { ...corsHeaders, "Content-Type": contentType },
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    console.error("❌ asr-transcribe-proxy error", {
      durationMs,
      message: err instanceof Error ? err.message : String(err),
    });

    return new Response(JSON.stringify({ error: "Proxy failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
