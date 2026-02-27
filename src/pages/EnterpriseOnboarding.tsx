import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ChevronRight, ChevronLeft, Check, Shield, ArrowRight, Loader2, AlertCircle, CheckCircle2, Minus, Plus, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  validateOnboarding,
  saveDraft,
  getDraft,
  startTrial,
  type OnboardingFormData,
  type ValidationResponse,
} from '@/lib/enterpriseOnboardingApi';

const PLANS = [
  {
    id: 'enterprise_small' as const,
    name: 'Small',
    priceSek: 2490,
    seats: 10,
    activationSek: 4900,
  },
  {
    id: 'enterprise_standard' as const,
    name: 'Standard',
    priceSek: 5990,
    seats: 30,
    activationSek: 9900,
  },
];

const EXTRA_SEAT_PRICE = 249;
const STEPS = ['Teamstorlek', 'Plan', 'Uppgifter', 'Bekräfta'];
const DRAFT_KEY = 'tivly_enterprise_draft';
const FORM_KEY = 'tivly_enterprise_form';

function saveDraftLocal(draftId: string, resumeToken: string) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ draftId, resumeToken })); } catch {}
}
function loadDraftLocal(): { draftId: string; resumeToken: string } | null {
  try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function clearDraftLocal() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

function fmt(n: number) {
  return n.toLocaleString('sv-SE');
}

export default function EnterpriseOnboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Partial<OnboardingFormData>>({
    companyName: '',
    workEmail: '',
    planType: 'enterprise_small',
    organizationNumber: '',
    countryCode: 'SE',
    contactName: '',
    contactPhone: '',
    websiteUrl: '',
    expectedSeats: 5,
    acceptedTerms: false,
    authorizedSignatory: false,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fieldChecks, setFieldChecks] = useState<Record<string, boolean>>({});
  const [availability, setAvailability] = useState<ValidationResponse['validation']['availability']>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [completed, setCompleted] = useState(false);
  const [completedEmail, setCompletedEmail] = useState('');
  const [draftId, setDraftId] = useState<string | undefined>();
  const [resumeToken, setResumeToken] = useState<string | undefined>();

  const validateTimer = useRef<ReturnType<typeof setTimeout>>();
  const draftTimer = useRef<ReturnType<typeof setTimeout>>();

  // Refs for stale closure prevention
  const draftIdRef = useRef(draftId);
  const resumeTokenRef = useRef(resumeToken);
  const formRef = useRef(form);
  const stepRef = useRef(step);

  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);
  useEffect(() => { resumeTokenRef.current = resumeToken; }, [resumeToken]);
  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => { stepRef.current = step; }, [step]);

  const saveFormLocal = useCallback((f: Partial<OnboardingFormData>, s: number) => {
    try { localStorage.setItem(FORM_KEY, JSON.stringify({ form: f, step: s })); } catch {}
  }, []);

  // Load draft or local form on mount
  useEffect(() => {
    const hasRealData = (f: Partial<OnboardingFormData>) =>
      !!(f.companyName || f.workEmail || f.contactName || f.organizationNumber);

    const local = loadDraftLocal();
    if (local) {
      getDraft(local.draftId, local.resumeToken)
        .then((res) => {
          setDraftId(res.draft.id);
          setResumeToken(res.draft.resumeToken);
          const raw = res.draft.rawFields || {};
          const restored = { ...form, ...raw, expectedSeats: raw.expectedSeats ? Number(raw.expectedSeats) : form.expectedSeats };
          if (hasRealData(restored)) {
            setForm(restored);
            if (res.draft.progress?.step) setStep(Math.min(res.draft.progress.step, STEPS.length - 1));
          }
        })
        .catch(() => {
          clearDraftLocal();
          restoreFromLocal();
        });
    } else {
      restoreFromLocal();
    }

    function restoreFromLocal() {
      try {
        const saved = localStorage.getItem(FORM_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (parsed.form && hasRealData(parsed.form)) {
          setForm(prev => ({ ...prev, ...parsed.form }));
          if (parsed.step > 0) setStep(Math.min(parsed.step, STEPS.length - 1));
        }
      } catch {}
    }
  }, []);

  // Validate via backend API (debounced)
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

  // Save draft to server (debounced)
  const triggerDraftSave = useCallback((fields: Partial<OnboardingFormData>, currentStep: number) => {
    saveFormLocal(fields, currentStep);
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        const res = await saveDraft({
          ...fields,
          draftId: draftIdRef.current,
          resumeToken: resumeTokenRef.current,
          progressStep: currentStep,
          progressPercent: Math.round(((currentStep + 1) / STEPS.length) * 100),
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
    const next = { ...form, [field]: value };
    setForm(next);
    // Validate on step 2 (details) or whenever key fields change
    if (step >= 2) {
      triggerValidation(next as Partial<OnboardingFormData>);
    }
    triggerDraftSave(next as Partial<OnboardingFormData>, step);
  };

  // Auto-select plan based on team size
  useEffect(() => {
    const seats = form.expectedSeats || 5;
    if (seats <= 10) {
      setForm(prev => ({ ...prev, planType: 'enterprise_small' }));
    } else {
      setForm(prev => ({ ...prev, planType: 'enterprise_standard' }));
    }
  }, [form.expectedSeats]);

  // Save draft on step change & validate on step 2+
  useEffect(() => {
    saveFormLocal(form, step);
    triggerDraftSave(form as Partial<OnboardingFormData>, step);
    if (step >= 2) {
      triggerValidation(form as Partial<OnboardingFormData>);
    }
  }, [step]);

  // Beacon save on unload
  useEffect(() => {
    const handler = () => {
      const f = formRef.current;
      const s = stepRef.current;
      try { localStorage.setItem(FORM_KEY, JSON.stringify({ form: f, step: s })); } catch {}
      if (f.companyName || f.workEmail) {
        navigator.sendBeacon?.('https://api.tivly.se/enterprise/onboarding/draft',
          new Blob([JSON.stringify({
            ...f, countryCode: 'SE',
            draftId: draftIdRef.current,
            resumeToken: resumeTokenRef.current,
            progressStep: s,
            progressPercent: Math.round(((s + 1) / STEPS.length) * 100),
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

  // Availability blockers
  const orgTaken = availability?.organizationNumberAvailable === false;
  const emailTaken = availability?.workEmailAvailable === false;

  const canProceedStep2 = form.companyName && form.organizationNumber && form.contactName && form.workEmail && form.contactPhone
    && !fieldErrors.companyName && !fieldErrors.organizationNumber && !fieldErrors.contactName && !fieldErrors.workEmail && !fieldErrors.contactPhone
    && !orgTaken && !emailTaken;
  const canSubmit = form.acceptedTerms && form.authorizedSignatory && canProceedStep2;

  const handleSubmit = async () => {
    setSubmitError('');
    setIsSubmitting(true);
    try {
      // Final validation with commitments
      const valRes = await validateOnboarding({ ...form, requireCommitments: true } as any);
      if (!valRes.valid) {
        setFieldErrors(valRes.validation?.errors || {});
        setFieldChecks(valRes.validation?.checks || {});
        setAvailability(valRes.validation?.availability || {});
        setSubmitError('Vänligen korrigera felen innan du fortsätter.');
        setIsSubmitting(false);
        return;
      }
      const res = await startTrial({ ...(form as OnboardingFormData), draftId, resumeToken });
      setCompleted(true);
      setCompletedEmail(res.invitation?.email || form.workEmail || '');
      clearDraftLocal();
      try { localStorage.removeItem(FORM_KEY); } catch {}
    } catch (err: any) {
      setSubmitError(err?.message || err?.error || 'Något gick fel. Försök igen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (completed) return <CompletionScreen email={completedEmail} />;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Tivly Enterprise</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {isSaving && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Sparar</span>}
            {!isSaving && draftId && <span className="flex items-center gap-1 text-muted-foreground"><Check className="h-3 w-3" />Sparat</span>}
            <span className="text-muted-foreground/60">Steg {step + 1}/{STEPS.length}</span>
          </div>
        </div>
      </header>

      {/* Step bar */}
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i <= step ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {step === 0 && (
              <StepTeamSize seats={seats} onChange={(v) => updateField('expectedSeats', v)} />
            )}
            {step === 1 && (
              <StepPlan
                form={form}
                selectedPlan={selectedPlan}
                extraSeats={extraSeats}
                monthlyTotal={monthlyTotal}
                updateField={updateField}
              />
            )}
            {step === 2 && (
              <StepDetails
                form={form}
                fieldErrors={fieldErrors}
                fieldChecks={fieldChecks}
                availability={availability}
                isValidating={isValidating}
                updateField={updateField}
              />
            )}
            {step === 3 && (
              <StepConfirm
                form={form}
                selectedPlan={selectedPlan}
                monthlyTotal={monthlyTotal}
                extraSeats={extraSeats}
                updateField={updateField}
                submitError={submitError}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10">
          <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)} disabled={step === 0} className="gap-1.5 text-muted-foreground">
            <ChevronLeft className="h-4 w-4" /> Tillbaka
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              size="sm"
              onClick={() => setStep(s => s + 1)}
              disabled={step === 2 && !canProceedStep2}
              className="gap-1.5"
            >
              Nästa <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className="gap-1.5 min-w-[160px]"
            >
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Startar...</> : <>Starta trial <ArrowRight className="h-4 w-4" /></>}
            </Button>
          )}
        </div>
      </main>
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
        <p className="text-sm text-muted-foreground mt-1">Vi rekommenderar en plan baserat på ert behov.</p>
      </div>

      <div className="flex items-center justify-center gap-6 py-8">
        <button
          onClick={() => onChange(Math.max(1, seats - 1))}
          className="h-10 w-10 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="text-center">
          <span className="text-5xl font-bold text-foreground tabular-nums">{seats}</span>
          <p className="text-sm text-muted-foreground mt-1">användare</p>
        </div>
        <button
          onClick={() => onChange(Math.min(500, seats + 1))}
          className="h-10 w-10 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-2">
        {presets.map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
              seats === n
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:border-primary/40'
            )}
          >
            {n}
          </button>
        ))}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {seats <= 10
          ? 'Vi rekommenderar Small-planen för ert team.'
          : 'Vi rekommenderar Standard-planen för ert team.'}
      </p>
    </div>
  );
}

/* ─── STEP 1: Plan ─── */

function StepPlan({
  form,
  selectedPlan,
  extraSeats,
  monthlyTotal,
  updateField,
}: {
  form: Partial<OnboardingFormData>;
  selectedPlan: typeof PLANS[0];
  extraSeats: number;
  monthlyTotal: number;
  updateField: (f: string, v: any) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Välj plan</h2>
        <p className="text-sm text-muted-foreground mt-1">7 dagars kostnadsfri trial. Ingen betalning nu.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {PLANS.map(plan => {
          const isSelected = form.planType === plan.id;
          return (
            <button
              key={plan.id}
              onClick={() => updateField('planType', plan.id)}
              className={cn(
                'text-left rounded-lg border p-4 transition-all',
                isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">{plan.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{plan.seats} användare inkl.</p>
                </div>
                <div className={cn('h-5 w-5 rounded-full border-2 flex items-center justify-center', isSelected ? 'border-primary' : 'border-border')}>
                  {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </div>
              </div>
              <p className="mt-3">
                <span className="text-2xl font-bold text-foreground">{fmt(plan.priceSek)}</span>
                <span className="text-sm text-muted-foreground"> SEK/mån</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">Aktivering {fmt(plan.activationSek)} SEK</p>
            </button>
          );
        })}
      </div>

      {/* Price breakdown */}
      <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{selectedPlan.name} ({selectedPlan.seats} anv.)</span>
          <span className="text-foreground">{fmt(selectedPlan.priceSek)} SEK</span>
        </div>
        {extraSeats > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{extraSeats} extra × {EXTRA_SEAT_PRICE} SEK</span>
            <span className="text-foreground">{fmt(extraSeats * EXTRA_SEAT_PRICE)} SEK</span>
          </div>
        )}
        <div className="flex justify-between pt-2 border-t border-border font-medium">
          <span className="text-foreground">Totalt/mån</span>
          <span className="text-foreground">{fmt(monthlyTotal)} SEK</span>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="h-3 w-3" /> Exkl. moms. Slutpris beräknas av servern.
        </p>
      </div>
    </div>
  );
}

/* ─── STEP 2: Company + Contact ─── */

function StepDetails({
  form,
  fieldErrors,
  fieldChecks,
  availability,
  isValidating,
  updateField,
}: {
  form: Partial<OnboardingFormData>;
  fieldErrors: Record<string, string>;
  fieldChecks: Record<string, boolean>;
  availability: ValidationResponse['validation']['availability'];
  isValidating: boolean;
  updateField: (f: string, v: any) => void;
}) {
  const orgTaken = availability?.organizationNumberAvailable === false;
  const emailTaken = availability?.workEmailAvailable === false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Företag & kontakt</h2>
          <p className="text-sm text-muted-foreground mt-1">Fyll i uppgifter om ert företag och kontaktperson.</p>
        </div>
        {isValidating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <FieldInput
            label="Företagsnamn"
            id="companyName"
            placeholder="Acme AB"
            value={form.companyName || ''}
            onChange={(v) => updateField('companyName', v)}
            error={fieldErrors.companyName}
            valid={fieldChecks.companyNameValid}
            required
          />
          <FieldInput
            label="Organisationsnummer"
            id="organizationNumber"
            placeholder="556016-0680"
            value={form.organizationNumber || ''}
            onChange={(v) => updateField('organizationNumber', v)}
            error={orgTaken ? 'Detta organisationsnummer är redan registrerat.' : fieldErrors.organizationNumber}
            valid={fieldChecks.organizationNumberValid && !orgTaken}
            hint="XXXXXX-XXXX"
            required
          />
        </div>
        <FieldInput
          label="Webbplats"
          id="websiteUrl"
          placeholder="https://acme.se"
          value={form.websiteUrl || ''}
          onChange={(v) => updateField('websiteUrl', v)}
          error={fieldErrors.websiteUrl}
          valid={fieldChecks.websiteUrlValid}
        />

        <div className="border-t border-border pt-4 mt-2" />

        <FieldInput
          label="Kontaktperson"
          id="contactName"
          placeholder="Anna Andersson"
          value={form.contactName || ''}
          onChange={(v) => updateField('contactName', v)}
          error={fieldErrors.contactName}
          valid={fieldChecks.contactNameValid}
          required
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <FieldInput
            label="Jobbmejl"
            id="workEmail"
            type="email"
            placeholder="anna@acme.se"
            value={form.workEmail || ''}
            onChange={(v) => updateField('workEmail', v)}
            error={emailTaken ? 'Denna e-postadress är redan registrerad.' : fieldErrors.workEmail}
            valid={fieldChecks.workEmailValid && !emailTaken}
            hint="Ingen gratismail"
            required
          />
          <FieldInput
            label="Telefon"
            id="contactPhone"
            placeholder="+46 70 123 45 67"
            value={form.contactPhone || ''}
            onChange={(v) => updateField('contactPhone', v)}
            error={fieldErrors.contactPhone}
            valid={fieldChecks.contactPhoneValid}
            required
          />
        </div>
      </div>

      {(orgTaken || emailTaken) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">
            {orgTaken && emailTaken
              ? 'Både organisationsnumret och e-postadressen är redan registrerade.'
              : orgTaken
                ? 'Organisationsnumret är redan registrerat. Kontakta support om du behöver hjälp.'
                : 'E-postadressen är redan registrerad. Kontakta support om du behöver hjälp.'}
            {' '}<a href="mailto:support@tivly.se" className="underline">support@tivly.se</a>
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Shared field component ─── */

function FieldInput({
  label, id, placeholder, value, onChange, error, valid, hint, type = 'text', required,
}: {
  label: string; id: string; placeholder: string; value: string;
  onChange: (v: string) => void; error?: string; valid?: boolean;
  hint?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-medium">
        {label}{required && ' *'}
      </Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('mt-1', error && 'border-destructive')}
      />
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1 mt-1">
          <AlertCircle className="h-3 w-3 shrink-0" /> {error}
        </p>
      )}
      {!error && valid && value && (
        <p className="text-xs text-primary flex items-center gap-1 mt-1">
          <CheckCircle2 className="h-3 w-3" /> OK
        </p>
      )}
      {!error && !valid && hint && (
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      )}
    </div>
  );
}

/* ─── STEP 3: Confirm ─── */

function StepConfirm({
  form,
  selectedPlan,
  monthlyTotal,
  extraSeats,
  updateField,
  submitError,
}: {
  form: Partial<OnboardingFormData>;
  selectedPlan: typeof PLANS[0];
  monthlyTotal: number;
  extraSeats: number;
  updateField: (f: string, v: any) => void;
  submitError: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Bekräfta</h2>
        <p className="text-sm text-muted-foreground mt-1">Granska och starta din kostnadsfria trial.</p>
      </div>

      <div className="rounded-lg border border-border divide-y divide-border text-sm">
        <Row label="Företag" value={form.companyName || '–'} />
        <Row label="Orgnr" value={form.organizationNumber || '–'} />
        <Row label="Kontakt" value={form.contactName || '–'} />
        <Row label="Mejl" value={form.workEmail || '–'} />
        <Row label="Telefon" value={form.contactPhone || '–'} />
        <Row label="Plan" value={`${selectedPlan.name} – ${fmt(monthlyTotal)} SEK/mån`} />
        <Row label="Användare" value={String(form.expectedSeats || 0)} />
        {extraSeats > 0 && <Row label="Extra platser" value={`${extraSeats} × ${EXTRA_SEAT_PRICE} SEK`} />}
        <Row label="Aktivering" value={`${fmt(selectedPlan.activationSek)} SEK (efter trial)`} />
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            checked={form.acceptedTerms || false}
            onCheckedChange={(c) => updateField('acceptedTerms', c === true)}
            className="mt-0.5"
          />
          <span className="text-sm text-muted-foreground leading-relaxed">
            Jag godkänner <a href="https://www.tivly.se/enterprise-villkor" target="_blank" rel="noopener noreferrer" className="text-primary underline">enterprise-villkoren</a> och <a href="https://www.tivly.se/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline">integritetspolicyn</a>.
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            checked={form.authorizedSignatory || false}
            onCheckedChange={(c) => updateField('authorizedSignatory', c === true)}
            className="mt-0.5"
          />
          <span className="text-sm text-muted-foreground leading-relaxed">
            Jag är behörig att teckna avtal för {form.companyName || 'företaget'}.
          </span>
        </label>
      </div>

      {submitError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{submitError}</p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start gap-3">
        <Shield className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Ingen betalning krävs. Trial varar 7 dagar. Du aktiverar kontot via e-post.
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

/* ─── Completion ─── */

function CompletionScreen({ email }: { email: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-md w-full text-center space-y-6"
      >
        <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Kolla din e-post</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Vi har skickat en inbjudan till <strong className="text-foreground">{email}</strong>.
          </p>
        </div>
        <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground space-y-3 text-left">
          <p><strong className="text-foreground">1.</strong> Öppna mejlet och klicka på aktiveringslänken.</p>
          <p><strong className="text-foreground">2.</strong> Skapa ditt lösenord.</p>
          <p><strong className="text-foreground">3.</strong> Bjud in teammedlemmar.</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Hittar du inte mejlet? Kolla skräpposten eller mejla <a href="mailto:support@tivly.se" className="text-primary underline">support@tivly.se</a>.
        </p>
      </motion.div>
    </div>
  );
}
