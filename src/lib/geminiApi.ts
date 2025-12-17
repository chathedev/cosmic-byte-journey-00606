import { supabase } from "@/integrations/supabase/client";

const API_BASE_URL = "https://api.tivly.se";

export type GeminiModel = 
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite"
  | "gemini-2.5-pro"
  | "gemini-2.0"
  | "gemini-1.0";

export interface GeminiRequest {
  prompt: string;
  model?: GeminiModel;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiResponse {
  success: boolean;
  model: string;
  response: {
    candidates?: Array<{
      output?: { text?: string };
      content?: {
        parts?: Array<{ text?: string }>;
      };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
}

export interface GeminiError {
  error: string;
  message?: string;
}

/**
 * Get the auth token for API requests
 */
async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }
  return session.access_token;
}

/**
 * Call the Gemini AI endpoint via api.tivly.se backend.
 * 
 * Uses gemini-2.5-flash for enterprise users and gemini-2.5-flash-lite for regular users by default.
 * 
 * @param request - The request parameters
 * @param isEnterprise - Whether to use the enterprise model (gemini-2.5-flash)
 * @returns The Gemini response
 * @throws Error if the request fails
 */
export async function generateWithGemini(
  request: GeminiRequest, 
  isEnterprise = false
): Promise<GeminiResponse> {
  const token = await getAuthToken();

  // Set default model based on enterprise status if not specified
  const model = request.model || (isEnterprise ? "gemini-2.5-flash" : "gemini-2.5-flash-lite");

  const response = await fetch(`${API_BASE_URL}/ai/gemini`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...request,
      model,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as GeminiError;
    
    if (response.status === 400 && errorData.error === "prompt_required") {
      throw new Error("A prompt is required");
    }
    
    if (response.status === 502) {
      throw new Error(errorData.message || "Gemini API error - please try again later");
    }
    
    throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Extract text from Gemini response
 */
export function extractText(response: GeminiResponse): string {
  // Try the newer format first
  const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) return text;
  
  // Fall back to older format
  return response.response?.candidates?.[0]?.output?.text || "";
}

/**
 * Simple helper to generate text with Gemini using sensible defaults.
 * 
 * @param prompt - The prompt to send to Gemini
 * @param isEnterprise - Whether to use the enterprise model (gemini-2.5-flash)
 * @returns The generated text
 */
export async function generateText(prompt: string, isEnterprise = false): Promise<string> {
  const response = await generateWithGemini({ prompt }, isEnterprise);
  return extractText(response);
}

/**
 * Generate text with a specific model.
 * 
 * @param prompt - The prompt to send to Gemini
 * @param model - The specific Gemini model to use
 * @param options - Additional options (temperature, maxOutputTokens)
 * @returns The generated text
 */
export async function generateTextWithModel(
  prompt: string,
  model: GeminiModel,
  options?: { temperature?: number; maxOutputTokens?: number }
): Promise<string> {
  const response = await generateWithGemini({
    prompt,
    model,
    ...options,
  });
  return extractText(response);
}
