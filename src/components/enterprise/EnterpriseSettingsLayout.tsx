import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Building2, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useEnterpriseSectionSettings } from '@/hooks/useEnterpriseSectionSettings';

interface Props {
  title: string;
  description?: string;
  icon: ReactNode;
  sectionSlug: string;
  children: (ctx: ReturnType<typeof useEnterpriseSectionSettings>) => ReactNode;
}

export function EnterpriseSettingsLayout({ title, description, icon, sectionSlug, children }: Props) {
  const navigate = useNavigate();
  const ctx = useEnterpriseSectionSettings(sectionSlug);

  if (!ctx.isEnterprise) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <Shield className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">Enterprise-inställningar är bara tillgängliga för Enterprise-planen.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/enterprise/settings')} className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold truncate">{title}</h1>
              {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="bg-primary/15 text-primary text-xs gap-1">
              <Building2 className="w-3 h-3" />Enterprise
            </Badge>
            {ctx.hasLocks && (
              <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                <Lock className="w-3 h-3" />Låst
              </Badge>
            )}
          </div>
        </div>

        {!ctx.loading && !ctx.canEdit && (
          <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs text-amber-700 dark:text-amber-300">
            Du har läsbehörighet men kan inte ändra enterprise-inställningar.
          </div>
        )}

        {ctx.loading || !ctx.data ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="h-5 w-48 bg-muted rounded" />
                <div className="h-4 w-full bg-muted/60 rounded" />
                <div className="h-4 w-3/4 bg-muted/40 rounded" />
              </div>
            ))}
          </div>
        ) : (
          children(ctx)
        )}
      </div>
    </div>
  );
}
