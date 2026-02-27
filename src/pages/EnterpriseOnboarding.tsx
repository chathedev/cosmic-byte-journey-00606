import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Mail, User, Phone, Globe, Users, ChevronRight, ChevronLeft, Check, Shield, Sparkles, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import {
  validateOnboarding,
  saveDraft,
  getDraft,
  startTrial,
  type OnboardingFormData,
  type PricingInfo,
} from '@/lib/enterpriseOnboardingApi';

const PLANS = [
  {
    id: 'enterprise_small' as const,
    name: 'Small',
    price: '2 490',
    seats: 10,
    activation: '4 900',
    description: 'Perfekt för mindre team som vill komma igång snabbt.',
  },
  {
    id: 'enterprise_standard' as const,
    name: 'Standard',
    price: '5 990',
    seats: 30,
    activation: '9 900',
    description: 'För växande organisationer med fler behov.',
    popular: true,
  },
];

const STEPS = [
  { label: 'Företag', icon: Building2 },
  { label: 'Kontakt', icon: User },
  { label: 'Plan', icon: Sparkles },
  { label: 'Bekräfta', icon: Shield },
];

const DRAFT_STORAGE_KEY = 'tivly_enterprise_draft';

function saveDraftLocal(draftId: string, resumeToken: string) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ draftId, resumeToken }));
  } catch {}
}

