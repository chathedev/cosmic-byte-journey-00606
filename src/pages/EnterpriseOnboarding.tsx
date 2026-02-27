import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Check, Shield, ArrowRight, Loader2, AlertCircle, CheckCircle2, Minus, Plus, Info, Mail, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  validateOnboarding,
  saveDraft,
  getDraft,
  subscribeDraft,
  startTrial,
  type OnboardingFormData,
  type ValidationResponse,
} from '@/lib/enterpriseOnboardingApi';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

/* ─── No hardcoded Stripe key — loaded from backend response ─── */

const PLANS = [
  { id: 'enterprise_small' as const, name: 'Small', priceSek: 2490, seats: 10, activationSek: 4900 },
  { id: 'enterprise_standard' as const, name: 'Standard', priceSek: 5990, seats: 30, activationSek: 9900 },
];

const EXTRA_SEAT_PRICE = 249;
const STEPS = ['Teamstorlek', 'Plan', 'Uppgifter', 'Bekräfta', 'Betalkort'];
const DRAFT_KEY = 'tivly_enterprise_draft';
const FORM_KEY = 'tivly_enterprise_form';

function saveStorageJSON(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  try { localStorage.setItem(key, serialized); } catch {}
  try { sessionStorage.setItem(key, serialized); } catch {}
}

function readStorageJSON<T>(key: string): T | null {
  try {
    const local = localStorage.getItem(key);
    if (local) return JSON.parse(local) as T;
  } catch {}
  try {
    const session = sessionStorage.getItem(key);
    if (session) return JSON.parse(session) as T;
  } catch {}
  return null;
}

function removeStorageKey(key: string) {
  try { localStorage.removeItem(key); } catch {}
  try { sessionStorage.removeItem(key); } catch {}
}

function saveDraftLocal(draftId: string, resumeToken: string) {
  saveStorageJSON(DRAFT_KEY, { draftId, resumeToken });
}

function loadDraftLocal(): { draftId: string; resumeToken: string } | null {
  return readStorageJSON<{ draftId: string; resumeToken: string }>(DRAFT_KEY);
}

function clearDraftLocal() { removeStorageKey(DRAFT_KEY); }
function clearFormLocal() { removeStorageKey(FORM_KEY); }

function fmt(n: number) { return n.toLocaleString('sv-SE'); }

function extractSetupIntentClientSecret(payload: any): string | null {
  return (
    payload?.billing?.setupIntentClientSecret ||
    payload?.setupIntentClientSecret ||
    payload?.clientSecret ||
    payload?.client_secret ||
    null
  );
}

function extractStripePublishableKey(payload: any): string | null {
  return payload?.billing?.stripePublishableKey || null;
}

