import { Video } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsMeeting } from '@/components/enterprise/EnterpriseSettingsMeeting';

export default function EnterpriseSettingsMeetingsPage() {
  return (
    <EnterpriseSettingsLayout
      title="Möten & Innehåll"
      description="Inspelning, transkribering, AI och delningspolicyer"
      icon={<Video className="w-5 h-5 text-primary" />}
      sectionSlug="meeting-content-controls"
    >
      {(ctx) => (
        <EnterpriseSettingsMeeting
          settings={ctx.data?.settings ?? ctx.data ?? {}}
          locks={ctx.locks}
          canEdit={ctx.canEdit}
          onUpdate={ctx.handleUpdate}
          customizationBoundaries={ctx.customizationBoundaries}
        />
      )}
    </EnterpriseSettingsLayout>
  );
}