function loadDraftLocal(): { draftId: string; resumeToken: string } | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearDraftLocal() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {}
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
    expectedSeats: 10,
    acceptedTerms: false,
    authorizedSignatory: false,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [completed, setCompleted] = useState(false);
  const [completedEmail, setCompletedEmail] = useState('');
  const [draftId, setDraftId] = useState<string | undefined>();
  const [resumeToken, setResumeToken] = useState<string | undefined>();
  const [validatedFields, setValidatedFields] = useState<Set<string>>(new Set());

  const validateTimer = useRef<ReturnType<typeof setTimeout>>();
  const draftTimer = useRef<ReturnType<typeof setTimeout>>();

  // Load existing draft on mount
  useEffect(() => {
    const local = loadDraftLocal();
    if (local) {
      getDraft(local.draftId, local.resumeToken)
        .then((res) => {
          setDraftId(res.draft.id);
          setResumeToken(res.draft.resumeToken);
          const raw = res.draft.rawFields || {};
          setForm((prev) => ({
            ...prev,
            ...raw,
            expectedSeats: raw.expectedSeats ? Number(raw.expectedSeats) : prev.expectedSeats,
          }));
          if (res.draft.progress?.step) {
            setStep(Math.min(res.draft.progress.step, STEPS.length - 1));
          }
        })
        .catch(() => {
          clearDraftLocal();
        });
    }
  }, []);

  // Debounced validation
  const triggerValidation = useCallback(
    (fields: Partial<OnboardingFormData>) => {
      clearTimeout(validateTimer.current);
      validateTimer.current = setTimeout(async () => {
        setIsValidating(true);
        try {
          const res = await validateOnboarding(fields);
          setFieldErrors(res.validation?.errors || {});
          // Track which fields passed
          const passed = new Set<string>();
          const allFields = ['companyName', 'workEmail', 'organizationNumber', 'contactName', 'contactPhone', 'websiteUrl', 'expectedSeats'];
          for (const f of allFields) {
            if ((fields as any)[f] && !(res.validation?.errors || {})[f]) {
              passed.add(f);
            }
          }
          setValidatedFields(passed);
        } catch {
          // Ignore validation errors
        } finally {
          setIsValidating(false);
        }
      }, 400);
    },
    []
  );

  // Debounced draft save
  const triggerDraftSave = useCallback(
    (fields: Partial<OnboardingFormData>, currentStep: number) => {
      clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          const progressPercent = Math.round(((currentStep + 1) / STEPS.length) * 100);
          const res = await saveDraft({
            ...fields,
            draftId,
            resumeToken,
            progressStep: currentStep,
            progressPercent,
          });
          if (res.draft) {
            setDraftId(res.draft.id);
            setResumeToken(res.draft.resumeToken);
            saveDraftLocal(res.draft.id, res.draft.resumeToken);
          }
        } catch {
          // Silently fail draft save
        } finally {
          setIsSaving(false);
        }
      }, 800);
    },
    [draftId, resumeToken]
  );

  const updateField = (field: string, value: any) => {
    const next = { ...form, [field]: value };
    setForm(next);
    triggerValidation(next as Partial<OnboardingFormData>);
    triggerDraftSave(next as Partial<OnboardingFormData>, step);
  };

  // Save draft on step change
  useEffect(() => {
    if (draftId) {
      triggerDraftSave(form as Partial<OnboardingFormData>, step);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Save before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (form.companyName || form.workEmail) {
        const progressPercent = Math.round(((step + 1) / STEPS.length) * 100);
        navigator.sendBeacon?.(
          'https://api.tivly.se/enterprise/onboarding/draft',
          new Blob(
            [JSON.stringify({ ...form, countryCode: 'SE', draftId, resumeToken, progressStep: step, progressPercent })],
            { type: 'application/json' }
          )
        );
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [form, step, draftId, resumeToken]);

  const canProceedStep0 = form.companyName && form.organizationNumber && !fieldErrors.companyName && !fieldErrors.organizationNumber;
  const canProceedStep1 = form.contactName && form.workEmail && form.contactPhone && !fieldErrors.contactName && !fieldErrors.workEmail && !fieldErrors.contactPhone;
  const canProceedStep2 = form.planType && (form.expectedSeats ?? 0) >= 1;
  const canSubmit = form.acceptedTerms && form.authorizedSignatory && canProceedStep0 && canProceedStep1 && canProceedStep2;

  const handleSubmit = async () => {
    setSubmitError('');
    setIsSubmitting(true);
    try {
      // Final validation with commitments
      const valRes = await validateOnboarding({ ...form, requireCommitments: true } as any);
      if (!valRes.valid) {
        setFieldErrors(valRes.validation?.errors || {});
        setSubmitError('Vänligen korrigera felen ovan innan du fortsätter.');
        setIsSubmitting(false);
        return;
      }

      const res = await startTrial({
        ...(form as OnboardingFormData),
        draftId,
        resumeToken,
      });
      setCompleted(true);
      setCompletedEmail(res.invitation?.email || form.workEmail || '');
      clearDraftLocal();
    } catch (err: any) {
      setSubmitError(err?.message || err?.error || 'Något gick fel. Försök igen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercent = ((step + 1) / STEPS.length) * 100;

  if (completed) {
    return <CompletionScreen email={completedEmail} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Tivly Enterprise</h1>
              <p className="text-xs text-muted-foreground">7 dagars kostnadsfri trial</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isSaving && (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Sparar...
              </span>
            )}
            {!isSaving && draftId && (
              <span className="flex items-center gap-1 text-primary">
                <CheckCircle2 className="h-3 w-3" /> Sparat
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        {/* Step indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === step;
              const isDone = i < step;
              return (
                <button
                  key={i}
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  className={cn(
                    'flex items-center gap-2 text-sm font-medium transition-colors',
                    isActive && 'text-primary',
                    isDone && 'text-primary/70 cursor-pointer hover:text-primary',
                    !isActive && !isDone && 'text-muted-foreground/50 cursor-default'
                  )}
                >
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center transition-all text-xs',
                      isActive && 'bg-primary text-primary-foreground shadow-md',
                      isDone && 'bg-primary/15 text-primary',
                      !isActive && !isDone && 'bg-muted text-muted-foreground/50'
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>

        {/* Form steps */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            {step === 0 && (
              <StepCompany form={form} fieldErrors={fieldErrors} validatedFields={validatedFields} updateField={updateField} isValidating={isValidating} />
            )}
            {step === 1 && (
              <StepContact form={form} fieldErrors={fieldErrors} validatedFields={validatedFields} updateField={updateField} isValidating={isValidating} />
            )}
            {step === 2 && (
              <StepPlan form={form} updateField={updateField} />
            )}
            {step === 3 && (
              <StepConfirm form={form} fieldErrors={fieldErrors} updateField={updateField} submitError={submitError} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border/50">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" /> Tillbaka
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={
                (step === 0 && !canProceedStep0) ||
                (step === 1 && !canProceedStep1) ||
                (step === 2 && !canProceedStep2)
              }
              className="gap-2"
            >
              Nästa <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
              className="gap-2 min-w-[180px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Startar trial...
                </>
              ) : (
                <>
                  Starta 7 dagars trial <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

/* ──────────────── STEP COMPONENTS ──────────────── */

interface StepProps {
  form: Partial<OnboardingFormData>;
  fieldErrors: Record<string, string>;
  validatedFields: Set<string>;
  updateField: (field: string, value: any) => void;
  isValidating: boolean;
}

function FieldStatus({ field, errors, validated, isValidating }: { field: string; errors: Record<string, string>; validated: Set<string>; isValidating: boolean }) {
  if (errors[field]) {
    return (
      <p className="text-xs text-destructive flex items-center gap-1 mt-1">
        <AlertCircle className="h-3 w-3" /> {errors[field]}
      </p>
    );
  }
  if (validated.has(field)) {
    return (
      <p className="text-xs text-primary flex items-center gap-1 mt-1">
        <CheckCircle2 className="h-3 w-3" /> Godkänt
      </p>
    );
  }
  return null;
}

function StepCompany({ form, fieldErrors, validatedFields, updateField, isValidating }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Företagsuppgifter</h2>
        <p className="text-muted-foreground mt-1">Ange ditt företags grunduppgifter. Endast svenska företag (SE).</p>
      </div>
      <div className="grid gap-5">
        <div>
          <Label htmlFor="companyName">Företagsnamn *</Label>
          <div className="relative mt-1.5">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="companyName"
              placeholder="Acme AB"
              value={form.companyName || ''}
              onChange={(e) => updateField('companyName', e.target.value)}
              className={cn('pl-10', fieldErrors.companyName && 'border-destructive')}
            />
          </div>
          <FieldStatus field="companyName" errors={fieldErrors} validated={validatedFields} isValidating={isValidating} />
        </div>
        <div>
          <Label htmlFor="organizationNumber">Organisationsnummer *</Label>
          <div className="relative mt-1.5">
            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="organizationNumber"
              placeholder="556016-0680"
              value={form.organizationNumber || ''}
              onChange={(e) => updateField('organizationNumber', e.target.value)}
              className={cn('pl-10', fieldErrors.organizationNumber && 'border-destructive')}
            />
          </div>
          <FieldStatus field="organizationNumber" errors={fieldErrors} validated={validatedFields} isValidating={isValidating} />
          <p className="text-xs text-muted-foreground mt-1">Svenskt format: XXXXXX-XXXX</p>
        </div>
        <div>
          <Label htmlFor="websiteUrl">Webbplats</Label>
          <div className="relative mt-1.5">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="websiteUrl"
              placeholder="https://acme.se"
              value={form.websiteUrl || ''}
              onChange={(e) => updateField('websiteUrl', e.target.value)}
              className={cn('pl-10', fieldErrors.websiteUrl && 'border-destructive')}
            />
          </div>
          <FieldStatus field="websiteUrl" errors={fieldErrors} validated={validatedFields} isValidating={isValidating} />
        </div>
      </div>
    </div>
  );
}

function StepContact({ form, fieldErrors, validatedFields, updateField, isValidating }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Kontaktperson</h2>
        <p className="text-muted-foreground mt-1">Vem ska administrera ert Tivly Enterprise-konto?</p>
      </div>
      <div className="grid gap-5">
        <div>
          <Label htmlFor="contactName">Fullständigt namn *</Label>
          <div className="relative mt-1.5">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="contactName"
              placeholder="Anna Andersson"
              value={form.contactName || ''}
              onChange={(e) => updateField('contactName', e.target.value)}
              className={cn('pl-10', fieldErrors.contactName && 'border-destructive')}
            />
          </div>
          <FieldStatus field="contactName" errors={fieldErrors} validated={validatedFields} isValidating={isValidating} />
        </div>
        <div>
          <Label htmlFor="workEmail">Jobbmejl *</Label>
          <div className="relative mt-1.5">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="workEmail"
              type="email"
              placeholder="anna@acme.se"
              value={form.workEmail || ''}
              onChange={(e) => updateField('workEmail', e.target.value)}
              className={cn('pl-10', fieldErrors.workEmail && 'border-destructive')}
            />
          </div>
          <FieldStatus field="workEmail" errors={fieldErrors} validated={validatedFields} isValidating={isValidating} />
          <p className="text-xs text-muted-foreground mt-1">Gratismail (gmail, hotmail etc.) accepteras inte.</p>
        </div>
        <div>
          <Label htmlFor="contactPhone">Telefonnummer *</Label>
          <div className="relative mt-1.5">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="contactPhone"
              placeholder="+46 70 123 45 67"
              value={form.contactPhone || ''}
              onChange={(e) => updateField('contactPhone', e.target.value)}
              className={cn('pl-10', fieldErrors.contactPhone && 'border-destructive')}
            />
          </div>
          <FieldStatus field="contactPhone" errors={fieldErrors} validated={validatedFields} isValidating={isValidating} />
        </div>
      </div>
    </div>
  );
}

function StepPlan({ form, updateField }: { form: Partial<OnboardingFormData>; updateField: (f: string, v: any) => void }) {
  const selectedPlan = PLANS.find((p) => p.id === form.planType) || PLANS[0];
  const extraSeats = Math.max(0, (form.expectedSeats || 0) - selectedPlan.seats);
  const extraCost = extraSeats * 249;
  const totalMonthly = parseInt(selectedPlan.price.replace(/\s/g, '')) + extraCost;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Välj plan</h2>
        <p className="text-muted-foreground mt-1">Alla planer inkluderar 7 dagars kostnadsfri trial.</p>
      </div>

      <RadioGroup
        value={form.planType}
        onValueChange={(v) => {
          updateField('planType', v);
          // Adjust seats to match plan minimum
          const plan = PLANS.find((p) => p.id === v);
          if (plan && (form.expectedSeats || 0) < plan.seats) {
            updateField('expectedSeats', plan.seats);
          }
        }}
        className="grid md:grid-cols-2 gap-4"
      >
        {PLANS.map((plan) => (
          <label
            key={plan.id}
            className={cn(
              'relative cursor-pointer rounded-xl border-2 p-5 transition-all',
              form.planType === plan.id
                ? 'border-primary bg-primary/5 shadow-md'
                : 'border-border hover:border-primary/40'
            )}
          >
            <RadioGroupItem value={plan.id} className="sr-only" />
            {plan.popular && (
              <span className="absolute -top-3 left-4 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                Populärast
              </span>
            )}
            <div className="space-y-3">
              <h3 className="font-semibold text-lg text-foreground">{plan.name}</h3>
              <p className="text-sm text-muted-foreground">{plan.description}</p>
              <div>
                <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                <span className="text-muted-foreground text-sm"> SEK/mån</span>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" /> {plan.seats} inkluderade användare</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" /> Aktiveringsavgift {plan.activation} SEK</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" /> 249 SEK/extra användare/mån</li>
              </ul>
            </div>
          </label>
        ))}
      </RadioGroup>

      <div>
        <Label htmlFor="expectedSeats">Förväntat antal användare</Label>
        <div className="relative mt-1.5">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="expectedSeats"
            type="number"
            min={1}
            max={500}
            value={form.expectedSeats || ''}
            onChange={(e) => updateField('expectedSeats', Math.max(1, parseInt(e.target.value) || 1))}
            className="pl-10 w-40"
          />
        </div>
      </div>

      {/* Price summary */}
      <Card className="bg-muted/50">
        <CardContent className="pt-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Grundavgift ({selectedPlan.name})</span>
            <span className="font-medium text-foreground">{selectedPlan.price} SEK/mån</span>
          </div>
          {extraSeats > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{extraSeats} extra användare × 249 SEK</span>
              <span className="font-medium text-foreground">{extraCost.toLocaleString('sv-SE')} SEK/mån</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-border">
            <span className="font-semibold text-foreground">Totalt per månad</span>
            <span className="font-bold text-foreground text-lg">{totalMonthly.toLocaleString('sv-SE')} SEK</span>
          </div>
          <p className="text-xs text-muted-foreground pt-1">Slutpris beräknas av servern vid aktivering. Alla priser exkl. moms.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StepConfirm({
  form,
  fieldErrors,
  updateField,
  submitError,
}: {
  form: Partial<OnboardingFormData>;
  fieldErrors: Record<string, string>;
  updateField: (f: string, v: any) => void;
  submitError: string;
}) {
  const selectedPlan = PLANS.find((p) => p.id === form.planType) || PLANS[0];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Bekräfta och starta trial</h2>
        <p className="text-muted-foreground mt-1">Kontrollera uppgifterna och starta din 7 dagars kostnadsfria provperiod.</p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4 text-sm">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Företag</span>
              <p className="font-medium text-foreground">{form.companyName || '–'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Orgnr</span>
              <p className="font-medium text-foreground">{form.organizationNumber || '–'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Kontaktperson</span>
              <p className="font-medium text-foreground">{form.contactName || '–'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Mejl</span>
              <p className="font-medium text-foreground">{form.workEmail || '–'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Telefon</span>
              <p className="font-medium text-foreground">{form.contactPhone || '–'}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Plan</span>
              <p className="font-medium text-foreground">{selectedPlan.name} – {selectedPlan.price} SEK/mån</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Användare</span>
              <p className="font-medium text-foreground">{form.expectedSeats}</p>
            </div>
            {form.websiteUrl && (
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Webbplats</span>
                <p className="font-medium text-foreground">{form.websiteUrl}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="acceptedTerms"
            checked={form.acceptedTerms || false}
            onCheckedChange={(checked) => updateField('acceptedTerms', checked === true)}
          />
          <Label htmlFor="acceptedTerms" className="text-sm leading-relaxed cursor-pointer">
            Jag godkänner Tivlys <a href="https://tivly.se/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">användarvillkor</a> och <a href="https://tivly.se/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">integritetspolicy</a>. *
          </Label>
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="authorizedSignatory"
            checked={form.authorizedSignatory || false}
            onCheckedChange={(checked) => updateField('authorizedSignatory', checked === true)}
          />
          <Label htmlFor="authorizedSignatory" className="text-sm leading-relaxed cursor-pointer">
            Jag intygar att jag är behörig att teckna avtal för {form.companyName || 'företaget'}. *
          </Label>
        </div>
      </div>

      {submitError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{submitError}</p>
        </div>
      )}

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-5 flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Ingen betalning krävs nu</p>
            <p>Din 7 dagars trial startar direkt. Efter att du bekräftat din e-post kan du bjuda in teammedlemmar och börja använda Tivly Enterprise.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ──────────────── COMPLETION SCREEN ──────────────── */

function CompletionScreen({ email }: { email: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="max-w-lg w-full text-center space-y-6"
      >
        <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <Mail className="h-10 w-10 text-primary" />
          </motion.div>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-foreground">Kolla din e-post!</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Vi har skickat en inbjudan till <strong className="text-foreground">{email}</strong>.
          </p>
        </div>

        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">1</div>
              <p>Öppna mejlet från Tivly och klicka på aktiveringslänken.</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">2</div>
              <p>Skapa ditt lösenord och logga in.</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">3</div>
              <p>Bjud in dina teammedlemmar och börja använda Tivly Enterprise.</p>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Hittar du inte mejlet? Kontrollera din skräppost eller kontakta oss på{' '}
          <a href="mailto:support@tivly.se" className="text-primary underline">support@tivly.se</a>.
        </p>
      </motion.div>
    </div>
  );
}
