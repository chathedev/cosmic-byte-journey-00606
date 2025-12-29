import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Check,
  X,
  Loader2,
  Building2,
  TrendingUp,
  ExternalLink,
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
  url?: string;
  detail?: string;
  fetchedAt?: string;
  cached?: boolean;
};

type LinkedInCompanyData = {
  companyName?: string;
  companyUrl?: string;
  tagline?: string;
  taglineItems?: string[];
  employees?: string;
  fetchedAt?: string;
  cached?: boolean;
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
  valuation?: string;
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
  const [linkedIn, setLinkedIn] = useState<LinkedInCompanyData | null>(null);

  useEffect(() => {
    void analyzePricing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName, companyId]);

  const displayEmployeeCount = useMemo(() => {
    return suggestion?.employeeCount || linkedIn?.employees;
  }, [suggestion?.employeeCount, linkedIn?.employees]);

  const analyzePricing = async () => {
    setStage("analyzing");
    setError(null);
    setSuggestion(null);
    setLinkedIn(null);

    try {
      const token = apiClient.getAuthToken();
      if (!token) {
        setError("Du behöver vara inloggad för att få AI-förslag");
        setStage("error");
        return;
      }

      // 1) Enterprise context (memberLimit + member count + optional employee hint)
      let memberLimit: number | null | undefined = undefined;
      let memberCount: number | undefined = undefined;
      let employeeCountHint: string | undefined = undefined;
      let companyMetaInfo: string | undefined = undefined;

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
          companyMetaInfo = enterpriseCompany?.notes || undefined;
        } catch {
          // best-effort only
        }
      }

      // 2) LinkedIn prefetch
      let linkedInData: LinkedInCompanyData | null = null;
      try {
        const liRes = await fetch(`${BACKEND_URL}/linkedin/company`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ companyName }),
        });

        if (liRes.ok) {
          const liJson = await liRes.json();
          linkedInData = (liJson?.data || liJson) as LinkedInCompanyData;
          setLinkedIn(linkedInData);
        }
      } catch {
        // Ignore LinkedIn failures; AI can still proceed.
      }

      // Floors: ensure we never pick Entry for obvious larger orgs.
      const employeesRaw =
        linkedInData?.employees || employeeCountHint || undefined;
      const employeesRange = parseEmployeeCountRange(employeesRaw);
      const floorFromEmployees = tierFromEmployees(employeesRange);
      const floorFromMemberLimit = tierFromMemberLimit(memberLimit);

      // 3) AI pricing suggestion
      const prompt = `Du är en prisrådgivare för Tivly Enterprise.

MÅL: Föreslå RIMLIGT pris baserat på bolagets sannolika storlek och behov. Om du är osäker, välj hellre för högt än för lågt.

INPUT (KÄLLOR):
- Företagsnamn: ${companyName}
- LinkedIn (om tillgängligt):
  - URL: ${linkedInData?.companyUrl ?? "okänt"}
  - Tagline: ${linkedInData?.tagline ?? "okänt"}
  - Anställda: ${linkedInData?.employees ?? "okänt"}
- Enterprise-kontekst (internt):
  - Nuvarande medlemmar i teamet: ${memberCount ?? "okänt"}
  - Max teamstorlek (memberLimit): ${memberLimit ?? "okänt"}
  - Admin-notes (om finns): ${companyMetaInfo ? companyMetaInfo.slice(0, 300) : "-"}

PRISSÄTTNING (tiers):
- Entry (1–5 användare): 2 000 kr/mån
- Growth (6–10 användare): 3 900 kr/mån
- Core (11–20 användare): 6 900 kr/mån
- Scale (21+ användare): 14 900 kr/mån

REGLER:
- Entry (2 000) får bara föreslås om bolaget sannolikt är mycket litet (<10 anställda) och inga signaler tyder på större behov.
- Om anställda > 20: minst Growth.
- Om anställda > 50: minst Core.
- Om memberLimit finns: respektera det som stark signal för tier.

Svara ENDAST med JSON (ingen markdown):
{
  "pricingTier": "Entry|Growth|Core|Scale",
  "suggestedAmount": 2000,
  "employeeCount": "<t.ex. '200-500' eller 'ca 70'>",
  "companyInfo": "<1 mening: vad bolaget gör>",
  "reasoning": "<1 mening: varför denna tier>",
  "factors": ["<kort faktor>", "<kort faktor>", "<kort faktor>"]
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
      const content = aiJson.text || aiJson.response;
      if (!content) {
        throw new Error("Inget innehåll i AI-svar");
      }

      const clean = String(content).replace(/```json\n?|\n?```/g, "").trim();
      let parsed: any;
      try {
        parsed = typeof clean === "string" ? JSON.parse(clean) : clean;
      } catch {
        throw new Error("Kunde inte tolka AI-svaret (JSON)");
      }

      const aiTier = normalizeTier(parsed.pricingTier);
      const finalTier = maxTier(aiTier, floorFromEmployees, floorFromMemberLimit);
      const finalAmount = PRICING_TIERS[finalTier].price;

      const sources: Source[] = [];
      if (linkedInData?.companyUrl || linkedInData?.employees || linkedInData?.tagline) {
        sources.push({
          label: "LinkedIn",
          url: linkedInData.companyUrl,
          detail: [linkedInData.tagline, linkedInData.employees].filter(Boolean).join(" • ") || undefined,
          fetchedAt: linkedInData.fetchedAt,
          cached: linkedInData.cached,
        });
      }

      if (memberLimit !== undefined || memberCount !== undefined || employeeCountHint) {
        sources.push({
          label: "Enterprise-inställning",
          detail: [
            memberCount !== undefined ? `Nuvarande medlemmar: ${memberCount}` : null,
            memberLimit !== undefined && memberLimit !== null ? `MemberLimit: ${memberLimit}` : memberLimit === null ? "MemberLimit: obegränsat" : null,
            employeeCountHint ? `Admin-hint anställda: ${employeeCountHint}` : null,
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
            : linkedInData?.tagline || undefined,
        valuation: typeof parsed.approxValuation === "string" ? parsed.approxValuation : undefined,
        employeeCount:
          typeof parsed.employeeCount === "string" && parsed.employeeCount.trim()
            ? parsed.employeeCount.trim()
            : linkedInData?.employees || employeeCountHint,
        factors: Array.isArray(parsed.factors)
          ? parsed.factors.map((x: any) => String(x)).filter(Boolean).slice(0, 5)
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
              {(suggestion.companyInfo || displayEmployeeCount) && (
                <div className="text-xs bg-muted/50 rounded-lg p-3 space-y-1.5">
                  {suggestion.companyInfo && (
                    <div className="text-foreground font-medium line-clamp-2">
                      {suggestion.companyInfo}
                    </div>
                  )}
                  {displayEmployeeCount && (
                    <div className="text-muted-foreground">
                      Anställda: <span className="font-medium text-foreground">{displayEmployeeCount}</span>
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
                  <p className="text-xs text-muted-foreground">
                    {suggestion.pricingTier}-nivå
                    {suggestion.oneTimeAmount && suggestion.oneTimeAmount > 0 && (
                      <span> + {suggestion.oneTimeAmount.toLocaleString("sv-SE")} kr engång</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Reasoning */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {suggestion.reasoning}
              </p>

              {/* Details (collapsed by default) */}
              {(suggestion.factors?.length || suggestion.sources?.length) ? (
                <details className="rounded-lg border bg-muted/20 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
                    Visa detaljer
                  </summary>
                  <div className="pt-2 space-y-3">
                    {suggestion.factors && suggestion.factors.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                          Faktorer
                        </p>
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
                      </div>
                    )}

                    {suggestion.sources && suggestion.sources.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                          Källor
                        </p>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {suggestion.sources.map((s, i) => (
                            <li key={i} className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium text-foreground">{s.label}</div>
                                {s.detail && <div className="text-muted-foreground break-words">{s.detail}</div>}
                                {s.fetchedAt && (
                                  <div className="text-[10px] text-muted-foreground">
                                    {new Date(s.fetchedAt).toLocaleString("sv-SE")}
                                    {typeof s.cached === "boolean" ? (s.cached ? " • cache" : "") : ""}
                                  </div>
                                )}
                              </div>
                              {s.url && (
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Länk
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              ) : null}

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
