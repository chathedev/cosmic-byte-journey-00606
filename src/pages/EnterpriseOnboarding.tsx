import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronLeft, Check, Shield, ArrowRight, Loader2, AlertCircle,
  CheckCircle2, Minus, Plus, Info, Mail, CreditCard, Users, Building2, Sparkles,
  FileCheck, Clock, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
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

/* ─── Constants ─── */
const PLANS = [
  { id: 'enterprise_small' as const, name: 'Small', priceSek: 2490, seats: 10, activationSek: 4900 },
  { id: 'enterprise_standard' as const, name: 'Standard', priceSek: 5990, seats: 30, activationSek: 9900 },
];
const EXTRA_SEAT_PRICE = 249;
const STEPS = ['Team', 'Plan', 'Uppgifter', 'Bekräfta', 'Betalning'];
const STEP_ICONS = [Users, Zap, Building2, FileCheck, CreditCard];
const DRAFT_KEY = 'tivly_enterprise_draft';
const FORM_KEY = 'tivly_enterprise_form';

function saveStorageJSON(key: string, value: unknown) {
  const s = JSON.stringify(value);
  try { localStorage.setItem(key, s); } catch {}
  try { sessionStorage.setItem(key, s); } catch {}
}
function readStorageJSON<T>(key: string): T | null {
  try { const l = localStorage.getItem(key); if (l) return JSON.parse(l) as T; } catch {}
  try { const s = sessionStorage.getItem(key); if (s) return JSON.parse(s) as T; } catch {}
  return null;
}
function removeStorageKey(key: string) {
  try { localStorage.removeItem(key); } catch {}
  try { sessionStorage.removeItem(key); } catch {}
}
function saveDraftLocal(draftId: string, resumeToken: string) { saveStorageJSON(DRAFT_KEY, { draftId, resumeToken }); }
function loadDraftLocal(): { draftId: string; resumeToken: string } | null { return readStorageJSON(DRAFT_KEY); }
function clearDraftLocal() { removeStorageKey(DRAFT_KEY); }
function clearFormLocal() { removeStorageKey(FORM_KEY); }
function fmt(n: number) { return n.toLocaleString('sv-SE'); }
function extractSetupIntentClientSecret(p: any): string | null { return p?.billing?.setupIntentClientSecret || p?.setupIntentClientSecret || p?.clientSecret || p?.client_secret || null; }
function extractStripePublishableKey(p: any): string | null { return p?.billing?.stripePublishableKey || null; }

