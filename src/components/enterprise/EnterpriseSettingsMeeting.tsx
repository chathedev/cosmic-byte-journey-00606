import { useState } from 'react';
import { Video, FileText, Mic, Sparkles, CheckCircle2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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

  const handleToggle = async (field: string, value: boolean) => {
    if (!canEdit || isLocked(field)) return;
    setSaving(true);
    try { await onUpdate({ meetingContentControls: { [field]: value } }); }
    finally { setSaving(false); }
  };

  const toggleItems: Array<{ field: string; label: string; desc: string; icon: typeof Video }> = [
    { field: 'recordingAllowed', label: 'Inspelning', desc: 'Tillåt inspelning av möten', icon: Video },
    { field: 'transcriptionAllowed', label: 'Transkribering', desc: 'Tillåt automatisk transkribering', icon: Mic },
    { field: 'aiSummaryAllowed', label: 'AI-sammanfattning', desc: 'Tillåt AI-genererade sammanfattningar', icon: Sparkles },
    { field: 'speakerIdentificationAllowed', label: 'Talaridentifiering', desc: 'Tillåt identifiering av talare', icon: Mic },
    { field: 'protocolTemplatesEnabled', label: 'Protokollmallar', desc: 'Aktivera mallbibliotek för protokoll', icon: FileText },
    { field: 'approvalWorkflowEnabled', label: 'Godkännandeflöde', desc: 'Kräv godkännande innan protokoll publiceras', icon: CheckCircle2 },
  ];

  const sharingItems: Array<{ field: string; label: string; desc: string }> = [
    { field: 'allowOrgSharedMeetings', label: 'Organisationsdelade möten', desc: 'Tillåt delning av möten inom organisationen' },
    { field: 'allowTeamScopedMeetings', label: 'Team-möten', desc: 'Tillåt team-specifika möten' },
    { field: 'allowExternalShareLinks', label: 'Externa delningslänkar', desc: 'Tillåt delning utanför organisationen' },
  ];

  const requiredFields = settings.requiredProtocolFields || [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Video className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-medium text-sm">Mötes- & Innehållskontroller</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Styr vad som är tillåtet i arbetsytan</p>
          </div>
        </div>

        {toggleItems.map(({ field, label, desc, icon: Icon }) => (
          <div key={field} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
            <Switch
              checked={(settings as any)[field] ?? true}
              onCheckedChange={v => handleToggle(field, v)}
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
              variant={requiredFields.includes(field) ? 'default' : 'outline'}
              className="text-xs cursor-pointer"
              onClick={async () => {
                if (!canEdit) return;
                const newFields = requiredFields.includes(field)
                  ? requiredFields.filter(f => f !== field)
                  : [...requiredFields, field];
                setSaving(true);
                try { await onUpdate({ meetingContentControls: { requiredProtocolFields: newFields } }); }
                finally { setSaving(false); }
              }}
            >
              {field === 'summary' ? 'Sammanfattning' : field === 'decisions' ? 'Beslut' : field === 'action_items' ? 'Åtgärder' : 'Huvudpunkter'}
            </Badge>
          ))}
        </div>
      </div>

      {/* Sharing Policy */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h4 className="text-sm font-medium">Delningspolicy</h4>
        {sharingItems.map(({ field, label, desc }) => (
          <div key={field} className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <Switch
              checked={(settings.sharingPolicy as any)?.[field] ?? true}
              onCheckedChange={async v => {
                if (!canEdit) return;
                setSaving(true);
                try { await onUpdate({ meetingContentControls: { sharingPolicy: { [field]: v } } }); }
                finally { setSaving(false); }
              }}
              disabled={!canEdit || saving}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
