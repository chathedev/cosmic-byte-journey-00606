import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Check,
  X,
  Loader2,
  Building2,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import {
  PRICING_TIERS,
  maxTier,
  normalizeTier,
  parseEmployeeCountRange,
  tierFromEmployees,
  tierFromMemberLimit,
  type PricingTier,
} from "@/lib/enterprisePricing";

const BACKEND_URL = "https://api.tivly.se";

type Stage = "analyzing" | "suggesting" | "done" | "error";

type Source = {
  label: string;
  detail?: string;
};

interface InvoiceAISuggestionProps {
  companyName: string;
  companyId?: string;
  onAccept: (suggestion: AISuggestion) => void;
  onDecline: () => void;
}

export interface AISuggestion {
  monthlyAmount: number;
  oneTimeAmount?: number;
  pricingTier: PricingTier;
  reasoning: string;
  companyInfo?: string;
  employeeCount?: string;
  factors?: string[];
  sources?: Source[];
}

function friendlyErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message || "";
    if (msg.toLowerCase().includes("unauthorized") || msg.includes("401")) {
      return "Inloggningen gick inte att verifiera. Logga in igen.";
    }
    if (msg.toLowerCase().includes("failed to fetch")) {
      return "Nätverksfel – kunde inte nå tjänsten.";
    }
    return msg;
  }
  return "Ett oväntat fel uppstod.";
}