/* ─── Animation variants ─── */
const fadeSlide = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, y: -16, scale: 0.98, transition: { duration: 0.25 } },
};
const staggerContainer = {
  animate: { transition: { staggerChildren: 0.08 } },
};
const staggerItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
};

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
        ...form, countryCode: 'SE', draftId: draftIdRef.current, resumeToken: resumeTokenRef.current,
        progressStep: 3, progressPercent: 80,
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
      const subscribeRes = await subscribeDraft(ensuredDraftId, ensuredResumeToken);
      const billing = subscribeRes?.billing;
      const secret = extractSetupIntentClientSecret(subscribeRes);
      const pkKey = extractStripePublishableKey(subscribeRes);
      if (billing?.readyForTrialStart || billing?.paymentMethodSaved) {
        setSetupIntentClientSecret(null);
        setStripePublishableKey(pkKey);
        setStep(4);
        return;
      }
      if (!pkKey) { setSubmitError('Stripe-konfigurationsfel (publishable key saknas). Kontakta support.'); setIsSubmitting(false); return; }
      if (!secret) { setSubmitError('Kunde inte initiera kortregistrering. Försök igen.'); setIsSubmitting(false); return; }
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

  // ─── Done screen ───
  if (allDone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="max-w-md w-full">
          <Card className="border-border/50 shadow-2xl shadow-primary/5 overflow-hidden">
            {/* Success gradient bar */}
            <div className="h-1.5 bg-gradient-to-r from-primary via-accent to-primary" />
            <CardContent className="p-8 space-y-6">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200 }} className="flex justify-center">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                </div>
              </motion.div>
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold text-foreground">Allt klart!</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Trial aktiverad och betalkort sparat. Debitering sker automatiskt efter 7 dagar.
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl p-5 space-y-4">
                {[
                  { n: '1', text: <>Öppna inbjudan i din mejl (<span className="text-foreground font-medium">{completedEmail}</span>)</> },
                  { n: '2', text: 'Klicka på länken och logga in' },
                  { n: '3', text: 'Bjud in ditt team och börja använda Tivly' },
                ].map((item, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.1 }} className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {item.n}
                    </div>
                    <span className="text-sm text-muted-foreground">{item.text}</span>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
          <p className="text-[10px] text-center text-muted-foreground mt-6">© {new Date().getFullYear()} Tivly AB</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Header */}
      <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4 }} className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-semibold tracking-wide text-foreground">Tivly Enterprise</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {isSaving && <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Sparar</span>}
            {!isSaving && draftId && step < 4 && <span className="flex items-center gap-1.5 text-primary"><Check className="h-3 w-3" />Sparat</span>}
          </div>
        </div>
      </motion.header>

      {/* Step indicator */}
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-2">
        <div className="flex items-center gap-1">
          {STEPS.map((label, i) => {
            const Icon = STEP_ICONS[i];
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <motion.div
                  animate={{
                    scale: isActive ? 1 : 0.9,
                    opacity: isActive || isDone ? 1 : 0.4,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className={cn(
                    'h-10 w-10 rounded-xl flex items-center justify-center transition-colors duration-300',
                    isActive && 'bg-primary text-primary-foreground shadow-lg shadow-primary/25',
                    isDone && 'bg-primary/10 text-primary',
                    !isActive && !isDone && 'bg-muted text-muted-foreground',
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </motion.div>
                <span className={cn('text-[10px] font-medium tracking-wide', isActive ? 'text-foreground' : 'text-muted-foreground/60')}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
        {/* Progress bar */}
        <div className="mt-4 h-1 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
            animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div key={step} variants={fadeSlide} initial="initial" animate="animate" exit="exit">
            {step === 0 && <StepTeamSize seats={seats} onChange={(v) => updateField('expectedSeats', v)} />}
            {step === 1 && <StepPlan form={form} selectedPlan={selectedPlan} extraSeats={extraSeats} monthlyTotal={monthlyTotal} updateField={updateField} />}
            {step === 2 && <StepDetails form={form} fieldErrors={fieldErrors} fieldChecks={fieldChecks} availability={availability} isValidating={isValidating} updateField={updateField} />}
            {step === 3 && <StepConfirm form={form} selectedPlan={selectedPlan} monthlyTotal={monthlyTotal} extraSeats={extraSeats} updateField={updateField} submitError={submitError} />}
            {step === 4 && draftId && resumeToken && (
              <StepCardPayment
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

        {/* Navigation */}
        {step < 3 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex items-center justify-between mt-8">
            <Button variant="ghost" size="sm" onClick={() => { hasUserInteractedRef.current = true; setStep(s => s - 1); }} disabled={step === 0} className="gap-1.5 text-muted-foreground no-hover-lift">
              <ChevronLeft className="h-4 w-4" /> Tillbaka
            </Button>
            <Button size="sm" onClick={() => { hasUserInteractedRef.current = true; setStep(s => s + 1); }} disabled={step === 2 && !canProceedStep2} className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 no-hover-lift rounded-xl px-6 shadow-lg shadow-primary/20">
              Nästa <ChevronRight className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
        {step === 3 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex items-center justify-between mt-8">
            <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="gap-1.5 text-muted-foreground no-hover-lift">
              <ChevronLeft className="h-4 w-4" /> Tillbaka
            </Button>
            <Button size="sm" onClick={handleConfirmAndProceedToCard} disabled={!canProceedStep3 || isSubmitting} className="gap-1.5 min-w-[180px] bg-primary text-primary-foreground hover:bg-primary/90 no-hover-lift rounded-xl px-6 shadow-lg shadow-primary/20">
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Validerar...</> : <>Fortsätt till betalning <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </motion.div>
        )}
      </main>

      <footer className="max-w-2xl mx-auto px-4 pb-8 pt-4">
        <p className="text-[10px] text-muted-foreground text-center">
          © {new Date().getFullYear()} Tivly · <a href="https://www.tivly.se/enterprise-villkor" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">Villkor</a> · <a href="https://www.tivly.se/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">Integritet</a>
        </p>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
/* STEP 0: Team Size                                       */
/* ═══════════════════════════════════════════════════════ */
function StepTeamSize({ seats, onChange }: { seats: number; onChange: (v: number) => void }) {
  const presets = [5, 10, 15, 25, 50];
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
      <motion.div variants={staggerItem}>
        <h2 className="text-2xl font-bold text-foreground">Hur stort är ert team?</h2>
        <p className="text-sm text-muted-foreground mt-1.5">Vi rekommenderar en plan baserat på ert behov.</p>
      </motion.div>

      <motion.div variants={staggerItem}>
        <Card className="border-border/50 shadow-lg shadow-primary/5 overflow-hidden">
          <CardContent className="p-8">
            <div className="flex items-center justify-center gap-8 py-4">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => onChange(Math.max(1, seats - 1))}
                className="h-12 w-12 rounded-xl bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground transition-colors no-hover-lift"
              >
                <Minus className="h-5 w-5" />
              </motion.button>
              <div className="text-center min-w-[100px]">
                <motion.span
                  key={seats}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-6xl font-bold text-foreground tabular-nums block"
                >
                  {seats}
                </motion.span>
                <p className="text-sm text-muted-foreground mt-2">användare</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => onChange(Math.min(500, seats + 1))}
                className="h-12 w-12 rounded-xl bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground transition-colors no-hover-lift"
              >
                <Plus className="h-5 w-5" />
              </motion.button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={staggerItem} className="flex items-center justify-center gap-2 flex-wrap">
        {presets.map(n => (
          <motion.button
            key={n}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(n)}
            className={cn(
              'px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 no-hover-lift',
              seats === n
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                : 'bg-card border border-border text-muted-foreground hover:border-primary/30 hover:text-foreground',
            )}
          >
            {n}
          </motion.button>
        ))}
      </motion.div>

      <motion.div variants={staggerItem}>
        <Card className="border-border/50 bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              Rekommenderad plan: <span className="text-foreground font-semibold">{seats <= 10 ? 'Small' : 'Standard'}</span>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════ */
/* STEP 1: Plan                                            */
/* ═══════════════════════════════════════════════════════ */
function StepPlan({ form, selectedPlan, extraSeats, monthlyTotal, updateField }: {
  form: Partial<OnboardingFormData>; selectedPlan: typeof PLANS[0]; extraSeats: number; monthlyTotal: number; updateField: (f: string, v: any) => void;
}) {
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
      <motion.div variants={staggerItem}>
        <h2 className="text-2xl font-bold text-foreground">Välj plan</h2>
        <p className="text-sm text-muted-foreground mt-1.5">7 dagars kostnadsfri trial. Betalkort krävs innan trial startar.</p>
      </motion.div>

      <motion.div variants={staggerItem} className="grid sm:grid-cols-2 gap-4">
        {PLANS.map(plan => {
          const isSelected = form.planType === plan.id;
          return (
            <motion.button
              key={plan.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => updateField('planType', plan.id)}
              className={cn(
                'text-left rounded-2xl border-2 p-6 transition-all duration-300 no-hover-lift relative overflow-hidden',
                isSelected
                  ? 'border-primary bg-primary/[0.03] shadow-lg shadow-primary/10'
                  : 'border-border hover:border-primary/30 bg-card',
              )}
            >
              {isSelected && (
                <motion.div
                  layoutId="plan-selected"
                  className="absolute top-3 right-3 h-6 w-6 rounded-full bg-primary flex items-center justify-center"
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                >
                  <Check className="h-3.5 w-3.5 text-primary-foreground" />
                </motion.div>
              )}
              <p className="font-bold text-lg text-foreground">{plan.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{plan.seats} användare inkl.</p>
              <p className="mt-4">
                <span className="text-3xl font-bold text-foreground">{fmt(plan.priceSek)}</span>
                <span className="text-sm text-muted-foreground"> SEK/mån</span>
              </p>
              <p className="text-xs text-muted-foreground mt-2">Aktivering {fmt(plan.activationSek)} SEK (engång)</p>
            </motion.button>
          );
        })}
      </motion.div>

      <motion.div variants={staggerItem}>
        <Card className="border-border/50 shadow-md">
          <CardContent className="p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Plan {selectedPlan.name}</span>
              <span className="text-foreground font-medium">{fmt(selectedPlan.priceSek)} SEK/mån</span>
            </div>
            {extraSeats > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{extraSeats} extra användare × {fmt(EXTRA_SEAT_PRICE)} SEK</span>
                <span className="text-foreground font-medium">{fmt(extraSeats * EXTRA_SEAT_PRICE)} SEK/mån</span>
              </div>
            )}
            <div className="h-px bg-border" />
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-foreground">Totalt/mån</span>
              <span className="text-foreground">{fmt(monthlyTotal)} SEK</span>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="h-3 w-3 shrink-0" /> Exkl. moms. Slutpris beräknas server-side.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════ */
/* STEP 2: Details                                         */
/* ═══════════════════════════════════════════════════════ */
function StepDetails({ form, fieldErrors, fieldChecks, availability, isValidating, updateField }: {
  form: Partial<OnboardingFormData>; fieldErrors: Record<string, string>; fieldChecks: Record<string, boolean>;
  availability: ValidationResponse['validation']['availability']; isValidating: boolean; updateField: (f: string, v: any) => void;
}) {
  const orgTaken = availability?.organizationNumberAvailable === false;
  const emailTaken = availability?.workEmailAvailable === false;
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
      <motion.div variants={staggerItem} className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Företag & kontakt</h2>
          <p className="text-sm text-muted-foreground mt-1.5">Uppgifter om företaget och kontaktpersonen.</p>
        </div>
        {isValidating && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      </motion.div>

      <motion.div variants={staggerItem}>
        <Card className="border-border/50 shadow-md">
          <CardContent className="p-6 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <FieldInput label="Företagsnamn" id="companyName" placeholder="Acme AB" value={form.companyName || ''} onChange={(v) => updateField('companyName', v)} error={fieldErrors.companyName} valid={fieldChecks.companyNameValid} required />
              <FieldInput label="Organisationsnummer" id="organizationNumber" placeholder="556016-0680" value={form.organizationNumber || ''} onChange={(v) => updateField('organizationNumber', v)} error={orgTaken ? 'Redan registrerat.' : fieldErrors.organizationNumber} valid={fieldChecks.organizationNumberValid && !orgTaken} hint="XXXXXX-XXXX" required />
            </div>
            <FieldInput label="Webbplats" id="websiteUrl" placeholder="https://acme.se" value={form.websiteUrl || ''} onChange={(v) => updateField('websiteUrl', v)} error={fieldErrors.websiteUrl} valid={fieldChecks.websiteUrlValid} />
            <div className="h-px bg-border" />
            <FieldInput label="Kontaktperson" id="contactName" placeholder="Anna Andersson" value={form.contactName || ''} onChange={(v) => updateField('contactName', v)} error={fieldErrors.contactName} valid={fieldChecks.contactNameValid} required />
            <div className="grid sm:grid-cols-2 gap-4">
              <FieldInput label="Jobbmejl" id="workEmail" type="email" placeholder="anna@acme.se" value={form.workEmail || ''} onChange={(v) => updateField('workEmail', v)} error={emailTaken ? 'Redan registrerad.' : fieldErrors.workEmail} valid={fieldChecks.workEmailValid && !emailTaken} hint="Ingen gratismail" required />
              <FieldInput label="Telefon" id="contactPhone" placeholder="+46 70 123 45 67" value={form.contactPhone || ''} onChange={(v) => updateField('contactPhone', v)} error={fieldErrors.contactPhone} valid={fieldChecks.contactPhoneValid} required />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {(orgTaken || emailTaken) && (
        <motion.div variants={staggerItem}>
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                {orgTaken && emailTaken ? 'Organisationsnummer och mejl redan registrerade.' : orgTaken ? 'Organisationsnumret redan registrerat.' : 'Mejladressen redan registrerad.'}
                {' '}Kontakta <a href="mailto:support@tivly.se" className="underline font-medium">support@tivly.se</a>.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ─── Field input ─── */
function FieldInput({ label, id, placeholder, value, onChange, error, valid, hint, type = 'text', required }: {
  label: string; id: string; placeholder: string; value: string; onChange: (v: string) => void;
  error?: string; valid?: boolean; hint?: string; type?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}{required && ' *'}</Label>
      <Input id={id} type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={cn('bg-background rounded-xl border-border/80 focus:border-primary', error && 'border-destructive focus:border-destructive')} />
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" /> {error}</p>}
      {!error && valid && value && <p className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> OK</p>}
      {!error && !valid && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
/* STEP 3: Confirm                                         */
/* ═══════════════════════════════════════════════════════ */
function StepConfirm({ form, selectedPlan, monthlyTotal, extraSeats, updateField, submitError }: {
  form: Partial<OnboardingFormData>; selectedPlan: typeof PLANS[0]; monthlyTotal: number; extraSeats: number;
  updateField: (f: string, v: any) => void; submitError: string;
}) {
  const rows = [
    { label: 'Företag', value: form.companyName || '–' },
    { label: 'Orgnr', value: form.organizationNumber || '–' },
    { label: 'Kontakt', value: form.contactName || '–' },
    { label: 'Mejl', value: form.workEmail || '–' },
    { label: 'Telefon', value: form.contactPhone || '–' },
    { label: 'Plan', value: `${selectedPlan.name} – ${fmt(selectedPlan.priceSek)} SEK/mån` },
    { label: 'Användare', value: String(form.expectedSeats || 0) },
    ...(extraSeats > 0 ? [{ label: 'Extra platser', value: `${extraSeats} × ${fmt(EXTRA_SEAT_PRICE)} SEK/mån` }] : []),
    { label: 'Aktivering', value: `${fmt(selectedPlan.activationSek)} SEK (efter trial)` },
  ];

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
      <motion.div variants={staggerItem}>
        <h2 className="text-2xl font-bold text-foreground">Bekräfta uppgifter</h2>
        <p className="text-sm text-muted-foreground mt-1.5">Granska innan du fortsätter till kortregistrering.</p>
      </motion.div>

      <motion.div variants={staggerItem}>
        <Card className="border-border/50 shadow-md overflow-hidden">
          <CardContent className="p-0">
            {rows.map((row, i) => (
              <div key={i} className={cn('flex justify-between px-5 py-3.5 text-sm', i < rows.length - 1 && 'border-b border-border/50')}>
                <span className="text-muted-foreground">{row.label}</span>
                <span className="text-foreground font-medium text-right">{row.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={staggerItem} className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer group">
          <Checkbox checked={form.acceptedTerms || false} onCheckedChange={(c) => updateField('acceptedTerms', c === true)} className="mt-0.5" />
          <span className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
            Jag godkänner <a href="https://www.tivly.se/enterprise-villkor" target="_blank" rel="noopener noreferrer" className="text-primary underline">enterprise-villkoren</a> och <a href="https://www.tivly.se/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline">integritetspolicyn</a>.
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer group">
          <Checkbox checked={form.authorizedSignatory || false} onCheckedChange={(c) => updateField('authorizedSignatory', c === true)} className="mt-0.5" />
          <span className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">Jag är behörig att teckna avtal för {form.companyName || 'företaget'}.</span>
        </label>
      </motion.div>

      {submitError && (
        <motion.div variants={staggerItem}>
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{submitError}</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div variants={staggerItem}>
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CreditCard className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              I nästa steg registrerar du ett betalkort. <strong className="text-foreground">Ingen debitering sker under trial-perioden.</strong>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════ */
/* STEP 4: Card Payment                                    */
/* ═══════════════════════════════════════════════════════ */
function StepCardPayment({ draftId, resumeToken, initialClientSecret, stripePublishableKey, email, monthlyTotal, planBaseSek, activationFeeSek, includedSeats, expectedSeats, extraSeats, onCardConfirmed }: {
  draftId: string; resumeToken: string; initialClientSecret: string | null; stripePublishableKey: string | null;
  email: string; monthlyTotal: number; planBaseSek: number; activationFeeSek: number; includedSeats: number; expectedSeats: number; extraSeats: number;
  onCardConfirmed: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(!initialClientSecret);
  const [clientSecret, setClientSecret] = useState<string | null>(initialClientSecret);
  const [error, setError] = useState('');
  const [readyForTrialStart, setReadyForTrialStart] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);
  const [resolvedStripePromise, setResolvedStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [currentPk, setCurrentPk] = useState<string | null>(stripePublishableKey);

  const trialChargeDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => { if (currentPk) setResolvedStripePromise(loadStripe(currentPk)); }, [currentPk]);

  const applySubscribeResponse = useCallback((res: any) => {
    const billing = res?.billing || {};
    const ready = !!billing?.readyForTrialStart;
    const saved = !!billing?.paymentMethodSaved;
    const pk = extractStripePublishableKey(res);
    setReadyForTrialStart(ready);
    if (pk && pk !== currentPk) setCurrentPk(pk);
    const secret = extractSetupIntentClientSecret(res);
    if (ready || saved) { setClientSecret(null); setError(''); return; }
    if (!pk) { setClientSecret(null); setError('Stripe publishable key saknas. Kontakta support.'); return; }
    if (!secret) { setClientSecret(null); setError('Kortsetup kunde inte initieras. Klicka "Försök igen".'); return; }
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
        setError(err?.message || err?.error || 'Kunde inte ladda kortsteget just nu.');
      }
    } finally {
      setLoading(false);
    }
  }, [draftId, resumeToken, applySubscribeResponse]);

  useEffect(() => {
    if (initialClientSecret) { setLoading(false); setClientSecret(initialClientSecret); return; }
    loadCardSetup();
  }, [initialClientSecret, loadCardSetup]);

  const handleStartTrialNow = async () => {
    setStartingTrial(true);
    setError('');
    try { await onCardConfirmed(); } catch (err: any) { setError(err?.message || err?.error || 'Kunde inte starta trial.'); } finally { setStartingTrial(false); }
  };

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-5">
      <motion.div variants={staggerItem}>
        <h2 className="text-2xl font-bold text-foreground">Registrera betalmetod</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          Kort, Apple Pay, Google Pay eller Klarna. Ingen debitering under trial.
        </p>
      </motion.div>

      {/* Cost breakdown */}
      <motion.div variants={staggerItem}>
        <Card className="border-border/50 shadow-lg overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-primary to-accent" />
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-foreground">Idag</span>
                  <p className="text-xs text-muted-foreground">7 dagars gratis trial</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-primary">0 kr</span>
            </div>

            <div className="h-px bg-border" />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{trialChargeDate}</span>
              <span className="text-lg font-bold text-foreground">{fmt(activationFeeSek + monthlyTotal)} kr</span>
            </div>
            <div className="pl-1 space-y-1.5 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Aktiveringsavgift</span><span>{fmt(activationFeeSek)} kr</span></div>
              <div className="flex justify-between"><span>Plan ({includedSeats} anv. inkl.)</span><span>{fmt(planBaseSek)} kr</span></div>
              {extraSeats > 0 && <div className="flex justify-between"><span>{extraSeats} extra × {fmt(EXTRA_SEAT_PRICE)} kr</span><span>{fmt(extraSeats * EXTRA_SEAT_PRICE)} kr</span></div>}
            </div>

            <div className="h-px bg-border" />

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Därefter/mån</span>
              <span className="text-lg font-bold text-foreground">{fmt(monthlyTotal)} kr</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Exkl. moms · {expectedSeats} användare</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Email notice */}
      <motion.div variants={staggerItem}>
        <Card className="border-border/50 bg-muted/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Mail className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground">
              Inbjudan skickas till <span className="text-foreground font-medium">{email}</span> efter kort sparats.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {loading && (
        <motion.div variants={staggerItem} className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Laddar betalning...</p>
          </div>
        </motion.div>
      )}

      {error && !loading && (
        <motion.div variants={staggerItem}>
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={loadCardSetup} className="rounded-xl">Försök igen</Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!loading && !error && readyForTrialStart && (
        <motion.div variants={staggerItem}>
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardContent className="p-5 space-y-4">
              <p className="text-sm text-foreground">Kort är redan sparat. Du kan starta trial direkt.</p>
              <Button type="button" onClick={handleStartTrialNow} disabled={startingTrial} className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 no-hover-lift rounded-xl text-sm font-medium shadow-lg shadow-primary/20">
                {startingTrial ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Startar trial...</> : <><Sparkles className="h-4 w-4 mr-2" /> Starta trial nu</>}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!loading && !error && !readyForTrialStart && clientSecret && resolvedStripePromise && (
        <motion.div variants={staggerItem}>
          <Elements stripe={resolvedStripePromise} options={{
            clientSecret,
            appearance: {
              theme: 'flat',
              variables: {
                fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
                fontSizeBase: '14px',
                borderRadius: '12px',
                colorPrimary: 'hsl(211 100% 50%)',
                colorBackground: 'hsl(0 0% 100%)',
                colorText: 'hsl(220 10% 15%)',
                colorDanger: 'hsl(0 84% 60%)',
                spacingUnit: '4px',
                spacingGridRow: '16px',
              },
              rules: {
                '.Tab': {
                  border: '1.5px solid hsl(214 32% 91%)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  transition: 'all 0.2s ease',
                },
                '.Tab--selected': {
                  border: '2px solid hsl(211 100% 50%)',
                  backgroundColor: 'hsl(211 100% 50% / 0.04)',
                  boxShadow: '0 2px 8px 0 hsl(211 100% 50% / 0.1)',
                },
                '.Tab:hover': {
                  border: '1.5px solid hsl(211 100% 50% / 0.4)',
                },
                '.Input': {
                  border: '1.5px solid hsl(214 32% 91%)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                },
                '.Input:focus': {
                  border: '2px solid hsl(211 100% 50%)',
                  boxShadow: '0 0 0 3px hsl(211 100% 50% / 0.1)',
                },
                '.Label': {
                  fontSize: '12px',
                  fontWeight: '500',
                  color: 'hsl(220 8% 46%)',
                  marginBottom: '6px',
                },
              },
            },
          }}>
            <CardFormInner clientSecret={clientSecret} email={email} onCardConfirmed={onCardConfirmed} />
          </Elements>
        </motion.div>
      )}

      {!loading && !error && !readyForTrialStart && !clientSecret && !resolvedStripePromise && (
        <motion.div variants={staggerItem}>
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-destructive">Stripe kunde inte initieras. Kontakta support.</p>
              <Button variant="outline" size="sm" onClick={loadCardSetup} className="rounded-xl">Försök igen</Button>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ─── Card form inner ─── */
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
          if (!cardElement) return { error: { message: 'Kortfältet kunde inte laddas.' } } as any;
          return stripe.confirmCardSetup(clientSecret, {
            payment_method: { card: cardElement, billing_details: email ? { email } : undefined },
          });
        })()
      : await stripe.confirmSetup({
          elements,
          confirmParams: { return_url: window.location.href },
          redirect: 'if_required',
        });

    if (result.error) { setError(result.error.message || 'Betalmetoden kunde inte sparas.'); setSubmitting(false); return; }
    if (result.setupIntent?.status !== 'succeeded') { setError('Betalmetoden kunde inte bekräftas. Försök igen.'); setSubmitting(false); return; }

    setPhase('starting');
    try { await onCardConfirmed(); } catch (err: any) { setError(err?.message || err?.error || 'Kunde inte starta trial.'); setPhase('card'); setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card className="border-border/50 shadow-md overflow-hidden">
        <CardContent className="p-5">
          {!useCardFallback && (
            <PaymentElement
              onLoadError={(event) => setPaymentElementLoadError(event?.error?.message || 'Kunde inte ladda alla betalmetoder.')}
              options={{
                layout: 'tabs',
                paymentMethodOrder: ['card', 'klarna', 'apple_pay', 'google_pay'],
                wallets: { applePay: 'auto', googlePay: 'auto' },
                fields: { billingDetails: { email: 'auto' } },
              }}
            />
          )}
          {useCardFallback && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-background px-4 py-4">
                <CardElement options={{ hidePostalCode: true }} />
              </div>
              <p className="text-xs text-muted-foreground">Fler betalmetoder kunde inte laddas. Kortbetalning fungerar.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-3">
            <p className="text-xs text-destructive font-medium">{error}</p>
          </CardContent>
        </Card>
      )}

      <Button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 no-hover-lift text-sm font-medium shadow-lg shadow-primary/20"
      >
        {submitting && phase === 'card' && <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sparar betalmetod...</>}
        {submitting && phase === 'starting' && <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Startar trial...</>}
        {!submitting && <><Shield className="h-4 w-4 mr-2" /> Spara & starta 7 dagars trial</>}
      </Button>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-3.5 w-3.5 text-primary" />
        <span>Krypterad betalning · 0 kr under trial</span>
      </div>
    </form>
  );
}
