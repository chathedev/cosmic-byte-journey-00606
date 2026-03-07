import { useState, useEffect, useMemo, useCallback } from 'react';
import { Video, FileText, Mic, Sparkles, CheckCircle2 } from 'lucide-react';
import { CardSaveFooter } from './CardSaveFooter';
import { useManualSave } from '@/hooks/useManualSave';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import type { MeetingContentSettings, SettingsLock } from '@/lib/enterpriseSettingsApi';

interface Props {
  settings: Partial<MeetingContentSettings>;
  locks: Record<string, SettingsLock>;
  canEdit: boolean;
  onUpdate: (patch: Record<string, any>) => Promise<void>;
}

// ─── Controls Card ───
function ControlsCard({ settings, locks, canEdit, onUpdate }: Props) {
  const isLocked = (path: string) => !!locks[`meetingContentControls.${path}`]?.locked;

  const [recordingAllowed, setRecordingAllowed] = useState(settings.recordingAllowed ?? true);
  const [transcriptionAllowed, setTranscriptionAllowed] = useState(settings.transcriptionAllowed ?? true);
  const [aiSummaryAllowed, setAiSummaryAllowed] = useState(settings.aiSummaryAllowed ?? true);
  const [speakerIdentificationAllowed, setSpeakerIdentificationAllowed] = useState(settings.speakerIdentificationAllowed ?? false);
  const [protocolTemplatesEnabled, setProtocolTemplatesEnabled] = useState(settings.protocolTemplatesEnabled ?? true);
  const [approvalWorkflowEnabled, setApprovalWorkflowEnabled] = useState(settings.approvalWorkflowEnabled ?? false);

  const sync = useCallback(() => {
    setRecordingAllowed(settings.recordingAllowed ?? true);
    setTranscriptionAllowed(settings.transcriptionAllowed ?? true);
    setAiSummaryAllowed(settings.aiSummaryAllowed ?? true);
    setSpeakerIdentificationAllowed(settings.speakerIdentificationAllowed ?? false);
    setProtocolTemplatesEnabled(settings.protocolTemplatesEnabled ?? true);
    setApprovalWorkflowEnabled(settings.approvalWorkflowEnabled ?? false);
  }, [settings]);

  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() =>
    recordingAllowed !== (settings.recordingAllowed ?? true) ||
    transcriptionAllowed !== (settings.transcriptionAllowed ?? true) ||
    aiSummaryAllowed !== (settings.aiSummaryAllowed ?? true) ||
    speakerIdentificationAllowed !== (settings.speakerIdentificationAllowed ?? false) ||
    protocolTemplatesEnabled !== (settings.protocolTemplatesEnabled ?? true) ||
    approvalWorkflowEnabled !== (settings.approvalWorkflowEnabled ?? false),
  [recordingAllowed, transcriptionAllowed, aiSummaryAllowed, speakerIdentificationAllowed, protocolTemplatesEnabled, approvalWorkflowEnabled, settings]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onUpdate({
      meetingContentControls: {
        recordingAllowed, transcriptionAllowed, aiSummaryAllowed, speakerIdentificationAllowed,
        protocolTemplatesEnabled, approvalWorkflowEnabled,
      },
    });
  }, [isDirty, recordingAllowed, transcriptionAllowed, aiSummaryAllowed, speakerIdentificationAllowed, protocolTemplatesEnabled, approvalWorkflowEnabled, onUpdate]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });

  const toggleItems: Array<{ field: string; label: string; desc: string; icon: typeof Video; value: boolean; setter: (v: boolean) => void }> = [
    { field: 'recordingAllowed', label: 'Inspelning', desc: 'Tillåt inspelning av möten', icon: Video, value: recordingAllowed, setter: setRecordingAllowed },
    { field: 'transcriptionAllowed', label: 'Transkribering', desc: 'Tillåt automatisk transkribering', icon: Mic, value: transcriptionAllowed, setter: setTranscriptionAllowed },
    { field: 'aiSummaryAllowed', label: 'AI-sammanfattning', desc: 'Tillåt AI-genererade sammanfattningar', icon: Sparkles, value: aiSummaryAllowed, setter: setAiSummaryAllowed },
    { field: 'speakerIdentificationAllowed', label: 'Talaridentifiering', desc: 'Tillåt identifiering av talare', icon: Mic, value: speakerIdentificationAllowed, setter: setSpeakerIdentificationAllowed },
    { field: 'protocolTemplatesEnabled', label: 'Protokollmallar', desc: 'Aktivera mallbibliotek för protokoll', icon: FileText, value: protocolTemplatesEnabled, setter: setProtocolTemplatesEnabled },
    { field: 'approvalWorkflowEnabled', label: 'Godkännandeflöde', desc: 'Kräv godkännande innan protokoll publiceras', icon: CheckCircle2, value: approvalWorkflowEnabled, setter: setApprovalWorkflowEnabled },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10"><Video className="w-5 h-5 text-primary" /></div>
        <div>
          <h3 className="font-medium text-sm">Mötes- & Innehållskontroller</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Styr vad som är tillåtet i arbetsytan</p>
        </div>
      </div>
      {toggleItems.map(({ field, label, desc, icon: Icon, value, setter }) => (
        <div key={field} className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <div><p className="text-sm">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
          </div>
          <Switch checked={value} onCheckedChange={setter} disabled={!canEdit || isLocked(field) || isSaving} />
        </div>
      ))}
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

// ─── Required Fields Card ───
function RequiredFieldsCard({ settings, locks, canEdit, onUpdate }: Props) {
  const [requiredProtocolFields, setRequiredProtocolFields] = useState<string[]>(settings.requiredProtocolFields || []);

  const sync = useCallback(() => {
    setRequiredProtocolFields(settings.requiredProtocolFields || []);
  }, [settings]);

  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() =>
    JSON.stringify(requiredProtocolFields) !== JSON.stringify(settings.requiredProtocolFields || []),
  [requiredProtocolFields, settings]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onUpdate({ meetingContentControls: { requiredProtocolFields } });
  }, [isDirty, requiredProtocolFields, onUpdate]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });

  const toggleRequiredField = (field: string) => {
    if (!canEdit) return;
    setRequiredProtocolFields(prev => prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h4 className="text-sm font-medium">Obligatoriska protokollfält</h4>
      <div className="flex flex-wrap gap-2">
        {['summary', 'decisions', 'action_items', 'mainPoints'].map(field => (
          <Badge key={field} variant={requiredProtocolFields.includes(field) ? 'default' : 'outline'} className="text-xs cursor-pointer" onClick={() => toggleRequiredField(field)}>
            {field === 'summary' ? 'Sammanfattning' : field === 'decisions' ? 'Beslut' : field === 'action_items' ? 'Åtgärder' : 'Huvudpunkter'}
          </Badge>
        ))}
      </div>
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

// ─── Sharing Policy Card ───
function SharingPolicyCard({ settings, locks, canEdit, onUpdate }: Props) {
  const [allowOrgSharedMeetings, setAllowOrgSharedMeetings] = useState(settings.sharingPolicy?.allowOrgSharedMeetings ?? true);
  const [allowTeamScopedMeetings, setAllowTeamScopedMeetings] = useState(settings.sharingPolicy?.allowTeamScopedMeetings ?? true);
  const [allowExternalShareLinks, setAllowExternalShareLinks] = useState(settings.sharingPolicy?.allowExternalShareLinks ?? true);

  const sync = useCallback(() => {
    setAllowOrgSharedMeetings(settings.sharingPolicy?.allowOrgSharedMeetings ?? true);
    setAllowTeamScopedMeetings(settings.sharingPolicy?.allowTeamScopedMeetings ?? true);
    setAllowExternalShareLinks(settings.sharingPolicy?.allowExternalShareLinks ?? true);
  }, [settings]);

  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() =>
    allowOrgSharedMeetings !== (settings.sharingPolicy?.allowOrgSharedMeetings ?? true) ||
    allowTeamScopedMeetings !== (settings.sharingPolicy?.allowTeamScopedMeetings ?? true) ||
    allowExternalShareLinks !== (settings.sharingPolicy?.allowExternalShareLinks ?? true),
  [allowOrgSharedMeetings, allowTeamScopedMeetings, allowExternalShareLinks, settings]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onUpdate({
      meetingContentControls: {
        sharingPolicy: { allowOrgSharedMeetings, allowTeamScopedMeetings, allowExternalShareLinks },
      },
    });
  }, [isDirty, allowOrgSharedMeetings, allowTeamScopedMeetings, allowExternalShareLinks, onUpdate]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });

  const sharingItems = [
    { field: 'allowOrgSharedMeetings', label: 'Organisationsdelade möten', desc: 'Tillåt delning inom organisationen', value: allowOrgSharedMeetings, setter: setAllowOrgSharedMeetings },
    { field: 'allowTeamScopedMeetings', label: 'Team-möten', desc: 'Tillåt team-specifika möten', value: allowTeamScopedMeetings, setter: setAllowTeamScopedMeetings },
    { field: 'allowExternalShareLinks', label: 'Externa delningslänkar', desc: 'Tillåt delning utanför organisationen', value: allowExternalShareLinks, setter: setAllowExternalShareLinks },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h4 className="text-sm font-medium">Delningspolicy</h4>
      {sharingItems.map(({ field, label, desc, value, setter }) => (
        <div key={field} className="flex items-center justify-between py-1">
          <div><p className="text-sm">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
          <Switch checked={value} onCheckedChange={setter} disabled={!canEdit || isSaving} />
        </div>
      ))}
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

export function EnterpriseSettingsMeeting({ settings, locks, canEdit, onUpdate }: Props) {
  return (
    <div className="space-y-6">
      <ControlsCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} />
      <RequiredFieldsCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} />
      <SharingPolicyCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} />
    </div>
  );
}