export function InvoiceAISuggestion({
  companyName,
  companyId,
  onAccept,
  onDecline,
}: InvoiceAISuggestionProps) {
  const [stage, setStage] = useState<Stage>("analyzing");
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void analyzePricing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName, companyId]);

  const analyzePricing = async () => {
    setStage("analyzing");
    setError(null);
    setSuggestion(null);

    try {
      const token = apiClient.getAuthToken();
      if (!token) {
        setError("Du behöver vara inloggad för att få AI-förslag");
        setStage("error");
        return;
      }

      // Fetch enterprise context directly (no LinkedIn call)
      let memberLimit: number | null | undefined = undefined;
      let memberCount: number | undefined = undefined;
      let employeeCountHint: string | undefined = undefined;
      let companyAbout: string | undefined = undefined;

      if (companyId) {
        try {
          const enterpriseResp = await apiClient.getEnterpriseCompany(companyId);
          const enterpriseCompany = enterpriseResp?.company;
          memberLimit =
            enterpriseCompany?.memberLimit ??
            enterpriseCompany?.member_limit ??
            enterpriseCompany?.preferences?.memberLimit ??
            null;
          memberCount = Array.isArray(enterpriseCompany?.members) ? enterpriseCompany.members.length : undefined;
          employeeCountHint =
            enterpriseCompany?.metadata?.employeeCountHint ||
            enterpriseCompany?.metadata?.employeeCount ||
            undefined;
          companyAbout =
            enterpriseCompany?.metadata?.companyAbout ||
            enterpriseCompany?.notes ||
            undefined;
        } catch {
          // best-effort only
        }
      }

      // Floors: ensure we never pick Entry for obvious larger orgs
      const employeesRange = parseEmployeeCountRange(employeeCountHint);
      const floorFromEmployees = tierFromEmployees(employeesRange);
      const floorFromMemberLimit = tierFromMemberLimit(memberLimit);

      // AI pricing suggestion - focus on estimated USERS, not total employees
      const prompt = `Du är en prisrådgivare för Tivly Enterprise.

MÅL: Uppskatta hur många som FAKTISKT kommer använda Tivly och föreslå rätt prisplan.

INPUT:
- Företagsnamn: ${companyName}
- Om företaget: ${companyAbout || "Ej angivet"}
- Antal anställda (ca): ${employeeCountHint || "Ej angivet"}
- Nuvarande medlemmar i teamet: ${memberCount ?? "okänt"}
- Max teamstorlek (memberLimit): ${memberLimit ?? "okänt"}

PRISSÄTTNING (baserat på antal ANVÄNDARE):
- Entry (1–5 användare): 2 000 kr/mån
- Growth (6–10 användare): 3 900 kr/mån
- Core (11–20 användare): 6 900 kr/mån
- Scale (21+ användare): 14 900 kr/mån

VIKTIGT - TÄNK SÅ HÄR:
1. Tivly är ett mötesprotokoll-verktyg
2. INTE alla anställda behöver verktyget - bara de som leder/dokumenterar möten
3. Typiska användare: projektledare, chefer, säljare, konsulter, teamleads
4. Uppskatta REALISTISKT hur många i bolaget som faktiskt kommer använda Tivly
5. Välj prisplan baserat på ESTIMERAT ANTAL ANVÄNDARE, inte totala anställda

EXEMPEL:
- Konsultbolag 50 pers → kanske 15-20 konsulter behöver det → Core
- IT-bolag 100 pers → kanske 10 projektledare → Growth  
- Litet bolag 8 pers → alla kanske använder det → Growth
- Startup 4 pers → Entry

Svara ENDAST med ren JSON (ingen markdown, inga backticks):
{
  "pricingTier": "Entry|Growth|Core|Scale",
  "suggestedAmount": 2000,
  "estimatedUsers": 5,
  "employeeCount": 50,
  "companyInfo": "Kort beskrivning av bolaget",
  "reasoning": "Motivering varför X antal kommer använda verktyget",
  "factors": ["faktor1", "faktor2"]
}`;

      const aiResponse = await fetch(`${BACKEND_URL}/ai/gemini`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt,
          model: "gemini-2.5-flash",
          costUsd: 0.0008,
        }),
      });

      if (!aiResponse.ok) {
        if (aiResponse.status === 401) {
          throw new Error("401");
        }
        throw new Error(`AI request failed (${aiResponse.status})`);
      }

      const aiJson = await aiResponse.json();
      
      // Extract content - handle nested Gemini response structure
      let content: string | undefined;
      if (aiJson.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        content = aiJson.response.candidates[0].content.parts[0].text;
      } else if (aiJson.candidates?.[0]?.content?.parts?.[0]?.text) {
        content = aiJson.candidates[0].content.parts[0].text;
      } else if (typeof aiJson.text === "string") {
        content = aiJson.text;
      } else if (typeof aiJson.response === "string") {
        content = aiJson.response;
      }
      
      if (!content) {
        console.error("[InvoiceAISuggestion] Unexpected AI response structure:", aiJson);
        throw new Error("Inget innehåll i AI-svar");
      }

      // Strip markdown code blocks if present
      const clean = content.replace(/```json\n?|\n?```/g, "").trim();
      let parsed: any;
      try {
        parsed = JSON.parse(clean);
      } catch (parseErr) {
        console.error("[InvoiceAISuggestion] JSON parse failed:", clean);
        throw new Error("Kunde inte tolka AI-svaret (JSON)");
      }

      const aiTier = normalizeTier(parsed.pricingTier);
      const finalTier = maxTier(aiTier, floorFromEmployees, floorFromMemberLimit);
      const finalAmount = PRICING_TIERS[finalTier].price;

      const sources: Source[] = [];
      if (memberCount !== undefined || memberLimit !== undefined || employeeCountHint || companyAbout) {
        sources.push({
          label: "Enterprise-inställning",
          detail: [
            memberCount !== undefined ? `Medlemmar: ${memberCount}` : null,
            memberLimit !== undefined && memberLimit !== null ? `Max: ${memberLimit}` : null,
            employeeCountHint ? `Anställda: ${employeeCountHint}` : null,
          ]
            .filter(Boolean)
            .join(" • ") || undefined,
        });
      }

      setSuggestion({
        monthlyAmount: finalAmount,
        pricingTier: finalTier,
        oneTimeAmount: parsed.oneTimeAmount,
        reasoning:
          typeof parsed.reasoning === "string" && parsed.reasoning.trim()
            ? parsed.reasoning.trim()
            : `Föreslår ${finalTier}-nivå (${finalAmount.toLocaleString("sv-SE")} kr/mån) för ${companyName}.`,
        companyInfo:
          typeof parsed.companyInfo === "string" && parsed.companyInfo.trim()
            ? parsed.companyInfo.trim()
            : companyAbout?.slice(0, 100) || undefined,
        employeeCount:
          typeof parsed.employeeCount === "string" && parsed.employeeCount.trim()
            ? parsed.employeeCount.trim()
            : employeeCountHint,
        factors: Array.isArray(parsed.factors)
          ? parsed.factors.map((x: any) => String(x)).filter(Boolean).slice(0, 4)
          : undefined,
        sources: sources.length ? sources : undefined,
      });

      setStage("suggesting");
    } catch (err) {
      console.error("[InvoiceAISuggestion] pricing analysis failed:", err);
      setError(friendlyErrorMessage(err));
      setStage("error");
    }
  };

  const handleAccept = () => {
    if (!suggestion) return;
    setStage("done");
    onAccept(suggestion);
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stage}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="rounded-xl border bg-gradient-to-br from-card to-card/80 overflow-hidden"
      >
        <header className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">AI-prisförslag</p>
            <p className="text-[10px] text-muted-foreground">Baserat på företagsanalys</p>
          </div>
        </header>

        <main className="p-4">
          {stage === "analyzing" && (
            <section className="flex flex-col items-center py-6 space-y-3" aria-live="polite">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                <div className="relative p-3 rounded-full bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Analyserar {companyName}...</p>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Hämtar info & föreslår prissättning</span>
                </div>
              </div>
            </section>
          )}

          {stage === "suggesting" && suggestion && (
            <section className="space-y-3">
              {/* Minimal company hint */}
              {(suggestion.companyInfo || suggestion.employeeCount) && (
                <div className="text-xs bg-muted/50 rounded-lg p-3 space-y-1">
                  {suggestion.companyInfo && (
                    <div className="text-foreground font-medium line-clamp-2">
                      {suggestion.companyInfo}
                    </div>
                  )}
                  {suggestion.employeeCount && (
                    <div className="text-muted-foreground">
                      Anställda: <span className="font-medium text-foreground">{suggestion.employeeCount}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Price */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <div className="p-2 rounded-full bg-primary/10">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold">
                      {suggestion.monthlyAmount.toLocaleString("sv-SE")}
                    </span>
                    <span className="text-sm text-muted-foreground">kr/mån</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{suggestion.pricingTier}-nivå</p>
                </div>
              </div>

              {/* Reasoning */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {suggestion.reasoning}
              </p>

              {/* Factors (inline, minimal) */}
              {suggestion.factors && suggestion.factors.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestion.factors.map((factor, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                    >
                      {factor}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button onClick={handleAccept} size="sm" className="flex-1 gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Acceptera
                </Button>
                <Button onClick={onDecline} variant="outline" size="sm" className="flex-1 gap-1.5">
                  <X className="h-3.5 w-3.5" />
                  Manuellt
                </Button>
              </div>
            </section>
          )}

          {stage === "error" && (
            <section className="py-4 text-center space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              <div className="flex gap-2">
                <Button onClick={analyzePricing} variant="outline" size="sm" className="flex-1">
                  Försök igen
                </Button>
                <Button onClick={onDecline} variant="outline" size="sm" className="flex-1">
                  Manuellt
                </Button>
              </div>
            </section>
          )}
        </main>
      </motion.div>
    </AnimatePresence>
  );
}
