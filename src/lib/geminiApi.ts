import { supabase } from "@/integrations/supabase/client";

export type GeminiModel = 
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite"
  | "gemini-2.5-pro"
  | "gemini-2.0-flash"
  | "gemini-1.5-flash"
  | "gemini-1.5-pro";

export interface GeminiRequest {
  prompt: string;
  model?: GeminiModel;
  temperature?: number;
  maxOutputTokens?: number;
  isEnterprise?: boolean;
}

export interface GeminiResponse {
  success: boolean;
  model: string;
  text: string;
  response: {
    candidates?: Array<{
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
  message: string;
  status?: number;
}

/**
 * Call the Gemini AI endpoint via Supabase edge function.
 * 
 * Uses gemini-2.5-flash for enterprise users and gemini-2.5-flash-lite for regular users by default.
 * 
 * @param request - The request parameters
 * @returns The Gemini response with generated text
 * @throws Error if the request fails
 */
export async function generateWithGemini(request: GeminiRequest): Promise<GeminiResponse> {
  const { data, error } = await supabase.functions.invoke<GeminiResponse | GeminiError>("ai-gemini", {
    body: request,
  });

  if (error) {
    console.error("Gemini API error:", error);
    throw new Error(error.message || "Failed to call Gemini API");
  }

  if (!data) {
    throw new Error("No response from Gemini API");
  }

  // Check if response is an error
  if ("error" in data && !("success" in data)) {
    const errorData = data as GeminiError;
    throw new Error(errorData.message || errorData.error);
  }

  return data as GeminiResponse;
}

/**
 * Simple helper to generate text with Gemini using sensible defaults.
 * 
 * @param prompt - The prompt to send to Gemini
 * @param isEnterprise - Whether to use the enterprise model (gemini-2.5-flash)
 * @returns The generated text
 */
export async function generateText(prompt: string, isEnterprise = false): Promise<string> {
  const response = await generateWithGemini({ prompt, isEnterprise });
  return response.text;
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
  return response.text;
}