export default function EnterpriseOnboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Partial<OnboardingFormData>>({
    companyName: '', workEmail: '', planType: 'enterprise_small',
    organizationNumber: '', countryCode: 'SE', contactName: '',
    contactPhone: '', websiteUrl: '', expectedSeats: 5,
    acceptedTerms: false, authorizedSignatory: false,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fieldChecks, setFieldChecks] = useState<Record<string, boolean>>({});
  const [availability, setAvailability] = useState<ValidationResponse['validation']['availability']>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [allDone, setAllDone] = useState(false);
  const [completedEmail, setCompletedEmail] = useState('');
  const [draftId, setDraftId] = useState<string | undefined>();
  const [resumeToken, setResumeToken] = useState<string | undefined>();
  const [setupIntentClientSecret, setSetupIntentClientSecret] = useState<string | null>(null);
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null);

  const validateTimer = useRef<ReturnType<typeof setTimeout>>();
  const draftTimer = useRef<ReturnType<typeof setTimeout>>();
  const initialMountRef = useRef(true);
  const draftIdRef = useRef(draftId);
  const resumeTokenRef = useRef(resumeToken);
  const formRef = useRef(form);
  const stepRef = useRef(step);
  const hasUserInteractedRef = useRef(false);

  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);
  useEffect(() => { resumeTokenRef.current = resumeToken; }, [resumeToken]);
  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => { stepRef.current = step; }, [step]);

  const saveFormLocal = useCallback((f: Partial<OnboardingFormData>, s: number) => {
    saveStorageJSON(FORM_KEY, { form: f, step: s, touched: hasUserInteractedRef.current, updatedAt: Date.now() });
  }, []);

  // Load draft or local form on mount
  useEffect(() => {
    const hasRestorableProgress = (f: Partial<OnboardingFormData>, s = 0) => {
      const hasRealData = !!(f.companyName || f.workEmail || f.contactName || f.organizationNumber);
      const changedFromDefaults = Number(f.expectedSeats ?? 5) !== 5 || (f.planType && f.planType !== 'enterprise_small') || !!f.acceptedTerms || !!f.authorizedSignatory;
      return hasRealData || changedFromDefaults || s > 0;
    };

    const local = loadDraftLocal();
    if (local) {
      getDraft(local.draftId, local.resumeToken)
        .then((res) => {
          setDraftId(res.draft.id);
          setResumeToken(res.draft.resumeToken);
          const raw = res.draft.rawFields || {};
          const restored = { ...form, ...raw, expectedSeats: raw.expectedSeats ? Number(raw.expectedSeats) : form.expectedSeats };
          const restoredStep = Math.min(res.draft.progress?.step ?? 0, 3);
          if (hasRestorableProgress(restored, restoredStep)) {
            hasUserInteractedRef.current = true;
            setForm(restored);
            if (restoredStep > 0) setStep(restoredStep);
          } else { restoreFromLocal(); }
        })
        .catch(() => { clearDraftLocal(); restoreFromLocal(); });
    } else { restoreFromLocal(); }

    function restoreFromLocal() {
      const parsed = readStorageJSON<{ form?: Partial<OnboardingFormData>; step?: number; touched?: boolean }>(FORM_KEY);
      if (!parsed?.form) return;
      const restoredStep = Math.min(parsed.step ?? 0, 3);
      if (hasRestorableProgress(parsed.form, restoredStep)) {
        hasUserInteractedRef.current = true;
        setForm(prev => ({ ...prev, ...parsed.form }));
        if (restoredStep > 0) setStep(restoredStep);
      }
    }
  }, []);

  const triggerValidation = useCallback((fields: Partial<OnboardingFormData>) => {
    clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(async () => {
      setIsValidating(true);
      try {
        const res = await validateOnboarding(fields);
        setFieldErrors(res.validation?.errors || {});
        setFieldChecks(res.validation?.checks || {});
        setAvailability(res.validation?.availability || {});
      } catch {}
      setIsValidating(false);
    }, 400);
  }, []);

  const triggerDraftSave = useCallback((fields: Partial<OnboardingFormData>, currentStep: number) => {
    saveFormLocal(fields, currentStep);
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        const res = await saveDraft({
          ...fields, draftId: draftIdRef.current, resumeToken: resumeTokenRef.current,
          progressStep: currentStep, progressPercent: Math.round(((currentStep + 1) / STEPS.length) * 100),
        });
        if (res.draft) {
          setDraftId(res.draft.id);
          setResumeToken(res.draft.resumeToken);
          saveDraftLocal(res.draft.id, res.draft.resumeToken);
        }
      } catch {}
      setIsSaving(false);
    }, 800);
  }, [saveFormLocal]);

  const updateField = (field: string, value: any) => {
    hasUserInteractedRef.current = true;
    const next = { ...form, [field]: value };
    setForm(next);
    if (step >= 2) triggerValidation(next as Partial<OnboardingFormData>);
    triggerDraftSave(next as Partial<OnboardingFormData>, step);
  };

  useEffect(() => {
    const seats = form.expectedSeats || 5;
    if (seats <= 10) setForm(prev => ({ ...prev, planType: 'enterprise_small' }));
    else setForm(prev => ({ ...prev, planType: 'enterprise_standard' }));
  }, [form.expectedSeats]);

  useEffect(() => {
    if (initialMountRef.current) return;
    hasUserInteractedRef.current = true;
    saveFormLocal(form, step);
    if (step < 4) triggerDraftSave(form as Partial<OnboardingFormData>, step);
    if (step >= 2 && step < 4) triggerValidation(form as Partial<OnboardingFormData>);
  }, [step]);

  useEffect(() => {
    if (initialMountRef.current) { initialMountRef.current = false; return; }
    if (!hasUserInteractedRef.current) return;
    saveFormLocal(form, step);
  }, [form, step, saveFormLocal]);

  useEffect(() => {
    const handler = () => {
      const f = formRef.current;
      const s = stepRef.current;
      saveStorageJSON(FORM_KEY, { form: f, step: s, touched: hasUserInteractedRef.current, updatedAt: Date.now() });
      if (f.companyName || f.workEmail) {
        navigator.sendBeacon?.('https://api.tivly.se/enterprise/onboarding/draft',
          new Blob([JSON.stringify({
            ...f, countryCode: 'SE', draftId: draftIdRef.current, resumeToken: resumeTokenRef.current,
            progressStep: s, progressPercent: Math.round(((s + 1) / STEPS.length) * 100),
          })], { type: 'application/json' }));
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const selectedPlan = PLANS.find(p => p.id === form.planType) || PLANS[0];
  const seats = form.expectedSeats || 5;
  const extraSeats = Math.max(0, seats - selectedPlan.seats);
  const monthlyTotal = selectedPlan.priceSek + extraSeats * EXTRA_SEAT_PRICE;

  const orgTaken = availability?.organizationNumberAvailable === false;
  const emailTaken = availability?.workEmailAvailable === false;

  const canProceedStep2 = form.companyName && form.organizationNumber && form.contactName && form.workEmail && form.contactPhone
    && !fieldErrors.companyName && !fieldErrors.organizationNumber && !fieldErrors.contactName && !fieldErrors.workEmail && !fieldErrors.contactPhone
    && !orgTaken && !emailTaken;
  const canProceedStep3 = form.acceptedTerms && form.authorizedSignatory && canProceedStep2;

  // Step 3 → Step 4: validate + save + subscribe payment + then show card form
  const handleConfirmAndProceedToCard = async () => {
    setSubmitError('');
    setIsSubmitting(true);
    setSetupIntentClientSecret(null);
    setStripePublishableKey(null);

    try {
      clearTimeout(draftTimer.current);

      const valRes = await validateOnboarding({ ...form, requireCommitments: true } as any);
      if (!valRes.valid) {
        setFieldErrors(valRes.validation?.errors || {});
        setFieldChecks(valRes.validation?.checks || {});
        setAvailability(valRes.validation?.availability || {});
        setSubmitError('Vänligen korrigera felen innan du fortsätter.');
        setIsSubmitting(false);
        return;
      }

      const draftRes = await saveDraft({
        ...form,
        countryCode: 'SE',
        draftId: draftIdRef.current,
        resumeToken: resumeTokenRef.current,
        progressStep: 3,
        progressPercent: 80,
      } as any);

      const ensuredDraftId = draftRes.draft?.id;
      const ensuredResumeToken = draftRes.draft?.resumeToken || resumeTokenRef.current;

      if (!ensuredDraftId || !ensuredResumeToken) {
        setSubmitError('Kunde inte spara onboarding. Försök igen.');
        setIsSubmitting(false);
        return;
      }

      setDraftId(ensuredDraftId);
      setResumeToken(ensuredResumeToken);
      saveDraftLocal(ensuredDraftId, ensuredResumeToken);
      draftIdRef.current = ensuredDraftId;
      resumeTokenRef.current = ensuredResumeToken;

      // Call /enterprise/onboarding/subscribe (draft-level, pre-trial)
      const subscribeRes = await subscribeDraft(ensuredDraftId, ensuredResumeToken);
      const billing = subscribeRes?.billing;
      const secret = extractSetupIntentClientSecret(subscribeRes);
      const pkKey = extractStripePublishableKey(subscribeRes);

      // If card is already saved, skip to trial start
      if (billing?.readyForTrialStart || billing?.paymentMethodSaved) {
        setSetupIntentClientSecret(null);
        setStripePublishableKey(pkKey);
        setStep(4);
        return;
      }

      // Stripe key-pair mismatch check
      if (!pkKey) {
        setSubmitError('Stripe-konfigurationsfel (publishable key saknas i svaret). Kontakta support.');
        setIsSubmitting(false);
        return;
      }

      if (!secret) {
        setSubmitError('Kunde inte initiera kortregistrering. Försök igen.');
        setIsSubmitting(false);
        return;
      }

      setStripePublishableKey(pkKey);
      setSetupIntentClientSecret(secret);
      setStep(4);
    } catch (err: any) {
      const status = err?.status;
      const code = err?.code || err?.error;
      if (status === 503 && (code === 'stripe_key_mismatch' || code === 'stripe_publishable_key_missing')) {
        setSubmitError('Stripe-konfigurationsfel på serversidan. Kontakta support@tivly.se.');
      } else {
        setSubmitError(err?.message || err?.error || 'Kunde inte initiera betalningssteget. Försök igen.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Called after card confirmed — starts trial
  const handleCardConfirmedStartTrial = async () => {
    try {
      const res = await startTrial({ ...(form as OnboardingFormData), draftId, resumeToken });
      setCompletedEmail(res.invitation?.email || form.workEmail || '');
      clearDraftLocal();
      clearFormLocal();
      setAllDone(true);
    } catch (err: any) {
      throw err;
    }
  };

  // Final done screen
  if (allDone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="max-w-md w-full">
          <div className="text-center mb-8">
            <span className="text-[11px] font-semibold tracking-[0.3em] uppercase text-foreground">Tivly Enterprise</span>
          </div>
          <div className="border border-border bg-card rounded-lg p-8 space-y-6">
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-full bg-foreground/5 border border-border flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-foreground" />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold text-foreground">Allt klart!</h1>
              <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
                Trial aktiverad och betalkort sparat. Debitering sker automatiskt efter 7 dagar.
              </p>
            </div>
            <Separator />
            <div className="space-y-2.5 text-[13px] text-muted-foreground">
              <div className="flex items-start gap-3">
                <span className="text-foreground font-semibold text-sm">1</span>
                <span>Öppna inbjudan i din mejl (<span className="text-foreground font-medium">{completedEmail}</span>)</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-foreground font-semibold text-sm">2</span>
                <span>Klicka på länken och logga in</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-foreground font-semibold text-sm">3</span>
                <span>Bjud in ditt team och börja använda Tivly</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-center text-muted-foreground mt-6">© {new Date().getFullYear()} Tivly AB</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-[0.3em] uppercase text-foreground">Tivly Enterprise</span>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {isSaving && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Sparar</span>}
            {!isSaving && draftId && step < 4 && <span className="flex items-center gap-1"><Check className="h-3 w-3" />Sparat</span>}
            <span className="text-muted-foreground/60">Steg {step + 1}/{STEPS.length}</span>
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="flex gap-1.5">
          {STEPS.map((label, i) => (
            <div key={i} className={cn('h-0.5 flex-1 rounded-full transition-colors', i <= step ? 'bg-foreground' : 'bg-border')} />
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {STEPS.map((label, i) => (
            <span key={i} className={cn('text-[10px] tracking-wide', i <= step ? 'text-foreground font-medium' : 'text-muted-foreground/50')}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
            {step === 0 && <StepTeamSize seats={seats} onChange={(v) => updateField('expectedSeats', v)} />}
            {step === 1 && <StepPlan form={form} selectedPlan={selectedPlan} extraSeats={extraSeats} monthlyTotal={monthlyTotal} updateField={updateField} />}
            {step === 2 && <StepDetails form={form} fieldErrors={fieldErrors} fieldChecks={fieldChecks} availability={availability} isValidating={isValidating} updateField={updateField} />}
            {step === 3 && <StepConfirm form={form} selectedPlan={selectedPlan} monthlyTotal={monthlyTotal} extraSeats={extraSeats} updateField={updateField} submitError={submitError} />}
            {step === 4 && draftId && resumeToken && (
              <StepCard
                draftId={draftId}
                resumeToken={resumeToken}
                initialClientSecret={setupIntentClientSecret}
                stripePublishableKey={stripePublishableKey}
                email={form.workEmail || ''}
                monthlyTotal={monthlyTotal}
                planBaseSek={selectedPlan.priceSek}
                activationFeeSek={selectedPlan.activationSek}
                includedSeats={selectedPlan.seats}
                expectedSeats={seats}
                extraSeats={extraSeats}
                onCardConfirmed={handleCardConfirmedStartTrial}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation — steps 0-2 */}
        {step < 3 && (
          <div className="flex items-center justify-between mt-10">
            <Button variant="ghost" size="sm" onClick={() => { hasUserInteractedRef.current = true; setStep(s => s - 1); }} disabled={step === 0} className="gap-1.5 text-muted-foreground no-hover-lift">
              <ChevronLeft className="h-4 w-4" /> Tillbaka
            </Button>
            <Button size="sm" onClick={() => { hasUserInteractedRef.current = true; setStep(s => s + 1); }} disabled={step === 2 && !canProceedStep2} className="gap-1.5 bg-foreground text-background hover:bg-foreground/90 no-hover-lift">
              Nästa <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        {/* Navigation — step 3 (confirm → card) */}
        {step === 3 && (
          <div className="flex items-center justify-between mt-10">
            <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="gap-1.5 text-muted-foreground no-hover-lift">
              <ChevronLeft className="h-4 w-4" /> Tillbaka
            </Button>
            <Button size="sm" onClick={handleConfirmAndProceedToCard} disabled={!canProceedStep3 || isSubmitting} className="gap-1.5 min-w-[160px] bg-foreground text-background hover:bg-foreground/90 no-hover-lift">
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Validerar...</> : <>Fortsätt till betalning <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </div>
        )}
      </main>

      <footer className="max-w-2xl mx-auto px-4 pb-8 pt-4">
        <p className="text-[10px] text-muted-foreground text-center">
          © {new Date().getFullYear()} Tivly · <a href="https://www.tivly.se/enterprise-villkor" target="_blank" rel="noopener noreferrer" className="underline">Villkor</a> · <a href="https://www.tivly.se/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">Integritet</a>
        </p>
      </footer>
    </div>
  );
}

/* ─── STEP 0: Team Size ─── */
function StepTeamSize({ seats, onChange }: { seats: number; onChange: (v: number) => void }) {
  const presets = [5, 10, 15, 25, 50];
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Hur stort är ert team?</h2>
        <p className="text-[13px] text-muted-foreground mt-1">Vi rekommenderar en plan baserat på ert behov.</p>
      </div>
      <div className="flex items-center justify-center gap-6 py-8">
        <button onClick={() => onChange(Math.max(1, seats - 1))} className="h-10 w-10 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors no-hover-lift">
          <Minus className="h-4 w-4" />
        </button>
        <div className="text-center">
          <span className="text-5xl font-bold text-foreground tabular-nums">{seats}</span>
          <p className="text-[13px] text-muted-foreground mt-1">användare</p>
        </div>
        <button onClick={() => onChange(Math.min(500, seats + 1))} className="h-10 w-10 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors no-hover-lift">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-center gap-2">
        {presets.map(n => (
          <button key={n} onClick={() => onChange(n)} className={cn('px-4 py-2 rounded-lg text-[13px] font-medium transition-colors border no-hover-lift', seats === n ? 'bg-foreground text-background border-foreground' : 'bg-card border-border text-muted-foreground hover:border-foreground/30')}>
            {n}
          </button>
        ))}
      </div>
      <p className="text-center text-[13px] text-muted-foreground">
        {seats <= 10 ? 'Rekommenderad plan: Small' : 'Rekommenderad plan: Standard'}
      </p>
    </div>
  );
}

/* ─── STEP 1: Plan ─── */
function StepPlan({ form, selectedPlan, extraSeats, monthlyTotal, updateField }: {
  form: Partial<OnboardingFormData>; selectedPlan: typeof PLANS[0]; extraSeats: number; monthlyTotal: number; updateField: (f: string, v: any) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Välj plan</h2>
        <p className="text-[13px] text-muted-foreground mt-1">7 dagars kostnadsfri trial. Betalkort krävs innan trial startar.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {PLANS.map(plan => {
          const isSelected = form.planType === plan.id;
          return (
            <button key={plan.id} onClick={() => updateField('planType', plan.id)} className={cn('text-left rounded-lg border p-5 transition-all no-hover-lift', isSelected ? 'border-foreground bg-foreground/[0.03]' : 'border-border hover:border-foreground/30')}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-foreground">{plan.name}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{plan.seats} användare inkl.</p>
                </div>
                <div className={cn('h-5 w-5 rounded-full border-2 flex items-center justify-center', isSelected ? 'border-foreground' : 'border-border')}>
                  {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-foreground" />}
                </div>
              </div>
              <p className="mt-3">
                <span className="text-2xl font-bold text-foreground">{fmt(plan.priceSek)}</span>
                <span className="text-[13px] text-muted-foreground"> SEK/mån</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Aktivering {fmt(plan.activationSek)} SEK (engångsavgift)</p>
            </button>
          );
        })}
      </div>

      {/* Cost summary */}
      <div className="rounded-lg border border-border p-4 space-y-2 text-[13px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Plan {selectedPlan.name}</span>
          <span className="text-foreground">{fmt(selectedPlan.priceSek)} SEK/mån</span>
        </div>
        {extraSeats > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{extraSeats} extra användare × {fmt(EXTRA_SEAT_PRICE)} SEK</span>
            <span className="text-foreground">{fmt(extraSeats * EXTRA_SEAT_PRICE)} SEK/mån</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-medium">
          <span className="text-foreground">Totalt/mån</span>
          <span className="text-foreground">{fmt(monthlyTotal)} SEK</span>
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" /> Exkl. moms. Slutpris beräknas server-side.</p>
      </div>
    </div>
  );
}

/* ─── STEP 2: Details ─── */
function StepDetails({ form, fieldErrors, fieldChecks, availability, isValidating, updateField }: {
  form: Partial<OnboardingFormData>; fieldErrors: Record<string, string>; fieldChecks: Record<string, boolean>;
  availability: ValidationResponse['validation']['availability']; isValidating: boolean; updateField: (f: string, v: any) => void;
}) {
  const orgTaken = availability?.organizationNumberAvailable === false;
  const emailTaken = availability?.workEmailAvailable === false;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Företag & kontakt</h2>
          <p className="text-[13px] text-muted-foreground mt-1">Uppgifter om företaget och kontaktpersonen.</p>
        </div>
        {isValidating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <FieldInput label="Företagsnamn" id="companyName" placeholder="Acme AB" value={form.companyName || ''} onChange={(v) => updateField('companyName', v)} error={fieldErrors.companyName} valid={fieldChecks.companyNameValid} required />
          <FieldInput label="Organisationsnummer" id="organizationNumber" placeholder="556016-0680" value={form.organizationNumber || ''} onChange={(v) => updateField('organizationNumber', v)} error={orgTaken ? 'Redan registrerat.' : fieldErrors.organizationNumber} valid={fieldChecks.organizationNumberValid && !orgTaken} hint="XXXXXX-XXXX" required />
        </div>
        <FieldInput label="Webbplats" id="websiteUrl" placeholder="https://acme.se" value={form.websiteUrl || ''} onChange={(v) => updateField('websiteUrl', v)} error={fieldErrors.websiteUrl} valid={fieldChecks.websiteUrlValid} />
        <Separator />
        <FieldInput label="Kontaktperson" id="contactName" placeholder="Anna Andersson" value={form.contactName || ''} onChange={(v) => updateField('contactName', v)} error={fieldErrors.contactName} valid={fieldChecks.contactNameValid} required />
        <div className="grid sm:grid-cols-2 gap-4">
          <FieldInput label="Jobbmejl" id="workEmail" type="email" placeholder="anna@acme.se" value={form.workEmail || ''} onChange={(v) => updateField('workEmail', v)} error={emailTaken ? 'Redan registrerad.' : fieldErrors.workEmail} valid={fieldChecks.workEmailValid && !emailTaken} hint="Ingen gratismail" required />
          <FieldInput label="Telefon" id="contactPhone" placeholder="+46 70 123 45 67" value={form.contactPhone || ''} onChange={(v) => updateField('contactPhone', v)} error={fieldErrors.contactPhone} valid={fieldChecks.contactPhoneValid} required />
        </div>
      </div>
      {(orgTaken || emailTaken) && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-[13px] text-destructive">
            {orgTaken && emailTaken ? 'Organisationsnummer och mejl redan registrerade.' : orgTaken ? 'Organisationsnumret redan registrerat.' : 'Mejladressen redan registrerad.'}
            {' '}Kontakta <a href="mailto:support@tivly.se" className="underline">support@tivly.se</a>.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Field input ─── */
function FieldInput({ label, id, placeholder, value, onChange, error, valid, hint, type = 'text', required }: {
  label: string; id: string; placeholder: string; value: string; onChange: (v: string) => void;
  error?: string; valid?: boolean; hint?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}{required && ' *'}</Label>
      <Input id={id} type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={cn('mt-1 text-[13px] bg-background', error && 'border-destructive')} />
      {error && <p className="text-[11px] text-destructive flex items-center gap-1 mt-1"><AlertCircle className="h-3 w-3 shrink-0" /> {error}</p>}
      {!error && valid && value && <p className="text-[11px] text-foreground flex items-center gap-1 mt-1"><CheckCircle2 className="h-3 w-3" /> OK</p>}
      {!error && !valid && hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

/* ─── STEP 3: Confirm ─── */
function StepConfirm({ form, selectedPlan, monthlyTotal, extraSeats, updateField, submitError }: {
  form: Partial<OnboardingFormData>; selectedPlan: typeof PLANS[0]; monthlyTotal: number; extraSeats: number;
  updateField: (f: string, v: any) => void; submitError: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Bekräfta uppgifter</h2>
        <p className="text-[13px] text-muted-foreground mt-1">Granska innan du fortsätter till kortregistrering.</p>
      </div>
      <div className="rounded-lg border border-border divide-y divide-border text-[13px]">
        <Row label="Företag" value={form.companyName || '–'} />
        <Row label="Orgnr" value={form.organizationNumber || '–'} />
        <Row label="Kontakt" value={form.contactName || '–'} />
        <Row label="Mejl" value={form.workEmail || '–'} />
        <Row label="Telefon" value={form.contactPhone || '–'} />
        <Row label="Plan" value={`${selectedPlan.name} – ${fmt(selectedPlan.priceSek)} SEK/mån`} />
        <Row label="Användare" value={String(form.expectedSeats || 0)} />
        {extraSeats > 0 && <Row label="Extra platser" value={`${extraSeats} × ${fmt(EXTRA_SEAT_PRICE)} SEK/mån`} />}
        <Row label="Aktivering" value={`${fmt(selectedPlan.activationSek)} SEK (efter trial)`} />
      </div>
      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox checked={form.acceptedTerms || false} onCheckedChange={(c) => updateField('acceptedTerms', c === true)} className="mt-0.5" />
          <span className="text-[13px] text-muted-foreground leading-relaxed">
            Jag godkänner <a href="https://www.tivly.se/enterprise-villkor" target="_blank" rel="noopener noreferrer" className="text-foreground underline">enterprise-villkoren</a> och <a href="https://www.tivly.se/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-foreground underline">integritetspolicyn</a>.
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox checked={form.authorizedSignatory || false} onCheckedChange={(c) => updateField('authorizedSignatory', c === true)} className="mt-0.5" />
          <span className="text-[13px] text-muted-foreground leading-relaxed">Jag är behörig att teckna avtal för {form.companyName || 'företaget'}.</span>
        </label>
      </div>
      {submitError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-[13px] text-destructive">{submitError}</p>
        </div>
      )}
      <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start gap-3">
        <CreditCard className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[13px] text-muted-foreground">
          I nästa steg registrerar du ett betalkort. <strong className="text-foreground">Ingen debitering sker under trial-perioden.</strong> Trial startar först efter att kortet sparats.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium text-right">{value}</span>
    </div>
  );
}

/* ─── STEP 4: Card (Stripe SetupIntent via draft-level subscribe) ─── */
function StepCard({ draftId, resumeToken, initialClientSecret, stripePublishableKey, email, monthlyTotal, planBaseSek, activationFeeSek, includedSeats, expectedSeats, extraSeats, onCardConfirmed }: {
  draftId: string;
  resumeToken: string;
  initialClientSecret: string | null;
  stripePublishableKey: string | null;
  email: string;
  monthlyTotal: number;
  planBaseSek: number;
  activationFeeSek: number;
  includedSeats: number;
  expectedSeats: number;
  extraSeats: number;
  onCardConfirmed: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(!initialClientSecret);
  const [clientSecret, setClientSecret] = useState<string | null>(initialClientSecret);
  const [error, setError] = useState('');
  const [readyForTrialStart, setReadyForTrialStart] = useState(false);
  const [paymentMethodSaved, setPaymentMethodSaved] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);
  const [resolvedStripePromise, setResolvedStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [currentPk, setCurrentPk] = useState<string | null>(stripePublishableKey);

  const trialChargeDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Resolve Stripe promise from backend-provided publishable key
  useEffect(() => {
    if (currentPk) {
      setResolvedStripePromise(loadStripe(currentPk));
    }
  }, [currentPk]);

  const applySubscribeResponse = useCallback((res: any) => {
    const billing = res?.billing || {};
    const ready = !!billing?.readyForTrialStart;
    const saved = !!billing?.paymentMethodSaved;
    const pk = extractStripePublishableKey(res);

    setReadyForTrialStart(ready);
    setPaymentMethodSaved(saved);

    if (pk && pk !== currentPk) {
      setCurrentPk(pk);
    }

    const secret = extractSetupIntentClientSecret(res);

    if (ready || saved) {
      setClientSecret(null);
      setError('');
      return;
    }

    if (!pk) {
      setClientSecret(null);
      setError('Stripe publishable key saknas i svaret. Kontakta support.');
      return;
    }

    if (!secret) {
      setClientSecret(null);
      setError('Kortsetup kunde inte initieras. Klicka på "Försök igen".');
      return;
    }

    setClientSecret(secret);
    setError('');
  }, [currentPk]);

  const loadCardSetup = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await subscribeDraft(draftId, resumeToken);
      applySubscribeResponse(res);
    } catch (err: any) {
      const status = err?.status;
      const code = err?.code || err?.error;
      if (status === 503 && (code === 'stripe_key_mismatch' || code === 'stripe_publishable_key_missing')) {
        setError('Stripe-konfigurationsfel på serversidan. Kontakta support@tivly.se.');
      } else {
        const msg = err?.message || err?.error || err?.detail ||
          (typeof err === 'string' ? err : 'Kunde inte ladda kortsteget just nu.');
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [draftId, resumeToken, applySubscribeResponse]);

  useEffect(() => {
    if (initialClientSecret) {
      setLoading(false);
      setClientSecret(initialClientSecret);
      return;
    }
    loadCardSetup();
  }, [initialClientSecret, loadCardSetup]);

  const handleStartTrialNow = async () => {
    setStartingTrial(true);
    setError('');
    try {
      await onCardConfirmed();
    } catch (err: any) {
      setError(err?.message || err?.error || 'Kunde inte starta trial. Försök igen.');
    } finally {
      setStartingTrial(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Registrera betalkort</h2>
        <p className="text-[13px] text-muted-foreground mt-1">
          Trial startar först när kortet är bekräftat.
        </p>
      </div>

      {/* Cost breakdown */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-[13px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Idag</span>
          <span className="text-foreground font-semibold">0 kr</span>
        </div>
        <Separator className="!my-1.5" />
        <div className="flex justify-between">
          <span className="text-muted-foreground">{trialChargeDate}</span>
          <span className="text-foreground font-medium">{fmt(activationFeeSek + monthlyTotal)} kr</span>
        </div>
        <div className="pl-3 space-y-0.5 text-[11px] text-muted-foreground">
          <div className="flex justify-between"><span>Aktiveringsavgift</span><span>{fmt(activationFeeSek)} kr</span></div>
          <div className="flex justify-between"><span>Plan ({includedSeats} anv. inkl.)</span><span>{fmt(planBaseSek)} kr</span></div>
          {extraSeats > 0 && <div className="flex justify-between"><span>{extraSeats} extra × {fmt(EXTRA_SEAT_PRICE)} kr</span><span>{fmt(extraSeats * EXTRA_SEAT_PRICE)} kr</span></div>}
        </div>
        <Separator className="!my-1.5" />
        <div className="flex justify-between">
          <span className="text-muted-foreground">Därefter/mån</span>
          <span className="text-foreground font-medium">{fmt(monthlyTotal)} kr</span>
        </div>
        <p className="text-[10px] text-muted-foreground pt-1">Exkl. moms · {expectedSeats} användare</p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start gap-3">
        <Mail className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[13px] text-muted-foreground">
          Inbjudan skickas till <span className="text-foreground font-medium">{email}</span> när kortet är sparat och trial startad.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-3">
          <p className="text-[13px] text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={loadCardSetup} className="text-[12px]">
            Försök igen
          </Button>
        </div>
      )}

      {!loading && !error && readyForTrialStart && (
        <div className="space-y-3 rounded-lg border border-border p-4 bg-background">
          <p className="text-[13px] text-foreground">Kort är redan sparat för detta utkast. Du kan starta trial direkt.</p>
          <Button type="button" onClick={handleStartTrialNow} disabled={startingTrial} className="w-full h-10 bg-foreground text-background hover:bg-foreground/90 no-hover-lift text-[13px]">
            {startingTrial ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Startar trial...</> : <><CreditCard className="h-4 w-4 mr-2" /> Starta trial nu</>}
          </Button>
        </div>
      )}

      {!loading && !error && !readyForTrialStart && clientSecret && resolvedStripePromise && (
        <Elements stripe={resolvedStripePromise} options={{
          clientSecret,
          appearance: {
            theme: 'stripe',
            variables: { fontFamily: 'inherit', borderRadius: '8px' },
          },
        }}>
          <CardFormInner clientSecret={clientSecret} email={email} onCardConfirmed={onCardConfirmed} />
        </Elements>
      )}

      {!loading && !error && !readyForTrialStart && !clientSecret && !resolvedStripePromise && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 space-y-3">
          <p className="text-[13px] text-destructive">Stripe kunde inte initieras (ingen publishable key). Kontakta support.</p>
          <Button variant="outline" size="sm" onClick={loadCardSetup} className="text-[12px]">
            Försök igen
          </Button>
        </div>
      )}
    </div>
  );
}

function CardFormInner({ clientSecret, email, onCardConfirmed }: { clientSecret: string; email: string; onCardConfirmed: () => Promise<void> }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'card' | 'starting'>('card');
  const [paymentElementLoadError, setPaymentElementLoadError] = useState('');

  const useCardFallback = paymentElementLoadError.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');

    const result = useCardFallback
      ? await (async () => {
          const cardElement = elements.getElement(CardElement);
          if (!cardElement) {
            return { error: { message: 'Kortfältet kunde inte laddas.' } } as any;
          }
          return stripe.confirmCardSetup(clientSecret, {
            payment_method: {
              card: cardElement,
              billing_details: email ? { email } : undefined,
            },
          });
        })()
      : await stripe.confirmSetup({
          elements,
          confirmParams: { return_url: window.location.href },
          redirect: 'if_required',
        });

    if (result.error) {
      setError(result.error.message || 'Betalmetoden kunde inte sparas.');
      setSubmitting(false);
      return;
    }

    if (result.setupIntent?.status !== 'succeeded') {
      setError('Betalmetoden kunde inte bekräftas. Försök igen.');
      setSubmitting(false);
      return;
    }

    setPhase('starting');
    try {
      await onCardConfirmed();
    } catch (err: any) {
      setError(err?.message || err?.error || 'Kunde inte starta trial. Kontakta support.');
      setPhase('card');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!useCardFallback && (
        <PaymentElement
          onLoadError={(event) => setPaymentElementLoadError(event?.error?.message || 'Kunde inte ladda alla betalmetoder.')}
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card', 'klarna', 'apple_pay', 'google_pay'],
            wallets: { applePay: 'auto', googlePay: 'auto' },
          }}
        />
      )}

      {useCardFallback && (
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-background px-3 py-3">
            <CardElement options={{ hidePostalCode: true }} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Fler betalmetoder kunde inte laddas. Kortbetalning fungerar.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded bg-destructive/8 border border-destructive/15 px-3 py-2.5">
          <p className="text-[12px] text-destructive font-medium">{error}</p>
        </div>
      )}
      <Button type="submit" disabled={!stripe || submitting} className="w-full h-10 bg-foreground text-background hover:bg-foreground/90 no-hover-lift text-[13px]">
        {submitting && phase === 'card' && <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sparar...</>}
        {submitting && phase === 'starting' && <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Startar trial...</>}
        {!submitting && <><Shield className="h-4 w-4 mr-2" /> Spara & starta trial</>}
      </Button>
      <p className="text-center text-[10px] text-muted-foreground">
        Krypterad betalning via Stripe · 0 kr under trial
      </p>
    </form>
  );
}
