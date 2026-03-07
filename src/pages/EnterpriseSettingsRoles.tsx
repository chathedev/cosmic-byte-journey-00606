import { Users } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsRoles as RolesContent } from '@/components/enterprise/EnterpriseSettingsRoles';

export default function EnterpriseSettingsRolesPage() {
  return (
    <EnterpriseSettingsLayout
      title="Roller & Behörigheter"
      description="Anpassade roller, behörighetspaket och rollmallar"
      icon={<Users className="w-5 h-5 text-primary" />}
      sectionSlug="roles"
    >
      {(ctx) => {
        // Roles endpoint has a unique structure:
        // { company, viewer, presets, permissionCatalog, permissionKeys,
        //   presetPermissions, anchorRolePermissions, roleTemplates, recommendedTemplateIds, roles }
        const res = ctx.data ?? {};
        return (
          <RolesContent
            companyId={ctx.companyId ?? ''}
            canEdit={ctx.canEdit}
            initialRoles={res.roles ?? []}
            permissionCatalog={res.permissionCatalog}
            permissionKeys={res.permissionKeys}
            presets={res.presets}
            presetPermissions={res.presetPermissions}
            anchorRolePermissions={res.anchorRolePermissions}
            roleTemplates={res.roleTemplates}
            recommendedTemplateIds={res.recommendedTemplateIds}
          />
        );
      }}
    </EnterpriseSettingsLayout>
  );
}
