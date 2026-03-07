import { useState, useEffect, useMemo } from 'react';
import { Video, FileText, Mic, Sparkles, CheckCircle2 } from 'lucide-react';
import { EnterpriseSaveBar } from './EnterpriseSaveBar';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MeetingContentSettings, SettingsLock } from '@/lib/enterpriseSettingsApi';

interface Props {
  settings: Partial<MeetingContentSettings>;
  locks: Record<string, SettingsLock>;
  canEdit: boolean;
  onUpdate: (patch: Record<string, any>) => Promise<void>;
}

export function EnterpriseSettingsMeeting({ settings, locks, canEdit, onUpdate }: Props) {
  const [saving, setSaving] = useState(false);
  const isLocked = (path: string) => !!locks[`meetingContentControls.${path}`]?.locked;

  // Local state
  const [recordingAllowed, setRecordingAllowed] = useState(settings.recordingAllowed ?? true);
  const [transcriptionAllowed, setTranscriptionAllowed] = useState(settings.transcriptionAllowed ?? true);
  const [aiSummaryAllowed, setAiSummaryAllowed] = useState(settings.aiSummaryAllowed ?? true);
  const [speakerIdentificationAllowed, setSpeakerIdentificationAllowed] = useState(settings.speakerIdentificationAllowed ?? false);
  const [protocolTemplatesEnabled, setProtocolTemplatesEnabled] = useState(settings.protocolTemplatesEnabled ?? true);
  const [approvalWorkflowEnabled, setApprovalWorkflowEnabled] = useState(settings.approvalWorkflowEnabled ?? false);
  const [requiredProtocolFields, setRequiredProtocolFields] = useState<string[]>(settings.requiredProtocolFields || []);
  const [allowOrgSharedMeetings, setAllowOrgSharedMeetings] = useState(settings.sharingPolicy?.allowOrgSharedMeetings ?? true);
  const [allowTeamScopedMeetings, setAllowTeamScopedMeetings] = useState(settings.sharingPolicy?.allowTeamScopedMeetings ?? true);
  const [allowExternalShareLinks, setAllowExternalShareLinks] = useState(settings.sharingPolicy?.allowExternalShareLinks ?? true);

  useEffect(() => {
    setRecordingAllowed(settings.recordingAllowed ?? true);
    setTranscriptionAllowed(settings.transcriptionAllowed ?? true);
    setAiSummaryAllowed(settings.aiSummaryAllowed ?? true);
    setSpeakerIdentificationAllowed(settings.speakerIdentificationAllowed ?? false);
    setProtocolTemplatesEnabled(settings.protocolTemplatesEnabled ?? true);
    setApprovalWorkflowEnabled(settings.approvalWorkflowEnabled ?? false);
    setRequiredProtocolFields(settings.requiredProtocolFields || []);
    setAllowOrgSharedMeetings(settings.sharingPolicy?.allowOrgSharedMeetings ?? true);
    setAllowTeamScopedMeetings(settings.sharingPolicy?.allowTeamScopedMeetings ?? true);
    setAllowExternalShareLinks(settings.sharingPolicy?.allowExternalShareLinks ?? true);
  }, [settings]);

  const isDirty = useMemo(() => {
    return (
      recordingAllowed !== (settings.recordingAllowed ?? true) ||
      transcriptionAllowed !== (settings.transcriptionAllowed ?? true) ||
      aiSummaryAllowed !== (settings.aiSummaryAllowed ?? true) ||
      speakerIdentificationAllowed !== (settings.speakerIdentificationAllowed ?? false) ||
      protocolTemplatesEnabled !== (settings.protocolTemplatesEnabled ?? true) ||
      approvalWorkflowEnabled !== (settings.approvalWorkflowEnabled ?? false) ||
      JSON.stringify(requiredProtocolFields) !== JSON.stringify(settings.requiredProtocolFields || []) ||
      allowOrgSharedMeetings !== (settings.sharingPolicy?.allowOrgSharedMeetings ?? true) ||
      allowTeamScopedMeetings !== (settings.sharingPolicy?.allowTeamScopedMeetings ?? true) ||
      allowExternalShareLinks !== (settings.sharingPolicy?.allowExternalShareLinks ?? true)
    );
  }, [recordingAllowed, transcriptionAllowed, aiSummaryAllowed, speakerIdentificationAllowed, protocolTemplatesEnabled, approvalWorkflowEnabled, requiredProtocolFields, allowOrgSharedMeetings, allowTeamScopedMeetings, allowExternalShareLinks, settings]);

  const handleSave = async () => {
    if (!canEdit || !isDirty) return;
    setSaving(true);
    try {
      await onUpdate({
        meetingContentControls: {
          recordingAllowed,
          transcriptionAllowed,
          aiSummaryAllowed,
          speakerIdentificationAllowed,
          protocolTemplatesEnabled,
          approvalWorkflowEnabled,
          requiredProtocolFields,
          sharingPolicy: {
            allowOrgSharedMeetings,
            allowTeamScopedMeetings,
            allowExternalShareLinks,
          },
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleField = (field: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
  };

  const toggleItems: Array<{ field: string; label: string; desc: string; icon: typeof Video; value: boolean; setter: (v: boolean) => void }> = [
    { field: 'recordingAllowed', label: 'Inspelning', desc: 'Tillåt inspelning av möten', icon: Video, value: recordingAllowed, setter: setRecordingAllowed },
    { field: 'transcriptionAllowed', label: 'Transkribering', desc: 'Tillåt automatisk transkribering', icon: Mic, value: transcriptionAllowed, setter: setTranscriptionAllowed },
    { field: 'aiSummaryAllowed', label: 'AI-sammanfattning', desc: 'Tillåt AI-genererade sammanfattningar', icon: Sparkles, value: aiSummaryAllowed, setter: setAiSummaryAllowed },
    { field: 'speakerIdentificationAllowed', label: 'Talaridentifiering', desc: 'Tillåt identifiering av talare', icon: Mic, value: speakerIdentificationAllowed, setter: setSpeakerIdentificationAllowed },
    { field: 'protocolTemplatesEnabled', label: 'Protokollmallar', desc: 'Aktivera mallbibliotek för protokoll', icon: FileText, value: protocolTemplatesEnabled, setter: setProtocolTemplatesEnabled },
    { field: 'approvalWorkflowEnabled', label: 'Godkännandeflöde', desc: 'Kräv godkännande innan protokoll publiceras', icon: CheckCircle2, value: approvalWorkflowEnabled, setter: setApprovalWorkflowEnabled },
  ];

  const sharingItems: Array<{ field: string; label: string; desc: string; value: boolean; setter: (v: boolean) => void }> = [
    { field: 'allowOrgSharedMeetings', label: 'Organisationsdelade möten', desc: 'Tillåt delning av möten inom organisationen', value: allowOrgSharedMeetings, setter: setAllowOrgSharedMeetings },
    { field: 'allowTeamScopedMeetings', label: 'Team-möten', desc: 'Tillåt team-specifika möten', value: allowTeamScopedMeetings, setter: setAllowTeamScopedMeetings },
    { field: 'allowExternalShareLinks', label: 'Externa delningslänkar', desc: 'Tillåt delning utanför organisationen', value: allowExternalShareLinks, setter: setAllowExternalShareLinks },
  ];

  const toggleRequiredField = (field: string) => {
    if (!canEdit) return;
    setRequiredProtocolFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  return (
    <div className="space-y-6">
      <EnterpriseSaveBar isDirty={isDirty} saving={saving} canEdit={canEdit} onSave={handleSave} />
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
              <div>
                <p className="text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
            <Switch
              checked={value}
              onCheckedChange={setter}
              disabled={!canEdit || isLocked(field) || saving}
            />
          </div>
        ))}
      </div>

      {/* Required Fields */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h4 className="text-sm font-medium">Obligatoriska protokollfält</h4>
        <div className="flex flex-wrap gap-2">
          {['summary', 'decisions', 'action_items', 'mainPoints'].map(field => (
            <Badge
              key={field}
              variant={requiredProtocolFields.includes(field) ? 'default' : 'outline'}
              className="text-xs cursor-pointer"
              onClick={() => toggleRequiredField(field)}
            >
              {field === 'summary' ? 'Sammanfattning' : field === 'decisions' ? 'Beslut' : field === 'action_items' ? 'Åtgärder' : 'Huvudpunkter'}
            </Badge>
          ))}
        </div>
      </div>

      {/* Sharing Policy */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h4 className="text-sm font-medium">Delningspolicy</h4>
        {sharingItems.map(({ field, label, desc, value, setter }) => (
          <div key={field} className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <Switch
              checked={value}
              onCheckedChange={setter}
              disabled={!canEdit || saving}
            />
          </div>
        ))}
      </div>

      {/* Save button */}
      {canEdit && isDirty && (
        <div className="sticky bottom-4 flex justify-end z-10">
          <Button onClick={handleSave} disabled={saving} className="gap-2 shadow-lg">
            <Save className="w-4 h-4" />
            {saving ? 'Sparar…' : 'Spara ändringar'}
          </Button>
        </div>
      )}
    </div>
  );
}
