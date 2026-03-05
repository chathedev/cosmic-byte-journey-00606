import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import {
  ChevronRight, ChevronLeft, Check, Shield, ArrowRight, Loader2, AlertCircle,
  CheckCircle2, Minus, Plus, Info, Mail, CreditCard, Users, Building2,
  FileCheck, Clock, Globe, Phone, User, Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  validateOnboarding,
  saveDraft,
  getDraft,
  subscribeDraft,
  startTrial,
  sendOnboardingEmailVerification,
  checkOnboardingEmailVerification,
  type OnboardingFormData,
  type ValidationResponse,
  type CompanyRegistryResult,
  type CompanyConnectionResult,
} from '@/lib/enterpriseOnboardingApi';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { toast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Elements, PaymentElement, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

/* ─── Constants ─── */
const PLANS = [
  { id: 'enterprise_small' as const, name: 'Team', priceSek: 1990, seats: 5, activationSek: 0, extraSeatSek: 199 },
];
const STEPS = ['Uppgifter', 'Bekräfta', 'Betalning'];
const DRAFT_KEY = 'tivly_team_draft';
const FORM_KEY = 'tivly_team_form';

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
function extractFirstChargeEstimate(p: any): any { return p?.billing?.firstChargeEstimate || null; }

export default function EnterpriseOnboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enterpriseMembership } = useSubscription();
  const [onboardingEnabled, setOnboardingEnabled] = useState<boolean | null>(null);
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
  const [companyRegistry, setCompanyRegistry] = useState<CompanyRegistryResult | null>(null);
  const [companyConnection, setCompanyConnection] = useState<CompanyConnectionResult | null>(null);
  const [stripeMode, setStripeMode] = useState<'test' | 'live' | null>(null);
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
  const [firstChargeEstimate, setFirstChargeEstimate] = useState<any>(null);
  
  // Company connection verification state (popup step before email verification)
  const [companyConnState, setCompanyConnState] = useState<'idle' | 'verifying' | 'verified' | 'failed'>('idle');
  const [companyConnError, setCompanyConnError] = useState('');

  // Email verification state (inline in step 2) — link-based, no OTP
  const [emailVerifyState, setEmailVerifyState] = useState<'idle' | 'sending' | 'pending' | 'verified'>('idle');
  const [emailVerifyError, setEmailVerifyError] = useState('');
  const [emailVerifyCooldown, setEmailVerifyCooldown] = useState(0);

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

  useEffect(() => {
    const hasRestorableProgress = (f: Partial<OnboardingFormData>, s = 0) => {
    const hasRealData = !!(f.companyName || f.workEmail || f.contactName || f.organizationNumber);
      const changedFromDefaults = !!f.acceptedTerms || !!f.authorizedSignatory;
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
          const restoredStep = Math.min(res.draft.progress?.step ?? 0, 1);
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
      const restoredStep = Math.min(parsed.step ?? 0, 1);
      if (hasRestorableProgress(parsed.form, restoredStep)) {
        hasUserInteractedRef.current = true;
        setForm(prev => ({ ...prev, ...parsed.form }));
        if (restoredStep > 0) setStep(restoredStep);
      }
    }
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
    if (fieldErrors[field]) {
      setFieldErrors(prev => { const copy = { ...prev }; delete copy[field]; return copy; });
    }
    // Reset verification states if key fields change
    if (['workEmail', 'websiteUrl', 'companyName', 'organizationNumber'].includes(field)) {
      if (companyConnState !== 'idle') {
        setCompanyConnState('idle');
        setCompanyConnError('');
      }
      if (field === 'workEmail' && emailVerifyState !== 'idle') {
        setEmailVerifyState('idle');
        setEmailVerifyError('');
      }
    }
    triggerDraftSave(next as Partial<OnboardingFormData>, step);
  };

  const [stepValidating, setStepValidating] = useState(false);

  // Step 0 (Uppgifter): validate → company connection popup → email verification popup
  const handleNextFromStep1 = async () => {
    hasUserInteractedRef.current = true;
    const missing: string[] = [];
    if (!form.companyName?.trim()) missing.push('companyName');
    if (!form.organizationNumber?.trim()) missing.push('organizationNumber');
    if (!form.contactName?.trim()) missing.push('contactName');
    if (!form.workEmail?.trim()) missing.push('workEmail');
    if (!form.contactPhone?.trim()) missing.push('contactPhone');
    if (missing.length > 0) {
      const labels: Record<string, string> = { companyName: 'Företagsnamn krävs', organizationNumber: 'Organisationsnummer krävs', contactName: 'Kontaktperson krävs', workEmail: 'Jobbmejl krävs', contactPhone: 'Telefon krävs' };
      const errs: Record<string, string> = {};
      missing.forEach(f => { errs[f] = labels[f] || 'Obligatoriskt fält'; });
      setFieldErrors(prev => ({ ...prev, ...errs }));
      return;
    }
    
    // If both already verified, go straight to next step (Bekräfta)
    if (companyConnState === 'verified' && emailVerifyState === 'verified') {
      setStep(1);
      return;
    }
    
    setStepValidating(true);
    if (companyConnState !== 'verified') setCompanyConnState('verifying');
    try {
      const res = await validateOnboarding(form as Partial<OnboardingFormData>);
      setFieldErrors(res.validation?.errors || {});
      setFieldChecks(res.validation?.checks || {});
      setAvailability(res.validation?.availability || {});
      setCompanyRegistry(res.validation?.companyRegistry || null);
      setCompanyConnection(res.validation?.companyConnection || null);
      const hasErrors = Object.keys(res.validation?.errors || {}).length > 0;
      const orgTakenNow = res.validation?.availability?.organizationNumberAvailable === false;
      const emailTakenNow = res.validation?.availability?.workEmailAvailable === false;
      const domainTrialBlocked = res.validation?.availability?.domainTrialAvailable === false;
      if (hasErrors || orgTakenNow || emailTakenNow || domainTrialBlocked) {
        setCompanyConnState('idle');
        setStepValidating(false);
        return;
      }
      // Gate: companyRegistry must be valid
      const checks = res.validation?.checks || {};
      if (!checks.companyRegistryValid) {
        setCompanyConnState('idle');
        setFieldErrors(prev => ({ ...prev, _general: 'Företaget kunde inte verifieras mot bolagsregistret. Kontrollera företagsnamn och organisationsnummer.' }));
        setStepValidating(false);
        return;
      }
      if (!checks.domainValid) {
        setCompanyConnState('idle');
        setFieldErrors(prev => ({ ...prev, _general: res.validation?.errors?.domain || 'Mejldomänen matchar inte webbplatsens domän.' }));
        setStepValidating(false);
        return;
      }

      // Show company connection verification popup
      if (companyConnState !== 'verified') {
        if (checks.companyConnectionValid) {
          // Show verified popup briefly, then proceed to email
          setCompanyConnState('verified');
          setTimeout(async () => {
            await proceedToEmailVerification();
          }, 1500);
        } else {
          // Failed — reset to idle and show error inline
          setCompanyConnState('idle');
          const connMsg = res.validation?.companyConnection?.message ||
            'Webbplats och arbetsmail kunde inte kopplas till företaget. Kontrollera att webbplatsen och mejlen hör till samma bolag.';
          setCompanyConnError(connMsg);
          setFieldErrors(prev => ({ ...prev, _companyConnection: connMsg }));
        }
      } else {
        // Company connection already verified — go to email
        await proceedToEmailVerification();
      }
    } catch {
      setCompanyConnState('idle');
      setFieldErrors(prev => ({ ...prev, _general: 'Validering misslyckades. Försök igen.' }));
    } finally {
      setStepValidating(false);
    }
  };

  // Separate function to proceed to email verification (called after company connection is verified)
  const proceedToEmailVerification = async () => {
    // If email already verified, go to next step
    if (emailVerifyState === 'verified') {
      setStep(1);
      return;
    }

    // Save draft to ensure draftId exists for verification
    const draftRes = await saveDraft({
      ...form, countryCode: 'SE', draftId: draftIdRef.current, resumeToken: resumeTokenRef.current,
      progressStep: 0, progressPercent: 30,
    } as any);
    if (draftRes.draft) {
      setDraftId(draftRes.draft.id);
      setResumeToken(draftRes.draft.resumeToken);
      saveDraftLocal(draftRes.draft.id, draftRes.draft.resumeToken);
      draftIdRef.current = draftRes.draft.id;
      resumeTokenRef.current = draftRes.draft.resumeToken;
    }
    // Send email verification link
    setEmailVerifyState('sending');
    setEmailVerifyError('');
    try {
      await sendOnboardingEmailVerification({
        email: form.workEmail!,
        draftId: draftIdRef.current!,
      });
      setEmailVerifyState('pending');
      setEmailVerifyCooldown(60);
    } catch (err: any) {
      setEmailVerifyError(err?.message || 'Kunde inte skicka verifieringsmail.');
      setEmailVerifyState('idle');
    }
  };

  // Email verification polling — auto-detect when user verifies via link in another tab
  useEffect(() => {
    if (step !== 1 || emailVerifyState !== 'pending' || !draftIdRef.current) return;
    const interval = setInterval(async () => {
      try {
        const res = await checkOnboardingEmailVerification(draftIdRef.current!);
        if (res.emailVerification?.status === 'verified') {
          setEmailVerifyState('verified');
          toast({ title: 'E-post verifierad', description: 'Din företagsmail har bekräftats.' });
          setTimeout(() => setStep(2), 1500);
        }
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [step, emailVerifyState]);

  // Email verification cooldown timer
  useEffect(() => {
    if (emailVerifyCooldown <= 0) return;
    const timer = setTimeout(() => setEmailVerifyCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [emailVerifyCooldown]);

  const handleResendVerification = async () => {
    if (emailVerifyCooldown > 0) return;
    setEmailVerifyError('');
    try {
      const res = await sendOnboardingEmailVerification({
        email: form.workEmail!,
        draftId: draftIdRef.current!,
      });
      setEmailVerifyCooldown(res.retryAfterMs ? Math.ceil(res.retryAfterMs / 1000) : 60);
    } catch (err: any) {
      setEmailVerifyError(err?.message || 'Kunde inte skicka ny kod.');
    }
  };

  // No auto-switch — user picks plan manually. Both plans allow extra seats at 249 kr/st.

  useEffect(() => {
    if (initialMountRef.current) return;
    hasUserInteractedRef.current = true;
    saveFormLocal(form, step);
    if (step < 3) triggerDraftSave(form as Partial<OnboardingFormData>, step);
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

  useEffect(() => {
    apiClient.getEnterpriseOnboardingAuto()
      .then(data => setOnboardingEnabled(data.enabled))
      .catch(() => setOnboardingEnabled(false));
  }, []);

  // Pre-fill form from logged-in user (only on initial mount, before interaction)
  useEffect(() => {
    if (!user || hasUserInteractedRef.current) return;
    const prefill: Partial<OnboardingFormData> = {};
    if (user.email && !form.workEmail) prefill.workEmail = user.email;
    if ((user as any).name && !form.contactName) prefill.contactName = (user as any).name;
    if (Object.keys(prefill).length > 0) {
      setForm(prev => ({ ...prev, ...prefill }));
    }
  }, [user]);

  const selectedPlan = PLANS.find(p => p.id === form.planType) || PLANS[0];
  const seats = form.expectedSeats || 5;
  // Seats from step 0 is only a recommendation — no extra seats in onboarding
  const extraSeats = 0;
  const monthlyTotal = selectedPlan.priceSek;

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
    setFirstChargeEstimate(null);
    try {
      clearTimeout(draftTimer.current);
      const valRes = await validateOnboarding({ ...form, requireCommitments: true } as any);
      if (!valRes.valid) {
        setFieldErrors(valRes.validation?.errors || {});
        setFieldChecks(valRes.validation?.checks || {});
        setAvailability(valRes.validation?.availability || {});
        setCompanyRegistry(valRes.validation?.companyRegistry || null);
        setCompanyConnection(valRes.validation?.companyConnection || null);
        setSubmitError('Vänligen korrigera felen innan du fortsätter.');
        setIsSubmitting(false);
        return;
      }
      const draftRes = await saveDraft({
        ...form, countryCode: 'SE', draftId: draftIdRef.current, resumeToken: resumeTokenRef.current,
        progressStep: 2, progressPercent: 75,
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
      const fce = extractFirstChargeEstimate(subscribeRes);
      if (fce) setFirstChargeEstimate(fce);
      const mode = billing?.stripePublishableKeyMode;
      if (mode) setStripeMode(mode);
      if (billing?.readyForTrialStart || billing?.paymentMethodSaved) {
        setSetupIntentClientSecret(null);
        setStripePublishableKey(pkKey);
        setStep(3);
        return;
      }
      if (!pkKey) { setSubmitError('Stripe-konfigurationsfel (publishable key saknas). Kontakta support.'); setIsSubmitting(false); return; }
      if (!secret) { setSubmitError('Kunde inte initiera kortregistrering. Försök igen.'); setIsSubmitting(false); return; }
      setStripePublishableKey(pkKey);
      setSetupIntentClientSecret(secret);
      setStep(3);
    } catch (err: any) {
      const status = err?.status;
      const code = err?.code || err?.error;
      if (status === 503 && (code === 'stripe_key_mismatch' || code === 'stripe_publishable_key_missing')) {
        setSubmitError('Stripe-konfigurationsfel på serversidan. Kontakta support@tivly.se.');
      } else if (status === 409 && code === 'payment_method_required_before_trial') {
        setSubmitError('Betalkort krävs innan trial kan startas.');
      } else {
        setSubmitError(err?.message || err?.error || 'Kunde inte initiera betalningssteget. Försök igen.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const [completedBilling, setCompletedBilling] = useState<any>(null);

  const handleCardConfirmedStartTrial = async () => {
    try {
      const res = await startTrial({ ...(form as OnboardingFormData), draftId, resumeToken });
      setCompletedEmail(res.invitation?.email || form.workEmail || '');
      if ((res as any).billing?.firstCharge) setCompletedBilling((res as any).billing.firstCharge);
      clearDraftLocal();
      clearFormLocal();
      setAllDone(true);
    } catch (err: any) {
      throw err;
    }
  };

  // ─── Loading / disabled gate ───
  if (onboardingEnabled === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (onboardingEnabled === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3 max-w-sm">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <h1 className="text-lg font-semibold text-foreground">Onboarding ej tillgänglig</h1>
          <p className="text-sm text-muted-foreground">
            Self-serve Team-onboarding är för tillfället inaktiverad. Kontakta oss för att komma igång.
          </p>
        </div>
      </div>
    );
  }

  // ─── Done screen ───
  if (allDone) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full border border-border bg-card p-8 sm:p-10 space-y-6">
          <div className="flex justify-center">
            <div className="h-14 w-14 border-2 border-primary/20 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-xl font-semibold text-foreground">Trial aktiverad</h1>
            <p className="text-sm text-muted-foreground">
              Välkommen till Tivly Team. Debitering sker automatiskt efter 7 dagar.
            </p>
          </div>

          {completedBilling && (
            <div className="border border-border divide-y divide-border">
              {completedBilling.activationFeeSek != null && (
                <div className="flex justify-between px-4 py-2.5 text-xs">
                  <span className="text-muted-foreground">Aktiveringsavgift (efter trial)</span>
                  <span className="text-foreground font-medium">{fmt(completedBilling.activationFeeSek)} kr</span>
                </div>
              )}
              {completedBilling.monthlyTotalSek != null && (
                <div className="flex justify-between px-4 py-2.5 text-xs">
                  <span className="text-muted-foreground">Månadsavgift</span>
                  <span className="text-foreground font-medium">{fmt(completedBilling.monthlyTotalSek)} kr/mån</span>
                </div>
              )}
              <div className="px-4 py-2">
                <p className="text-[10px] text-muted-foreground">Exkl. moms</p>
              </div>
            </div>
          )}

          <div className="border border-border divide-y divide-border">
            {[
              { n: '1', icon: Mail, text: <>Öppna inbjudan i <span className="text-foreground font-medium">{completedEmail}</span></> },
              { n: '2', icon: ArrowRight, text: 'Klicka på länken för att logga in' },
              { n: '3', icon: Users, text: 'Bjud in ditt team och börja använda Tivly' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-4">
                <item.icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-sm text-muted-foreground">{item.text}</span>
              </div>
            ))}
          </div>
          <div className="text-center space-y-3">
            <a href="/auth" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors">
              Gå till inloggning <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <p className="text-[11px] text-muted-foreground">© {new Date().getFullYear()} <a href="https://lyrio.se" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Lyrio AB</a></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/auth" className="text-sm font-semibold tracking-wide text-foreground hover:text-primary transition-colors">Tivly</a>
            <span className="text-border">|</span>
            <span className="text-xs text-muted-foreground font-medium">Team</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {stripeMode === 'test' && (
              <span className="px-2 py-0.5 border border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-400 text-[10px] font-semibold uppercase tracking-wider">Test</span>
            )}
            {isSaving && <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Sparar</span>}
            {!isSaving && draftId && step < 3 && <span className="flex items-center gap-1.5"><Check className="h-3 w-3" />Sparat</span>}
          </div>
        </div>
      </header>

      {/* Step indicator */}
      <div className="border-b border-border bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-1 sm:gap-2">
            {STEPS.map((label, i) => {
              const isActive = i === step;
              const isDone = i < step;
              return (
                <div key={i} className="flex items-center gap-1 sm:gap-2">
                  {i > 0 && <div className={cn('h-px w-4 sm:w-8', isDone ? 'bg-foreground' : 'bg-border')} />}
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      'h-6 w-6 text-[10px] font-semibold flex items-center justify-center shrink-0 transition-colors',
                      isDone && 'bg-foreground text-background',
                      isActive && 'border-2 border-foreground text-foreground',
                      !isActive && !isDone && 'border border-border text-muted-foreground/50',
                    )}>
                      {isDone ? <Check className="h-3 w-3" /> : i + 1}
                    </div>
                    <span className={cn(
                      'text-xs hidden sm:inline transition-colors',
                      isActive && 'text-foreground font-semibold',
                      isDone && 'text-foreground',
                      !isActive && !isDone && 'text-muted-foreground/50',
                    )}>
                      {label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Info banner for existing enterprise members */}
      {enterpriseMembership?.isMember && enterpriseMembership.company?.id && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
          <div className="flex items-center gap-3 px-4 py-3 border border-primary/20 bg-primary/5 rounded-lg">
            <Info className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm text-foreground">
              Du är redan medlem i <span className="font-semibold">{enterpriseMembership.company.name || 'ett företag'}</span>.
              Du kan fortfarande skapa ett nytt Team-konto här.
            </p>
            <Button variant="ghost" size="sm" className="ml-auto shrink-0 text-xs" onClick={() => navigate('/')}>
              Gå till appen
            </Button>
          </div>
        </div>
      )}

      {/* Main content — two-column on desktop */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left: Form */}
          <main className="flex-1 min-w-0">
            {step === 0 && <StepTeamSize seats={seats} onChange={(v) => updateField('expectedSeats', v)} />}
            {step === 1 && (
              <StepDetails
                form={form}
                fieldErrors={fieldErrors}
                fieldChecks={fieldChecks}
                availability={availability}
                companyRegistry={companyRegistry}
                companyConnection={companyConnection}
                companyConnState={companyConnState}
                companyConnError={companyConnError}
                isValidating={stepValidating}
                updateField={updateField}
                emailVerifyState={emailVerifyState}
                emailVerifyError={emailVerifyError}
                emailVerifyCooldown={emailVerifyCooldown}
                onResend={handleResendVerification}
              />
            )}
            {step === 2 && <StepConfirm form={form} selectedPlan={selectedPlan} monthlyTotal={monthlyTotal} extraSeats={extraSeats} updateField={updateField} submitError={submitError} extraSeatSek={selectedPlan.extraSeatSek} />}
            {step === 3 && draftId && resumeToken && (
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
                extraSeatSek={selectedPlan.extraSeatSek}
                firstChargeEstimate={firstChargeEstimate}
                onCardConfirmed={handleCardConfirmedStartTrial}
              />
            )}

            {/* Navigation */}
            {step === 0 && (
              <div className="flex items-center justify-end mt-8 pt-6 border-t border-border">
                <Button size="sm" onClick={() => { hasUserInteractedRef.current = true; setStep(1); }} className="gap-1.5 no-hover-lift rounded-none px-6">
                  Nästa <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            {step === 1 && (
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => { hasUserInteractedRef.current = true; setStep(0); }} className="gap-1.5 text-muted-foreground no-hover-lift rounded-none">
                  <ChevronLeft className="h-4 w-4" /> Tillbaka
                </Button>
                {emailVerifyState !== 'pending' && emailVerifyState !== 'sending' && companyConnState !== 'verifying' && companyConnState !== 'verified' && (
                  <Button size="sm" onClick={handleNextFromStep1} disabled={stepValidating} className="gap-1.5 no-hover-lift rounded-none px-6 min-w-[140px]">
                    {stepValidating ? <><Loader2 className="h-4 w-4 animate-spin" /> Validerar...</> : <>Nästa <ChevronRight className="h-4 w-4" /></>}
                  </Button>
                )}
              </div>
            )}
            {step === 2 && (
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="gap-1.5 text-muted-foreground no-hover-lift rounded-none">
                  <ChevronLeft className="h-4 w-4" /> Tillbaka
                </Button>
                <Button size="sm" onClick={handleConfirmAndProceedToCard} disabled={!canProceedStep3 || isSubmitting} className="gap-1.5 min-w-[180px] no-hover-lift rounded-none px-6">
                  {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Validerar...</> : <>Fortsätt till betalning <ArrowRight className="h-4 w-4" /></>}
                </Button>
              </div>
            )}
          </main>

          {/* Right: Cost sidebar — desktop only, visible from step 2 (after plan chosen) */}
          {step >= 2 && (
            <aside className="hidden lg:block w-72 shrink-0">
              <div className="sticky top-[calc(3.5rem+3.5rem+1px)] space-y-4">
                <CostSidebar
                  selectedPlan={selectedPlan}
                  seats={seats}
                  extraSeats={extraSeats}
                  monthlyTotal={monthlyTotal}
                  step={step}
                  form={form}
                  extraSeatSek={selectedPlan.extraSeatSek}
                />
              </div>
            </aside>
          )}
        </div>
      </div>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pb-8 pt-4">
        <p className="text-[11px] text-muted-foreground text-center">
          © {new Date().getFullYear()} Tivly · <a href="https://www.tivly.se/enterprise-villkor" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">Villkor</a> · <a href="https://www.tivly.se/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">Integritet</a>
        </p>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
/* Cost Sidebar                                            */
/* ═══════════════════════════════════════════════════════ */
function CostSidebar({ selectedPlan, seats, extraSeats, monthlyTotal, step, form, extraSeatSek }: {
  selectedPlan: typeof PLANS[0]; seats: number; extraSeats: number; monthlyTotal: number; step: number;
  form: Partial<OnboardingFormData>; extraSeatSek: number;
}) {
  const trialDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  return (
    <div className="border border-border divide-y divide-border">
      <div className="px-4 py-3 bg-muted/30">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Prisöversikt</p>
      </div>

      <div className="px-4 py-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Plan</span>
          <span className="text-foreground font-medium">{selectedPlan.name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Inkluderade platser</span>
          <span className="text-foreground font-medium">{selectedPlan.seats} st</span>
        </div>
        {extraSeats > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Extra platser</span>
            <span className="text-foreground font-medium">{extraSeats} × {fmt(extraSeatSek)} kr</span>
          </div>
        )}
      </div>

      <div className="px-4 py-3 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Idag</span>
          <span className="text-foreground font-semibold">0 kr</span>
        </div>
        <p className="text-[11px] text-muted-foreground">7 dagars gratis trial</p>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Från {trialDate}</span>
          <span className="text-foreground font-semibold">{fmt(monthlyTotal)} kr/mån</span>
        </div>
        {selectedPlan.activationSek > 0 && (
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Aktivering (engång)</span>
            <span className="text-muted-foreground">{fmt(selectedPlan.activationSek)} kr</span>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">Exkl. moms</p>
      </div>

      {step >= 2 && form.companyName && (
        <div className="px-4 py-3 space-y-1">
          <p className="text-[11px] text-muted-foreground font-medium">Företag</p>
          <p className="text-sm text-foreground truncate">{form.companyName}</p>
          {form.workEmail && <p className="text-[11px] text-muted-foreground truncate">{form.workEmail}</p>}
        </div>
      )}

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Shield className="h-3 w-3 shrink-0" />
          <span>Krypterad · GDPR · ISO 27001</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
/* STEP 0: Team Size                                       */
/* ═══════════════════════════════════════════════════════ */
function StepTeamSize({ seats, onChange }: { seats: number; onChange: (v: number) => void }) {
  const presets = [5, 10, 15, 25, 50];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Hur stort är ert team?</h2>
        <p className="text-sm text-muted-foreground mt-1">Vi rekommenderar en plan baserat på ert behov.</p>
      </div>

      <div className="border border-border p-6 sm:p-8">
        <div className="flex items-center justify-center gap-6 sm:gap-8">
          <button
            onClick={() => onChange(Math.max(1, seats - 1))}
            className="h-10 w-10 sm:h-12 sm:w-12 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors no-hover-lift"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="text-center min-w-[90px]">
            <span className="text-5xl sm:text-6xl font-semibold text-foreground tabular-nums block">{seats}</span>
            <p className="text-xs text-muted-foreground mt-2">användare</p>
          </div>
          <button
            onClick={() => onChange(Math.min(500, seats + 1))}
            className="h-10 w-10 sm:h-12 sm:w-12 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground transition-colors no-hover-lift"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 flex-wrap">
        {presets.map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors no-hover-lift border',
              seats === n
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
            )}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="border border-border p-4 flex items-start gap-3">
        <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Vi matchar en plan baserat på ert teamstorlek. Prisdetaljer visas i ett senare steg.
        </p>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════ */
/* STEP 2: Details + Inline Email Verification             */
/* ═══════════════════════════════════════════════════════ */
function StepDetails({ form, fieldErrors, fieldChecks, availability, companyRegistry, companyConnection,
  companyConnState, companyConnError,
  isValidating, updateField,
  emailVerifyState, emailVerifyError, emailVerifyCooldown, onResend,
}: {
  form: Partial<OnboardingFormData>; fieldErrors: Record<string, string>;
  fieldChecks: Record<string, boolean>;
  availability: ValidationResponse['validation']['availability'];
  companyRegistry: CompanyRegistryResult | null;
  companyConnection: CompanyConnectionResult | null;
  companyConnState: 'idle' | 'verifying' | 'verified' | 'failed';
  companyConnError: string;
  isValidating: boolean; updateField: (f: string, v: any) => void;
  emailVerifyState: 'idle' | 'sending' | 'pending' | 'verified';
  emailVerifyError: string;
  emailVerifyCooldown: number;
  onResend: () => void;
}) {
  const orgTaken = availability?.organizationNumberAvailable === false;
  const emailTaken = availability?.workEmailAvailable === false;

  const registryStatusLabel = (status: string) => {
    switch (status) {
      case 'verified': return { text: 'Företaget verifierat', color: 'text-primary', icon: CheckCircle2 };
      case 'company_name_mismatch': return { text: 'Bolagsnamnet matchar inte organisationsnumret', color: 'text-destructive', icon: AlertCircle };
      case 'organization_not_found': return { text: 'Organisationsnumret hittades inte', color: 'text-destructive', icon: AlertCircle };
      case 'blocked': return { text: 'Företaget kan inte registreras', color: 'text-destructive', icon: AlertCircle };
      case 'rate_limited': return { text: 'Verifiering tillfälligt otillgänglig, försök igen', color: 'text-muted-foreground', icon: Clock };
      case 'unavailable': return { text: 'Verifiering tillfälligt otillgänglig', color: 'text-muted-foreground', icon: Clock };
      case 'test_bypass': return { text: 'Testläge — verifiering kringgås', color: 'text-muted-foreground', icon: Info };
      default: return { text: `Verifieringsstatus: ${status}`, color: 'text-muted-foreground', icon: Info };
    }
  };

  const showCompanyConnDialog = companyConnState === 'verifying' || companyConnState === 'verified';
  const showVerification = emailVerifyState === 'sending' || emailVerifyState === 'pending' || emailVerifyState === 'verified';
  const fieldsLocked = showCompanyConnDialog || showVerification;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Företag & kontakt</h2>
          <p className="text-sm text-muted-foreground mt-1">Uppgifter om ert svenska företag och kontaktperson.</p>
        </div>
        {isValidating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Company section */}
      <div className="border border-border">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Företag</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <FieldInput icon={Building2} label="Företagsnamn" id="companyName" placeholder="Acme AB" value={form.companyName || ''} onChange={(v) => updateField('companyName', v)} error={fieldErrors.companyName} valid={fieldChecks.companyNameValid} required disabled={fieldsLocked} />
            <FieldInput icon={Hash} label="Organisationsnummer" id="organizationNumber" placeholder="556016-0680" value={form.organizationNumber || ''} onChange={(v) => updateField('organizationNumber', v)} error={orgTaken ? 'Redan registrerat.' : fieldErrors.organizationNumber} valid={fieldChecks.organizationNumberValid && !orgTaken} hint="XXXXXX-XXXX" required disabled={fieldsLocked} />
          </div>
          <FieldInput icon={Globe} label="Webbplats" id="websiteUrl" placeholder="https://acme.se" value={form.websiteUrl || ''} onChange={(v) => updateField('websiteUrl', v)} error={fieldErrors.websiteUrl} valid={fieldChecks.websiteUrlValid} disabled={fieldsLocked} />

          {/* Company registry verification status */}
          {companyRegistry?.checked && (
            <div className={cn(
              'flex items-center gap-2 px-4 py-2.5 border',
              companyRegistry.ok ? 'border-primary/20 bg-primary/5' : 'border-destructive/20 bg-destructive/5',
            )}>
              {(() => {
                const s = registryStatusLabel(companyRegistry.status);
                const Icon = s.icon;
                return (
                  <>
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', s.color)} />
                    <span className={cn('text-xs font-medium', s.color)}>{s.text}</span>
                  </>
                );
              })()}
            </div>
          )}

          {/* Company connection verification status */}
          {companyConnection?.checked && (
            <div className={cn(
              'flex items-start gap-2 px-4 py-2.5 border',
              companyConnection.ok ? 'border-primary/20 bg-primary/5' : 'border-destructive/20 bg-destructive/5',
            )}>
              {companyConnection.ok ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                  <div>
                    <span className="text-xs font-medium text-primary">Företagskoppling verifierad</span>
                    {companyConnection.reason && <p className="text-[11px] text-muted-foreground mt-0.5">{companyConnection.reason}</p>}
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
                  <div>
                    <span className="text-xs font-medium text-destructive">
                      {companyConnection.status === 'website_unreachable' ? 'Webbplatsen kunde inte nås' :
                       companyConnection.status === 'ai_rejected' ? 'Webbplats och mejl kunde inte kopplas till företaget' :
                       companyConnection.status === 'insufficient_evidence' ? 'Otillräcklig evidens för företagskoppling' :
                       'Företagskoppling kunde inte verifieras'}
                    </span>
                    {companyConnection.message && <p className="text-[11px] text-muted-foreground mt-0.5">{companyConnection.message}</p>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Contact section */}
      <div className="border border-border">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kontaktperson</span>
        </div>
        <div className="p-5 space-y-4">
          <FieldInput icon={User} label="Namn" id="contactName" placeholder="Anna Andersson" value={form.contactName || ''} onChange={(v) => updateField('contactName', v)} error={fieldErrors.contactName} valid={fieldChecks.contactNameValid} required disabled={fieldsLocked} />
          <div className="grid sm:grid-cols-2 gap-4">
            <FieldInput icon={Mail} label="Jobbmejl" id="workEmail" type="email" placeholder="anna@acme.se" value={form.workEmail || ''} onChange={(v) => updateField('workEmail', v)} error={emailTaken ? 'Redan registrerad.' : fieldErrors.workEmail} valid={fieldChecks.workEmailValid && !emailTaken} hint="Ingen gratismail" required disabled={fieldsLocked} />
            <FieldInput icon={Phone} label="Telefon" id="contactPhone" placeholder="+46 70 123 45 67" value={form.contactPhone || ''} onChange={(v) => updateField('contactPhone', v)} error={fieldErrors.contactPhone} valid={fieldChecks.contactPhoneValid} required disabled={fieldsLocked} />
          </div>
        </div>
      </div>

      {/* Company connection verification dialog */}
      <Dialog open={showCompanyConnDialog && !showVerification} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-sm rounded-none" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-center text-base">
              {companyConnState === 'verifying' && 'Verifierar företagskoppling…'}
              {companyConnState === 'verified' && 'Företagskoppling verifierad'}
            </DialogTitle>
            <DialogDescription className="text-center">
              {companyConnState === 'verifying' && 'Vi kontrollerar att webbplatsen och arbetsmailen hör till samma företag.'}
              {companyConnState === 'verified' && (
                <>Webbplats och mejl har kopplats till <span className="text-foreground font-medium">{form.companyName}</span>.</>
              )}
            </DialogDescription>
          </DialogHeader>

          {companyConnState === 'verifying' && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {companyConnState === 'verified' && (
            <div className="flex items-center justify-center gap-2 py-3">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Går vidare till e-postverifiering…</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Email verification dialog */}
      <Dialog open={showVerification} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-sm rounded-none" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-center text-base">
              {emailVerifyState === 'sending' && 'Skickar verifieringsmail…'}
              {emailVerifyState === 'pending' && 'Verifiera din e-post'}
              {emailVerifyState === 'verified' && 'E-post verifierad'}
            </DialogTitle>
            <DialogDescription className="text-center">
              {emailVerifyState === 'sending' && 'Vänta medan vi skickar ett mail till dig.'}
              {emailVerifyState === 'pending' && (
                <>En verifieringslänk har skickats till <span className="text-foreground font-medium">{form.workEmail}</span></>
              )}
              {emailVerifyState === 'verified' && 'Din företagsmail har bekräftats. Vi går vidare…'}
            </DialogDescription>
          </DialogHeader>

          {emailVerifyState === 'sending' && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {emailVerifyState === 'pending' && (
            <div className="space-y-3 mt-1">
              <div className="flex items-center justify-center gap-2 px-4 py-3 border border-border bg-muted/30">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">Väntar på att du klickar länken i mailet…</span>
              </div>

              {emailVerifyError && (
                <div className="flex items-center gap-2 px-3 py-2 border border-destructive/20 bg-destructive/5">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <p className="text-xs text-destructive">{emailVerifyError}</p>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full rounded-none"
                onClick={onResend}
                disabled={emailVerifyCooldown > 0}
              >
                {emailVerifyCooldown > 0 ? `Skicka nytt mail (${emailVerifyCooldown}s)` : 'Skicka nytt verifieringsmail'}
              </Button>

              <p className="text-[11px] text-muted-foreground text-center">
                Hittar du inte mailet? Kontrollera skräppost eller <a href="mailto:support@tivly.se" className="underline hover:text-foreground transition-colors">kontakta support</a>.
              </p>
            </div>
          )}

          {emailVerifyState === 'verified' && (
            <div className="flex items-center justify-center gap-2 py-3">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Går vidare…</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {(orgTaken || emailTaken) && (
        <div className="border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">
            {orgTaken && emailTaken ? 'Organisationsnummer och mejl redan registrerade.' : orgTaken ? 'Organisationsnumret redan registrerat.' : 'Mejladressen redan registrerad.'}
            {' '}Kontakta <a href="mailto:support@tivly.se" className="underline font-medium">support@tivly.se</a>.
          </p>
        </div>
      )}

      {availability?.domainTrialAvailable === false && availability?.domainTrialLock && (
        <div className="border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">
            Domänen <span className="font-medium">{availability.domainTrialLock.domain}</span> har redan en aktiv trial
            {availability.domainTrialLock.lockExpiresAt && ` (spärrad till ${new Date(availability.domainTrialLock.lockExpiresAt).toLocaleDateString('sv-SE')})`}.
            {' '}Kontakta <a href="mailto:support@tivly.se" className="underline font-medium">support@tivly.se</a>.
          </p>
        </div>
      )}

      {fieldErrors._companyConnection && (
        <div className="border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-destructive font-medium">Företagskoppling kunde inte verifieras</p>
            <p className="text-xs text-destructive/80 mt-1">{fieldErrors._companyConnection}</p>
            {companyConnection?.websiteDomain && (
              <p className="text-[11px] text-muted-foreground mt-1.5">Webbdomän: {companyConnection.websiteDomain} · Mejldomän: {companyConnection.workEmailDomain || '–'}</p>
            )}
          </div>
        </div>
      )}

      {fieldErrors._general && (
        <div className="border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{fieldErrors._general}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Field input ─── */
function FieldInput({ label, id, placeholder, value, onChange, error, valid, hint, type = 'text', required, icon: Icon, disabled }: {
  label: string; id: string; placeholder: string; value: string; onChange: (v: string) => void;
  error?: string; valid?: boolean; hint?: string; type?: string; required?: boolean; icon?: any; disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}{required && ' *'}</Label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none z-10" />}
        <Input id={id} type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={cn('rounded-none border-border focus:border-foreground', Icon && 'pl-9', error && 'border-destructive focus:border-destructive', disabled && 'opacity-60')} />
      </div>
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" /> {error}</p>}
      {!error && valid && value && <p className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> OK</p>}
      {!error && !valid && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
/* STEP 3: Confirm                                         */
/* ═══════════════════════════════════════════════════════ */
function StepConfirm({ form, selectedPlan, monthlyTotal, extraSeats, updateField, submitError, extraSeatSek }: {
  form: Partial<OnboardingFormData>; selectedPlan: typeof PLANS[0]; monthlyTotal: number; extraSeats: number;
  updateField: (f: string, v: any) => void; submitError: string; extraSeatSek: number;
}) {
  const seats = form.expectedSeats || 0;
  const planLabel = selectedPlan.name;
  const rows = [
    { label: 'Företag', value: form.companyName || '–', icon: Building2 },
    { label: 'Orgnr', value: form.organizationNumber || '–', icon: Hash },
    { label: 'Kontakt', value: form.contactName || '–', icon: User },
    { label: 'Mejl', value: form.workEmail || '–', icon: Mail },
    { label: 'Telefon', value: form.contactPhone || '–', icon: Phone },
    { label: 'Plan', value: planLabel, icon: CreditCard },
    { label: 'Månadsavgift', value: `${fmt(selectedPlan.priceSek)} SEK/mån`, icon: CreditCard },
    { label: 'Inkluderade användare', value: `${selectedPlan.seats} st`, icon: Users },
    { label: 'Totalt antal användare', value: `${seats} st`, icon: Users },
    ...(extraSeats > 0 ? [{ label: 'Extra användare', value: `${extraSeats} st × ${fmt(extraSeatSek)} SEK/mån`, icon: Plus }] : []),
    ...(selectedPlan.activationSek > 0 ? [{ label: 'Aktiveringsavgift', value: `${fmt(selectedPlan.activationSek)} SEK (efter trial)`, icon: Clock }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Bekräfta uppgifter</h2>
        <p className="text-sm text-muted-foreground mt-1">Granska innan du fortsätter till kortregistrering.</p>
      </div>

      <div className="border border-border divide-y divide-border">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 text-sm gap-4">
            <span className="text-muted-foreground flex items-center gap-2">
              <row.icon className="h-3.5 w-3.5 shrink-0" />
              {row.label}
            </span>
            <span className="text-foreground font-medium text-right truncate">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox checked={form.acceptedTerms || false} onCheckedChange={(c) => updateField('acceptedTerms', c === true)} className="mt-0.5 rounded-none" />
          <span className="text-sm text-muted-foreground">
            Jag godkänner <a href="https://www.tivly.se/enterprise-villkor" target="_blank" rel="noopener noreferrer" className="text-foreground underline">enterprise-villkoren</a> och <a href="https://www.tivly.se/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-foreground underline">integritetspolicyn</a>.
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox checked={form.authorizedSignatory || false} onCheckedChange={(c) => updateField('authorizedSignatory', c === true)} className="mt-0.5 rounded-none" />
          <span className="text-sm text-muted-foreground">Jag är behörig att teckna avtal för {form.companyName || 'företaget'}.</span>
        </label>
      </div>

      {submitError && (
        <div className="border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{submitError}</p>
        </div>
      )}

      <div className="border border-border p-4 flex items-start gap-3">
        <CreditCard className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          I nästa steg registrerar du ett betalkort. <strong className="text-foreground">Ingen debitering sker under trial-perioden.</strong>
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
/* STEP 4: Card Payment                                    */
/* ═══════════════════════════════════════════════════════ */
function StepCardPayment({ draftId, resumeToken, initialClientSecret, stripePublishableKey, email, monthlyTotal, planBaseSek, activationFeeSek, includedSeats, expectedSeats, extraSeats, extraSeatSek, firstChargeEstimate, onCardConfirmed }: {
  draftId: string; resumeToken: string; initialClientSecret: string | null; stripePublishableKey: string | null;
  email: string; monthlyTotal: number; planBaseSek: number; activationFeeSek: number; includedSeats: number; expectedSeats: number; extraSeats: number; extraSeatSek: number;
  firstChargeEstimate: any; onCardConfirmed: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(!initialClientSecret);
  const [clientSecret, setClientSecret] = useState<string | null>(initialClientSecret);
  const [error, setError] = useState('');
  const [readyForTrialStart, setReadyForTrialStart] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);
  const [resolvedStripePromise, setResolvedStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [currentPk, setCurrentPk] = useState<string | null>(stripePublishableKey);

  const trialChargeDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  const fce = firstChargeEstimate;
  const showActivation = fce?.activationFeeSek ?? activationFeeSek;
  const showMonthly = fce?.monthlyTotalSek ?? monthlyTotal;
  const showTotal = fce?.expectedTotalSek ?? (showActivation + showMonthly);
  const showTrialDays = fce?.trialDays ?? 7;

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
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Registrera betalmetod</h2>
        <p className="text-sm text-muted-foreground mt-1">Ingen debitering under {showTrialDays} dagars trial.</p>
      </div>

      {/* Cost breakdown */}
      <div className="border border-border divide-y divide-border">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <span className="text-sm font-medium text-foreground">Idag</span>
            <p className="text-xs text-muted-foreground">{showTrialDays} dagars gratis trial</p>
          </div>
          <span className="text-xl font-semibold text-foreground">0 kr</span>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{trialChargeDate}</span>
            <span className="text-sm font-semibold text-foreground">{fmt(showTotal)} kr</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            {showActivation > 0 && <div className="flex justify-between"><span>Aktiveringsavgift</span><span>{fmt(showActivation)} kr</span></div>}
            <div className="flex justify-between"><span>Plan ({includedSeats} anv. inkl.)</span><span>{fmt(planBaseSek)} kr</span></div>
            {extraSeats > 0 && <div className="flex justify-between"><span>{extraSeats} extra × {fmt(extraSeatSek)} kr</span><span>{fmt(extraSeats * extraSeatSek)} kr</span></div>}
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-muted-foreground">Därefter/mån</span>
          <span className="text-sm font-semibold text-foreground">{fmt(showMonthly)} kr</span>
        </div>
        <div className="px-4 py-2.5">
          <p className="text-[11px] text-muted-foreground">Exkl. moms · {expectedSeats} användare</p>
        </div>
      </div>

      {/* Email notice */}
      <div className="border border-border p-3 flex items-center gap-3">
        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          Inbjudan skickas till <span className="text-foreground font-medium">{email}</span> efter kort sparats.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && !loading && (
        <div className="border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={loadCardSetup} className="rounded-none">Försök igen</Button>
        </div>
      )}

      {!loading && !error && readyForTrialStart && (
        <div className="border border-border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <p className="text-sm text-foreground font-medium">Kort sparat</p>
          </div>
          <p className="text-sm text-muted-foreground">Betalmetod är registrerad. Du kan starta trial direkt.</p>
          <Button type="button" onClick={handleStartTrialNow} disabled={startingTrial} className="w-full h-11 no-hover-lift rounded-none text-sm font-medium">
            {startingTrial ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Startar trial...</> : 'Starta trial nu'}
          </Button>
        </div>
      )}

      {!loading && !error && !readyForTrialStart && clientSecret && resolvedStripePromise && (
        <Elements stripe={resolvedStripePromise} options={{
          clientSecret,
          appearance: {
            theme: 'flat',
            variables: {
              fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
              fontSizeBase: '14px',
              borderRadius: '0px',
              colorPrimary: 'hsl(220 10% 15%)',
              colorBackground: 'hsl(0 0% 100%)',
              colorText: 'hsl(220 10% 15%)',
              colorDanger: 'hsl(0 84% 60%)',
              spacingUnit: '4px',
              spacingGridRow: '14px',
            },
            rules: {
              '.Tab': { border: '1px solid hsl(214 32% 91%)', borderRadius: '0px', padding: '10px 12px' },
              '.Tab--selected': { border: '1px solid hsl(220 10% 15%)', backgroundColor: 'hsl(220 10% 15% / 0.03)' },
              '.Tab:hover': { border: '1px solid hsl(220 10% 40%)' },
              '.Input': { border: '1px solid hsl(214 32% 91%)', borderRadius: '0px', padding: '10px 12px' },
              '.Input:focus': { border: '1px solid hsl(220 10% 15%)', boxShadow: 'none' },
              '.Label': { fontSize: '12px', fontWeight: '500', color: 'hsl(220 8% 46%)', marginBottom: '4px' },
            },
          },
        }}>
          <CardFormInner clientSecret={clientSecret} email={email} onCardConfirmed={onCardConfirmed} />
        </Elements>
      )}

      {!loading && !error && !readyForTrialStart && !clientSecret && !resolvedStripePromise && (
        <div className="border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <p className="text-sm text-destructive">Stripe kunde inte initieras. Kontakta support.</p>
          <Button variant="outline" size="sm" onClick={loadCardSetup} className="rounded-none">Försök igen</Button>
        </div>
      )}
    </div>
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
      <div className="border border-border p-5">
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
            <div className="border border-border px-4 py-4">
              <CardElement options={{ hidePostalCode: true }} />
            </div>
            <p className="text-xs text-muted-foreground">Fler betalmetoder kunde inte laddas.</p>
          </div>
        )}
      </div>

      {error && (
        <div className="border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive font-medium">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full h-11 rounded-none no-hover-lift text-sm font-medium"
      >
        {submitting && phase === 'card' && <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sparar betalmetod...</>}
        {submitting && phase === 'starting' && <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Startar trial...</>}
        {!submitting && <><Shield className="h-4 w-4 mr-2" /> Spara & starta 7 dagars trial</>}
      </Button>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-3 w-3" />
        <span>Krypterad anslutning via Stripe</span>
      </div>
    </form>
  );
}
